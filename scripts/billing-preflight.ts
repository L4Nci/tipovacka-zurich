/** Offline readiness report. Never prints values, changes gates or calls a provider. */
import fs from 'node:fs';
import dotenv from 'dotenv';
import { readBillingTestConfig } from '../server/lib/billingTestConfig.ts';
import { readBillingLiveConfig } from '../server/lib/billingLiveConfig.ts';
const live = process.argv.includes('--live');
const env = dotenv.parse(fs.readFileSync('.env'));
const names = live ? ['BILLING_LIVE_ACCOUNT_ID','BILLING_LIVE_RECONCILE_SECRET','BILLING_LIVE_OFFER_CONTRACT',
  'STRIPE_LIVE_SECRET_KEY','STRIPE_LIVE_WEBHOOK_SECRET','STRIPE_LIVE_PRODUCT_ID','STRIPE_LIVE_PRICE_MONTHLY_ID',
  'STRIPE_LIVE_PRICE_ANNUAL_ID','STRIPE_LIVE_PORTAL_CONFIGURATION_ID'] : ['BILLING_TEST_MODE','BILLING_TEST_ACCOUNT_ID',
  'BILLING_TEST_APP_ORIGIN','BILLING_TEST_ALLOWED_PLAYER_IDS','BILLING_TEST_RECONCILE_SECRET','STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET','STRIPE_TEST_PRODUCT_ID','STRIPE_TEST_PRICE_MONTHLY_ID','STRIPE_TEST_PRICE_ANNUAL_ID','STRIPE_TEST_PORTAL_CONFIGURATION_ID'];
const missingFields = names.filter(name => !env[name]?.trim());
let configurationValid = false;
try { (live ? readBillingLiveConfig : readBillingTestConfig)(env); configurationValid = true; } catch { /* Report names, not raw config/errors. */ }
const gates = live ? ['BILLING_LIVE_ENABLED','BILLING_LIVE_CHECKOUT_ENABLED','VITE_BILLING_LIVE_UI_ENABLED']
  : ['BILLING_TEST_ENABLED','VITE_BILLING_TEST_UI_ENABLED'];
console.log(JSON.stringify({ environment: live ? 'live' : 'test', configurationValid, missingFields,
  disabledGates: gates.filter(name => env[name] !== 'true'),
  requiresSeparateVerification: ['provider account/catalog/portal', 'webhook endpoint/signing secret/delivery',
    'signed Clerk buyer flow', ...(live ? ['accepted DB offer + checkout admission', 'approved Live schema apply + release'] : [])] }, null, 2));
process.exitCode = configurationValid ? 0 : 1;
