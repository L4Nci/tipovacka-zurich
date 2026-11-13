/** Internal Stripe sandbox transport. No call here grants an application capability. */
export type BillingTestOfferKey = 'fan_vip_monthly' | 'fan_vip_annual';
export type BillingTestState = 'not_started' | 'checkout_open' | 'pending' | 'paid' | 'unpaid' | 'expired' | 'cancelled' | 'refunded' | 'review';
export type BillingTestStatus = {
  environment: 'test' | 'live';
  state: BillingTestState;
  offerKey: BillingTestOfferKey | null;
  paidUntil: string | null;
  canManage: boolean;
  renewalStopped?: boolean;
};

export type BillingTestErrorCode = 'configuration' | 'signed_out' | 'forbidden' | 'busy' | 'offer_conflict' | 'rate_limited' | 'network' | 'invalid_response' | 'unavailable';
export class BillingTestError extends Error {
  constructor(public readonly code: BillingTestErrorCode, public readonly offerKey: BillingTestOfferKey | null = null) {
    super(`Billing test: ${code}`);
    this.name = 'BillingTestError';
  }
}
export class BillingTestStaleRequestError extends Error {
  constructor() { super('Billing test request no longer belongs to the mounted account.'); this.name = 'BillingTestStaleRequestError'; }
}

const states: readonly BillingTestState[] = ['not_started', 'checkout_open', 'pending', 'paid', 'unpaid', 'expired', 'cancelled', 'refunded', 'review'];
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export const isBillingTestOfferKey = (value: unknown): value is BillingTestOfferKey => value === 'fan_vip_monthly' || value === 'fan_vip_annual';

export function parseBillingTestStatus(value: unknown, environment: 'test' | 'live' = 'test'): BillingTestStatus {
  if (!object(value) || value.environment !== environment || !states.includes(value.state as BillingTestState)
    || !(value.offerKey === null || isBillingTestOfferKey(value.offerKey))
    || !(value.paidUntil === null || typeof value.paidUntil === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value.paidUntil)
      && Number.isFinite(Date.parse(value.paidUntil)))
    || typeof value.canManage !== 'boolean'
    || (value.renewalStopped !== undefined && typeof value.renewalStopped !== 'boolean')) throw new BillingTestError('invalid_response');
  return { environment, state: value.state as BillingTestState,
    offerKey: value.offerKey as BillingTestOfferKey | null, paidUntil: value.paidUntil as string | null, canManage: value.canManage,
    ...(value.renewalStopped === undefined ? {} : { renewalStopped: value.renewalStopped as boolean }) };
}

/** A server response is not an open redirect: each action has one exact Stripe origin. */
export function billingTestRedirect(value: unknown, action: 'checkout' | 'portal'): string {
  if (typeof value !== 'string' || value.length > 8192 || value.trim() !== value || !value.startsWith('https://')) {
    throw new BillingTestError('invalid_response');
  }
  let url: URL;
  try { url = new URL(value); } catch { throw new BillingTestError('invalid_response'); }
  const origin = action === 'checkout' ? 'https://checkout.stripe.com' : 'https://billing.stripe.com';
  if (url.origin !== origin || url.username || url.password || /[\\\u0000-\u0020\u007f]/.test(value)) {
    throw new BillingTestError('invalid_response');
  }
  return url.href;
}

type BillingTestClientOptions = {
  subject: string;
  getAccessToken: () => Promise<string | null>;
  getCurrentSubject: () => string | null;
  fetch?: typeof fetch;
};

/** One mounted identity owns a disposable scope; tokens are fresh and never persisted. */
function createBillingClient(options: BillingTestClientOptions, environment: 'test' | 'live') {
  const fetcher = options.fetch ?? globalThis.fetch;
  const controllers = new Set<AbortController>();
  let disposed = false;
  const assertCurrent = () => {
    if (disposed || !options.subject || options.getCurrentSubject() !== options.subject) throw new BillingTestStaleRequestError();
  };
  async function request(action: 'checkout' | 'status' | 'portal' | 'offer', body?: Record<string, unknown>): Promise<unknown> {
    assertCurrent();
    const controller = new AbortController();
    controllers.add(controller);
    try {
      const token = await options.getAccessToken();
      assertCurrent();
      if (!token || typeof token !== 'string' || !token.trim()) throw new BillingTestError('signed_out');
      const response = await fetcher(`/api/billing/${environment}/${action}`, {
        method: action === 'status' || action === 'offer' ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error',
      });
      assertCurrent();
      if (!response.ok) {
        // Read only the narrow, allowlisted conflict contract. Never display a
        // provider's error body, and fence even this JSON against identity changes.
        if (action === 'checkout' && response.status === 409) {
          let conflict: unknown;
          try { conflict = await response.json(); } catch { /* Generic busy below. */ }
          assertCurrent();
          if (object(conflict) && conflict.error === 'offer_conflict' && isBillingTestOfferKey(conflict.offerKey)) {
            throw new BillingTestError('offer_conflict', conflict.offerKey);
          }
        }
        const code: BillingTestErrorCode = response.status === 503 ? 'configuration' : response.status === 401 ? 'signed_out'
          : response.status === 403 ? 'forbidden' : response.status === 409 ? 'busy' : response.status === 429 ? 'rate_limited' : 'unavailable';
        throw new BillingTestError(code);
      }
      let value: unknown;
      try { value = await response.json(); } catch { assertCurrent(); throw new BillingTestError('invalid_response'); }
      assertCurrent();
      return value;
    } catch (error) {
      assertCurrent();
      if (error instanceof BillingTestError) throw error;
      throw new BillingTestError('network');
    } finally { controllers.delete(controller); }
  }
  return {
    async checkout(offerKey: BillingTestOfferKey, requestId: string, acceptedOfferVersion?: string) {
      if (!isBillingTestOfferKey(offerKey) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
        throw new BillingTestError('invalid_response');
      }
      if (environment === 'live' && !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(acceptedOfferVersion ?? '')) throw new BillingTestError('invalid_response');
      const result = await request('checkout', { offerKey, requestId, ...(environment === 'live' ? { acceptedOfferVersion } : {}) });
      return billingTestRedirect(object(result) ? result.checkoutUrl : null, 'checkout');
    },
    async status() { return parseBillingTestStatus(await request('status'), environment); },
    async offer() {
      if (environment !== 'live') throw new BillingTestError('invalid_response');
      const value = await request('offer');
      const prose = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 2000;
      const link = (x: unknown) => { try { const u = new URL(String(x)); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } };
      if (!object(value) || !prose(value.version) || !prose(value.summary) || !prose(value.seller)
        || !prose(value.renewalSummary) || !prose(value.cancellationSummary) || !prose(value.supportEmail)
        || value.monthly !== 49 || value.annual !== 499 || value.currency !== 'CZK'
        || !Number.isSafeInteger(value.ownedLobbyQuota) || Number(value.ownedLobbyQuota) < 2
        || !link(value.termsUrl) || !link(value.privacyUrl) || !link(value.refundUrl)) throw new BillingTestError('invalid_response');
      return value as unknown as BillingLiveOffer;
    },
    async portal() {
      const result = await request('portal', {});
      return billingTestRedirect(object(result) ? result.portalUrl : null, 'portal');
    },
    dispose() {
      disposed = true;
      for (const controller of controllers) controller.abort();
      controllers.clear();
    },
  };
}

export interface BillingLiveOffer {
  version: string; summary: string; seller: string; monthly: 49; annual: 499; currency: 'CZK'; ownedLobbyQuota: number;
  renewalSummary: string; cancellationSummary: string; termsUrl: string; privacyUrl: string; refundUrl: string; supportEmail: string;
}
export function createBillingTestClient(options: BillingTestClientOptions) { return createBillingClient(options, 'test'); }
export function createBillingLiveClient(options: BillingTestClientOptions) { return createBillingClient(options, 'live'); }
