import test from 'node:test';
import assert from 'node:assert/strict';
import { createBillingTestService } from './billingTestService.ts';
import type { BillingTestConfig } from './billingTestConfig.ts';
import type { BillingTestStatus, BillingTestStore } from './billingTestStore.ts';
import type { StripeTestGateway, VerifiedStripeTestEvent } from './stripeTestGateway.ts';

const clock = new Date('2026-11-12T12:00:00.000Z');
const period = (invoiceId = 'in_paid', endsAt = '2026-12-01T00:00:00.000Z') => ({
  invoiceId, invoiceLineId: `il_${invoiceId}`, paymentIntentId: `pi_${invoiceId}`, chargeId: `ch_${invoiceId}`,
  snapshot: { environment: 'test' as const, offerKey: 'fan_vip_monthly' as const, subscriptionState: 'active' as const,
    cancelAtPeriodEnd: false, paidPeriod: { startsAt: '2026-11-01T00:00:00.000Z', endsAt, paymentState: 'paid' as const } },
});
const initial = (): BillingTestStatus => ({ intent: {
  id: 'intent_one', offerKey: 'fan_vip_monthly', state: 'reserved', customerId: null, sessionId: null,
  checkoutUrl: null, expiresAt: null, idempotencyKey: 'checkout_stable', customerIdempotencyKey: 'customer_stable',
  createdAt: clock.toISOString(), customerCreatedAt: clock.toISOString(),
}, outcome: null, snapshot: null, subscriptionId: null, invoiceId: null, verifiedAt: null, fundingPeriods: [] });
function harness(status = initial()) {
  const calls: Array<[string, unknown]> = [];
  const config = { accountId: 'acct_test', appOrigin: 'http://localhost:3000' } as BillingTestConfig;
  const store = {
    reserveCheckout: async () => structuredClone(status.intent),
    bindCustomer: async (_a: string, _p: string, id: string) => { status.intent!.customerId = id; },
    saveCheckout: async (...args: unknown[]) => { calls.push(['save', args]); },
    bindRecoveredCheckout: async (_a: string, _p: string, _i: string, session: { id: string; customerId: string; url: string; status: string; subscriptionId: string }) => {
      calls.push(['bind_recovered', session]); status.intent = { ...status.intent!, sessionId: session.id,
        customerId: session.customerId, checkoutUrl: session.url, state: session.status === 'complete' ? 'completed' : session.status === 'expired' ? 'expired' : 'open' };
      status.subscriptionId = session.subscriptionId; return status.intent;
    },
    getStatus: async () => structuredClone(status),
    beginReconciliation: async () => ({ kind: 'claimed', playerId: 'player', leaseToken: 'lease', leaseVersion: 1, status }),
    completeReconciliation: async (value: unknown) => { calls.push(['complete', value]); return true; },
    failReconciliation: async () => { calls.push(['fail', null]); return true; },
    bindEventCustomer: async () => {},
    findEventStatus: async (_a: string, _c: string, refs: unknown) => { calls.push(['find', refs]); return status; },
    deferEvent: async () => { calls.push(['defer', null]); return true; },
    retireCheckout: async () => { calls.push(['retire', null]); },
  } as unknown as BillingTestStore;
  const gateway = {
    recoverCustomer: async () => null,
    createCustomer: async (_p: string, key: string) => { calls.push(['customer', key]); return { id: 'cus_test' }; },
    recoverCheckout: async () => null,
    canStartNewCheckout: async () => ({ allowed: true, reason: 'terminal' }),
    createCheckout: async (input: unknown) => { calls.push(['checkout', input]); return { id: 'cs_test_one', url: 'https://checkout.stripe.com/c/test', expiresAt: clock.getTime() / 1000 + 3600 }; },
    retrieveCheckout: async () => ({ customerId: 'cus_test', checkoutIntentId: 'intent_one', offerKey: 'fan_vip_monthly', status: 'complete', subscriptionId: 'sub_test' }),
    reconcile: async (_s: string, input: unknown) => { calls.push(['reconcile', input]); return {
      outcome: 'pending', reason: 'invoice_not_paid', subscriptionId: 'sub_test', fundingPeriods: [period()], reviewInvoiceIds: [],
    }; },
    resolveEventTarget: async (event: unknown) => event,
  } as unknown as StripeTestGateway;
  return { service: createBillingTestService({ config, store, gateway, now: () => clock }), store, gateway, calls, status };
}
const funded = () => { const s = initial(); s.intent = { ...s.intent!, state: 'completed', customerId: 'cus_test', sessionId: 'cs_test_one' };
  s.subscriptionId = 'sub_test'; s.outcome = 'verified'; s.fundingPeriods = [period()]; return s; };

test('checkout uses stored customer/session idempotence and server-owned return URLs', async () => {
  const h = harness(); await h.service.checkout('player', 'fan_vip_monthly');
  assert.deepEqual(h.calls.find(x => x[0] === 'customer'), ['customer', 'customer_stable']);
  const created = h.calls.find(x => x[0] === 'checkout')![1] as Record<string, unknown>;
  assert.equal(created.idempotencyKey, 'checkout_stable');
  assert.equal(created.successUrl, 'http://localhost:3000/billing-test.html?billing_return=checkout');
});
test('a >24h ambiguous customer/checkout never causes a fresh provider creation', async () => {
  const s = initial(); s.intent!.createdAt = s.intent!.customerCreatedAt = '2026-11-10T00:00:00.000Z';
  const h = harness(s);
  await assert.rejects(h.service.checkout('player', 'fan_vip_monthly'), /recovery_requires_review/);
  assert.ok(!h.calls.some(x => x[0] === 'customer' || x[0] === 'checkout'));
});
test('canonical recovery after timeout binds existing objects without recreating them', async () => {
  const s = initial(); s.intent!.createdAt = s.intent!.customerCreatedAt = '2026-11-10T00:00:00.000Z';
  const h = harness(s); h.gateway.recoverCustomer = async () => ({ id: 'cus_existing' });
  h.gateway.recoverCheckout = async () => ({ id: 'cs_test_recovered', customerId: 'cus_existing', checkoutIntentId: 'intent_one', offerKey: 'fan_vip_monthly',
    status: 'open', subscriptionId: null, url: 'https://checkout.stripe.com/c/recovered', expiresAt: clock.getTime() / 1000 + 1000 });
  const r = await h.service.checkout('player', 'fan_vip_monthly'); assert.match(r.checkoutUrl, /recovered$/);
  assert.ok(h.calls.some(x => x[0] === 'bind_recovered')); assert.ok(!h.calls.some(x => x[0] === 'customer' || x[0] === 'checkout'));
});
test('another interval cannot silently reuse an old reserved offer', async () => {
  const h = harness(); await assert.rejects(h.service.checkout('player', 'fan_vip_annual'), error => (error as { code: string }).code === 'offer_conflict');
  assert.deepEqual(h.calls, []);
});
test('paid-through cancellation survives pending renewal diagnostics and expires at exact boundary', () => {
  const s = funded(); s.fundingPeriods[0].snapshot = { ...s.fundingPeriods[0].snapshot, cancelAtPeriodEnd: true }; s.outcome = 'pending';
  const h = harness(s); const r = h.service.publicStatus(s); assert.equal(r.state, 'paid'); assert.equal(r.renewalStopped, true);
  const expired = period('in_paid', clock.toISOString()); s.fundingPeriods = [expired]; assert.equal(h.service.publicStatus(s).state, 'expired');
});
test('targeted old refund/review cannot erase a separate newer funded period', () => {
  const s = funded(); s.outcome = 'requires_review'; s.fundingPeriods.push({ ...period('in_old'), requiresReview: true });
  const h = harness(s); assert.equal(h.service.publicStatus(s).state, 'paid');
  s.fundingPeriods[0].snapshot = { ...s.fundingPeriods[0].snapshot,
    paidPeriod: { ...s.fundingPeriods[0].snapshot.paidPeriod!, paymentState: 'refunded' } };
  assert.equal(h.service.publicStatus(s).state, 'review');
});
test('event reconciliation retains funded invoices and scopes affected charge to exact historical target', async () => {
  const h = harness(funded());
  const event = { id: 'evt_refund', type: 'charge.refunded', customerId: 'cus_test', chargeId: 'ch_old', invoiceId: 'in_old',
    subscriptionId: 'sub_test', accountId: 'acct_test', livemode: false, objectId: 'ch_old', created: 1 } as VerifiedStripeTestEvent;
  await h.service.processEvent(event, 'digest');
  assert.deepEqual(h.calls.find(x => x[0] === 'find')![1], { sessionId: undefined, subscriptionId: 'sub_test', invoiceId: 'in_old', chargeId: 'ch_old' });
  const reconciled = h.calls.find(x => x[0] === 'reconcile')![1] as Record<string, unknown>;
  assert.deepEqual(reconciled.knownInvoiceIds, ['in_paid']); assert.deepEqual(reconciled.affectedChargeIds, ['ch_old']);
  const complete = h.calls.find(x => x[0] === 'complete')![1] as Record<string, unknown>;
  assert.equal(complete.outcome, 'pending'); assert.deepEqual(complete.fundingPeriods, [period()]);
});
test('provider failure releases lease and retains retryable inbox', async () => {
  const h = harness(funded()); h.gateway.reconcile = async () => { throw Error('provider'); };
  await assert.rejects(h.service.processEvent({ id: 'evt_one', type: 'invoice.paid', customerId: 'cus_test', subscriptionId: 'sub_test' } as VerifiedStripeTestEvent, 'digest'));
  assert.ok(h.calls.some(x => x[0] === 'fail')); assert.ok(h.calls.some(x => x[0] === 'defer')); assert.ok(!h.calls.some(x => x[0] === 'complete'));
});
test('existing paid subscription cannot be retired for a duplicate purchase', async () => {
  const h = harness(funded()); h.gateway.canStartNewCheckout = async () => ({ allowed: false, reason: 'paid' });
  await assert.rejects(h.service.checkout('player', 'fan_vip_monthly'), /subscription_exists/);
  assert.ok(!h.calls.some(x => x[0] === 'retire' || x[0] === 'checkout'));
});

test('full refund is visible as refunded and cannot advertise a future paid-through date', () => {
  const s = funded(); s.fundingPeriods[0].snapshot = { ...s.fundingPeriods[0].snapshot,
    paidPeriod: { ...s.fundingPeriods[0].snapshot.paidPeriod!, paymentState: 'refunded' } };
  const r = harness(s).service.publicStatus(s); assert.equal(r.state, 'refunded'); assert.equal(r.paidUntil, null);
});
