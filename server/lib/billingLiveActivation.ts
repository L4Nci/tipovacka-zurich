import { FAN_VIP_PLAN_KEY } from './billingPolicy.ts';

/** A deployment-owned attestation, never a checkout request or legal assessment. */
export interface BillingLiveActivation {
  readonly status: 'accepted';
  readonly version: string;
  readonly accountId: string;
  readonly planKey: typeof FAN_VIP_PLAN_KEY;
  readonly currency: 'CZK';
  readonly monthlyAmountMinor: 4900;
  readonly annualAmountMinor: 49900;
  readonly sellerReference: string;
  readonly sellerDisplayName: string;
  readonly offerSummary: string;
  readonly renewalSummary: string;
  readonly cancellationSummary: string;
  readonly termsUrl: string;
  readonly privacyUrl: string;
  readonly refundUrl: string;
  readonly supportEmail: string;
  readonly termsVersion: string;
  readonly refundPolicyVersion: string;
  readonly appearancePolicyVersion: string;
  readonly acceptedCapabilities: readonly string[];
  readonly ownedLobbyQuota: number;
  // The current strict payment proof supports no-tax invoices only. Selecting
  // this value does not determine whether the seller has tax obligations.
  readonly taxModel: 'no_tax';
  readonly appOrigin: string;
  readonly clerkIssuer: string;
  readonly acceptedAt: string;
}

export class BillingLiveActivationError extends Error {
  constructor() { super('billing_live_offer_not_accepted'); this.name = 'BillingLiveActivationError'; }
}

const fields = ['status', 'version', 'accountId', 'planKey', 'currency', 'monthlyAmountMinor', 'annualAmountMinor',
  'sellerReference', 'sellerDisplayName', 'offerSummary', 'renewalSummary', 'cancellationSummary',
  'termsUrl', 'privacyUrl', 'refundUrl', 'supportEmail', 'termsVersion', 'refundPolicyVersion', 'appearancePolicyVersion', 'acceptedCapabilities',
  'ownedLobbyQuota', 'taxModel', 'appOrigin', 'clerkIssuer', 'acceptedAt'] as const;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const token = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value);
const prose = (value: unknown, maximum: number): value is string => typeof value === 'string'
  && value.trim() === value && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
const fail = (): never => { throw new BillingLiveActivationError(); };

function httpsOrigin(value: unknown): string {
  if (typeof value !== 'string') return fail();
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
      || url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || !url.hostname.includes('.')
      || /^\d+(\.\d+){3}$/.test(url.hostname)) return fail();
    return url.origin;
  } catch { return fail(); }
}

function httpsLink(value: unknown): string {
  if (!prose(value, 2048)) return fail();
  try {
    const url = new URL(value);
    httpsOrigin(url.origin);
    if (url.username || url.password) return fail();
    return url.href;
  } catch { return fail(); }
}

/** No side effects, defaults, capability creation, Stripe calls or activation. */
export function readBillingLiveActivation(value: unknown, now: Date = new Date()): BillingLiveActivation {
  if (!object(value) || Object.keys(value).length !== fields.length || fields.some(key => !(key in value))
    || value.status !== 'accepted' || !token(value.version) || value.planKey !== FAN_VIP_PLAN_KEY
    || value.currency !== 'CZK' || value.monthlyAmountMinor !== 4900 || value.annualAmountMinor !== 49900
    || value.taxModel !== 'no_tax' || typeof value.accountId !== 'string' || !/^acct_[A-Za-z0-9]{1,123}$/.test(value.accountId)
    || value.accountId === 'acct_1UQsnbC66ykHzmj6'
    || !token(value.sellerReference) || !token(value.termsVersion) || !token(value.refundPolicyVersion) || !token(value.appearancePolicyVersion)
    || !prose(value.sellerDisplayName, 200) || !prose(value.offerSummary, 1000)
    || !prose(value.renewalSummary, 1000) || !prose(value.cancellationSummary, 1000)
    || !prose(value.supportEmail, 254) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.supportEmail)
    || !Number.isSafeInteger(value.ownedLobbyQuota) || (value.ownedLobbyQuota as number) < 2 || (value.ownedLobbyQuota as number) > 10000
    || !Array.isArray(value.acceptedCapabilities) || value.acceptedCapabilities.length < 1 || value.acceptedCapabilities.length > 32
    || value.acceptedCapabilities.some(key => typeof key !== 'string' || !/^[a-z][a-z0-9_]{2,63}$/.test(key))
    || new Set(value.acceptedCapabilities).size !== value.acceptedCapabilities.length
    || typeof value.acceptedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.acceptedAt)
    || !Number.isFinite(now.getTime())) return fail();
  const accepted = new Date(value.acceptedAt);
  if (!Number.isFinite(accepted.getTime()) || accepted.toISOString() !== value.acceptedAt || accepted.getTime() > now.getTime()) return fail();
  const result = { ...value, appOrigin: httpsOrigin(value.appOrigin), clerkIssuer: httpsOrigin(value.clerkIssuer),
    termsUrl: httpsLink(value.termsUrl), privacyUrl: httpsLink(value.privacyUrl), refundUrl: httpsLink(value.refundUrl),
    acceptedCapabilities: Object.freeze([...value.acceptedCapabilities].sort()) } as unknown as BillingLiveActivation;
  return Object.freeze(result);
}
