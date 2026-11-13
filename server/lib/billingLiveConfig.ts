import { BillingTestConfigurationError, FANTIP_SANDBOX_ACCOUNT_ID, type BillingTestConfig } from './billingTestConfig.ts';
import { readBillingLiveActivation } from './billingLiveActivation.ts';

/** Preparation only: no configured seller, policy, Live credential or enabled flag is supplied by source. */
export function readBillingLiveConfig(env: Record<string, string | undefined>): BillingTestConfig {
  const requireValue = (name: string, pattern: RegExp) => {
    const value = env[name]?.trim() ?? '';
    if (!pattern.test(value)) throw new BillingTestConfigurationError();
    return value;
  };
  let input: unknown;
  try { input = JSON.parse(env.BILLING_LIVE_OFFER_CONTRACT ?? ''); } catch { throw new BillingTestConfigurationError(); }
  const contract = readBillingLiveActivation(input);
  const accountId = requireValue('BILLING_LIVE_ACCOUNT_ID', /^acct_[A-Za-z0-9]+$/);
  if (accountId === FANTIP_SANDBOX_ACCOUNT_ID || accountId !== contract.accountId
    || env.CLERK_ISSUER_URL !== contract.clerkIssuer || !/^pk_live_[A-Za-z0-9_]+$/.test(env.VITE_CLERK_PUBLISHABLE_KEY ?? '')
    || !(env.CLERK_AUTHORIZED_PARTIES ?? '').split(',').map(x => x.trim()).includes(contract.appOrigin)) throw new BillingTestConfigurationError();
  const monthly = requireValue('STRIPE_LIVE_PRICE_MONTHLY_ID', /^price_[A-Za-z0-9]+$/);
  const annual = requireValue('STRIPE_LIVE_PRICE_ANNUAL_ID', /^price_[A-Za-z0-9]+$/);
  if (monthly === annual) throw new BillingTestConfigurationError();
  const players = (env.BILLING_LIVE_ALLOWED_PLAYER_IDS ?? '').split(',').map(x => x.trim()).filter(Boolean);
  const publicCheckoutEnabled = env.BILLING_LIVE_PUBLIC_CHECKOUT_ENABLED === 'true';
  if ((!publicCheckoutEnabled && !players.length) || players.some(x => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x))) {
    throw new BillingTestConfigurationError();
  }
  return { environment: 'live', accountId, secretKey: requireValue('STRIPE_LIVE_SECRET_KEY', /^sk_live_[A-Za-z0-9]+$/),
    webhookSecret: requireValue('STRIPE_LIVE_WEBHOOK_SECRET', /^whsec_[A-Za-z0-9_]+$/),
    productId: requireValue('STRIPE_LIVE_PRODUCT_ID', /^prod_[A-Za-z0-9]+$/),
    priceIds: { fan_vip_monthly: monthly, fan_vip_annual: annual },
    portalConfigurationId: requireValue('STRIPE_LIVE_PORTAL_CONFIGURATION_ID', /^bpc_[A-Za-z0-9]+$/),
    appOrigin: contract.appOrigin, allowedPlayerIds: new Set(players),
    reconcileSecret: requireValue('BILLING_LIVE_RECONCILE_SECRET', /^[A-Za-z0-9_-]{32,256}$/),
    publicCheckoutEnabled, checkoutEnabled: env.BILLING_LIVE_CHECKOUT_ENABLED === 'true',
    activationVersion: contract.version, activationContract: contract };
}
