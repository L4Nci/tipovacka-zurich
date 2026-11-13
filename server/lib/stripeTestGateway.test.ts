import assert from 'node:assert/strict';
import test from 'node:test';
import Stripe from 'stripe';
import { getFanVipOffer, projectVipAccess } from './billingPolicy.ts';
import { createStripeTestGateway, createStripeLiveGateway, FANTIP_SANDBOX_ACCOUNT_ID, StripeTestGatewayError, STRIPE_TEST_API_VERSION } from './stripeTestGateway.ts';

const secretKey = 'sk_test_offlineonlynotreal', webhookSecret = 'whsec_offlineonlynotreal';
const playerId = '11111111-1111-4111-8111-111111111111';
const config = { secretKey, webhookSecret, appOrigin: 'http://localhost:3000', expectedAccountId: FANTIP_SANDBOX_ACCOUNT_ID,
  productId: 'prod_demo', priceIds: { fan_vip_monthly: 'price_demo', fan_vip_annual: 'price_annual' }, portalConfigurationId: 'bpc_demo' };
const expected = { customerId: 'cus_demo', checkoutIntentId: 'intent_demo', offerKey: 'fan_vip_monthly' as const };
const offer = getFanVipOffer(expected.offerKey)!;
const signer = new Stripe(secretKey, { apiVersion: STRIPE_TEST_API_VERSION });
const now = new Date('2026-11-10T12:00:00Z');

function bundle(key = 'demo', starts = '2026-11-01T12:00:00Z', ends = '2026-12-01T12:00:00Z') {
  const start = Date.parse(starts) / 1000, end = Date.parse(ends) / 1000;
  return {
    invoice: { id: `in_${key}`, object: 'invoice', livemode: false, customer: expected.customerId,
      parent: { subscription_details: { subscription: 'sub_demo' } }, status: 'paid', currency: 'czk',
      amount_paid: 4900, amount_due: 4900, total: 4900, amount_remaining: 0, amount_overpaid: 0, discounts: [],
      starting_balance: 0, ending_balance: 0, pre_payment_credit_notes_amount: 0, post_payment_credit_notes_amount: 0 },
    invoiceLines: { has_more: false, data: [{ id: `il_${key}`, livemode: false, currency: 'czk', amount: 4900,
      quantity: 1, subscription: null, pricing: { price_details: { price: 'price_demo' } },
      parent: { type: 'subscription_item_details', subscription_item_details: { subscription: 'sub_demo', proration: false } }, period: { start, end } }] },
    payments: { has_more: false, data: [{ id: `inpay_${key}`, livemode: false, invoice: `in_${key}`, status: 'paid',
      currency: 'czk', amount_paid: 4900, amount_requested: 4900, payment: { type: 'payment_intent', payment_intent: `pi_${key}` } }] },
    intent: { id: `pi_${key}`, livemode: false, customer: expected.customerId, status: 'succeeded', currency: 'czk',
      amount: 4900, amount_received: 4900, on_behalf_of: null, transfer_data: null, latest_charge: `ch_${key}` },
    charge: { id: `ch_${key}`, object: 'charge', livemode: false, customer: expected.customerId, payment_intent: `pi_${key}`,
      currency: 'czk', amount: 4900, amount_captured: 4900, status: 'succeeded', paid: true, captured: true,
      disputed: false, amount_refunded: 0, refunded: false },
  };
}

function fixture() {
  const metadata = { fan_checkout_intent_id: expected.checkoutIntentId, fan_offer_key: offer.key };
  const price = { id: 'price_demo', object: 'price', product: config.productId, active: true, livemode: false,
    currency: 'czk', unit_amount: 4900, type: 'recurring', billing_scheme: 'per_unit', custom_unit_amount: null,
    transform_quantity: null, recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed', trial_period_days: null } };
  const first = bundle();
  const customer = { id: 'cus_demo', livemode: false, metadata: { fan_player_id: playerId } };
  const session = { id: 'cs_test_demo', object: 'checkout.session', livemode: false, mode: 'subscription',
    status: 'complete', payment_status: 'paid', customer: expected.customerId, client_reference_id: expected.checkoutIntentId,
    subscription: 'sub_demo', metadata, expires_at: Math.floor(Date.now() / 1000) + 3600,
    currency: 'czk', amount_subtotal: 4900, amount_total: 4900, total_details: { amount_discount: 0, amount_tax: 0 },
    url: 'https://checkout.stripe.com/c/pay/cs_test_demo' };
  return {
    ...first, bundles: [first], account: { id: FANTIP_SANDBOX_ACCOUNT_ID }, customer, customers: [customer], session, sessions: [session], price,
    annualPrice: { ...price, id: 'price_annual', unit_amount: 49900, recurring: { ...price.recurring, interval: 'year' } },
    product: { id: config.productId, object: 'product', active: true, livemode: false, metadata: { fan_plan_key: 'fan_vip' } },
    checkoutLines: { has_more: false, data: [{ id: 'li_demo', price, quantity: 1, currency: 'czk',
      amount_subtotal: 4900, amount_total: 4900, amount_discount: 0, amount_tax: 0 }] },
    subscription: { id: 'sub_demo', object: 'subscription', livemode: false, customer: expected.customerId, metadata,
      billing_mode: { type: 'flexible' }, status: 'active', cancel_at_period_end: false, trial_start: null, trial_end: null, discounts: [],
      collection_method: 'charge_automatically', on_behalf_of: null, transfer_data: null, latest_invoice: 'in_demo',
      items: { has_more: false, data: [{ id: 'si_demo', quantity: 1, price,
        current_period_start: first.invoiceLines.data[0].period.start, current_period_end: first.invoiceLines.data[0].period.end }] } },
    portal: { id: 'bpc_demo', object: 'billing_portal.configuration', active: true, livemode: false, application: null,
      login_page: { enabled: false }, features: { payment_method_update: { enabled: true }, invoice_history: { enabled: true },
        customer_update: { enabled: false }, subscription_update: { enabled: false }, subscription_pause: { enabled: false },
        subscription_cancel: { enabled: true, mode: 'at_period_end', proration_behavior: 'none' } } },
  };
}

const page = (values: any[], params: any) => {
  const start = params.starting_after ? values.findIndex(value => value.id === params.starting_after) + 1 : 0;
  return { data: values.slice(start, start + params.limit), has_more: start + params.limit < values.length };
};
function harness(data: any = fixture(), overrides: any = {}) {
  const calls: { method: string; args: any[] }[] = [];
  const method = (name: string, result: (...args: any[]) => any) => async (...args: any[]) => {
    calls.push({ method: name, args }); return structuredClone(result(...args));
  };
  const find = (kind: string, value: string) => data.bundles.find((entry: any) => entry[kind].id === value)?.[kind];
  const client = {
    accounts: { retrieve: method('account', () => data.account) },
    prices: { retrieve: method('price', key => key === 'price_annual' ? data.annualPrice : data.price) },
    products: { retrieve: method('product', () => data.product) },
    customers: { create: method('customer.create', () => data.customer), retrieve: method('customer', () => data.customer),
      list: method('customer.list', p => page(data.customers, p)) },
    checkout: { sessions: {
      create: method('checkout.create', p => ({ ...data.session, status: 'open', payment_status: 'unpaid', subscription: null,
        customer: p.customer, client_reference_id: p.client_reference_id, metadata: p.metadata })),
      retrieve: method('checkout.retrieve', () => data.session), listLineItems: method('checkout.lines', () => data.checkoutLines),
      list: method('checkout.list', p => page(data.sessions.filter((value: any) => !p.status || value.status === p.status), p)),
    } },
    billingPortal: { configurations: { retrieve: method('portal.configuration', () => data.portal) },
      sessions: { create: method('portal.create', () => ({ url: 'https://billing.stripe.com/p/session/test_demo' })) } },
    subscriptions: { retrieve: method('subscription', () => data.subscription), list: method('subscription.list', p => page(data.subscription ? [data.subscription] : [], p)) },
    invoices: { retrieve: method('invoice', value => find('invoice', value)),
      list: method('invoice.list', p => page(data.bundles.map((value: any) => value.invoice).filter((value: any) => !p.status || value.status === p.status), p)),
      listLineItems: method('invoice.lines', value => data.bundles.find((entry: any) => entry.invoice.id === value)?.invoiceLines) },
    invoicePayments: { list: method('invoice.payments', p => p.invoice ? data.bundles.find((entry: any) => entry.invoice.id === p.invoice)?.payments
      : page(data.bundles.flatMap((entry: any) => entry.payments.data).filter((value: any) => value.payment.payment_intent === p.payment?.payment_intent), p)) },
    paymentIntents: { retrieve: method('intent', value => find('intent', value)) },
    charges: { retrieve: method('charge', value => find('charge', value)) },
    disputes: { list: method('dispute.list', p => ({ has_more: Boolean(data.disputesHaveMore),
      data: (data.disputes ?? []).filter((value: any) => value.charge === p.charge) })) },
    ...overrides,
  } as unknown as Stripe;
  return { gateway: createStripeTestGateway(config, { client, now: () => now }), calls, data, client };
}

function event(data: any = fixture().session, extras: Record<string, unknown> = {}) {
  return { id: 'evt_demo', object: 'event', type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000),
    livemode: false, data: { object: data }, ...extras };
}
function signed(payload: unknown, timestamp = Math.floor(Date.now() / 1000)) {
  const raw = Buffer.from(JSON.stringify(payload));
  return { raw, signature: signer.webhooks.generateTestHeaderString({ payload: raw.toString(), secret: webhookSecret, timestamp }) };
}
const errorCode = (code: string) => (error: unknown) => error instanceof StripeTestGatewayError && error.code === code;
const checkoutInput = (changes: any = {}) => ({ customerId: expected.customerId, offer, checkoutIntentId: expected.checkoutIntentId,
  successUrl: 'http://localhost:3000/billing?result=success', cancelUrl: 'http://localhost:3000/billing?result=cancel',
  idempotencyKey: 'checkout_request', ...changes });

test('credentials, mandatory account/catalog IDs and trusted application origin fail closed', async () => {
  for (const secretKey of ['sk_live_notallowed', 'rk_test_notallowed', '', undefined]) {
    assert.throws(() => createStripeTestGateway({ ...config, secretKey } as any), errorCode('test_credentials_required'));
  }
  for (const expectedAccountId of ['', undefined, 'invalid']) {
    assert.throws(() => createStripeTestGateway({ ...config, expectedAccountId } as any), errorCode('invalid_account_configuration'));
  }
  for (const change of [{ productId: '' }, { priceIds: undefined }, { priceIds: { fan_vip_monthly: 'price_same', fan_vip_annual: 'price_same' } }, { portalConfigurationId: '' }]) {
    assert.throws(() => createStripeTestGateway({ ...config, ...change } as any), errorCode('invalid_catalog_configuration'));
  }
  for (const appOrigin of ['http://foreign.example', 'https://app.example/path', 'https://u:p@app.example', 'https://app.example/?x=1']) {
    assert.throws(() => createStripeTestGateway({ ...config, appOrigin }), errorCode('invalid_app_origin'));
  }
  const h = harness(); h.data.account.id = 'acct_legacytest';
  await assert.rejects(h.gateway.getAccountId(), errorCode('provider_account_mismatch'));
});

test('customer/checkout use stable keys and canonical fixed Prices with flexible billing', async () => {
  const h = harness();
  assert.deepEqual(await h.gateway.createCustomer(playerId, 'customer_request'), { id: 'cus_demo' });
  await h.gateway.createCheckout(checkoutInput({ offer: { ...offer, amountMinor: 1 } }));
  const call = h.calls.find(call => call.method === 'checkout.create')!;
  assert.equal(call.args[0].mode, 'subscription');
  assert.deepEqual(call.args[0].allowed_payment_method_types, ['card']);
  assert.equal('payment_method_types' in call.args[0], false);
  assert.deepEqual(call.args[0].line_items, [{ quantity: 1, price: 'price_demo' }]);
  assert.deepEqual(call.args[0].subscription_data.billing_mode, { type: 'flexible' });
  assert.equal(call.args[0].allow_promotion_codes, false);
  assert.equal('trial_period_days' in call.args[0].subscription_data, false);
  assert.deepEqual(call.args[1], { idempotencyKey: 'checkout_request' });
  assert.equal(h.calls.filter(call => call.method === 'account').length, 1);
  assert(h.calls.findIndex(call => call.method === 'price') < h.calls.indexOf(call));
});

test('annual checkout verifies 499 CZK/year Price rather than accepting a browser price', async () => {
  const h = harness(); await h.gateway.createCheckout(checkoutInput({ offer: getFanVipOffer('fan_vip_annual')! }));
  assert.deepEqual(h.calls.find(call => call.method === 'price')!.args, ['price_annual']);
  assert.deepEqual(h.calls.find(call => call.method === 'checkout.create')!.args[0].line_items, [{ price: 'price_annual', quantity: 1 }]);
});

test('wrong amount, currency, interval, product, active flag or live catalog never creates Checkout', async () => {
  for (const mutate of [
    (d: any) => { d.price.unit_amount = 1; }, (d: any) => { d.price.currency = 'eur'; },
    (d: any) => { d.price.recurring.interval = 'year'; }, (d: any) => { d.price.product = 'prod_foreign'; },
    (d: any) => { d.price.active = false; }, (d: any) => { d.product.active = false; },
    (d: any) => { d.product.metadata.fan_plan_key = 'other'; }, (d: any) => { d.price.livemode = true; },
  ]) {
    const h = harness(); mutate(h.data);
    await assert.rejects(h.gateway.createCheckout(checkoutInput()), StripeTestGatewayError);
    assert.equal(h.calls.some(call => call.method === 'checkout.create'), false);
  }
});

test('foreign return/provider URLs reject before navigation or creating objects', async () => {
  const h = harness();
  await assert.rejects(h.gateway.createCheckout(checkoutInput({ successUrl: 'https://foreign.example' })), errorCode('invalid_return_url'));
  await assert.rejects(h.gateway.createPortal(expected.customerId, 'http://localhost:3000.evil.example'), errorCode('invalid_return_url'));
  assert.equal(h.calls.length, 0);
  h.data.session.url = 'https://checkout.stripe.com.evil.example/pay';
  await assert.rejects(h.gateway.retrieveCheckout('cs_test_demo'), errorCode('invalid_provider_url'));
});

test('portal uses an explicit verified cancellation-only config and server return URL', async () => {
  const h = harness(); await h.gateway.createPortal('cus_demo', 'http://localhost:3000/billing');
  assert.deepEqual(h.calls.find(call => call.method === 'portal.create')!.args, [{ customer: 'cus_demo',
    return_url: 'http://localhost:3000/billing', configuration: 'bpc_demo' }]);
  for (const mutate of [
    (d: any) => { d.portal.features.subscription_cancel.mode = 'immediately'; },
    (d: any) => { d.portal.features.subscription_cancel.proration_behavior = 'create_prorations'; },
    (d: any) => { d.portal.features.subscription_update.enabled = true; },
    (d: any) => { d.portal.features.subscription_pause.enabled = true; },
    (d: any) => { d.portal.features.customer_update.enabled = true; },
    (d: any) => { d.portal.login_page.enabled = true; }, (d: any) => { d.portal.active = false; },
    (d: any) => { d.portal.livemode = true; },
    (d: any) => { d.portal.features.unknown_purchase = { enabled: true }; },
  ]) {
    const h = harness(); mutate(h.data);
    await assert.rejects(h.gateway.createPortal('cus_demo', 'http://localhost:3000/billing'), StripeTestGatewayError);
    assert.equal(h.calls.some(call => call.method === 'portal.create'), false);
  }
});

test('real SDK verifies original bytes with no network, including API outage', async () => {
  const h = harness(undefined, { accounts: { retrieve: async () => { throw Error('offline'); } } });
  const value = signed(event()); const result = await h.gateway.verifyWebhook(value.raw, value.signature);
  assert.equal(result.livemode, false); assert.equal(result.accountId, FANTIP_SANDBOX_ACCOUNT_ID); assert.equal(result.customerId, 'cus_demo');
  assert.equal(result.checkoutSessionId, 'cs_test_demo'); assert.equal(h.calls.length, 0);
  await assert.rejects(h.gateway.verifyWebhook(Buffer.from(value.raw.toString() + ' '), value.signature), errorCode('invalid_webhook_signature'));
  await assert.rejects(h.gateway.verifyWebhook(value.raw, 't=1,v1=bad'), errorCode('invalid_webhook_signature'));
  const stale = signed(event(), Math.floor(Date.now() / 1000) - 301);
  await assert.rejects(h.gateway.verifyWebhook(stale.raw, stale.signature), errorCode('invalid_webhook_signature'));
  await assert.rejects(h.gateway.verifyWebhook(value.raw.toString() as any, value.signature), errorCode('invalid_webhook_signature'));
});

test('signed live, Connect, thin/malformed and foreign-context events are refused offline', async () => {
  for (const extra of [{ livemode: true }, { account: FANTIP_SANDBOX_ACCOUNT_ID }, { context: 'acct_foreign' }]) {
    const h = harness(), value = signed(event(undefined, extra));
    await assert.rejects(h.gateway.verifyWebhook(value.raw, value.signature), errorCode('non_platform_test_event'));
    assert.equal(h.calls.length, 0);
  }
  const h = harness(), value = signed({ ...event(), data: undefined });
  await assert.rejects(h.gateway.verifyWebhook(value.raw, value.signature), errorCode('invalid_test_event'));
});

test('snapshot webhook API version and reference syntax are checked before inbox/network work', async () => {
  const h = harness();
  const supported = signed(event(undefined, { api_version: STRIPE_TEST_API_VERSION }));
  assert.equal((await h.gateway.verifyWebhook(supported.raw, supported.signature)).id, 'evt_demo');
  const old = signed(event(undefined, { api_version: '2025-03-31.basil' }));
  await assert.rejects(h.gateway.verifyWebhook(old.raw, old.signature), errorCode('unsupported_webhook_api_version'));
  const malformed = signed(event({ ...h.data.session, subscription: 'foreign-reference' }));
  await assert.rejects(h.gateway.verifyWebhook(malformed.raw, malformed.signature), errorCode('invalid_test_event'));
  assert.equal(h.calls.length, 0);
});

test('dispute/refund signature phase preserves Charge references; target resolution is a separate canonical fetch', async () => {
  for (const type of ['dispute', 'refund']) {
    const h = harness(), value = signed(event({ id: `${type === 'dispute' ? 'dp' : 're'}_demo`, object: type,
      livemode: false, charge: 'ch_demo' }, { type: type === 'dispute' ? 'charge.dispute.created' : 'refund.updated' }));
    const verified = await h.gateway.verifyWebhook(value.raw, value.signature);
    assert.equal(verified.customerId, null); assert.equal(verified.chargeId, 'ch_demo'); assert.equal(h.calls.length, 0);
    const resolved = await h.gateway.resolveEventTarget(verified);
    assert.equal(resolved.customerId, 'cus_demo'); assert.equal(resolved.invoiceId, 'in_demo'); assert.equal(resolved.subscriptionId, 'sub_demo');
  }
});

test('Endive Refund snapshots omit object livemode while signed event mode and Charge binding remain mandatory', async () => {
  const h = harness();
  const refund = { id: 're_demo', object: 'refund', charge: 'ch_demo', payment_intent: 'pi_demo', customer: 'cus_demo' };
  const signedRefund = signed(event(refund, { type: 'refund.updated', api_version: STRIPE_TEST_API_VERSION }));
  const verified = await h.gateway.verifyWebhook(signedRefund.raw, signedRefund.signature);
  assert.equal(verified.chargeId, 'ch_demo');
  assert.equal((await h.gateway.resolveEventTarget(verified)).invoiceId, 'in_demo');
  const wrongMode = signed(event({ ...refund, livemode: true }, { type: 'refund.updated' }));
  await assert.rejects(h.gateway.verifyWebhook(wrongMode.raw, wrongMode.signature), errorCode('invalid_test_event'));
  const absentModeOnInvoice = signed(event({ ...h.data.invoice, livemode: undefined }, { type: 'invoice.paid' }));
  await assert.rejects(h.gateway.verifyWebhook(absentModeOnInvoice.raw, absentModeOnInvoice.signature), errorCode('invalid_test_event'));
  const liveEvent = signed(event(refund, { type: 'refund.updated', livemode: true }));
  await assert.rejects(h.gateway.verifyWebhook(liveEvent.raw, liveEvent.signature), errorCode('non_platform_test_event'));
});

test('invoice/subscription events recover a canonical customer and reject mismatched customers', async () => {
  const h = harness(), value = signed(event(h.data.invoice, { type: 'invoice.paid' }));
  const verified = await h.gateway.verifyWebhook(value.raw, value.signature);
  const resolved = await h.gateway.resolveEventTarget(verified);
  assert.equal(resolved.invoiceId, 'in_demo'); assert.equal(resolved.subscriptionId, 'sub_demo');
  h.data.invoice.customer = 'cus_foreign';
  await assert.rejects(h.gateway.resolveEventTarget(verified), errorCode('invoice_context_mismatch'));
});

test('a refund carrying only PaymentIntent recovers its exact Charge and invoice', async () => {
  const h = harness(), value = signed(event({ id: 're_demo', object: 'refund', livemode: false,
    charge: null, payment_intent: 'pi_demo' }, { type: 'refund.updated' }));
  const verified = await h.gateway.verifyWebhook(value.raw, value.signature);
  const resolved = await h.gateway.resolveEventTarget(verified);
  assert.equal(resolved.chargeId, 'ch_demo'); assert.equal(resolved.invoiceId, 'in_demo');
});

test('reconciliation fetches captured invoice proof with a finite period and durable funding references', async () => {
  const h = harness(), result = await h.gateway.reconcile('cs_test_demo', expected);
  assert.equal(result.outcome, 'verified'); if (result.outcome !== 'verified') assert.fail('Expected proof');
  assert.equal(result.invoiceLineId, 'il_demo');
  assert.deepEqual(result.fundingPeriods.map(period => period.invoiceId), ['in_demo']);
  assert.deepEqual(result.snapshot.paidPeriod, { startsAt: '2026-11-01T12:00:00.000Z', endsAt: '2026-12-01T12:00:00.000Z', paymentState: 'paid' });
  const projected = projectVipAccess(result.snapshot, now);
  assert.equal(projected.kind, 'projected'); if (projected.kind === 'projected') assert.equal(projected.eligible, true);
});

test('annual captured payment proves 49900 minor units and the invoice calendar year', async () => {
  const h = harness(), d = h.data;
  d.session.metadata.fan_offer_key = 'fan_vip_annual';
  d.price.id = 'price_annual'; d.price.unit_amount = 49900; d.price.recurring.interval = 'year';
  d.session.amount_subtotal = d.session.amount_total = 49900;
  d.checkoutLines.data[0].amount_subtotal = d.checkoutLines.data[0].amount_total = 49900;
  d.invoice.amount_paid = d.invoice.amount_due = d.invoice.total = 49900;
  d.invoiceLines.data[0].amount = 49900; d.invoiceLines.data[0].pricing.price_details.price = 'price_annual';
  d.invoiceLines.data[0].period.end = Date.parse('2027-11-01T12:00:00Z') / 1000;
  d.payments.data[0].amount_paid = d.payments.data[0].amount_requested = 49900;
  d.intent.amount = d.intent.amount_received = 49900; d.charge.amount = d.charge.amount_captured = 49900;
  const result = await h.gateway.reconcile('cs_test_demo', { ...expected, offerKey: 'fan_vip_annual' });
  assert.equal(result.outcome, 'verified'); if (result.outcome !== 'verified') assert.fail('Expected annual proof');
  assert.equal(result.snapshot.paidPeriod?.endsAt, '2027-11-01T12:00:00.000Z');
});

test('customer, intent and invoice mismatches cannot grant another buyer access', async () => {
  for (const mutate of [
    (d: any) => { d.session.customer = 'cus_foreign'; }, (d: any) => { d.session.client_reference_id = 'intent_foreign'; },
    (d: any) => { d.subscription.customer = 'cus_foreign'; }, (d: any) => { d.invoice.customer = 'cus_foreign'; },
    (d: any) => { d.invoice.parent.subscription_details.subscription = 'sub_foreign'; },
  ]) {
    const h = harness(); mutate(h.data);
    await assert.rejects(h.gateway.reconcile('cs_test_demo', expected), StripeTestGatewayError);
  }
});

test('unpaid Checkout/invoice, manual-paid invoices and incomplete capture do not grant', async () => {
  for (const [mutate, outcome] of [
    [(d: any) => { d.session.payment_status = 'unpaid'; }, 'pending'], [(d: any) => { d.invoice.status = 'open'; }, 'pending'],
    [(d: any) => { d.payments.data = []; }, 'requires_review'],
    [(d: any) => { d.payments.data[0].payment = { type: 'payment_record', payment_record: 'pyr_demo' }; }, 'requires_review'],
    [(d: any) => { d.intent.status = 'requires_action'; }, 'requires_review'], [(d: any) => { d.charge.captured = false; }, 'requires_review'],
  ] as const) {
    const h = harness(); mutate(h.data);
    assert.equal((await h.gateway.reconcile('cs_test_demo', expected)).outcome, outcome);
  }
});

test('wrong quantities/prices, classic billing, discounts, trial, proration and invalid periods require review', async () => {
  for (const mutate of [
    (d: any) => { d.checkoutLines.data[0].price.id = 'price_unknown'; }, (d: any) => { d.checkoutLines.data[0].quantity = 2; },
    (d: any) => { d.checkoutLines.has_more = true; }, (d: any) => { d.session.total_details.amount_discount = 100; },
    (d: any) => { d.subscription.trial_end = 2000000000; }, (d: any) => { d.subscription.billing_mode.type = 'classic'; },
    (d: any) => { d.invoice.starting_balance = -4900; }, (d: any) => { d.invoiceLines.data[0].parent.subscription_item_details.proration = true; },
    (d: any) => { d.invoiceLines.data[0].period.end = null; }, (d: any) => { d.invoiceLines.data[0].period.end += 86400 * 100; },
  ]) {
    const h = harness(); mutate(h.data);
    assert.equal((await h.gateway.reconcile('cs_test_demo', expected)).outcome, 'requires_review');
  }
});

test('a newer unpaid renewal preserves the independently verified previous paid invoice', async () => {
  const h = harness(), renewal = bundle('renewal', '2026-12-01T12:00:00Z', '2027-01-01T12:00:00Z');
  renewal.invoice.status = 'open'; h.data.bundles.push(renewal); h.data.subscription.latest_invoice = 'in_renewal';
  h.data.subscription.status = 'past_due'; h.data.subscription.items.data[0].current_period_start = renewal.invoiceLines.data[0].period.start;
  h.data.subscription.items.data[0].current_period_end = renewal.invoiceLines.data[0].period.end;
  const result = await h.gateway.reconcile('cs_test_demo', expected);
  assert.equal(result.outcome, 'verified'); if (result.outcome !== 'verified') assert.fail('Expected old proof');
  assert.equal(result.invoiceId, 'in_demo'); assert.equal(result.snapshot.paidPeriod?.endsAt, '2026-12-01T12:00:00.000Z');
});

test('paid invoice history paginates, deduplicates known/latest IDs and accepts historical item periods', async () => {
  const data = fixture(), old = bundle('old', '2026-10-01T12:00:00Z', '2026-11-01T12:00:00Z'); data.bundles.push(old);
  const cursors: any[] = [];
  const h = harness(data, { invoices: { ...harness(data).client.invoices,
    list: async (p: any) => { cursors.push(p.starting_after); return p.starting_after
      ? { data: [old.invoice], has_more: false } : { data: [data.invoice], has_more: true }; } } });
  const result = await h.gateway.reconcile('cs_test_demo', { ...expected, knownInvoiceIds: ['in_old', 'in_demo', 'in_old'] });
  assert.equal(result.outcome, 'verified'); assert.deepEqual(cursors, [undefined, 'in_demo']);
  assert.deepEqual(result.fundingPeriods.map(period => period.invoiceId), ['in_old', 'in_demo']);
});

test('an explicitly known historical funding invoice is fetched even if absent from listed history', async () => {
  const data = fixture(), old = bundle('old', '2026-10-01T12:00:00Z', '2026-11-01T12:00:00Z'); data.bundles.push(old);
  const h = harness(data), invoices = h.client.invoices;
  const withNarrowHistory = harness(data, { invoices: { ...invoices, list: async () => ({ data: [data.invoice], has_more: false }) } });
  const result = await withNarrowHistory.gateway.reconcile('cs_test_demo', { ...expected, knownInvoiceIds: ['in_old'] });
  assert.deepEqual(result.fundingPeriods.map(value => value.invoiceId), ['in_old', 'in_demo']);
});

test('an incomplete invoice scan never returns a grant or an unverified absence', async () => {
  const base = harness(); let count = 0;
  const h = harness(undefined, { invoices: { ...base.client.invoices,
    list: async () => ({ data: [{ ...base.data.invoice, id: `in_page${++count}` }], has_more: true }) } });
  await assert.rejects(h.gateway.reconcile('cs_test_demo', expected), errorCode('incomplete_provider_scan'));
  assert.equal(count, 5);
});

test('old full refund affects only its invoice while a newer funded period remains verified', async () => {
  const h = harness(), old = bundle('old', '2026-10-01T12:00:00Z', '2026-11-01T12:00:00Z');
  old.charge.refunded = true; old.charge.amount_refunded = 4900; h.data.bundles.push(old);
  const result = await h.gateway.reconcile('cs_test_demo', { ...expected, affectedChargeIds: ['ch_old'] });
  assert.equal(result.outcome, 'verified'); if (result.outcome !== 'verified') assert.fail('Expected proof');
  assert.equal(result.invoiceId, 'in_demo'); assert.equal(result.snapshot.paidPeriod?.paymentState, 'paid');
  assert.equal(result.fundingPeriods.find(value => value.invoiceId === 'in_old')?.snapshot.paidPeriod?.paymentState, 'refunded');
});

test('partial refund or dispute returns targeted review and preserves other verified funding periods', async () => {
  for (const mutate of [(entry: any) => { entry.charge.amount_refunded = 100; }, (entry: any) => { entry.charge.disputed = true; }]) {
    const h = harness(), old = bundle('old', '2026-10-01T12:00:00Z', '2026-11-01T12:00:00Z'); mutate(old); h.data.bundles.push(old);
    const result = await h.gateway.reconcile('cs_test_demo', { ...expected, knownInvoiceIds: ['in_old'] });
    assert.equal(result.outcome, 'requires_review'); assert.deepEqual(result.reviewInvoiceIds, ['in_old']);
    assert.equal(result.invoiceReviews[0].chargeId, 'ch_old'); assert.deepEqual(result.fundingPeriods.map(value => value.invoiceId), ['in_demo']);
  }
});

test('a canonical closed dispute restores won funding and reverses only the lost invoice', async () => {
  for (const status of ['won', 'lost']) {
    const h = harness();
    h.data.charge.disputed = true;
    h.data.disputes = [{ id: 'dp_demo', livemode: false, charge: 'ch_demo', payment_intent: 'pi_demo',
      amount: 4900, currency: 'czk', status }];
    const result = await h.gateway.reconcile('cs_test_demo', expected);
    assert.equal(result.outcome, 'verified'); if (result.outcome !== 'verified') assert.fail('Expected closed dispute proof');
    assert.equal(result.snapshot.paidPeriod?.paymentState, status === 'won' ? 'paid' : 'chargeback');
    assert.deepEqual(result.reviewInvoiceIds, []);
    h.data.subscription.status = 'canceled';
    assert.equal((await h.gateway.canStartNewCheckout('cus_demo', 'sub_demo')).allowed, status === 'lost');
  }
});

test('an old lost dispute leaves a newer independently funded period paid', async () => {
  const h = harness(), old = bundle('old', '2026-10-01T12:00:00Z', '2026-11-01T12:00:00Z');
  old.charge.disputed = true; h.data.bundles.push(old);
  h.data.disputes = [{ id: 'dp_old', livemode: false, charge: 'ch_old', payment_intent: 'pi_old', amount: 4900, currency: 'czk', status: 'lost' }];
  const result = await h.gateway.reconcile('cs_test_demo', { ...expected, affectedChargeIds: ['ch_old'] });
  assert.equal(result.outcome, 'verified'); if (result.outcome !== 'verified') assert.fail('Expected proof');
  assert.equal(result.invoiceId, 'in_demo'); assert.equal(result.snapshot.paidPeriod?.paymentState, 'paid');
  assert.equal(result.fundingPeriods.find(value => value.invoiceId === 'in_old')?.snapshot.paidPeriod?.paymentState, 'chargeback');
});

test('open, partial, ambiguous or foreign dispute facts cannot restore funding', async () => {
  const mutations = [
    (data: any) => { data.disputes[0].status = 'under_review'; },
    (data: any) => { data.disputes[0].amount = 100; },
    (data: any) => { data.disputes[0].currency = 'eur'; },
    (data: any) => { data.disputes[0].payment_intent = 'pi_other'; },
    (data: any) => { data.disputes[0].livemode = true; },
    (data: any) => { data.disputes.push({ ...data.disputes[0], id: 'dp_second' }); },
    (data: any) => { data.disputesHaveMore = true; },
  ];
  for (const mutate of mutations) {
    const h = harness(); h.data.charge.disputed = true;
    h.data.disputes = [{ id: 'dp_demo', livemode: false, charge: 'ch_demo', payment_intent: 'pi_demo', amount: 4900, currency: 'czk', status: 'won' }];
    mutate(h.data);
    const result = await h.gateway.reconcile('cs_test_demo', expected);
    assert.equal(result.outcome, 'requires_review'); assert.deepEqual(result.reviewInvoiceIds, ['in_demo']);
    assert.deepEqual(result.fundingPeriods, []);
  }
});

test('full funding refund denies only that funded period; cancellation remains paid through expiry', async () => {
  const h = harness(); h.data.charge.refunded = true; h.data.charge.amount_refunded = 4900;
  const result = await h.gateway.reconcile('cs_test_demo', expected);
  assert.equal(result.outcome, 'verified'); if (result.outcome !== 'verified') assert.fail('Expected proof');
  assert.equal(result.snapshot.paidPeriod?.paymentState, 'refunded');
  const other = harness(); other.data.subscription.status = 'canceled'; other.data.subscription.cancel_at_period_end = true;
  const canceled = await other.gateway.reconcile('cs_test_demo', expected);
  assert.equal(canceled.outcome, 'verified'); if (canceled.outcome !== 'verified') assert.fail('Expected proof');
  const projected = projectVipAccess(canceled.snapshot, now);
  assert.equal(projected.kind, 'projected'); if (projected.kind === 'projected') assert.equal(projected.eligible, true);
});

test('ambiguous customer/Checkout recovery fails closed after all pages and preserves exact interval', async () => {
  const h = harness(); assert.deepEqual(await h.gateway.recoverCustomer(playerId), { id: 'cus_demo' });
  assert.equal((await h.gateway.recoverCheckout('cus_demo', 'intent_demo', 'fan_vip_monthly'))?.id, 'cs_test_demo');
  h.data.customers.push({ ...h.data.customer, id: 'cus_duplicate' });
  await assert.rejects(h.gateway.recoverCustomer(playerId), errorCode('ambiguous_customer_recovery'));
  await assert.rejects(h.gateway.recoverCheckout('cus_demo', 'intent_demo', 'fan_vip_annual'), errorCode('checkout_context_mismatch'));
  h.data.sessions.push({ ...h.data.session, id: 'cs_test_duplicate' });
  await assert.rejects(h.gateway.recoverCheckout('cus_demo', 'intent_demo', 'fan_vip_monthly'), errorCode('ambiguous_checkout_recovery'));
});

test('customer recovery scans later pages and refuses truncated scans instead of claiming absence', async () => {
  const data = fixture();
  const h = harness(data, { customers: { list: async (p: any) => p.starting_after
    ? { data: [data.customer], has_more: false } : { data: [{ id: 'cus_other', livemode: false, metadata: {} }], has_more: true } } });
  assert.deepEqual(await h.gateway.recoverCustomer(playerId), { id: 'cus_demo' });
  let count = 0;
  const truncated = harness(undefined, { customers: { list: async () => ({ data: [{ id: `cus_other${++count}`, livemode: false, metadata: {} }], has_more: true }) } });
  await assert.rejects(truncated.gateway.recoverCustomer(playerId), errorCode('incomplete_provider_scan'));
  assert.equal(count, 5);
});

test('Checkout recovery scans later pages and refuses a repeated cursor or a second subscription', async () => {
  const data = fixture(), unrelated = { ...data.session, id: 'cs_test_other', client_reference_id: 'intent_other',
    metadata: { ...data.session.metadata, fan_checkout_intent_id: 'intent_other' } };
  const h = harness(data, { checkout: { sessions: { list: async (p: any) => p.starting_after
    ? { data: [data.session], has_more: false } : { data: [unrelated], has_more: true } } } });
  assert.equal((await h.gateway.recoverCheckout('cus_demo', 'intent_demo', 'fan_vip_monthly'))?.id, 'cs_test_demo');
  const repeated = harness(data, { checkout: { sessions: { list: async () => ({ data: [unrelated], has_more: true }) } } });
  await assert.rejects(repeated.gateway.recoverCheckout('cus_demo', 'intent_demo', 'fan_vip_monthly'), errorCode('incomplete_provider_scan'));
});

test('recovery returning no matching objects performs only reads', async () => {
  const h = harness(); h.data.customers = []; h.data.sessions = [];
  assert.equal(await h.gateway.recoverCustomer(playerId), null);
  assert.equal(await h.gateway.recoverCheckout('cus_demo', 'intent_demo', 'fan_vip_monthly'), null);
  assert.equal(h.calls.some(value => value.method.includes('create')), false);
});

test('repurchase rejects active subscriptions, pending invoices, open sessions and remaining paid-through time', async () => {
  const active = harness(); assert.equal((await active.gateway.canStartNewCheckout('cus_demo', 'sub_demo')).reason, 'subscription_not_terminal');
  const paid = harness(); paid.data.subscription.status = 'canceled';
  assert.equal((await paid.gateway.canStartNewCheckout('cus_demo', 'sub_demo')).reason, 'paid_period_remaining');
  paid.data.invoice.status = 'open'; assert.equal((await paid.gateway.canStartNewCheckout('cus_demo', 'sub_demo')).reason, 'invoice_pending');
  const open = harness(); open.data.session.status = 'open'; open.data.session.expires_at = 1;
  assert.equal((await open.gateway.canStartNewCheckout('cus_demo', 'sub_demo')).reason, 'checkout_still_open');
});

test('repurchase needs terminal state and exhausted finite paid period; uncertain proof still blocks it', async () => {
  const h = harness(); h.data.subscription.status = 'canceled';
  h.data.invoiceLines.data[0].period.start = Date.parse('2026-10-01T12:00:00Z') / 1000;
  h.data.invoiceLines.data[0].period.end = Date.parse('2026-11-01T12:00:00Z') / 1000;
  assert.equal((await h.gateway.canStartNewCheckout('cus_demo', 'sub_demo')).allowed, true);
  h.data.charge.disputed = true; assert.equal((await h.gateway.canStartNewCheckout('cus_demo', 'sub_demo')).allowed, false);
});

test('uncollectible debt is unsettled and cannot authorize a replacement subscription', async () => {
  const h = harness(); h.data.subscription.status = 'canceled'; h.data.invoice.status = 'uncollectible';
  assert.deepEqual(await h.gateway.canStartNewCheckout('cus_demo', 'sub_demo'), { allowed: false, reason: 'invoice_unsettled' });
});

const liveConfig = { ...config, expectedAccountId: 'acct_offlineLive', secretKey: 'sk_live_offlineonlynotreal' };
function liveFixture() {
  const converted = JSON.parse(JSON.stringify(fixture()).replaceAll('cs_test_', 'cs_live_')
    .replaceAll(FANTIP_SANDBOX_ACCOUNT_ID, liveConfig.expectedAccountId));
  const mark = (value: any) => {
    if (!value || typeof value !== 'object') return;
    if ('livemode' in value) value.livemode = true;
    for (const child of Object.values(value)) mark(child);
  };
  mark(converted); return converted;
}

test('explicit factories enforce FanTip TEST account and separate Live credentials/account', async () => {
  assert.throws(() => createStripeTestGateway(liveConfig), errorCode('invalid_account_configuration'));
  assert.throws(() => createStripeTestGateway({ ...config, expectedAccountId: 'acct_legacytest' }), errorCode('invalid_account_configuration'));
  assert.throws(() => createStripeLiveGateway({ ...liveConfig, expectedAccountId: FANTIP_SANDBOX_ACCOUNT_ID }), errorCode('invalid_account_configuration'));
  assert.throws(() => createStripeLiveGateway({ ...liveConfig, secretKey }), errorCode('live_credentials_required'));
});

test('the shared engine proves a synthetic Live payment and emits only Live snapshots', async () => {
  const h = harness(liveFixture()), gateway = createStripeLiveGateway(liveConfig, { client: h.client, now: () => now });
  const result = await gateway.reconcile('cs_live_demo', expected);
  assert.equal(result.outcome, 'verified'); if (result.outcome !== 'verified') assert.fail('Expected Live mock proof');
  assert.equal(result.snapshot.environment, 'live'); assert.equal(result.fundingPeriods[0].snapshot.environment, 'live');
  await gateway.createCheckout(checkoutInput());
  assert.equal(h.calls.find(value => value.method === 'checkout.create')!.args[0].line_items[0].price, 'price_demo');
});

test('signed events never cross TEST/Live even with a valid HMAC and matching object format', async () => {
  const h = harness(), live = createStripeLiveGateway(liveConfig, { client: harness(liveFixture()).client });
  const liveValue = signed(event(liveFixture().session, { livemode: true }));
  const testValue = signed(event());
  assert.equal((await live.verifyWebhook(liveValue.raw, liveValue.signature)).livemode, true);
  await assert.rejects(h.gateway.verifyWebhook(liveValue.raw, liveValue.signature), errorCode('non_platform_test_event'));
  await assert.rejects(live.verifyWebhook(testValue.raw, testValue.signature), errorCode('non_platform_live_event'));
  assert.equal(h.calls.length, 0);
});

test('Live engine rejects TEST Session IDs and TEST canonical objects before any funding proof', async () => {
  const h = harness(liveFixture()), gateway = createStripeLiveGateway(liveConfig, { client: h.client });
  await assert.rejects(gateway.retrieveCheckout('cs_test_demo'), errorCode('live_checkout_required'));
  await assert.rejects(h.gateway.retrieveCheckout('cs_live_demo'), errorCode('test_checkout_required'));
  h.data.session.livemode = false;
  await assert.rejects(gateway.reconcile('cs_live_demo', expected), errorCode('provider_mode_mismatch'));
  const other = harness(liveFixture()), canonical = createStripeLiveGateway(liveConfig, { client: other.client });
  other.data.bundles[0].charge.livemode = false;
  await assert.rejects(canonical.reconcile('cs_live_demo', expected), errorCode('provider_mode_mismatch'));
});

test('provider failures are sanitized and never leak credentials', async () => {
  const h = harness(undefined, { accounts: { retrieve: async () => { throw new Error(secretKey); } } });
  await assert.rejects(h.gateway.getAccountId(), error => {
    assert(error instanceof StripeTestGatewayError); assert.equal(error.statusCode, 503);
    assert.doesNotMatch(error.message, /sk_test_|offlineonly/); return true;
  });
});

test('Endive invoice parent proves subscription while nullable legacy pointer grants no authority', async () => {
  const valid = harness();
  assert.equal((await valid.gateway.reconcile('cs_test_demo', expected)).outcome, 'verified');
  for (const mutate of [
    (line: any) => { line.parent.subscription_item_details.subscription = 'sub_foreign'; },
    (line: any) => { line.subscription = 'sub_foreign'; },
    (line: any) => { line.subscription = 'sub_demo'; line.parent = null; },
  ]) {
    const h = harness(); mutate(h.data.invoiceLines.data[0]);
    assert.equal((await h.gateway.reconcile('cs_test_demo', expected)).outcome, 'requires_review');
  }
});
