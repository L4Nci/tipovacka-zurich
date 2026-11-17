import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BillingTestError, BillingTestStaleRequestError, billingTestRedirect, createBillingTestClient, createBillingLiveClient, parseBillingTestStatus } from './billingTest.ts';

const requestId = '0bb857af-1170-4ee9-b45f-4267597c4078';
const status = { environment: 'test', state: 'paid', offerKey: 'fan_vip_annual', paidUntil: '2027-11-10T20:00:00.000Z', canManage: true };
const response = (body: unknown, code = 200) => new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } });
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const errorCode = (code: string) => (error: unknown) => error instanceof BillingTestError && error.code === code;

test('construction makes no request and each explicit operation obtains a fresh token', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  let tokens = 0;
  const client = createBillingTestClient({ subject: 'user_A', getCurrentSubject: () => 'user_A',
    getAccessToken: async () => `fresh-${++tokens}`, fetch: (async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return response(String(url).endsWith('/checkout') ? { checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_example' }
        : String(url).endsWith('/portal') ? { portalUrl: 'https://billing.stripe.com/p/session/test_example' } : status);
    }) as typeof fetch });
  assert.equal(calls.length, 0);
  assert.equal(await client.checkout('fan_vip_annual', requestId), 'https://checkout.stripe.com/c/pay/cs_test_example');
  assert.deepEqual(await client.status(), status);
  assert.equal(await client.portal(), 'https://billing.stripe.com/p/session/test_example');
  assert.equal(tokens, 3);
  assert.deepEqual(calls.map(call => call.init.headers), [
    { Authorization: 'Bearer fresh-1', 'Content-Type': 'application/json' },
    { Authorization: 'Bearer fresh-2' },
    { Authorization: 'Bearer fresh-3', 'Content-Type': 'application/json' },
  ]);
  assert.deepEqual(JSON.parse(calls[0].init.body as string), { offerKey: 'fan_vip_annual', requestId });
  assert.equal(calls[1].init.method, 'GET');
  assert.equal(calls[1].init.body, undefined);
  assert.equal(calls[2].init.body, '{}');
  for (const { init } of calls) {
    assert.equal(init.credentials, 'omit'); assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
  }
  client.dispose();
});

test('an identity switch while waiting for a token prevents the network call', async () => {
  let current = 'user_A'; let called = false;
  const token = deferred<string | null>();
  const client = createBillingTestClient({ subject: 'user_A', getCurrentSubject: () => current,
    getAccessToken: () => token.promise, fetch: (async () => { called = true; return response(status); }) as typeof fetch });
  const pending = client.checkout('fan_vip_monthly', requestId);
  current = 'user_B'; token.resolve('fresh-B');
  await assert.rejects(pending, BillingTestStaleRequestError);
  assert.equal(called, false);
});

test('a late checkout reply cannot become a redirect for another account', async () => {
  let current = 'user_A'; const network = deferred<Response>();
  const client = createBillingTestClient({ subject: 'user_A', getCurrentSubject: () => current,
    getAccessToken: async () => 'fresh-A', fetch: (() => network.promise) as typeof fetch });
  const pending = client.checkout('fan_vip_monthly', requestId);
  await Promise.resolve(); current = 'user_B';
  network.resolve(response({ checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_old' }));
  await assert.rejects(pending, BillingTestStaleRequestError);
});

test('disposing aborts in-flight work and ignores late status JSON even if fetch does not honour abort', async () => {
  let signal: AbortSignal | undefined; const json = deferred<unknown>(); const jsonStarted = deferred<void>();
  const client = createBillingTestClient({ subject: 'user_A', getCurrentSubject: () => 'user_A', getAccessToken: async () => 'fresh-A',
    fetch: (async (_url, init) => {
      signal = init?.signal as AbortSignal;
      return { ok: true, json: () => { jsonStarted.resolve(); return json.promise; } } as Response;
    }) as typeof fetch });
  const pending = client.status(); await jsonStarted.promise;
  client.dispose(); assert.equal(signal?.aborted, true); json.resolve(status);
  await assert.rejects(pending, BillingTestStaleRequestError);
  await assert.rejects(client.portal(), BillingTestStaleRequestError);
});

test('a disposed scope cannot revive when the same subject remounts', async () => {
  const token = deferred<string | null>(); let requests = 0;
  const options = { subject: 'user_A', getCurrentSubject: () => 'user_A', getAccessToken: () => token.promise,
    fetch: (async () => { requests++; return response(status); }) as typeof fetch };
  const old = createBillingTestClient(options); const pending = old.status(); old.dispose();
  const replacement = createBillingTestClient({ ...options, getAccessToken: async () => 'fresh-A' });
  token.resolve('old-A'); await assert.rejects(pending, BillingTestStaleRequestError);
  assert.deepEqual(await replacement.status(), status); assert.equal(requests, 1);
});

test('missing token refuses all network calls and token failures are safe messages', async () => {
  let called = false;
  const fetcher = (async () => { called = true; return response(status); }) as typeof fetch;
  const empty = createBillingTestClient({ subject: 'user_A', getCurrentSubject: () => 'user_A', getAccessToken: async () => null, fetch: fetcher });
  await assert.rejects(empty.status(), errorCode('signed_out')); assert.equal(called, false);
  const failed = createBillingTestClient({ subject: 'user_A', getCurrentSubject: () => 'user_A', getAccessToken: async () => { throw new Error('private-provider-detail'); }, fetch: fetcher });
  await assert.rejects(failed.status(), error => errorCode('network')(error) && !(error as Error).message.includes('private-provider-detail'));
  assert.equal(called, false);
});

test('HTTP failures never display a raw provider or configuration body', async () => {
  for (const [code, expected] of [[503, 'configuration'], [401, 'signed_out'], [403, 'forbidden'], [409, 'busy'], [429, 'rate_limited'], [500, 'unavailable']] as const) {
    const client = createBillingTestClient({ subject: 'user_A', getCurrentSubject: () => 'user_A', getAccessToken: async () => 'fresh-A',
      fetch: (async () => response({ error: 'private-provider-detail' }, code)) as typeof fetch });
    await assert.rejects(client.status(), error => errorCode(expected)(error) && !(error as Error).message.includes('private-provider-detail'));
  }
});

test('checkout interval conflict exposes only an allowlisted existing offer and never redirects', async () => {
  const options = { subject: 'user_A', getCurrentSubject: () => 'user_A', getAccessToken: async () => 'fresh-A' };
  const conflict = createBillingTestClient({ ...options, fetch: (async () => response({ error: 'offer_conflict',
    offerKey: 'fan_vip_monthly', checkoutUrl: 'https://checkout.stripe.com/private', detail: 'private-provider-detail' }, 409)) as typeof fetch });
  await assert.rejects(conflict.checkout('fan_vip_annual', requestId), error =>
    error instanceof BillingTestError && error.code === 'offer_conflict' && error.offerKey === 'fan_vip_monthly'
      && !error.message.includes('private-provider-detail'));
  for (const body of [{ error: 'offer_conflict', offerKey: 'arbitrary_price' }, { error: 'private-provider-detail', offerKey: 'fan_vip_monthly' }]) {
    const unsafe = createBillingTestClient({ ...options, fetch: (async () => response(body, 409)) as typeof fetch });
    await assert.rejects(unsafe.checkout('fan_vip_annual', requestId), error =>
      error instanceof BillingTestError && error.code === 'busy' && error.offerKey === null);
  }
});

test('an identity switch during conflict JSON cannot expose another account offer', async () => {
  let current = 'user_A'; const json = deferred<unknown>(); const started = deferred<void>();
  const client = createBillingTestClient({ subject: 'user_A', getCurrentSubject: () => current,
    getAccessToken: async () => 'fresh-A', fetch: (async () => ({ ok: false, status: 409,
      json: () => { started.resolve(); return json.promise; } } as Response)) as typeof fetch });
  const pending = client.checkout('fan_vip_annual', requestId); await started.promise;
  current = 'user_B'; json.resolve({ error: 'offer_conflict', offerKey: 'fan_vip_monthly' });
  await assert.rejects(pending, BillingTestStaleRequestError);
});

test('test DTO rejects live, unknown state/offer, invalid dates and truthy non-boolean permissions', () => {
  assert.deepEqual(parseBillingTestStatus(status), status);
  for (const change of [{ environment: 'live' }, { state: 'active' }, { offerKey: 'arbitrary_price' }, { paidUntil: 'tomorrow' }, { paidUntil: '2027-11-10' }, { canManage: 'true' }]) {
    assert.throws(() => parseBillingTestStatus({ ...status, ...change }), errorCode('invalid_response'));
  }
  assert.deepEqual(parseBillingTestStatus({ ...status, state: 'not_started', offerKey: null, paidUntil: null, canManage: false }),
    { environment: 'test', state: 'not_started', offerKey: null, paidUntil: null, canManage: false });
  assert.deepEqual(parseBillingTestStatus({ ...status, renewalStopped: true }), { ...status, renewalStopped: true });
  assert.throws(() => parseBillingTestStatus({ ...status, renewalStopped: 'true' }), errorCode('invalid_response'));
});

test('redirects require the exact action-specific HTTPS origin and no credentials or parsing tricks', () => {
  assert.equal(billingTestRedirect('https://checkout.stripe.com/c/pay/cs_test_example', 'checkout'), 'https://checkout.stripe.com/c/pay/cs_test_example');
  assert.equal(billingTestRedirect('https://billing.stripe.com/p/session/test_example', 'portal'), 'https://billing.stripe.com/p/session/test_example');
  for (const value of ['//checkout.stripe.com/a', 'http://checkout.stripe.com/a', 'https://checkout.stripe.com.evil.example/a',
    'https://evil.example/?next=https://checkout.stripe.com', 'https://user:pass@checkout.stripe.com/a',
    'https://checkout.stripe.com:444/a', 'https://checkout.stripe.com\\@evil.example/a', ' https://checkout.stripe.com/a',
    'https://checkout.stripe.com/a\n', 'javascript:alert(1)', 'https://billing.stripe.com/p/session/test']) {
    assert.throws(() => billingTestRedirect(value, 'checkout'), errorCode('invalid_response'), value);
  }
  assert.throws(() => billingTestRedirect('https://checkout.stripe.com/c/pay/cs_test_example', 'portal'), errorCode('invalid_response'));
});

test('arbitrary checkout fields and malformed request IDs never reach the API', async () => {
  let calls = 0;
  const client = createBillingTestClient({ subject: 'user_A', getCurrentSubject: () => 'user_A', getAccessToken: async () => 'fresh-A',
    fetch: (async () => { calls++; return response(status); }) as typeof fetch });
  await assert.rejects(client.checkout('arbitrary_price' as never, requestId), errorCode('invalid_response'));
  await assert.rejects(client.checkout('fan_vip_annual', 'not-a-request-id'), errorCode('invalid_response'));
  assert.equal(calls, 0);
});

test('invalid JSON and non-Stripe checkout results fail closed', async () => {
  const options = { subject: 'user_A', getCurrentSubject: () => 'user_A', getAccessToken: async () => 'fresh-A' };
  const invalidJson = createBillingTestClient({ ...options, fetch: (async () => new Response('not-json')) as typeof fetch });
  await assert.rejects(invalidJson.status(), errorCode('invalid_response'));
  const wrongRedirect = createBillingTestClient({ ...options, fetch: (async () => response({ checkoutUrl: 'https://evil.example' })) as typeof fetch });
  await assert.rejects(wrongRedirect.checkout('fan_vip_monthly', requestId), errorCode('invalid_response'));
});

test('Live transport requires explicit accepted offer version and never accepts TEST status', async () => {
  const calls: {url:string;body:unknown}[] = [];
  const client = createBillingLiveClient({subject:'A',getCurrentSubject:()=> 'A',getAccessToken:async()=> 'fresh',
    fetch:(async(url,init)=> {calls.push({url:String(url),body:init?.body?JSON.parse(String(init.body)):null});
      return String(url).endsWith('/status')?response(status):response({checkoutUrl:'https://checkout.stripe.com/c/live'});}) as typeof fetch});
  await assert.rejects(client.checkout('fan_vip_monthly',requestId),errorCode('invalid_response')); assert.equal(calls.length,0);
  await client.checkout('fan_vip_monthly',requestId,'owner-v1');
  assert.equal(calls[0].url,'/api/billing/live/checkout');
  assert.deepEqual(calls[0].body,{offerKey:'fan_vip_monthly',requestId,acceptedOfferVersion:'owner-v1'});
  await assert.rejects(client.status(),errorCode('invalid_response'));
});
test('Live offer rejects changed price and unsafe document links before any checkout', async () => {
  const offer={version:'owner-v1',summary:'Accepted features',seller:'Seller',monthly:49,annual:499,currency:'CZK',ownedLobbyQuota:3,
    renewalSummary:'Accepted renewal',cancellationSummary:'Accepted cancellation',termsUrl:'https://example.com/terms',privacyUrl:'https://example.com/privacy',refundUrl:'https://example.com/refund',supportEmail:'support@example.com'};
  for(const change of [{monthly:29},{annual:49},{termsUrl:'javascript:alert(1)'},{privacyUrl:'https://secret@evil.example'}, {currency:'EUR'}]) {
    const client=createBillingLiveClient({subject:'A',getCurrentSubject:()=> 'A',getAccessToken:async()=> 'fresh',fetch:(async()=>response({...offer,...change})) as typeof fetch});
    await assert.rejects(client.offer(),errorCode('invalid_response'));
  }
});
