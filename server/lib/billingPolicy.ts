/**
 * Unwired, provider-neutral policy. This module does not verify a webhook,
 * authenticate a buyer, fetch provider facts, write access or deduplicate events.
 *
 * A future adapter must bind canonical facts to its private buyer/account mapping,
 * verify the provider and environment, and reconcile under a durable transaction.
 * Event arrival order/created timestamps are not an authority or a total order:
 * duplicate/reordered events must re-read canonical facts and atomically update
 * a durable event ledger and access projection. A rejected projection is not a
 * revocation instruction and must not overwrite an existing valid paid period.
 *
 * TEST projections are sandbox outcomes only. The shared public.subscriptions
 * table/readers have no test/live dimension; never persist test access there.
 */

export const FAN_VIP_PLAN_KEY = 'fan_vip' as const;
export type FanVipOfferKey = 'fan_vip_monthly' | 'fan_vip_annual';

export interface FanVipOffer {
  readonly key: FanVipOfferKey;
  readonly planKey: typeof FAN_VIP_PLAN_KEY;
  readonly currency: 'CZK';
  readonly amountMinor: number;
  readonly interval: 'month' | 'year';
  readonly intervalCount: 1;
}

const OFFERS: Readonly<Record<FanVipOfferKey, FanVipOffer>> = Object.freeze({
  fan_vip_monthly: Object.freeze({
    key: 'fan_vip_monthly', planKey: FAN_VIP_PLAN_KEY,
    currency: 'CZK', amountMinor: 4900, interval: 'month', intervalCount: 1,
  }),
  fan_vip_annual: Object.freeze({
    key: 'fan_vip_annual', planKey: FAN_VIP_PLAN_KEY,
    currency: 'CZK', amountMinor: 49900, interval: 'year', intervalCount: 1,
  }),
});

/** Browser input may select an offer key, never its amount or provider price ID. */
export function getFanVipOffer(key: unknown): FanVipOffer | null {
  if (key !== 'fan_vip_monthly' && key !== 'fan_vip_annual') return null;
  return OFFERS[key];
}

type SubscriptionState = 'active' | 'cancelled' | 'past_due' | 'pending' | 'trialing' | 'suspended';
type PeriodPaymentState = 'paid' | 'pending' | 'unpaid' | 'refunded' | 'chargeback';
type BillingEnvironment = 'test' | 'live';

/**
 * A normalisation contract, NOT proof of provider verification. Never construct
 * this from redirect/query/body claims. paidPeriod is the actual funded access
 * period, not an unpaid upcoming invoice period. A refund/chargeback here applies
 * to that funding payment; an unrelated old refund cannot revoke a newer period.
 * A partial refund needs an explicit adapter/business decision, not a guess here.
 */
export interface CanonicalVipBillingSnapshot {
  readonly environment: BillingEnvironment;
  readonly offerKey: FanVipOfferKey;
  readonly subscriptionState: SubscriptionState;
  readonly cancelAtPeriodEnd: boolean;
  readonly paidPeriod: {
    readonly startsAt: string;
    readonly endsAt: string;
    readonly paymentState: PeriodPaymentState;
  } | null;
}

type RejectionReason = 'invalid_clock' | 'invalid_snapshot' | 'unknown_offer' | 'invalid_paid_period';
type AccessReason = 'paid' | 'not_started' | 'expired' | 'no_paid_period' | 'payment_pending'
  | 'payment_unpaid' | 'refunded' | 'chargeback' | 'suspended' | 'trial_not_offered' | 'subscription_pending';

export type VipAccessProjection =
  | { readonly kind: 'rejected'; readonly reason: RejectionReason }
  | {
    readonly kind: 'projected';
    readonly environment: BillingEnvironment;
    readonly planKey: typeof FAN_VIP_PLAN_KEY;
    readonly offerKey: FanVipOfferKey;
    readonly eligible: boolean;
    readonly reason: AccessReason;
    // Vocabulary of the existing readers. null means no access row to create.
    readonly localStatus: 'active' | 'past_due' | 'cancelled' | 'expired' | null;
    readonly validFrom: string | null;
    readonly validUntil: string | null;
    readonly renewalStopped: boolean;
  };

const SUBSCRIPTION_STATES = new Set<unknown>(['active', 'cancelled', 'past_due', 'pending', 'trialing', 'suspended']);
const PAYMENT_STATES = new Set<unknown>(['paid', 'pending', 'unpaid', 'refunded', 'chargeback']);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Adapters normalise to UTC; strict round-trip prevents Date.parse rollovers.
function instant(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const normalized = value.includes('.') ? value : value.replace('Z', '.000Z');
  return new Date(time).toISOString() === normalized ? time : null;
}

/** Pure projection only; eligibility is evaluated on the caller's server clock. */
export function projectVipAccess(snapshot: unknown, now: Date): VipAccessProjection {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return { kind: 'rejected', reason: 'invalid_clock' };
  if (!record(snapshot)) return { kind: 'rejected', reason: 'invalid_snapshot' };
  const offer = getFanVipOffer(snapshot.offerKey);
  if (!offer) return { kind: 'rejected', reason: 'unknown_offer' };
  if ((snapshot.environment !== 'test' && snapshot.environment !== 'live')
    || !SUBSCRIPTION_STATES.has(snapshot.subscriptionState)
    || typeof snapshot.cancelAtPeriodEnd !== 'boolean'
    || !('paidPeriod' in snapshot)) return { kind: 'rejected', reason: 'invalid_snapshot' };

  let startsAt: number | null = null;
  let endsAt: number | null = null;
  let paymentState: PeriodPaymentState | null = null;
  if (snapshot.paidPeriod !== null) {
    if (!record(snapshot.paidPeriod) || !PAYMENT_STATES.has(snapshot.paidPeriod.paymentState)) {
      return { kind: 'rejected', reason: 'invalid_paid_period' };
    }
    startsAt = instant(snapshot.paidPeriod.startsAt);
    endsAt = instant(snapshot.paidPeriod.endsAt);
    if (startsAt === null || endsAt === null || endsAt <= startsAt) return { kind: 'rejected', reason: 'invalid_paid_period' };
    paymentState = snapshot.paidPeriod.paymentState as PeriodPaymentState;
  }

  const environment: BillingEnvironment = snapshot.environment;
  const base = {
    kind: 'projected' as const,
    environment,
    planKey: offer.planKey,
    offerKey: offer.key,
    validFrom: startsAt === null ? null : new Date(startsAt).toISOString(),
    validUntil: endsAt === null ? null : new Date(endsAt).toISOString(),
    renewalStopped: snapshot.cancelAtPeriodEnd || snapshot.subscriptionState === 'cancelled',
  };
  const deny = (reason: AccessReason, localStatus: 'active' | 'past_due' | 'cancelled' | 'expired' | null): VipAccessProjection =>
    ({ ...base, eligible: false, reason, localStatus });

  if (snapshot.subscriptionState === 'suspended') return deny('suspended', 'cancelled');
  if (snapshot.subscriptionState === 'trialing') return deny('trial_not_offered', null);
  if (paymentState === 'refunded') return deny('refunded', 'cancelled');
  if (paymentState === 'chargeback') return deny('chargeback', 'cancelled');
  if (snapshot.subscriptionState === 'pending') return deny('subscription_pending', null);
  if (paymentState === null) return deny('no_paid_period', null);
  if (paymentState === 'pending') return deny('payment_pending', null);
  if (paymentState === 'unpaid') return deny('payment_unpaid', 'past_due');
  if (now.getTime() >= endsAt!) return deny('expired', 'expired');
  if (now.getTime() < startsAt!) return deny('not_started', 'active');

  // Cancellation/failed renewal does not erase this still-funded finite period.
  // Never copy provider 'cancelled' into a row while paid-through access remains:
  // the existing SQL readers intentionally do not grant cancelled rows.
  return { ...base, eligible: true, reason: 'paid', localStatus: 'active' };
}
