import Stripe from 'stripe';
import { getFanVipOffer, type FanVipOffer, type FanVipOfferKey, type CanonicalVipBillingSnapshot } from './billingPolicy.ts';

export const STRIPE_API_VERSION = '2026-10-28.endive' as const;
export const STRIPE_TEST_API_VERSION = STRIPE_API_VERSION;
export const FANTIP_SANDBOX_ACCOUNT_ID = 'acct_1UQsnbC66ykHzmj6' as const;

export class StripeTestGatewayError extends Error {
  constructor(public readonly code: string, public readonly statusCode = 422) {
    super(code); this.name = 'StripeTestGatewayError';
  }
}

export interface StripeTestGatewayConfig {
  secretKey: string;
  webhookSecret: string;
  appOrigin: string;
  expectedAccountId: string;
  productId: string;
  priceIds: Readonly<Record<FanVipOfferKey, string>>;
  portalConfigurationId: string;
  expectedEventApiVersion?: string;
}

export interface StripeTestCheckout {
  id: string;
  customerId: string | null;
  checkoutIntentId: string | null;
  offerKey: FanVipOfferKey | null;
  status: 'open' | 'complete' | 'expired' | null;
  subscriptionId: string | null;
  url: string | null;
  expiresAt: number;
}

export interface VerifiedStripeTestEvent {
  id: string;
  type: string;
  created: number;
  accountId: string;
  livemode: boolean;
  objectId: string;
  objectType?: string;
  customerId: string | null;
  checkoutSessionId?: string;
  subscriptionId?: string;
  invoiceId?: string;
  chargeId?: string;
  paymentIntentId?: string;
}

export interface StripeTestFundingPeriod {
  snapshot: CanonicalVipBillingSnapshot;
  invoiceId: string;
  invoiceLineId: string;
  paymentIntentId: string;
  chargeId: string;
}

export interface StripeTestInvoiceReview {
  invoiceId: string;
  chargeId?: string;
  reason: string;
}

interface ReconciliationContext {
  accountId: string;
  sessionId: string;
  customerId: string;
  offerKey: FanVipOfferKey;
  subscriptionId: string | null;
  fundingPeriods: StripeTestFundingPeriod[];
  invoiceReviews: StripeTestInvoiceReview[];
  reviewInvoiceIds: string[];
}

export type StripeTestReconciliation = ReconciliationContext & (
  | { outcome: 'pending'; reason: string }
  | { outcome: 'requires_review'; reason: string }
  | ({ outcome: 'verified' } & StripeTestFundingPeriod)
);

export interface StripeTestGateway {
  getAccountId(): Promise<string>;
  createCustomer(playerId: string, idempotencyKey: string): Promise<{ id: string }>;
  createCheckout(input: {
    customerId: string; offer: FanVipOffer; checkoutIntentId: string;
    successUrl: string; cancelUrl: string; idempotencyKey: string;
  }): Promise<{ id: string; url: string; expiresAt: number }>;
  retrieveCheckout(sessionId: string): Promise<StripeTestCheckout>;
  createPortal(customerId: string, returnUrl: string): Promise<{ url: string }>;
  verifyWebhook(rawBody: Buffer, signature: string): Promise<VerifiedStripeTestEvent>;
  resolveEventTarget(event: VerifiedStripeTestEvent): Promise<VerifiedStripeTestEvent>;
  resolveEventCustomer(event: VerifiedStripeTestEvent): Promise<string | null>;
  recoverCustomer(playerId: string): Promise<{ id: string } | null>;
  recoverCheckout(customerId: string, checkoutIntentId: string, offerKey: FanVipOfferKey): Promise<StripeTestCheckout | null>;
  canStartNewCheckout(customerId: string, subscriptionId: string | null): Promise<{ allowed: boolean; reason: string }>;
  reconcile(sessionId: string, expected: {
    customerId: string; checkoutIntentId: string; offerKey: FanVipOfferKey;
    knownInvoiceIds?: string[]; affectedChargeIds?: string[];
  }): Promise<StripeTestReconciliation>;
}

const fail = (code: string, status = 422): never => { throw new StripeTestGatewayError(code, status); };
const id = (value: unknown, prefix: string): value is string =>
  typeof value === 'string' && value.length <= 320 && new RegExp(`^${prefix}_[A-Za-z0-9_]+$`).test(value);
const reference = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  return value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' ? value.id : null;
};
const token = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const zero = (value: number | null | undefined) => value === null || value === undefined || value === 0;
const epoch = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0 && (value as number) < 8640000000000;
const player = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const MAX_PAGES = 5;
const PAGE_SIZE = 100;

function appOrigin(value: string): string {
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/'
      || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) fail('invalid_app_origin', 503);
    return url.origin;
  } catch { return fail('invalid_app_origin', 503); }
}

function returnUrl(value: string, origin: string): string {
  try {
    const url = new URL(value);
    if (url.origin !== origin || url.username || url.password) fail('invalid_return_url');
    return url.href;
  } catch { return fail('invalid_return_url'); }
}

function stripeUrl(value: string | null, host: string): string {
  try {
    if (!value) fail('invalid_provider_url', 503);
    const url = new URL(value!);
    if (url.protocol !== 'https:' || url.hostname !== host || url.port || url.username || url.password) fail('invalid_provider_url', 503);
    return url.href;
  } catch { return fail('invalid_provider_url', 503); }
}

function priceMatches(price: Stripe.Price, offer: FanVipOffer, livemode: boolean) {
  return price.livemode === livemode && price.currency === 'czk' && price.unit_amount === offer.amountMinor
    && price.type === 'recurring' && price.billing_scheme === 'per_unit' && price.custom_unit_amount == null
    && price.transform_quantity == null && price.recurring?.interval === offer.interval
    && price.recurring.interval_count === 1 && price.recurring.usage_type === 'licensed'
    && price.recurring.trial_period_days == null;
}

/**
 * Shared provider engine. No database writes, entitlements or webhook ledger.
 * Explicit factories below fix the environment; the engine is not exported.
 * The optional client is a trusted server/test dependency, never request input.
 * Signature verification always uses the real official SDK, even with a mock API.
 */
function createStripeGateway(config: StripeTestGatewayConfig, environment: 'test' | 'live', dependencies: StripeGatewayDependencies): StripeTestGateway {
  const livemode = environment === 'live', sessionPrefix = livemode ? 'cs_live' : 'cs_test';
  const credentialPattern = livemode ? /^sk_live_[A-Za-z0-9]+$/ : /^sk_test_[A-Za-z0-9]+$/;
  const expectedEventApiVersion = config.expectedEventApiVersion ?? STRIPE_API_VERSION;
  if (!/^20\d{2}-\d{2}-\d{2}\.[a-z]+$/.test(expectedEventApiVersion)) fail('invalid_event_api_version', 503);
  if (typeof config.secretKey !== 'string' || !credentialPattern.test(config.secretKey)
    || typeof config.webhookSecret !== 'string' || !/^whsec_[A-Za-z0-9_]+$/.test(config.webhookSecret)) fail(`${environment}_credentials_required`, 503);
  if (!id(config.expectedAccountId, 'acct')) fail('invalid_account_configuration', 503);
  if (!id(config.productId, 'prod') || !id(config.priceIds?.fan_vip_monthly, 'price')
    || !id(config.priceIds?.fan_vip_annual, 'price') || config.priceIds.fan_vip_monthly === config.priceIds.fan_vip_annual
    || !id(config.portalConfigurationId, 'bpc')) fail('invalid_catalog_configuration', 503);
  // Capture immutable configuration; request code cannot swap account/catalog mid-flight.
  const expectedAccountId = config.expectedAccountId, productId = config.productId;
  const priceIds = { ...config.priceIds }, portalConfigurationId = config.portalConfigurationId;
  const origin = appOrigin(config.appOrigin);
  const official = new Stripe(config.secretKey, { apiVersion: STRIPE_API_VERSION, timeout: 10000, maxNetworkRetries: 1 });
  const client = dependencies.client ?? official;
  let account: Promise<string> | undefined;

  function modeObject(value: unknown) {
    if (!value || typeof value !== 'object' || !('livemode' in value) || value.livemode !== livemode) fail('provider_mode_mismatch');
  }

  async function request<T>(fn: () => PromiseLike<T>): Promise<T> {
    try { return await fn(); } catch (error) {
      if (error instanceof StripeTestGatewayError) throw error;
      return fail('provider_unavailable', 503);
    }
  }

  async function getAccountId(): Promise<string> {
    if (!account) account = request(() => client.accounts.retrieve(null)).then(result => {
      if (result.id !== expectedAccountId) fail('provider_account_mismatch', 503);
      return result.id;
    }).catch(error => { account = undefined; throw error; });
    return account;
  }

  const matchesPrice = (price: Stripe.Price, offer: FanVipOffer) =>
    price.id === priceIds[offer.key] && reference(price.product) === productId && priceMatches(price, offer, livemode);

  async function requireCatalog(offer: FanVipOffer) {
    await getAccountId();
    const price = await request(() => client.prices.retrieve(priceIds[offer.key]));
    const product = await request(() => client.products.retrieve(productId));
    modeObject(price);
    if ((product as unknown as { deleted?: boolean }).deleted === true || !('livemode' in product)) fail('invalid_provider_catalog', 503);
    modeObject(product);
    if (!price.active || !matchesPrice(price, offer) || product.id !== productId || !product.active
      || product.metadata.fan_plan_key !== offer.planKey) fail('invalid_provider_catalog', 503);
  }

  /** Explicitly bounded pagination; exhaustion is uncertainty, never proof of absence. */
  async function scan<T extends { id: string }>(fetch: (params: { limit: number; starting_after?: string }) => PromiseLike<{ data: T[]; has_more: boolean }>): Promise<T[]> {
    const items: T[] = [], seen = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await request(() => fetch({ limit: PAGE_SIZE, ...(cursor ? { starting_after: cursor } : {}) }));
      if (!Array.isArray(result.data) || typeof result.has_more !== 'boolean' || result.data.length > PAGE_SIZE) fail('invalid_provider_page', 503);
      for (const item of result.data) {
        if (!item || typeof item.id !== 'string' || seen.has(item.id)) fail('incomplete_provider_scan', 503);
        seen.add(item.id); items.push(item);
      }
      if (!result.has_more) return items;
      if (!result.data.length) fail('incomplete_provider_scan', 503);
      cursor = result.data.at(-1)!.id;
    }
    return fail('incomplete_provider_scan', 503);
  }

  async function customer(customerId: string) {
    if (!id(customerId, 'cus')) fail('invalid_customer_request');
    await getAccountId();
    const result = await request(() => client.customers.retrieve(customerId));
    if (result.deleted || !('livemode' in result)) fail('customer_unavailable', 503);
    modeObject(result);
    if (result.id !== customerId) fail('customer_context_mismatch');
    return result;
  }

  function checkout(session: Stripe.Checkout.Session): StripeTestCheckout {
    modeObject(session);
    const offer = getFanVipOffer(session.metadata?.fan_offer_key);
    if (!id(session.id, sessionPrefix) || !epoch(session.expires_at) || session.mode !== 'subscription') fail('invalid_checkout_response', 503);
    if (session.status !== 'open' && session.status !== 'complete' && session.status !== 'expired') fail('unsupported_checkout_state', 503);
    return {
      id: session.id, customerId: reference(session.customer), checkoutIntentId: session.client_reference_id,
      offerKey: offer?.key ?? null, status: session.status as StripeTestCheckout['status'], subscriptionId: reference(session.subscription),
      url: session.url === null ? null : stripeUrl(session.url, 'checkout.stripe.com'), expiresAt: session.expires_at,
    };
  }

  async function retrieveSession(sessionId: string) {
    if (!id(sessionId, sessionPrefix)) fail(`${environment}_checkout_required`);
    await getAccountId();
    const session = await request(() => client.checkout.sessions.retrieve(sessionId));
    modeObject(session);
    if (session.id !== sessionId || session.mode !== 'subscription') fail('checkout_mismatch');
    return session;
  }

  async function retrieveCheckout(sessionId: string): Promise<StripeTestCheckout> {
    return checkout(await retrieveSession(sessionId));
  }

  function subscriptionState(subscription: Stripe.Subscription): CanonicalVipBillingSnapshot['subscriptionState'] | null {
    return ({ active: 'active', canceled: 'cancelled', past_due: 'past_due', unpaid: 'past_due',
      incomplete: 'pending', incomplete_expired: 'pending', paused: 'suspended', trialing: 'trialing',
    } as Record<string, CanonicalVipBillingSnapshot['subscriptionState']>)[subscription.status] ?? null;
  }

  async function getInvoice(invoiceId: string, customerId: string, subscriptionId?: string) {
    if (!id(invoiceId, 'in')) fail('invalid_invoice_reference');
    const invoice = await request(() => client.invoices.retrieve(invoiceId));
    modeObject(invoice);
    if (invoice.id !== invoiceId || reference(invoice.customer) !== customerId
      || (subscriptionId && reference(invoice.parent?.subscription_details?.subscription) !== subscriptionId)) fail('invoice_context_mismatch');
    return invoice;
  }

  type InvoiceProof = { kind: 'verified'; period: StripeTestFundingPeriod }
    | { kind: 'pending' | 'requires_review'; reason: string; chargeId?: string };

  async function proveInvoice(invoice: Stripe.Invoice, subscription: Stripe.Subscription, offer: FanVipOffer): Promise<InvoiceProof> {
    const review = (reason: string, chargeId?: string): InvoiceProof => ({ kind: 'requires_review', reason, ...(chargeId ? { chargeId } : {}) });
    if (reference(invoice.customer) !== reference(subscription.customer)
      || reference(invoice.parent?.subscription_details?.subscription) !== subscription.id) fail('invoice_context_mismatch');
    if (invoice.status !== 'paid') return { kind: 'pending', reason: 'invoice_not_paid' };
    if (invoice.currency !== 'czk' || invoice.amount_paid !== offer.amountMinor || invoice.amount_due !== offer.amountMinor
      || invoice.total !== offer.amountMinor || invoice.amount_remaining !== 0 || invoice.amount_overpaid !== 0
      || invoice.discounts.length || !zero(invoice.starting_balance) || !zero(invoice.ending_balance)
      || !zero(invoice.pre_payment_credit_notes_amount) || !zero(invoice.post_payment_credit_notes_amount)) return review('invoice_amount_mismatch');
    const lines = await request(() => client.invoices.listLineItems(invoice.id, { limit: 2 }));
    if (lines.has_more || lines.data.length !== 1) return review('unexpected_invoice_items');
    const line = lines.data[0];
    if (!id(line.id, 'il') || line.livemode !== livemode || line.currency !== 'czk' || line.amount !== offer.amountMinor
      || line.quantity !== 1 || line.parent?.type !== 'subscription_item_details'
      || reference(line.parent.subscription_item_details?.subscription) !== subscription.id
      || (reference(line.subscription) !== null && reference(line.subscription) !== subscription.id)
      || reference(line.pricing?.price_details?.price) !== priceIds[offer.key]
      || line.parent?.subscription_item_details?.proration !== false
      || !epoch(line.period?.start) || !epoch(line.period?.end) || line.period.end <= line.period.start
      || line.period.end - line.period.start > (offer.interval === 'month' ? 32 : 370) * 86400) return review('invoice_period_mismatch');
    // Historical funding periods belong to this invoice, not today's subscription item.
    const payments = await request(() => client.invoicePayments.list({ invoice: invoice.id, status: 'paid', limit: 2 }));
    if (payments.has_more || payments.data.length !== 1) return review('unsupported_payment_proof');
    const payment = payments.data[0], paymentIntentId = reference(payment.payment?.payment_intent);
    if (payment.livemode !== livemode || payment.status !== 'paid' || reference(payment.invoice) !== invoice.id
      || payment.currency !== 'czk' || payment.amount_paid !== offer.amountMinor || payment.amount_requested !== offer.amountMinor
      || payment.payment?.type !== 'payment_intent' || !id(paymentIntentId, 'pi')) return review('unsupported_payment_proof');
    const intent = await request(() => client.paymentIntents.retrieve(paymentIntentId));
    modeObject(intent);
    const chargeId = reference(intent.latest_charge);
    if (intent.id !== paymentIntentId || reference(intent.customer) !== reference(subscription.customer) || intent.status !== 'succeeded'
      || intent.currency !== 'czk' || intent.amount !== offer.amountMinor || intent.amount_received !== offer.amountMinor
      || intent.on_behalf_of || intent.transfer_data || !id(chargeId, 'ch')) return review('unsupported_payment_proof');
    const charge = await request(() => client.charges.retrieve(chargeId));
    modeObject(charge);
    if (charge.id !== chargeId || reference(charge.customer) !== reference(subscription.customer) || reference(charge.payment_intent) !== intent.id
      || charge.currency !== 'czk' || charge.amount !== offer.amountMinor || charge.amount_captured !== offer.amountMinor
      || charge.status !== 'succeeded' || charge.paid !== true || charge.captured !== true) return review('unsupported_charge_proof', chargeId);
    let chargeback = false;
    if (charge.disputed) {
      // The Charge flag also survives a closed dispute. Re-fetch the outcome;
      // ambiguous, partial and still-open disputes remain operator review.
      const disputes = await request(() => client.disputes.list({ charge: chargeId, limit: 2 }));
      if (disputes.has_more || disputes.data.length !== 1) return review('dispute_requires_review', chargeId);
      const dispute = disputes.data[0];
      if (!id(dispute.id, 'dp') || dispute.livemode !== livemode || reference(dispute.charge) !== chargeId
        || reference(dispute.payment_intent) !== paymentIntentId || dispute.currency !== 'czk'
        || dispute.amount !== charge.amount || !['won', 'lost'].includes(dispute.status)) return review('dispute_requires_review', chargeId);
      chargeback = dispute.status === 'lost';
    }
    if (charge.amount_refunded > 0 && charge.amount_refunded < charge.amount) return review('partial_refund_requires_review', chargeId);
    if (charge.amount_refunded !== 0 && charge.amount_refunded !== charge.amount
      || charge.refunded !== (charge.amount_refunded === charge.amount)) return review('invalid_refund_state', chargeId);
    const state = subscriptionState(subscription);
    if (!state) return review('unsupported_subscription_state', chargeId);
    return { kind: 'verified', period: {
      invoiceId: invoice.id, invoiceLineId: line.id, paymentIntentId, chargeId,
      snapshot: { environment, offerKey: offer.key, subscriptionState: state,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        paidPeriod: { startsAt: new Date(line.period.start * 1000).toISOString(), endsAt: new Date(line.period.end * 1000).toISOString(),
          paymentState: chargeback ? 'chargeback' : charge.refunded ? 'refunded' : 'paid' } },
    } };
  }

  async function chargeTarget(chargeId: string, expectedCustomer?: string | null) {
    if (!id(chargeId, 'ch')) fail('invalid_charge_reference');
    const charge = await request(() => client.charges.retrieve(chargeId));
    modeObject(charge);
    const customerId = reference(charge.customer), paymentIntentId = reference(charge.payment_intent);
    if (charge.id !== chargeId || !id(customerId, 'cus') || (expectedCustomer && customerId !== expectedCustomer)) fail('charge_context_mismatch');
    if (!paymentIntentId) return { customerId, chargeId };
    if (!id(paymentIntentId, 'pi')) fail('invalid_payment_reference');
    const intent = await request(() => client.paymentIntents.retrieve(paymentIntentId));
    modeObject(intent);
    if (intent.id !== paymentIntentId || reference(intent.customer) !== customerId) fail('payment_context_mismatch');
    const payments = await scan(params => client.invoicePayments.list({ ...params,
      payment: { type: 'payment_intent', payment_intent: paymentIntentId } }));
    const invoices = new Set<string>();
    for (const payment of payments) {
      modeObject(payment);
      if (payment.payment?.type !== 'payment_intent' || reference(payment.payment.payment_intent) !== paymentIntentId) fail('payment_context_mismatch');
      const invoiceId = reference(payment.invoice);
      if (!id(invoiceId, 'in')) fail('invalid_invoice_reference');
      invoices.add(invoiceId);
    }
    if (invoices.size > 1) fail('ambiguous_payment_binding', 409);
    const invoiceId = [...invoices][0];
    if (!invoiceId) return { customerId, chargeId, paymentIntentId };
    const invoice = await getInvoice(invoiceId, customerId);
    const subscriptionId = reference(invoice.parent?.subscription_details?.subscription) ?? undefined;
    if (subscriptionId && !id(subscriptionId, 'sub')) fail('invalid_subscription_reference');
    return { customerId, chargeId, paymentIntentId, invoiceId, subscriptionId };
  }

  async function resolveEventTarget(event: VerifiedStripeTestEvent): Promise<VerifiedStripeTestEvent> {
    if (event.accountId !== expectedAccountId || event.livemode !== livemode) fail('event_context_mismatch');
    await getAccountId();
    const fromCharge = (target: Awaited<ReturnType<typeof chargeTarget>>): VerifiedStripeTestEvent => {
      if ((event.paymentIntentId && target.paymentIntentId && event.paymentIntentId !== target.paymentIntentId)
        || (event.invoiceId && target.invoiceId && event.invoiceId !== target.invoiceId)
        || (event.subscriptionId && target.subscriptionId && event.subscriptionId !== target.subscriptionId)) fail('event_context_mismatch');
      return { ...event, ...target, invoiceId: target.invoiceId, subscriptionId: target.subscriptionId };
    };
    if (event.chargeId) return fromCharge(await chargeTarget(event.chargeId, event.customerId));
    if (event.paymentIntentId) {
      if (!id(event.paymentIntentId, 'pi')) fail('invalid_payment_reference');
      const intent = await request(() => client.paymentIntents.retrieve(event.paymentIntentId!));
      modeObject(intent);
      const chargeId = reference(intent.latest_charge), customerId = reference(intent.customer);
      if (intent.id !== event.paymentIntentId || !id(customerId, 'cus')
        || (event.customerId && event.customerId !== customerId)) fail('payment_context_mismatch');
      if (!chargeId) return { ...event, customerId };
      return fromCharge(await chargeTarget(chargeId, customerId));
    }
    if (event.invoiceId) {
      if (!id(event.invoiceId, 'in')) fail('invalid_invoice_reference');
      const invoice = await request(() => client.invoices.retrieve(event.invoiceId!));
      modeObject(invoice);
      const customerId = reference(invoice.customer), subscriptionId = reference(invoice.parent?.subscription_details?.subscription) ?? undefined;
      if (invoice.id !== event.invoiceId || !id(customerId, 'cus') || (event.customerId && event.customerId !== customerId)
        || (subscriptionId && !id(subscriptionId, 'sub'))) fail('invoice_context_mismatch');
      return { ...event, customerId, subscriptionId };
    }
    if (event.checkoutSessionId) {
      const session = await retrieveSession(event.checkoutSessionId);
      const customerId = reference(session.customer), subscriptionId = reference(session.subscription) ?? undefined;
      if (!id(customerId, 'cus') || (event.customerId && event.customerId !== customerId)) fail('checkout_context_mismatch');
      return { ...event, customerId, subscriptionId };
    }
    if (event.subscriptionId) {
      if (!id(event.subscriptionId, 'sub')) fail('invalid_subscription_reference');
      const subscription = await request(() => client.subscriptions.retrieve(event.subscriptionId!));
      modeObject(subscription);
      const customerId = reference(subscription.customer);
      if (subscription.id !== event.subscriptionId || !id(customerId, 'cus')
        || (event.customerId && event.customerId !== customerId)) fail('subscription_context_mismatch');
      return { ...event, customerId };
    }
    return event;
  }

  return {
    getAccountId,
    async createCustomer(playerId, idempotencyKey) {
      if (!player(playerId) || !token(idempotencyKey)) fail('invalid_customer_request');
      await getAccountId();
      const result = await request(() => client.customers.create({ metadata: { fan_player_id: playerId } }, { idempotencyKey }));
      modeObject(result);
      if (!id(result.id, 'cus') || result.metadata?.fan_player_id !== playerId) fail('invalid_customer_response', 503);
      return { id: result.id };
    },
    async createCheckout(input) {
      const offer = getFanVipOffer(input.offer?.key);
      if (!offer || !id(input.customerId, 'cus') || !token(input.checkoutIntentId) || !token(input.idempotencyKey)) fail('invalid_checkout_request');
      const success = returnUrl(input.successUrl, origin), cancel = returnUrl(input.cancelUrl, origin);
      await requireCatalog(offer);
      await customer(input.customerId);
      const metadata = { fan_checkout_intent_id: input.checkoutIntentId, fan_offer_key: offer.key };
      const session = await request(() => client.checkout.sessions.create({
        mode: 'subscription', customer: input.customerId, client_reference_id: input.checkoutIntentId,
        success_url: success, cancel_url: cancel, metadata,
        subscription_data: { metadata, billing_mode: { type: 'flexible' } },
        allow_promotion_codes: false, allowed_payment_method_types: ['card'], automatic_tax: { enabled: false },
        line_items: [{ quantity: 1, price: priceIds[offer.key] }],
      }, { idempotencyKey: input.idempotencyKey }));
      const result = checkout(session);
      if (result.customerId !== input.customerId || result.checkoutIntentId !== input.checkoutIntentId
        || result.offerKey !== offer.key || result.status !== 'open' || !result.url) fail('invalid_checkout_response', 503);
      return { id: result.id, url: result.url, expiresAt: result.expiresAt };
    },
    retrieveCheckout,
    async createPortal(customerId, target) {
      const return_url = returnUrl(target, origin);
      await customer(customerId);
      const configuration = await request(() => client.billingPortal.configurations.retrieve(portalConfigurationId));
      modeObject(configuration);
      const features = configuration.features;
      const knownFeatures = new Set(['payment_method_update', 'invoice_history', 'customer_update',
        'subscription_update', 'subscription_pause', 'subscription_cancel']);
      const unknownEnabled = features && Object.entries(features).some(([name, value]) => !knownFeatures.has(name)
        && value && typeof value === 'object' && 'enabled' in value && value.enabled !== false);
      if (configuration.id !== portalConfigurationId || !configuration.active || configuration.application
        || configuration.login_page?.enabled !== false || features?.payment_method_update?.enabled !== true
        || features?.subscription_cancel?.enabled !== true || features.subscription_cancel.mode !== 'at_period_end'
        || features.subscription_cancel.proration_behavior !== 'none' || features.subscription_update?.enabled !== false
        || features.subscription_pause?.enabled !== false || features.customer_update?.enabled !== false
        || unknownEnabled) fail('unsafe_portal_configuration', 503);
      const session = await request(() => client.billingPortal.sessions.create({ customer: customerId, return_url, configuration: portalConfigurationId }));
      return { url: stripeUrl(session.url, 'billing.stripe.com') };
    },
    // No network: the signed inbox can be persisted even while Stripe's API is down.
    async verifyWebhook(rawBody, signature) {
      if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string') fail('invalid_webhook_signature', 400);
      let event: Stripe.Event;
      try { event = official.webhooks.constructEvent(rawBody, signature, config.webhookSecret, 300); }
      catch { return fail('invalid_webhook_signature', 400); }
      if (!event || event.livemode !== livemode || event.account || event.context) fail(`non_platform_${environment}_event`, 400);
      if (event.api_version != null && event.api_version !== expectedEventApiVersion) fail('unsupported_webhook_api_version', 400);
      const object = event.data?.object as unknown as Record<string, unknown>;
      if (!id(event.id, 'evt') || !epoch(event.created) || typeof event.type !== 'string' || !event.type
        || !object || typeof object.id !== 'string' || object.id.length > 320 || typeof object.object !== 'string'
        // Refund snapshots have no livemode field in Endive. The signed event
        // itself must still match this fixed account/mode; all other objects
        // keep their own mode check and canonical Charge/PI lookup follows.
        || !(object.object === 'refund' && object.livemode === undefined || object.livemode === livemode))
        fail(`invalid_${environment}_event`, 400);
      const objectId = object.id as string, objectType = object.object as string;
      const customerId = reference(object.customer);
      if (customerId && !id(customerId, 'cus')) fail(`invalid_${environment}_event`, 400);
      const subscriptionId = reference(object.subscription) ?? undefined;
      const paymentIntentId = reference(object.payment_intent) ?? undefined;
      const chargeId = objectType === 'charge' ? objectId : reference(object.charge) ?? undefined;
      const invoiceId = objectType === 'invoice' ? objectId : reference(object.invoice) ?? undefined;
      if ((subscriptionId && !id(subscriptionId, 'sub')) || (paymentIntentId && !id(paymentIntentId, 'pi'))
        || (chargeId && !id(chargeId, 'ch')) || (invoiceId && !id(invoiceId, 'in'))
        || (objectType === 'subscription' && !id(objectId, 'sub'))
        || (objectType === 'checkout.session' && !id(objectId, sessionPrefix))) fail(`invalid_${environment}_event`, 400);
      return {
        id: event.id, type: event.type, created: event.created, accountId: expectedAccountId, livemode,
        objectId, objectType, customerId,
        ...(objectType === 'checkout.session' ? { checkoutSessionId: objectId, ...(subscriptionId ? { subscriptionId } : {}) } : {}),
        ...(objectType === 'subscription' ? { subscriptionId: objectId } : {}),
        ...(invoiceId ? { invoiceId } : {}), ...(chargeId ? { chargeId } : {}), ...(paymentIntentId ? { paymentIntentId } : {}),
      };
    },
    resolveEventTarget,
    async resolveEventCustomer(event) { return (await resolveEventTarget(event)).customerId; },
    async recoverCustomer(playerId) {
      if (!player(playerId)) fail('invalid_customer_request');
      await getAccountId();
      const customers = await scan(params => client.customers.list(params));
      const matches: string[] = [];
      for (const candidate of customers) {
        modeObject(candidate);
        if (candidate.metadata?.fan_player_id === playerId) {
          if (!id(candidate.id, 'cus')) fail('invalid_customer_response', 503);
          matches.push(candidate.id);
        }
      }
      if (matches.length > 1) fail('ambiguous_customer_recovery', 409);
      return matches.length ? { id: matches[0] } : null;
    },
    async recoverCheckout(customerId, checkoutIntentId, offerKey) {
      if (!id(customerId, 'cus') || !token(checkoutIntentId) || !getFanVipOffer(offerKey)) fail('invalid_checkout_request');
      await getAccountId();
      const sessions = await scan(params => client.checkout.sessions.list({ ...params, customer: customerId }));
      const matches: StripeTestCheckout[] = [];
      for (const session of sessions) {
        modeObject(session);
        if (reference(session.customer) !== customerId) fail('checkout_context_mismatch');
        if (session.client_reference_id === checkoutIntentId || session.metadata?.fan_checkout_intent_id === checkoutIntentId) {
          if (session.client_reference_id !== checkoutIntentId || session.metadata?.fan_checkout_intent_id !== checkoutIntentId
            || session.metadata?.fan_offer_key !== offerKey) fail('checkout_context_mismatch');
          matches.push(checkout(session));
        }
      }
      if (matches.length > 1) fail('ambiguous_checkout_recovery', 409);
      return matches[0] ?? null;
    },
    async canStartNewCheckout(customerId, subscriptionId) {
      if (!id(customerId, 'cus') || (subscriptionId !== null && !id(subscriptionId, 'sub'))) fail('invalid_reconciliation_context');
      await customer(customerId);
      const sessions = await scan(params => client.checkout.sessions.list({ ...params, customer: customerId, status: 'open' }));
      for (const session of sessions) {
        modeObject(session);
        if (reference(session.customer) !== customerId) fail('checkout_context_mismatch');
        // An API-confirmed open Session remains open even if our wall clock passed expires_at.
        if (session.status !== 'expired') return { allowed: false, reason: 'checkout_still_open' };
      }
      const subscriptions = await scan(params => client.subscriptions.list({ ...params, customer: customerId, status: 'all' }));
      if (subscriptionId && !subscriptions.some(value => value.id === subscriptionId)) {
        subscriptions.push(await request(() => client.subscriptions.retrieve(subscriptionId)));
      }
      const byId = new Map<string, Stripe.Subscription>();
      for (const subscription of subscriptions) {
        modeObject(subscription);
        if (reference(subscription.customer) !== customerId) fail('subscription_context_mismatch');
        if (subscription.status !== 'canceled' && subscription.status !== 'incomplete_expired') return { allowed: false, reason: 'subscription_not_terminal' };
        byId.set(subscription.id, subscription);
      }
      const invoices = await scan(params => client.invoices.list({ ...params, customer: customerId }));
      const now = (dependencies.now?.() ?? new Date()).getTime();
      if (!Number.isFinite(now)) fail('invalid_clock', 503);
      for (const invoice of invoices) {
        modeObject(invoice);
        if (reference(invoice.customer) !== customerId) fail('invoice_context_mismatch');
        if (invoice.status === 'open' || invoice.status === 'draft') return { allowed: false, reason: 'invoice_pending' };
        if (invoice.status === 'void') continue;
        if (invoice.status === 'uncollectible') return { allowed: false, reason: 'invoice_unsettled' };
        if (invoice.status !== 'paid') return { allowed: false, reason: 'invoice_requires_review' };
        const parent = reference(invoice.parent?.subscription_details?.subscription), subscription = parent ? byId.get(parent) : null;
        const offer = getFanVipOffer(subscription?.metadata?.fan_offer_key);
        if (!subscription || !offer) return { allowed: false, reason: 'invoice_requires_review' };
        const proof = await proveInvoice(invoice, subscription, offer);
        if (proof.kind !== 'verified') return { allowed: false, reason: proof.reason };
        if (proof.period.snapshot.paidPeriod!.paymentState === 'paid' && Date.parse(proof.period.snapshot.paidPeriod!.endsAt) > now) {
          return { allowed: false, reason: 'paid_period_remaining' };
        }
      }
      return { allowed: true, reason: 'no_unsettled_or_paid_period' };
    },
    async reconcile(sessionId, expected) {
      const offer = getFanVipOffer(expected.offerKey);
      if (!offer || !id(expected.customerId, 'cus') || !token(expected.checkoutIntentId)
        || (expected.knownInvoiceIds && (expected.knownInvoiceIds.length > 100 || expected.knownInvoiceIds.some(value => !id(value, 'in'))))
        || (expected.affectedChargeIds && (expected.affectedChargeIds.length > 50 || expected.affectedChargeIds.some(value => !id(value, 'ch'))))) fail('invalid_reconciliation_context');
      const accountId = await getAccountId(), session = await retrieveSession(sessionId);
      if (reference(session.customer) !== expected.customerId || session.client_reference_id !== expected.checkoutIntentId
        || session.metadata?.fan_checkout_intent_id !== expected.checkoutIntentId || session.metadata?.fan_offer_key !== offer.key) fail('checkout_context_mismatch');
      const subscriptionId = reference(session.subscription);
      const context: ReconciliationContext = { accountId, sessionId, customerId: expected.customerId, offerKey: offer.key, subscriptionId,
        fundingPeriods: [], invoiceReviews: [], reviewInvoiceIds: [] };
      const review = (reason: string): StripeTestReconciliation => ({ ...context, outcome: 'requires_review', reason });
      const pending = (reason: string): StripeTestReconciliation => ({ ...context, outcome: 'pending', reason });
      if (session.status !== 'complete' || session.payment_status !== 'paid' || !id(subscriptionId, 'sub')) return pending('checkout_not_paid');
      if (session.currency !== 'czk' || session.amount_subtotal !== offer.amountMinor || session.amount_total !== offer.amountMinor
        || !zero(session.total_details?.amount_discount) || !zero(session.total_details?.amount_tax)) return review('checkout_amount_mismatch');
      const lines = await request(() => client.checkout.sessions.listLineItems(sessionId, { limit: 2 }));
      if (lines.has_more || lines.data.length !== 1) return review('unexpected_checkout_items');
      const line = lines.data[0], price = line.price;
      if (!price || !matchesPrice(price, offer) || line.quantity !== 1 || line.currency !== 'czk'
        || line.amount_subtotal !== offer.amountMinor || line.amount_total !== offer.amountMinor
        || !zero(line.amount_discount) || !zero(line.amount_tax)) return review('checkout_price_mismatch');
      const subscription = await request(() => client.subscriptions.retrieve(subscriptionId));
      modeObject(subscription);
      if (subscription.id !== subscriptionId || reference(subscription.customer) !== expected.customerId
        || subscription.metadata.fan_checkout_intent_id !== expected.checkoutIntentId
        || subscription.metadata.fan_offer_key !== offer.key) fail('subscription_context_mismatch');
      if (subscription.trial_start || subscription.trial_end || subscription.status === 'trialing') return review('trial_not_offered');
      if (subscription.items.has_more || subscription.items.data.length !== 1 || subscription.discounts.length
        || subscription.collection_method !== 'charge_automatically' || subscription.on_behalf_of || subscription.transfer_data
        || subscription.billing_mode?.type !== 'flexible') return review('unsupported_subscription');
      const item = subscription.items.data[0];
      if (item.quantity !== 1 || !matchesPrice(item.price, offer)) return review('subscription_price_mismatch');
      const invoices = new Map<string, Stripe.Invoice>();
      const history = await scan(params => client.invoices.list({ ...params, customer: expected.customerId, subscription: subscriptionId, status: 'paid' }));
      for (const invoice of history) {
        modeObject(invoice);
        if (reference(invoice.customer) !== expected.customerId || reference(invoice.parent?.subscription_details?.subscription) !== subscriptionId) fail('invoice_context_mismatch');
        invoices.set(invoice.id, invoice);
      }
      const invoiceIds = new Set(expected.knownInvoiceIds ?? []);
      const latestInvoiceId = reference(subscription.latest_invoice);
      if (latestInvoiceId) invoiceIds.add(latestInvoiceId);
      for (const chargeId of new Set(expected.affectedChargeIds ?? [])) {
        const target = await chargeTarget(chargeId, expected.customerId);
        if (!target.invoiceId || target.subscriptionId !== subscriptionId) return review('affected_payment_not_bound_to_subscription');
        invoiceIds.add(target.invoiceId);
      }
      for (const invoiceId of invoiceIds) invoices.set(invoiceId, await getInvoice(invoiceId, expected.customerId, subscriptionId));
      let pendingReason = 'invoice_not_ready';
      for (const invoice of invoices.values()) {
        const proof = await proveInvoice(invoice, subscription, offer);
        if (proof.kind === 'verified') context.fundingPeriods.push(proof.period);
        else if (proof.kind === 'requires_review') {
          context.invoiceReviews.push({ invoiceId: invoice.id, reason: proof.reason, ...(proof.chargeId ? { chargeId: proof.chargeId } : {}) });
          context.reviewInvoiceIds.push(invoice.id);
        } else pendingReason = proof.reason;
      }
      context.fundingPeriods.sort((a, b) => Date.parse(a.snapshot.paidPeriod!.endsAt) - Date.parse(b.snapshot.paidPeriod!.endsAt)
        || a.invoiceId.localeCompare(b.invoiceId));
      if (context.invoiceReviews.length) return review(context.invoiceReviews[0].reason);
      const latest = context.fundingPeriods.at(-1);
      if (!latest) return pending(pendingReason);
      return { ...context, outcome: 'verified', ...latest };
    },
  };
}

export type StripeGatewayConfig = StripeTestGatewayConfig;
export type StripeGateway = StripeTestGateway;
export type VerifiedStripeEvent = VerifiedStripeTestEvent;
export type StripeGatewayDependencies = { client?: Stripe; now?: () => Date };
export { StripeTestGatewayError as StripeGatewayError };

/** Sandbox tests can never be redirected to legacy Test mode or a Live account. */
export function createStripeTestGateway(config: StripeGatewayConfig, dependencies: StripeGatewayDependencies = {}): StripeGateway {
  if (config.expectedAccountId !== FANTIP_SANDBOX_ACCOUNT_ID) fail('invalid_account_configuration', 503);
  return createStripeGateway(config, 'test', dependencies);
}

/** Dormant until the caller explicitly supplies its separate Live configuration. */
export function createStripeLiveGateway(config: StripeGatewayConfig, dependencies: StripeGatewayDependencies = {}): StripeGateway {
  if (config.expectedAccountId === FANTIP_SANDBOX_ACCOUNT_ID) fail('invalid_account_configuration', 503);
  return createStripeGateway(config, 'live', dependencies);
}
