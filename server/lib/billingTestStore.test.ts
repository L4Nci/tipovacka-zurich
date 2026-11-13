import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BillingTestStoreError, createBillingTestStore } from './billingTestStore.ts';

const snapshot = { environment: 'test', offerKey: 'fan_vip_monthly', subscriptionState: 'active',
  cancelAtPeriodEnd: false, paidPeriod: { startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-12-01T00:00:00.000Z', paymentState: 'paid' } };
const intent = { id: 'intent', offerKey: 'fan_vip_monthly', state: 'completed', customerId: 'cus_A', sessionId: 'cs_test_A',
  checkoutUrl: 'https://checkout.stripe.com/a', expiresAt: '2026-11-13T00:00:00Z', idempotencyKey: 'checkout-seed',
  createdAt: '2026-11-12T00:00:00Z', customerCreatedAt: '2026-11-10T00:00:00Z', customerIdempotencyKey: 'stable-customer-seed' };
const funding = { snapshot, invoiceId: 'in_A', invoiceLineId: 'il_A', paymentIntentId: 'pi_A', chargeId: 'ch_A', requiresReview: false };
const status = { intent, outcome: 'verified', snapshot, subscriptionId: 'sub_A', invoiceId: 'in_A', verifiedAt: '2026-11-12T00:00:00Z',
  fundingPeriods: [funding], reviewInvoiceIds: [] };
const store = (respond: (name: string, params: Record<string, unknown>) => unknown) => createBillingTestStore({
  rpc: async (name: string, params: Record<string, unknown>) => ({ data: respond(name, params), error: null }),
} as unknown as SupabaseClient);

test('status preserves historical funding and review flags independently of a pending diagnostic', async () => {
  const value = { ...status, outcome: 'requires_review', snapshot: null, invoiceId: null,
    fundingPeriods: [{ ...funding, requiresReview: true }], reviewInvoiceIds: ['in_A'] };
  assert.deepEqual(await store(() => value).getStatus('acct_A', 'player'), value);
});

test('live or malformed stored proof is rejected before it reaches a caller', async () => {
  for (const invalid of [{ ...status, fundingPeriods: [{ ...funding, snapshot: { ...snapshot, environment: 'live' } }] },
    { ...status, fundingPeriods: [{ ...funding, requiresReview: 'true' }] }, { ...status, reviewInvoiceIds: [42] },
    { ...status, intent: { ...intent, customerCreatedAt: 'not-a-date' } }]) {
    await assert.rejects(store(() => invalid).getStatus('acct_A', 'player'), BillingTestStoreError);
  }
});

test('fencing rejection remains false; private SQL errors and unavailable databases never leak details', async () => {
  const completion = { accountId: 'acct_A', playerId: 'player', eventId: 'evt_A', fingerprint: 'a'.repeat(64),
    leaseToken: 'lease', leaseVersion: 2, intentId: 'intent', outcome: 'pending' as const,
    subscriptionId: null, invoiceId: null, snapshot: null };
  assert.equal(await store(() => false).completeReconciliation(completion), false);
  for (const error of [{ code: 'PBT02', message: 'private-payment-identifiers' }, { code: '42501', message: 'private-schema' }]) {
    const client = createBillingTestStore({ rpc: async () => ({ error, data: null }) } as unknown as SupabaseClient);
    await assert.rejects(client.getStatus('acct_A', 'player'), value => value instanceof BillingTestStoreError
      && value.code === (error.code === 'PBT02' ? 'billing_conflict' : 'billing_unavailable') && !value.message.includes('private'));
  }
});

test('inbox claims and immutable event/customer bindings retain the durable fingerprint', async () => {
  const calls: { name: string; params: Record<string, unknown> }[] = [];
  const event = { id: 'evt_A', type: 'charge.refunded', livemode: false as const, customerId: null, objectId: 'ch_A', chargeId: 'ch_A' };
  const pending = { ...event, fingerprint: 'a'.repeat(64), attempts: 2, claimToken: 'lease' };
  const client = store((name, params) => { calls.push({ name, params }); return name.endsWith('list_pending_events') ? [pending] : true; });
  await client.enqueueEvent('acct_A', event, pending.fingerprint);
  assert.deepEqual(await client.listPendingEvents('acct_A', 10), [pending]);
  await client.bindEventCustomer('acct_A', event.id, pending.fingerprint, 'cus_A');
  await client.deferEvent('acct_A', event.id, pending.fingerprint, 'provider_unavailable', pending.claimToken);
  assert.equal(calls[0].params.p_fingerprint, pending.fingerprint);
  assert.equal(calls[3].params.p_claim_token, pending.claimToken);
  assert.deepEqual(await client.consumeRateLimit('acct_A', 'player', 'checkout'), true);
});

test('historical lookup returns null instead of silently falling back to latest buyer status', async () => {
  const client = store(() => null);
  assert.equal(await client.findEventStatus('acct_A', 'cus_A', { chargeId: 'ch_old' }), null);
});

test('terminal recovered checkout binds without a URL and normalizes provider epoch once', async () => {
  const recovered = { id: 'cs_test_Recovered', customerId: 'cus_A', checkoutIntentId: 'intent',
    offerKey: 'fan_vip_monthly' as const, status: 'complete' as const, subscriptionId: 'sub_A', url: null,
    expiresAt: Date.parse('2026-11-13T00:00:00Z') / 1000 };
  const client = store((name, params) => {
    assert.equal(name, 'billing_test_bind_recovered_checkout');
    assert.deepEqual(params.p_session, { ...recovered, expiresAt: '2026-11-13T00:00:00.000Z' });
    return { ...intent, sessionId: recovered.id, checkoutUrl: null };
  });
  assert.equal((await client.bindRecoveredCheckout('acct_A', 'player', 'intent', recovered)).checkoutUrl, null);
  await assert.rejects(client.bindRecoveredCheckout('acct_A', 'player', 'intent', { ...recovered, expiresAt: Infinity }), BillingTestStoreError);
});
