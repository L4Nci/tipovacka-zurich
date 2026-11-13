/** Idempotent FanTip sandbox catalogue only. Never customers, payments or Live. */
import fs from 'node:fs';
import dotenv from 'dotenv';
import Stripe from 'stripe';
const apply = process.argv.includes('--apply');
const env = dotenv.parse(fs.readFileSync('.env'));
if (!/^sk_test_[A-Za-z0-9]+$/.test(env.STRIPE_SECRET_KEY ?? '')) throw Error('Sandbox key required; no value was printed.');
const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-10-28.endive', timeout: 10000, maxNetworkRetries: 1 });
const expected = 'acct_1UQsnbC66ykHzmj6';
const metadata = { fan_plan_key: 'fan_vip', fan_setup_version: 'v1', fan_environment: 'sandbox' };
async function bounded(list, parameters) {
  const data = []; let after;
  for (let page = 0; page < 5; page++) {
    const result = await list({ ...parameters, limit: 100, ...(after ? { starting_after: after } : {}) });
    data.push(...result.data); if (!result.has_more) return data;
    if (!result.data.length || result.data.at(-1).id === after) break;
    after = result.data.at(-1).id;
  }
  throw Error('Catalogue scan incomplete; no absence assumed.');
}
try {
  if ((await stripe.accounts.retrieve()).id !== expected) throw Error('Wrong sandbox account.');
  const products = (await bounded(x => stripe.products.list(x), {})).filter(x => x.metadata?.fan_plan_key === 'fan_vip');
  if (products.length > 1) throw Error('Ambiguous existing product.');
  let product = products[0];
  if (product && (!product.active || product.livemode !== false)) throw Error('Invalid existing product.');
  if (!product && apply) product = await stripe.products.create({ id: 'prod_FanTipVipV1', name: 'Fan VIP', metadata }, { idempotencyKey: 'fantip-sandbox-product-v1' });
  const ids = {};
  for (const [key, amount, interval] of [['monthly', 4900, 'month'], ['annual', 49900, 'year']]) {
    const lookup = `fantip_vip_${key}_v1`;
    const found = await bounded(x => stripe.prices.list(x), { lookup_keys: [lookup] });
    if (found.length > 1) throw Error('Ambiguous recurring price.');
    let price = found[0];
    if (price && (!product || price.product !== product.id || price.livemode !== false || !price.active
      || price.unit_amount !== amount || price.currency !== 'czk' || price.type !== 'recurring'
      || price.recurring?.interval !== interval || price.recurring.interval_count !== 1)) throw Error('Existing price conflicts with approved offer.');
    if (!price && apply) price = await stripe.prices.create({ product: product.id, lookup_key: lookup, currency: 'czk', unit_amount: amount,
      recurring: { interval, interval_count: 1 }, metadata }, { idempotencyKey: `fantip-sandbox-price-${key}-v1` });
    ids[`STRIPE_TEST_PRICE_${key.toUpperCase()}_ID`] = price?.id ?? null;
  }
  const configs = (await bounded(x => stripe.billingPortal.configurations.list(x), {}))
    .filter(x => x.metadata?.fan_plan_key === 'fan_vip' && x.metadata?.fan_setup_version === 'v1');
  if (configs.length > 1) throw Error('Ambiguous portal configuration.');
  let portal = configs[0];
  if (!portal && apply) portal = await stripe.billingPortal.configurations.create({ business_profile: { headline: 'Fan VIP · sandbox' },
    metadata, login_page: { enabled: false }, features: { customer_update: { enabled: false }, invoice_history: { enabled: true },
      payment_method_update: { enabled: true }, subscription_update: { enabled: false }, subscription_pause: { enabled: false },
      subscription_cancel: { enabled: true, mode: 'at_period_end', proration_behavior: 'none' } },
  }, { idempotencyKey: 'fantip-sandbox-portal-v1' });
  if (portal && (portal.livemode !== false || !portal.active || portal.login_page?.enabled
    || !portal.features.payment_method_update.enabled || !portal.features.subscription_cancel.enabled
    || portal.features.subscription_cancel.mode !== 'at_period_end' || portal.features.subscription_cancel.proration_behavior !== 'none'
    || portal.features.subscription_update.enabled || portal.features.subscription_pause.enabled || portal.features.customer_update.enabled)) throw Error('Unsafe existing portal configuration.');
  console.log(JSON.stringify({ accountVerified: true, mode: 'sandbox', applied: apply, STRIPE_TEST_PRODUCT_ID: product?.id ?? null,
    ...ids, STRIPE_TEST_PORTAL_CONFIGURATION_ID: portal?.id ?? null, gatesRemainDisabled: true }));
} catch (error) {
  console.error(JSON.stringify({ setupFailed: true, errorType: error.type ?? 'validation', code: error.code ?? null }));
  process.exitCode = 1;
}
