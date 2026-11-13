/** Deliberately no live branch: sandbox verification cannot create game VIP. */
export const FANTIP_SANDBOX_ACCOUNT_ID = 'acct_1UQsnbC66ykHzmj6';
export class BillingTestConfigurationError extends Error {
  constructor() { super('billing_configuration'); this.name = 'BillingTestConfigurationError'; }
}
export interface BillingTestConfig {
  environment: 'test' | 'live';
  accountId: string;
  secretKey: string;
  webhookSecret: string;
  productId: string;
  priceIds: { fan_vip_monthly: string; fan_vip_annual: string };
  portalConfigurationId: string;
  appOrigin: string;
  allowedPlayerIds: ReadonlySet<string>;
  reconcileSecret: string;
  publicCheckoutEnabled?: boolean;
  checkoutEnabled?: boolean;
  activationVersion?: string;
  activationContract?: unknown;
}
export const isBillingTestEnabled = (env: Record<string, string | undefined>) => env.BILLING_TEST_ENABLED === 'true';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readBillingTestConfig(env: Record<string, string | undefined>): BillingTestConfig {
  const requireValue = (name: string, pattern: RegExp) => {
    const value = env[name]?.trim() ?? '';
    if (!pattern.test(value)) throw new BillingTestConfigurationError();
    return value;
  };
  if (env.BILLING_TEST_ACCOUNT_ID !== FANTIP_SANDBOX_ACCOUNT_ID || env.BILLING_TEST_MODE !== 'sandbox') {
    throw new BillingTestConfigurationError();
  }
  let origin: URL;
  try { origin = new URL(env.BILLING_TEST_APP_ORIGIN ?? ''); } catch { throw new BillingTestConfigurationError(); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash
    || (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:'))) throw new BillingTestConfigurationError();
  const players = (env.BILLING_TEST_ALLOWED_PLAYER_IDS ?? '').split(',').map(x => x.trim()).filter(Boolean);
  if (!players.length || players.some(x => !uuid.test(x))) throw new BillingTestConfigurationError();
  const monthly = requireValue('STRIPE_TEST_PRICE_MONTHLY_ID', /^price_[A-Za-z0-9]+$/);
  const annual = requireValue('STRIPE_TEST_PRICE_ANNUAL_ID', /^price_[A-Za-z0-9]+$/);
  if (monthly === annual) throw new BillingTestConfigurationError();
  return {
    environment: 'test',
    accountId: FANTIP_SANDBOX_ACCOUNT_ID,
    secretKey: requireValue('STRIPE_SECRET_KEY', /^sk_test_[A-Za-z0-9]+$/),
    webhookSecret: requireValue('STRIPE_WEBHOOK_SECRET', /^whsec_[A-Za-z0-9_]+$/),
    productId: requireValue('STRIPE_TEST_PRODUCT_ID', /^prod_[A-Za-z0-9]+$/),
    priceIds: { fan_vip_monthly: monthly, fan_vip_annual: annual },
    portalConfigurationId: requireValue('STRIPE_TEST_PORTAL_CONFIGURATION_ID', /^bpc_[A-Za-z0-9]+$/),
    appOrigin: origin.origin,
    allowedPlayerIds: new Set(players),
    reconcileSecret: requireValue('BILLING_TEST_RECONCILE_SECRET', /^[A-Za-z0-9_-]{32,256}$/),
  };
}
