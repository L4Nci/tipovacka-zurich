import type { SupabaseClient } from '@supabase/supabase-js';
import type { CanonicalVipBillingSnapshot, FanVipOfferKey } from './billingPolicy.ts';

/** Service-only mode-scoped ports. TEST uses private TEST RPCs; LIVE uses its
 * separate ledger and admitted, finite-period entitlement projection. */
export interface BillingTestIntent {
  id: string;
  offerKey: FanVipOfferKey;
  state: 'reserved' | 'open' | 'completed' | 'expired' | 'retired';
  customerId: string | null;
  sessionId: string | null;
  checkoutUrl: string | null;
  expiresAt: string | null;
  idempotencyKey: string;
  createdAt: string;
  customerCreatedAt: string;
  customerIdempotencyKey: string;
}

export interface BillingTestFundingPeriod {
  snapshot: CanonicalVipBillingSnapshot;
  invoiceId: string;
  invoiceLineId: string;
  paymentIntentId: string;
  chargeId: string;
  requiresReview?: boolean;
}

/** Verified safe event references only; no raw payload, card data or URLs. */
export interface BillingTestInboxEvent {
  id: string;
  type: string;
  livemode: boolean;
  customerId: string | null;
  objectId: string | null;
  invoiceId?: string | null;
  chargeId?: string | null;
  paymentIntentId?: string | null;
  checkoutSessionId?: string | null;
  subscriptionId?: string | null;
}

export interface BillingTestPendingEvent extends BillingTestInboxEvent {
  fingerprint: string;
  attempts: number;
  claimToken: string;
}

export interface BillingTestEventReferences {
  sessionId?: string | null;
  subscriptionId?: string | null;
  invoiceId?: string | null;
  chargeId?: string | null;
}

export interface BillingTestRecoveredCheckout {
  id: string;
  customerId: string | null;
  checkoutIntentId: string | null;
  offerKey: FanVipOfferKey | null;
  status: 'open' | 'complete' | 'expired' | null;
  subscriptionId: string | null;
  url: string | null;
  expiresAt: number | string;
}

export interface BillingTestStatus {
  intent: BillingTestIntent | null;
  outcome: 'pending' | 'verified' | 'requires_review' | null;
  snapshot: CanonicalVipBillingSnapshot | null;
  subscriptionId: string | null;
  invoiceId: string | null;
  verifiedAt: string | null;
  fundingPeriods: BillingTestFundingPeriod[];
  reviewInvoiceIds?: string[];
}

export type BillingTestReconciliation =
  | { kind: 'completed' | 'busy' | 'unmapped' }
  | { kind: 'claimed'; playerId: string; leaseToken: string; leaseVersion: number; status: BillingTestStatus };

export interface BillingTestReconciliationKey {
  accountId: string;
  playerId: string;
  eventId: string;
  fingerprint: string;
  leaseToken: string;
  leaseVersion: number;
}

export interface BillingTestCompletion extends BillingTestReconciliationKey {
  intentId: string;
  outcome: 'pending' | 'verified' | 'requires_review';
  subscriptionId: string | null;
  invoiceId: string | null;
  snapshot: CanonicalVipBillingSnapshot | null;
  fundingPeriods?: BillingTestFundingPeriod[];
  reviewInvoiceIds?: string[];
}

export class BillingTestStoreError extends Error {
  readonly statusCode: 409 | 503;
  constructor(readonly code: 'billing_conflict' | 'billing_unavailable') {
    super(code === 'billing_conflict' ? 'Billing state conflicts with this request.' : 'Billing storage is temporarily unavailable.');
    this.name = 'BillingTestStoreError';
    this.statusCode = code === 'billing_conflict' ? 409 : 503;
  }
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const textOrNull = (value: unknown) => value === null || typeof value === 'string';

function intent(value: unknown): BillingTestIntent {
  if (!object(value) || typeof value.id !== 'string'
    || !['fan_vip_monthly', 'fan_vip_annual'].includes(String(value.offerKey))
    || !['reserved', 'open', 'completed', 'expired', 'retired'].includes(String(value.state))
    || !textOrNull(value.customerId) || !textOrNull(value.sessionId)
    || !textOrNull(value.checkoutUrl) || !textOrNull(value.expiresAt)
    || typeof value.idempotencyKey !== 'string'
    || typeof value.createdAt !== 'string' || typeof value.customerCreatedAt !== 'string'
    || typeof value.customerIdempotencyKey !== 'string'
    || !Number.isFinite(Date.parse(value.createdAt)) || !Number.isFinite(Date.parse(value.customerCreatedAt))) {
    throw new BillingTestStoreError('billing_unavailable');
  }
  return value as unknown as BillingTestIntent;
}

function status(value: unknown, environment: 'test' | 'live' = 'test'): BillingTestStatus {
  if (!object(value) || !textOrNull(value.subscriptionId) || !textOrNull(value.invoiceId)
    || (value.outcome !== null && !['pending', 'verified', 'requires_review'].includes(String(value.outcome)))
    || !textOrNull(value.verifiedAt) || !Array.isArray(value.fundingPeriods)
    || value.fundingPeriods.some(period => !object(period) || !object(period.snapshot)
      || period.snapshot.environment !== environment || typeof period.invoiceId !== 'string'
      || typeof period.invoiceLineId !== 'string' || typeof period.paymentIntentId !== 'string' || typeof period.chargeId !== 'string'
      || (period.requiresReview !== undefined && typeof period.requiresReview !== 'boolean'))
    || (value.reviewInvoiceIds !== undefined && (!Array.isArray(value.reviewInvoiceIds)
      || value.reviewInvoiceIds.some(id => typeof id !== 'string')))
    || (value.snapshot !== null && (!object(value.snapshot) || value.snapshot.environment !== environment))) {
    throw new BillingTestStoreError('billing_unavailable');
  }
  return { ...value, intent: value.intent === null ? null : intent(value.intent) } as unknown as BillingTestStatus;
}

function createBillingStore(database: SupabaseClient, environment: 'test' | 'live') {
  async function rpc(name: string, parameters: Record<string, unknown>): Promise<unknown> {
    try {
      const rpcName = environment === 'live' ? name.replace(/^billing_test_/, 'billing_live_') : name;
      const { data, error } = await database.rpc(rpcName, parameters);
      if (error) {
        // Do not expose SQL internals, payment data or provider identifiers.
        throw new BillingTestStoreError(typeof error.code === 'string' && /^(PBT|PBL)/.test(error.code)
          ? 'billing_conflict' : 'billing_unavailable');
      }
      return data;
    } catch (error) {
      if (error instanceof BillingTestStoreError) throw error;
      throw new BillingTestStoreError('billing_unavailable');
    }
  }

  const key = (value: BillingTestReconciliationKey) => ({
    p_account_id: value.accountId, p_player_id: value.playerId,
    p_event_id: value.eventId, p_fingerprint: value.fingerprint,
    p_lease_token: value.leaseToken, p_lease_version: value.leaseVersion,
  });

  return {
    async getActivation(accountId: string): Promise<{ enabled: boolean; version: string; contract: unknown } | null> {
      if (environment !== 'live') throw new BillingTestStoreError('billing_conflict');
      const result = await rpc('billing_live_get_activation', { p_account_id: accountId });
      if (result === null) return null;
      if (!object(result) || typeof result.enabled !== 'boolean' || typeof result.version !== 'string' || !object(result.contract)) throw new BillingTestStoreError('billing_unavailable');
      return { enabled: result.enabled, version: result.version, contract: result.contract };
    },
    async admitCheckout(accountId: string, playerId: string, intentId: string, version: string): Promise<void> {
      if (environment !== 'live' || await rpc('billing_live_admit_checkout', { p_account_id: accountId,
        p_player_id: playerId, p_intent_id: intentId, p_version: version }) !== true) throw new BillingTestStoreError('billing_conflict');
    },
    async consumeRateLimit(accountId: string, playerId: string, action: 'checkout' | 'status' | 'portal'): Promise<boolean> {
      const result = await rpc('billing_test_consume_rate_limit', { p_account_id: accountId,
        p_player_id: playerId, p_action: action });
      if (typeof result !== 'boolean') throw new BillingTestStoreError('billing_unavailable');
      return result;
    },
    async enqueueEvent(accountId: string, event: BillingTestInboxEvent, fingerprint: string): Promise<boolean> {
      const result = await rpc('billing_test_enqueue_event', {
        p_account_id: accountId, p_event: event, p_fingerprint: fingerprint,
      });
      if (typeof result !== 'boolean') throw new BillingTestStoreError('billing_unavailable');
      return result;
    },
    async listPendingEvents(accountId: string, limit = 20): Promise<BillingTestPendingEvent[]> {
      const result = await rpc('billing_test_list_pending_events', { p_account_id: accountId, p_limit: limit });
      if (!Array.isArray(result) || result.some(event => !object(event) || event.livemode !== (environment === 'live')
        || typeof event.id !== 'string' || typeof event.type !== 'string' || !textOrNull(event.customerId)
        || !textOrNull(event.objectId) || typeof event.fingerprint !== 'string'
        || !Number.isSafeInteger(event.attempts) || typeof event.claimToken !== 'string')) {
        throw new BillingTestStoreError('billing_unavailable');
      }
      return result as BillingTestPendingEvent[];
    },
    async listReconciliationCandidates(accountId: string, limit = 20): Promise<{ playerId: string; status: BillingTestStatus }[]> {
      const result = await rpc('billing_test_list_reconciliation_candidates', { p_account_id: accountId, p_limit: limit });
      if (!Array.isArray(result)) throw new BillingTestStoreError('billing_unavailable');
      return result.map(candidate => {
        if (!object(candidate) || typeof candidate.playerId !== 'string') throw new BillingTestStoreError('billing_unavailable');
        return { playerId: candidate.playerId, status: status(candidate.status, environment) };
      });
    },
    async bindEventCustomer(accountId: string, eventId: string, fingerprint: string, customerId: string): Promise<void> {
      if (await rpc('billing_test_bind_event_customer', { p_account_id: accountId, p_event_id: eventId,
        p_fingerprint: fingerprint, p_customer_id: customerId }) !== true) throw new BillingTestStoreError('billing_unavailable');
    },
    async deferEvent(accountId: string, eventId: string, fingerprint: string,
      errorCode: string, claimToken?: string): Promise<boolean> {
      const result = await rpc('billing_test_defer_event', { p_account_id: accountId, p_event_id: eventId,
        p_fingerprint: fingerprint, p_error_code: errorCode, p_claim_token: claimToken ?? null });
      if (typeof result !== 'boolean') throw new BillingTestStoreError('billing_unavailable');
      return result;
    },
    async reserveCheckout(accountId: string, playerId: string, offerKey: FanVipOfferKey): Promise<BillingTestIntent> {
      return intent(await rpc('billing_test_reserve_checkout', {
        p_account_id: accountId, p_player_id: playerId, p_offer_key: offerKey,
      }));
    },
    async bindCustomer(accountId: string, playerId: string, customerId: string): Promise<void> {
      if (await rpc('billing_test_bind_customer', {
        p_account_id: accountId, p_player_id: playerId, p_customer_id: customerId,
      }) !== true) throw new BillingTestStoreError('billing_unavailable');
    },
    async saveCheckout(accountId: string, playerId: string, intentId: string, customerId: string,
      sessionId: string, checkoutUrl: string, expiresAt: string): Promise<BillingTestIntent> {
      return intent(await rpc('billing_test_save_checkout', {
        p_account_id: accountId, p_player_id: playerId, p_intent_id: intentId,
        p_customer_id: customerId, p_session_id: sessionId,
        p_checkout_url: checkoutUrl, p_expires_at: expiresAt,
      }));
    },
    /** Bind a canonically retrieved Session after an ambiguous provider-create/DB-save outcome. */
    async bindRecoveredCheckout(accountId: string, playerId: string, intentId: string,
      session: BillingTestRecoveredCheckout): Promise<BillingTestIntent> {
      const expiry = typeof session.expiresAt === 'number' ? new Date(session.expiresAt * 1000) : new Date(session.expiresAt);
      if (!Number.isFinite(expiry.getTime())) throw new BillingTestStoreError('billing_conflict');
      return intent(await rpc('billing_test_bind_recovered_checkout', { p_account_id: accountId,
        p_player_id: playerId, p_intent_id: intentId, p_session: { ...session, expiresAt: expiry.toISOString() } }));
    },
    /** Call only after canonical provider confirmation of this exact session's expiry. */
    async expireCheckout(accountId: string, playerId: string, intentId: string, sessionId: string): Promise<void> {
      if (await rpc('billing_test_expire_checkout', {
        p_account_id: accountId, p_player_id: playerId,
        p_intent_id: intentId, p_session_id: sessionId,
      }) !== true) throw new BillingTestStoreError('billing_unavailable');
    },
    async getStatus(accountId: string, playerId: string, intentId?: string): Promise<BillingTestStatus> {
      return status(await rpc('billing_test_get_status', {
        p_account_id: accountId, p_player_id: playerId, p_intent_id: intentId ?? null,
      }), environment);
    },
    async findEventStatus(accountId: string, customerId: string, references: BillingTestEventReferences): Promise<BillingTestStatus | null> {
      const result = await rpc('billing_test_find_event_status', { p_account_id: accountId,
        p_customer_id: customerId, p_references: references });
      return result === null ? null : status(result, environment);
    },
    /** Gateway must first prove terminal subscription and no other active/unfinished subscriptions. */
    async retireCheckout(accountId: string, playerId: string, intentId: string, subscriptionId: string): Promise<void> {
      if (await rpc('billing_test_retire_checkout', { p_account_id: accountId, p_player_id: playerId,
        p_intent_id: intentId, p_subscription_id: subscriptionId }) !== true) throw new BillingTestStoreError('billing_unavailable');
    },
    async beginReconciliation(accountId: string, customerId: string, eventId: string,
      eventType: string, fingerprint: string): Promise<BillingTestReconciliation> {
      const result = await rpc('billing_test_begin_reconciliation', {
        p_account_id: accountId, p_customer_id: customerId, p_event_id: eventId,
        p_event_type: eventType, p_fingerprint: fingerprint,
      });
      if (!object(result)) throw new BillingTestStoreError('billing_unavailable');
      if (result.kind === 'completed' || result.kind === 'busy' || result.kind === 'unmapped') return { kind: result.kind };
      if (result.kind !== 'claimed' || typeof result.playerId !== 'string'
        || typeof result.leaseToken !== 'string' || !Number.isSafeInteger(result.leaseVersion)) {
        throw new BillingTestStoreError('billing_unavailable');
      }
      return { kind: 'claimed', playerId: result.playerId, leaseToken: result.leaseToken,
        leaseVersion: result.leaseVersion as number, status: status(result.status, environment) };
    },
    async completeReconciliation(value: BillingTestCompletion): Promise<boolean> {
      const result = await rpc('billing_test_complete_reconciliation', {
        ...key(value), p_intent_id: value.intentId, p_subscription_id: value.subscriptionId,
        p_invoice_id: value.invoiceId, p_snapshot: value.snapshot, p_outcome: value.outcome,
        p_funding_periods: value.fundingPeriods ?? [],
        p_review_invoice_ids: value.reviewInvoiceIds ?? [],
      });
      if (typeof result !== 'boolean') throw new BillingTestStoreError('billing_unavailable');
      return result;
    },
    async failReconciliation(value: BillingTestReconciliationKey): Promise<boolean> {
      const result = await rpc('billing_test_fail_reconciliation', key(value));
      if (typeof result !== 'boolean') throw new BillingTestStoreError('billing_unavailable');
      return result;
    },
  };
}

export function createBillingTestStore(database: SupabaseClient) { return createBillingStore(database, 'test'); }
export function createBillingLiveStore(database: SupabaseClient) { return createBillingStore(database, 'live'); }
export type BillingTestStore = ReturnType<typeof createBillingTestStore>;
