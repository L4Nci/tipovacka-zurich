import { createHash, timingSafeEqual } from 'node:crypto';
import { isBillingTestEnabled, readBillingTestConfig, BillingTestConfigurationError, type BillingTestConfig } from './billingTestConfig.ts';
import { createBillingTestStore, createBillingLiveStore, BillingTestStoreError, type BillingTestStore } from './billingTestStore.ts';
import { createStripeTestGateway, createStripeLiveGateway, StripeTestGatewayError, type StripeTestGateway, type VerifiedStripeTestEvent } from './stripeTestGateway.ts';
import { readBillingLiveConfig } from './billingLiveConfig.ts';
import { isDeepStrictEqual } from 'node:util';
import { createBillingTestService, BillingTestServiceError, BILLING_TEST_EVENTS, type BillingTestService } from './billingTestService.ts';
import { getFanVipOffer } from './billingPolicy.ts';
import { getSupabaseAdmin } from './supabaseAdmin.ts';
import { resolveClerkPlayerId, clerkAuthorizationErrorResponse } from './clerkAuthorization.ts';

export type BillingTestAction = 'checkout' | 'status' | 'portal' | 'webhook' | 'reconcile' | 'offer';
export type BillingTestRequest = {
  httpMethod?: string; headers?: Record<string, string | undefined>;
  body?: string | Buffer | null; isBase64Encoded?: boolean;
};
export type BillingTestRuntime = { config: BillingTestConfig; store: BillingTestStore; gateway: StripeTestGateway; service: BillingTestService };
const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const response = (statusCode: number, body: Record<string, unknown>) => ({ statusCode, headers, body: JSON.stringify(body) });
const header = (request: BillingTestRequest, name: string) => Object.entries(request.headers ?? {})
  .find(([key]) => key.toLowerCase() === name)?.[1] ?? '';
const secureEqual = (actual: string, expected: string) => {
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};
/** Stable authority references, AFTER raw-byte HMAC validation. Delivery-only
 * fields, JSON key order and whitespace must not make the same event conflict.
 * Amount/status remain canonical API facts, never authority from this digest. */
export function billingEventFingerprint(event: VerifiedStripeTestEvent) {
  return createHash('sha256').update(JSON.stringify({ accountId: event.accountId, livemode: event.livemode,
    id: event.id, type: event.type, objectId: event.objectId, customerId: event.customerId,
    invoiceId: event.invoiceId ?? null, chargeId: event.chargeId ?? null, paymentIntentId: event.paymentIntentId ?? null,
    checkoutSessionId: event.checkoutSessionId ?? null, subscriptionId: event.subscriptionId ?? null })).digest('hex');
}
export function billingTestRawBody(request: BillingTestRequest): Buffer {
  if (header(request, 'content-encoding') && header(request, 'content-encoding') !== 'identity') throw new BillingTestServiceError('unsupported_encoding', 415);
  if (request.body == null) return Buffer.alloc(0);
  let bytes: Buffer;
  if (Buffer.isBuffer(request.body)) bytes = request.body;
  else if (request.isBase64Encoded) {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(request.body)) throw new BillingTestServiceError('invalid_request', 400);
    bytes = Buffer.from(request.body, 'base64');
  } else bytes = Buffer.from(request.body, 'utf8');
  if (bytes.length > 128 * 1024) throw new BillingTestServiceError('request_too_large', 413);
  return bytes;
}
const cachedRuntimes = new Map<'test' | 'live', BillingTestRuntime>();
function getRuntime(env: Record<string, string | undefined>, environment: 'test' | 'live' = 'test') {
  if (!cachedRuntimes.has(environment)) {
    const config = environment === 'live' ? readBillingLiveConfig(env) : readBillingTestConfig(env);
    const store = (environment === 'live' ? createBillingLiveStore : createBillingTestStore)(getSupabaseAdmin());
    const gateway = (environment === 'live' ? createStripeLiveGateway : createStripeTestGateway)({ secretKey: config.secretKey, webhookSecret: config.webhookSecret,
      appOrigin: config.appOrigin, expectedAccountId: config.accountId, productId: config.productId,
      priceIds: config.priceIds, portalConfigurationId: config.portalConfigurationId });
    cachedRuntimes.set(environment, { config, store, gateway, service: createBillingTestService({ config, store, gateway }) });
  }
  return cachedRuntimes.get(environment)!;
}

export async function runBillingTestRecovery(runtime: BillingTestRuntime) {
  await runtime.gateway.getAccountId();
  const jobs = await runtime.store.listPendingEvents(runtime.config.accountId, 1);
  let completed = 0;
  for (const job of jobs) {
    try {
      await runtime.service.processEvent({ ...job, accountId: runtime.config.accountId, livemode: runtime.config.environment === 'live',
        created: 0, objectId: job.objectId ?? '' }, job.fingerprint, job.claimToken);
      completed++;
    } catch { /* The durable retry retains safe diagnostics; do not log payment data. */ }
  }
  // A webhook may never have arrived. Reconcile stored sessions independently
  // of the inbox, with the same private lease/fencing path and no object creation.
  let refreshed = 0;
  {
    const candidates = await runtime.store.listReconciliationCandidates(runtime.config.accountId, 1);
    for (const candidate of candidates) {
      if (!runtime.config.publicCheckoutEnabled && !runtime.config.allowedPlayerIds.has(candidate.playerId)) continue;
      try { await runtime.service.status(candidate.playerId); refreshed++; } catch { /* Retry on the next bounded sweep. */ }
    }
  }
  return { processed: jobs.length, completed, retrying: jobs.length - completed, refreshed };
}

/** Shared HTTP boundary; local and Netlify use identical identity and raw-byte rules. */
async function handleBillingRequest(environment: 'test' | 'live', action: BillingTestAction, request: BillingTestRequest, options: {
  env?: Record<string, string | undefined>;
  runtime?: () => BillingTestRuntime;
  resolvePlayer?: (authorization: string) => Promise<string>;
} = {}) {
  const env = options.env ?? process.env;
  if (!(environment === 'test' ? isBillingTestEnabled(env) : env.BILLING_LIVE_ENABLED === 'true')) return response(404, { error: 'not_found' });
  const method = action === 'status' || action === 'offer' ? 'GET' : 'POST';
  if (request.httpMethod !== method) return response(405, { error: 'method_not_allowed' });
  try {
    const authorization = header(request, 'authorization');
    if (action !== 'webhook' && !/^Bearer [^\s]+$/.test(authorization)) return response(401, { error: 'signed_out' });
    const runtime = options.runtime?.() ?? getRuntime(env, environment);
    if ((runtime.config.environment ?? 'test') !== environment) return response(503, { error: 'configuration' });
    if (action === 'reconcile') {
      if (!secureEqual(authorization, `Bearer ${runtime.config.reconcileSecret}`)) return response(401, { error: 'unauthorized' });
      return response(200, await runBillingTestRecovery(runtime));
    }
    if (action === 'webhook') {
      const raw = billingTestRawBody(request);
      const event = await runtime.gateway.verifyWebhook(raw, header(request, 'stripe-signature'));
      await runtime.gateway.getAccountId();
      if (event.accountId !== runtime.config.accountId || event.livemode !== (environment === 'live')) throw new BillingTestServiceError('account_mismatch', 400);
      if (!BILLING_TEST_EVENTS.has(event.type)) return response(200, { received: true });
      const digest = billingEventFingerprint(event);
      await runtime.store.enqueueEvent(runtime.config.accountId, {
        id: event.id, type: event.type, livemode: environment === 'live', customerId: event.customerId, objectId: event.objectId,
        invoiceId: event.invoiceId, chargeId: event.chargeId, checkoutSessionId: event.checkoutSessionId,
        subscriptionId: event.subscriptionId, paymentIntentId: event.paymentIntentId,
      }, digest);
      // 2xx only after processing: failures remain durable AND ask Stripe to retry.
      await runtime.service.processEvent(event, digest);
      return response(200, { received: true });
    }
    const player = await (options.resolvePlayer ?? (value => resolveClerkPlayerId(getSupabaseAdmin(), value)))(authorization);
    if (!runtime.config.publicCheckoutEnabled && !runtime.config.allowedPlayerIds.has(player)) return response(403, { error: 'forbidden' });
    if (action === 'offer' && environment !== 'live') return response(404, { error: 'not_found' });
    if (!await runtime.store.consumeRateLimit(runtime.config.accountId, player, action === 'offer' ? 'status' : action)) return response(429, { error: 'rate_limited' });
    if ((action === 'checkout' || action === 'offer') && environment === 'live') {
      const accepted = await runtime.store.getActivation(runtime.config.accountId);
      if (!runtime.config.checkoutEnabled || !accepted?.enabled || accepted.version !== runtime.config.activationVersion
        || !isDeepStrictEqual(accepted.contract, runtime.config.activationContract)) return response(503, { error: 'offer_not_active' });
      if (action === 'offer') {
        const policy = accepted.contract as Record<string, unknown>;
        return response(200, { version: accepted.version, monthly: 49, annual: 499, currency: 'CZK',
          summary: policy.offerSummary, seller: policy.sellerDisplayName, ownedLobbyQuota: policy.ownedLobbyQuota,
          renewalSummary: policy.renewalSummary, cancellationSummary: policy.cancellationSummary,
          termsUrl: policy.termsUrl, privacyUrl: policy.privacyUrl, refundUrl: policy.refundUrl, supportEmail: policy.supportEmail });
      }
    }
    await runtime.gateway.getAccountId();
    if (action === 'status') return response(200, await runtime.service.status(player));
    if (!/^application\/json(?:;|$)/i.test(header(request, 'content-type'))) return response(415, { error: 'unsupported_content_type' });
    let body: unknown;
    try { body = JSON.parse(billingTestRawBody(request).toString('utf8')); } catch (error) {
      if (error instanceof BillingTestServiceError) throw error;
      return response(400, { error: 'invalid_request' });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return response(400, { error: 'invalid_request' });
    const fields = body as Record<string, unknown>;
    if (action === 'portal') {
      if (Object.keys(fields).length) return response(400, { error: 'invalid_request' });
      return response(200, await runtime.service.portal(player));
    }
    const offer = getFanVipOffer(fields.offerKey);
    if (Object.keys(fields).some(key => !(environment === 'live' ? ['offerKey', 'requestId', 'acceptedOfferVersion'] : ['offerKey', 'requestId']).includes(key)) || !offer
      || (environment === 'live' && fields.acceptedOfferVersion !== runtime.config.activationVersion)
      || typeof fields.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fields.requestId)) {
      return response(400, { error: 'invalid_request' });
    }
    return response(200, await runtime.service.checkout(player, offer.key));
  } catch (error) {
    const auth = clerkAuthorizationErrorResponse(error);
    if (auth) return response(auth.statusCode, { error: auth.statusCode === 401 ? 'signed_out' : 'unavailable' });
    if (error instanceof BillingTestServiceError) return response(error.statusCode, { error: error.code, ...(error.offerKey ? { offerKey: error.offerKey } : {}) });
    if (error instanceof StripeTestGatewayError) return response(error.statusCode >= 500 ? 503 : error.statusCode, { error: error.statusCode >= 500 ? 'unavailable' : 'invalid_request' });
    if (error instanceof BillingTestStoreError) return response(error.statusCode, { error: error.code });
    if (error instanceof BillingTestConfigurationError) return response(503, { error: 'configuration' });
    return response(503, { error: 'unavailable' });
  }
}

export type BillingHttpOptions = Parameters<typeof handleBillingRequest>[3];
export function handleBillingTestRequest(action: BillingTestAction, request: BillingTestRequest, options?: BillingHttpOptions) {
  return handleBillingRequest('test', action, request, options);
}
export function handleBillingLiveRequest(action: BillingTestAction, request: BillingTestRequest, options?: BillingHttpOptions) {
  return handleBillingRequest('live', action, request, options);
}

/** For Netlify's scheduler only. Never turn an unauthenticated HTTP request into a service request. */
export async function runScheduledBillingTestRecovery(env: Record<string, string | undefined> = process.env) {
  if (!isBillingTestEnabled(env)) return { disabled: true };
  return runBillingTestRecovery(getRuntime(env));
}
export async function runScheduledBillingLiveRecovery(env: Record<string, string | undefined> = process.env) {
  if (env.BILLING_LIVE_ENABLED !== 'true') return { disabled: true };
  return runBillingTestRecovery(getRuntime(env, 'live'));
}
