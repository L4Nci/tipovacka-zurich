import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { handleBillingTestRequest, handleBillingLiveRequest, billingTestRawBody, billingEventFingerprint, type BillingTestRuntime } from './billingTestHttp.ts';
import { readBillingTestConfig, FANTIP_SANDBOX_ACCOUNT_ID } from './billingTestConfig.ts';
import { registerBillingTestRoutes } from './billingTestRoutes.ts';
import { BillingTestServiceError } from './billingTestService.ts';

const player = '00000000-0000-4000-8000-000000000001';
const env = { BILLING_TEST_ENABLED: 'true', BILLING_TEST_MODE: 'sandbox', BILLING_TEST_ACCOUNT_ID: FANTIP_SANDBOX_ACCOUNT_ID,
  BILLING_TEST_APP_ORIGIN: 'http://localhost:3000', BILLING_TEST_ALLOWED_PLAYER_IDS: player,
  BILLING_TEST_RECONCILE_SECRET: 'r'.repeat(48), STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake',
  STRIPE_TEST_PRODUCT_ID: 'prod_fake', STRIPE_TEST_PRICE_MONTHLY_ID: 'price_month', STRIPE_TEST_PRICE_ANNUAL_ID: 'price_year',
  STRIPE_TEST_PORTAL_CONFIGURATION_ID: 'bpc_fake' };
const request = (body: unknown = { offerKey: 'fan_vip_monthly', requestId: '11111111-1111-4111-8111-111111111111' }) => ({
  httpMethod: 'POST', headers: { authorization: 'Bearer signed', 'content-type': 'application/json' }, body: JSON.stringify(body),
});
function harness() {
  const calls: string[] = [];
  const runtime = {
    config: readBillingTestConfig(env),
    gateway: { getAccountId: async () => { calls.push('account'); return FANTIP_SANDBOX_ACCOUNT_ID; },
      verifyWebhook: async (raw: Buffer) => { calls.push('signature'); assert.equal(raw.toString(), '{"original":true}');
        return { id: 'evt_fake', type: 'invoice.paid', accountId: FANTIP_SANDBOX_ACCOUNT_ID, livemode: false }; } },
    store: { consumeRateLimit: async () => true, enqueueEvent: async () => { calls.push('enqueue'); return true; } },
    service: { checkout: async (id: string, offer: string) => { calls.push('checkout'); assert.equal(id, player); assert.equal(offer, 'fan_vip_monthly');
      return { checkoutUrl: 'https://checkout.stripe.com/c/fake' }; },
      processEvent: async () => { calls.push('process'); return true; } },
  } as unknown as BillingTestRuntime;
  return { runtime, calls, options: { env, runtime: () => runtime, resolvePlayer: async () => player } };
}
const body = (r: { body: string }) => JSON.parse(r.body);

test('disabled billing does not initialize credentials, auth, provider or storage', async () => {
  const r = await handleBillingTestRequest('checkout', request(), { env: {}, runtime: () => { throw Error('must not run'); } });
  assert.equal(r.statusCode, 404);
});
test('configuration refuses Live, legacy account, empty tester list and duplicate prices', () => {
  for (const change of [{ STRIPE_SECRET_KEY: 'sk_live_no' }, { BILLING_TEST_ACCOUNT_ID: 'acct_legacy' },
    { BILLING_TEST_MODE: 'live' }, { BILLING_TEST_ALLOWED_PLAYER_IDS: '' }, { STRIPE_TEST_PRICE_ANNUAL_ID: 'price_month' }]) {
    assert.throws(() => readBillingTestConfig({ ...env, ...change }));
  }
});
test('unauthenticated and disallowed buyers cannot call Stripe', async () => {
  const h = harness();
  assert.equal((await handleBillingTestRequest('checkout', { ...request(), headers: {} }, h.options)).statusCode, 401);
  assert.equal((await handleBillingTestRequest('checkout', request(), { ...h.options, resolvePlayer: async () => 'other' })).statusCode, 403);
  assert.deepEqual(h.calls, []);
});
test('server derives buyer and rejects client identity, price, amount and return URL claims', async () => {
  const h = harness();
  for (const override of [{ playerId: player }, { priceId: 'price_client' }, { amount: 1 }, { returnUrl: 'https://evil.invalid' }]) {
    assert.equal((await handleBillingTestRequest('checkout', request({ ...JSON.parse(request().body), ...override }), h.options)).statusCode, 400);
  }
  assert.ok(!h.calls.includes('checkout'));
  assert.equal((await handleBillingTestRequest('checkout', request(), h.options)).statusCode, 200);
  assert.equal(h.calls.at(-1), 'checkout');
});
test('durable rate limit rejects requests before provider work', async () => {
  const h = harness(); h.runtime.store.consumeRateLimit = async () => false;
  assert.equal((await handleBillingTestRequest('checkout', request(), h.options)).statusCode, 429);
  assert.deepEqual(h.calls, []);
});
test('offer conflicts disclose only the server-owned current interval', async () => {
  const h = harness(); h.runtime.service.checkout = async () => { throw new BillingTestServiceError('offer_conflict', 409, 'fan_vip_annual'); };
  const r = await handleBillingTestRequest('checkout', request(), h.options);
  assert.equal(r.statusCode, 409); assert.deepEqual(body(r), { error: 'offer_conflict', offerKey: 'fan_vip_annual' });
});
test('webhook base64 preserves original bytes and verifies before durable enqueue/processing', async () => {
  const h = harness();
  const r = await handleBillingTestRequest('webhook', { httpMethod: 'POST', headers: { 'stripe-signature': 'signed' },
    isBase64Encoded: true, body: Buffer.from('{"original":true}').toString('base64') }, h.options);
  assert.equal(r.statusCode, 200); assert.deepEqual(h.calls, ['signature', 'account', 'enqueue', 'process']);
});
test('unverified events never enter inbox and durable incomplete work asks provider to retry', async () => {
  const h = harness(); h.runtime.gateway.verifyWebhook = async () => { throw new BillingTestServiceError('bad_signature', 400); };
  const req = { httpMethod: 'POST', body: '{"original":true}' };
  assert.equal((await handleBillingTestRequest('webhook', req, h.options)).statusCode, 400);
  assert.deepEqual(h.calls, []);
  const pending = harness(); pending.runtime.service.processEvent = async () => { throw new BillingTestServiceError('mapping_pending', 503); };
  assert.equal((await handleBillingTestRequest('webhook', req, pending.options)).statusCode, 503);
  assert.ok(pending.calls.includes('enqueue'));
});
test('verified event dedup survives serialization/delivery metadata changes but rejects changed authority references', () => {
  const event = { id:'evt_stable',type:'invoice.paid',created:1,accountId:FANTIP_SANDBOX_ACCOUNT_ID,livemode:false,
    objectId:'in_stable',invoiceId:'in_stable',customerId:'cus_stable',subscriptionId:'sub_stable' };
  const deliveredAgain = { ...event, created:2, pending_webhooks:0 };
  assert.equal(billingEventFingerprint(event),billingEventFingerprint(deliveredAgain));
  assert.notEqual(billingEventFingerprint(event),billingEventFingerprint({...event,customerId:'cus_other'}));
  assert.notEqual(billingEventFingerprint(event),billingEventFingerprint({...event,livemode:true}));
});
test('recovery HTTP endpoint requires its separate secret; a player token is insufficient', async () => {
  const h = harness();
  assert.equal((await handleBillingTestRequest('reconcile', request(), h.options)).statusCode, 401);
  assert.deepEqual(h.calls, []);
});
test('Live remains disabled independently of an enabled sandbox', async () => {
  const h = harness(); assert.equal((await handleBillingLiveRequest('checkout', request(), h.options)).statusCode, 404);
  assert.deepEqual(h.calls, []);
});
test('Live checkout requires matching enabled immutable DB policy and buyer accepted version', async () => {
  const h = harness(); const policy = { status: 'accepted', version: 'owner-v1' };
  Object.assign(h.runtime.config, { environment: 'live', accountId: 'acct_LiveFixture', checkoutEnabled: true, activationVersion: 'owner-v1', activationContract: policy });
  h.runtime.store.getActivation = async () => ({ enabled: false, version: 'owner-v1', contract: policy });
  const options = { ...h.options, env: { ...env, BILLING_LIVE_ENABLED: 'true' } };
  assert.equal((await handleBillingLiveRequest('checkout', request(), options)).statusCode, 503);
  h.runtime.store.getActivation = async () => ({ enabled: true, version: 'owner-v1', contract: { ...policy, version: 'drift' } });
  assert.equal((await handleBillingLiveRequest('checkout', request(), options)).statusCode, 503);
  h.runtime.store.getActivation = async () => ({ enabled: true, version: 'owner-v1', contract: policy });
  assert.equal((await handleBillingLiveRequest('checkout', request(), options)).statusCode, 400);
  const accepted = { ...JSON.parse(request().body), acceptedOfferVersion: 'owner-v1' };
  assert.equal((await handleBillingLiveRequest('checkout', request(accepted), options)).statusCode, 200);
});
test('Live HTTP boundary rejects a sandbox event before durable inbox', async () => {
  const h = harness(); Object.assign(h.runtime.config, { environment: 'live', accountId: 'acct_LiveFixture' });
  const r = await handleBillingLiveRequest('webhook', { httpMethod: 'POST', body: '{"original":true}' },
    { ...h.options, env: { ...env, BILLING_LIVE_ENABLED: 'true' } });
  assert.equal(r.statusCode, 400); assert.ok(!h.calls.includes('enqueue'));
});
test('malformed base64, compressed and oversized bodies are rejected', () => {
  for (const req of [{ body: 'bad?', isBase64Encoded: true }, { body: 'x', headers: { 'content-encoding': 'gzip' } }, { body: 'x'.repeat(129 * 1024) }]) {
    assert.throws(() => billingTestRawBody(req));
  }
});
test('Express raw routing precedes global JSON parsing for signed bytes', async () => {
  const app = express(); const original = '{ "preserve":  true }';
  registerBillingTestRoutes(app, async (_action, req) => {
    assert.ok(Buffer.isBuffer(req.body)); assert.equal(req.body.toString(), original);
    return { statusCode: 200, headers: {}, body: '{}' };
  });
  app.use(express.json());
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening'); const address = server.address(); assert.ok(address && typeof address !== 'string');
    const r = await fetch(`http://127.0.0.1:${address.port}/api/billing/test/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: original });
    assert.equal(r.status, 200);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
