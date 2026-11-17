import { createHash, randomUUID } from 'node:crypto';
import { getFanVipOffer, projectVipAccess, type FanVipOfferKey } from './billingPolicy.ts';
import type { BillingTestConfig } from './billingTestConfig.ts';
import type { BillingTestStore, BillingTestStatus } from './billingTestStore.ts';
import type { StripeTestGateway, VerifiedStripeTestEvent } from './stripeTestGateway.ts';

export class BillingTestServiceError extends Error {
  constructor(readonly code: string, readonly statusCode: number, readonly offerKey?: FanVipOfferKey) {
    super(code); this.name = 'BillingTestServiceError';
  }
}
const fingerprint = (value: string) => createHash('sha256').update(value).digest('hex');
const retry = (code = 'busy'): never => { throw new BillingTestServiceError(code, 503); };
export const BILLING_TEST_EVENTS = new Set([
  'checkout.session.completed', 'checkout.session.expired', 'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed', 'customer.subscription.created', 'customer.subscription.updated',
  'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed', 'invoice.payment_action_required',
  'charge.refunded', 'refund.created', 'refund.updated', 'refund.failed', 'charge.dispute.created',
  'charge.dispute.updated', 'charge.dispute.closed',
]);

/** Shared orchestration, separate hard-scoped stores. TEST never grants game
 * access; LIVE's completion RPC atomically projects only admitted paid facts. */
export function createBillingTestService(deps: {
  config: BillingTestConfig; store: BillingTestStore; gateway: StripeTestGateway; now?: () => Date;
}) {
  const { config, store, gateway } = deps;
  const now = deps.now ?? (() => new Date());
  const account = config.accountId;

  async function reconcileIntent(status: BillingTestStatus, event: { id: string; type: string; customerId: string },
    digest: string, chargeId?: string) {
    const claim = await store.beginReconciliation(account, event.customerId, event.id, event.type, digest);
    if (claim.kind === 'completed') return true;
    if (claim.kind !== 'claimed') return false;
    const key = { accountId: account, playerId: claim.playerId, eventId: event.id, fingerprint: digest,
      leaseToken: claim.leaseToken, leaseVersion: claim.leaseVersion };
    try {
      // Reload the PRECISE historical intent after acquiring its buyer lease.
      status = await store.getStatus(account, claim.playerId, status.intent?.id);
      const intent = status.intent;
      if (!intent?.sessionId || intent.customerId !== event.customerId) retry('mapping_pending');
      const checkout = await gateway.retrieveCheckout(intent.sessionId);
      if (checkout.customerId !== event.customerId || checkout.checkoutIntentId !== intent.id
        || checkout.offerKey !== intent.offerKey) retry('mapping_conflict');
      if (checkout.status === 'expired' && !checkout.subscriptionId && intent.state !== 'completed') {
        await store.expireCheckout(account, claim.playerId, intent.id, intent.sessionId);
      }
      const result = await gateway.reconcile(intent.sessionId, {
        customerId: event.customerId, checkoutIntentId: intent.id, offerKey: intent.offerKey,
        knownInvoiceIds: status.fundingPeriods.map(x => x.invoiceId),
        affectedChargeIds: chargeId ? [chargeId] : [],
      });
      return await store.completeReconciliation({ ...key, intentId: intent.id,
        outcome: result.outcome, subscriptionId: result.subscriptionId,
        invoiceId: result.outcome === 'verified' ? result.invoiceId : null,
        snapshot: result.outcome === 'verified' ? result.snapshot : null,
        fundingPeriods: result.fundingPeriods,
        reviewInvoiceIds: result.reviewInvoiceIds,
      });
    } catch (error) {
      await store.failReconciliation(key).catch(() => false);
      throw error;
    }
  }

  async function refresh(playerId: string, status: BillingTestStatus) {
    if (!status.intent || status.intent.state === 'retired' || status.intent.state === 'expired') return status;
    if (!status.intent.customerId) {
      const recovered = await gateway.recoverCustomer(playerId);
      if (!recovered) return status;
      await store.bindCustomer(account, playerId, recovered.id);
      status = await store.getStatus(account, playerId, status.intent.id);
    }
    if (!status.intent!.sessionId && status.intent!.customerId) {
      const recovered = await gateway.recoverCheckout(status.intent!.customerId, status.intent!.id, status.intent!.offerKey);
      if (!recovered) return status;
      await store.bindRecoveredCheckout(account, playerId, status.intent!.id, recovered);
      status = await store.getStatus(account, playerId, status.intent!.id);
    }
    if (!status.intent?.sessionId || !status.intent.customerId) return status;
    const id = `obs_${randomUUID()}`;
    await reconcileIntent(status, { id, type: 'app.status_reconciliation', customerId: status.intent.customerId }, fingerprint(id));
    return store.getStatus(account, playerId);
  }

  function publicStatus(status: BillingTestStatus) {
    const projections = status.fundingPeriods.filter(x => !x.requiresReview)
      .map(x => projectVipAccess(x.snapshot, now()))
      .filter(x => x.kind === 'projected');
    const current = projections.filter(x => x.eligible).sort((a, b) => (b.validUntil ?? '').localeCompare(a.validUntil ?? ''))[0];
    const latest = projections.sort((a, b) => (b.validUntil ?? '').localeCompare(a.validUntil ?? ''))[0];
    const review = status.fundingPeriods.some(x => x.requiresReview) || status.outcome === 'requires_review';
    const reversed = latest?.reason === 'refunded' || latest?.reason === 'chargeback';
    const state = current ? 'paid' : review ? 'review' : reversed ? 'refunded' : latest?.reason === 'expired' ? 'expired'
      : status.intent?.state === 'expired' ? 'expired' : status.intent?.state === 'open' ? 'checkout_open'
      : status.snapshot?.subscriptionState === 'cancelled' ? 'cancelled' : status.intent ? 'pending' : 'not_started';
    return { environment: config.environment ?? 'test', state, offerKey: status.intent?.offerKey ?? null,
      paidUntil: current?.validUntil ?? (reversed ? null : latest?.validUntil ?? null),
      canManage: Boolean(status.subscriptionId && status.intent?.customerId),
      renewalStopped: current?.renewalStopped ?? latest?.renewalStopped ?? false };
  }

  return {
    async checkout(playerId: string, offerKey: FanVipOfferKey) {
      const offer = getFanVipOffer(offerKey);
      if (!offer) throw new BillingTestServiceError('invalid_request', 400);
      let intent = await store.reserveCheckout(account, playerId, offerKey);
      if (intent.state === 'completed') {
        const status = await refresh(playerId, await store.getStatus(account, playerId));
        const canonical = await gateway.canStartNewCheckout(intent.customerId!, status.subscriptionId);
        if (!canonical.allowed) throw new BillingTestServiceError('subscription_exists', 409, intent.offerKey);
        await store.retireCheckout(account, playerId, intent.id, status.subscriptionId!);
        intent = await store.reserveCheckout(account, playerId, offerKey);
      }
      if (intent.sessionId) {
        const existing = await gateway.retrieveCheckout(intent.sessionId);
        if (existing.customerId !== intent.customerId || existing.checkoutIntentId !== intent.id
          || existing.offerKey !== intent.offerKey) retry('mapping_conflict');
        if (existing.status === 'expired' && !existing.subscriptionId) {
          await store.expireCheckout(account, playerId, intent.id, intent.sessionId);
          intent = await store.reserveCheckout(account, playerId, offerKey);
        } else {
          if (intent.offerKey !== offerKey) throw new BillingTestServiceError('offer_conflict', 409, intent.offerKey);
          if (existing.status !== 'open' || !existing.url) throw new BillingTestServiceError('subscription_exists', 409, intent.offerKey);
          return { checkoutUrl: existing.url };
        }
      }
      if (intent.offerKey !== offerKey) throw new BillingTestServiceError('offer_conflict', 409, intent.offerKey);
      if (config.environment === 'live') {
        if (!config.activationVersion) throw new BillingTestServiceError('offer_not_active', 503);
        await store.admitCheckout(account, playerId, intent.id, config.activationVersion);
      }
      const olderThan = (value: string) => now().getTime() - Date.parse(value) >= 23 * 60 * 60 * 1000;
      let customerId = intent.customerId;
      if (!customerId) {
        // Never reuse a potentially pruned provider key without canonical recovery.
        const recovered = await gateway.recoverCustomer(playerId);
        if (recovered) customerId = recovered.id;
        else {
          if (!Number.isFinite(Date.parse(intent.customerCreatedAt)) || olderThan(intent.customerCreatedAt)) retry('recovery_requires_review');
          customerId = (await gateway.createCustomer(playerId, intent.customerIdempotencyKey)).id;
        }
        await store.bindCustomer(account, playerId, customerId);
      }
      let session = await gateway.recoverCheckout(customerId, intent.id, offerKey);
      if (!session) {
        if (!Number.isFinite(Date.parse(intent.createdAt)) || olderThan(intent.createdAt)) retry('recovery_requires_review');
        const permitted = await gateway.canStartNewCheckout(customerId, null);
        if (!permitted.allowed) throw new BillingTestServiceError('subscription_exists', 409, offerKey);
        const created = await gateway.createCheckout({ customerId, offer, checkoutIntentId: intent.id,
          successUrl: `${config.appOrigin}/${config.environment === 'live' ? 'billing' : 'billing-test'}.html?billing_return=checkout`,
          cancelUrl: `${config.appOrigin}/${config.environment === 'live' ? 'billing' : 'billing-test'}.html?billing_return=cancel`, idempotencyKey: intent.idempotencyKey });
        await store.saveCheckout(account, playerId, intent.id, customerId, created.id, created.url,
          new Date(created.expiresAt * 1000).toISOString());
        return { checkoutUrl: created.url };
      }
      await store.bindRecoveredCheckout(account, playerId, intent.id, session);
      if (session.status === 'complete') {
        await refresh(playerId, await store.getStatus(account, playerId));
        throw new BillingTestServiceError('subscription_exists', 409, offerKey);
      }
      if (session.status === 'expired') return this.checkout(playerId, offerKey);
      if (session.status !== 'open' || !session.url) retry('recovery_requires_review');
      return { checkoutUrl: session.url };
    },
    async status(playerId: string) {
      return publicStatus(await refresh(playerId, await store.getStatus(account, playerId)));
    },
    async portal(playerId: string) {
      const status = await store.getStatus(account, playerId);
      if (!status.intent?.customerId || !status.subscriptionId) throw new BillingTestServiceError('not_started', 409);
      return { portalUrl: (await gateway.createPortal(status.intent.customerId,
        `${config.appOrigin}/${config.environment === 'live' ? 'billing' : 'billing-test'}.html?billing_return=portal`)).url };
    },
    async processEvent(event: VerifiedStripeTestEvent, digest: string, claimToken?: string) {
      try {
        const target = await gateway.resolveEventTarget(event);
        if (!target.customerId) retry('mapping_pending');
        await store.bindEventCustomer(account, event.id, digest, target.customerId);
        const status = await store.findEventStatus(account, target.customerId, {
          sessionId: target.checkoutSessionId, subscriptionId: target.subscriptionId,
          invoiceId: target.invoiceId, chargeId: target.chargeId,
        });
        if (!status) retry('mapping_pending');
        const done = await reconcileIntent(status, { id: event.id, type: event.type, customerId: target.customerId }, digest, target.chargeId);
        if (!done) retry();
        return true;
      } catch (error) {
        await store.deferEvent(account, event.id, digest, 'reconciliation_pending', claimToken).catch(() => false);
        throw error;
      }
    },
    publicStatus,
  };
}
export type BillingTestService = ReturnType<typeof createBillingTestService>;
