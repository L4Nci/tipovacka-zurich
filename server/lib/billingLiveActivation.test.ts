import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BillingLiveActivationError, readBillingLiveActivation } from './billingLiveActivation.ts';

const now = new Date('2026-11-12T10:00:00.000Z');
const fixture = () => ({ status: 'accepted', version: 'fixture-v1', accountId: 'acct_LiveFixture', planKey: 'fan_vip', currency: 'CZK',
  monthlyAmountMinor: 4900, annualAmountMinor: 49900, sellerReference: 'fixture-seller', termsVersion: 'fixture-terms-v1',
  sellerDisplayName: 'Synthetic fixture seller', offerSummary: 'Synthetic accepted appearance capability.',
  renewalSummary: 'Synthetic renewal terms.', cancellationSummary: 'Synthetic cancellation terms.',
  termsUrl: 'https://fantip.example/terms', privacyUrl: 'https://fantip.example/privacy', refundUrl: 'https://fantip.example/refunds',
  supportEmail: 'support@fantip.example',
  refundPolicyVersion: 'fixture-refunds-v1', appearancePolicyVersion: 'fixture-appearance-v1',
  acceptedCapabilities: ['profile_skins', 'custom_lobby_branding'], ownedLobbyQuota: 3, taxModel: 'no_tax',
  appOrigin: 'https://fantip.example', clerkIssuer: 'https://identity.fantip.example', acceptedAt: '2026-11-12T09:00:00.000Z' });

test('accepted activation is explicit, immutable and canonically ordered without activating anything', () => {
  const input = fixture(); const contract = readBillingLiveActivation(input, now);
  assert.deepEqual(contract.acceptedCapabilities, ['custom_lobby_branding', 'profile_skins']);
  assert.equal(contract.ownedLobbyQuota, 3);
  assert.ok(Object.isFrozen(contract)); assert.ok(Object.isFrozen(contract.acceptedCapabilities));
  assert.deepEqual(input.acceptedCapabilities, ['profile_skins', 'custom_lobby_branding']);
  assert.equal('enabled' in contract, false);
});

test('unknown seller, quotas, draft terms and unsupported tax prevent live offer acceptance', () => {
  for (const change of [{ status: 'draft' }, { sellerReference: '' }, { termsVersion: '' }, { refundPolicyVersion: null },
    { appearancePolicyVersion: '' }, { ownedLobbyQuota: null }, { ownedLobbyQuota: 'unlimited' }, { ownedLobbyQuota: 1 },
    { ownedLobbyQuota: 3.5 }, { ownedLobbyQuota: 10001 }, { taxModel: 'unknown' }, { taxModel: 'stripe_tax' },
    { acceptedCapabilities: [] }, { acceptedCapabilities: ['profile_skins', 'profile_skins'] },
    { acceptedCapabilities: ['profile-skins'] }]) {
    assert.throws(() => readBillingLiveActivation({ ...fixture(), ...change }, now), BillingLiveActivationError);
  }
});

test('buyer-facing offer and seller information are required and treated as plain accepted content', () => {
  for (const change of [{ sellerDisplayName: '' }, { offerSummary: '' }, { offerSummary: '<script>\u0000</script>' },
    { renewalSummary: '' }, { cancellationSummary: '' }, { supportEmail: 'not-an-email' },
    { termsUrl: 'http://fantip.example/terms' }, { privacyUrl: 'https://user:pass@fantip.example/privacy' },
    { refundUrl: 'javascript:alert(1)' }]) {
    assert.throws(() => readBillingLiveActivation({ ...fixture(), ...change }, now), BillingLiveActivationError);
  }
});

test('approved price/product cannot be changed through a live activation contract', () => {
  for (const change of [{ planKey: 'creator' }, { monthlyAmountMinor: 2900 }, { annualAmountMinor: 499 },
    { currency: 'EUR' }, { accountId: 'acct_1UQsnbC66ykHzmj6' }, { accountId: 'invalid' }, { enabled: true }]) {
    assert.throws(() => readBillingLiveActivation({ ...fixture(), ...change }, now), BillingLiveActivationError);
  }
  const missing = fixture() as Record<string, unknown>; delete missing.sellerReference;
  assert.throws(() => readBillingLiveActivation(missing, now), BillingLiveActivationError);
});

test('only explicit HTTPS web/identity origins and a real accepted timestamp are allowed', () => {
  for (const origin of ['http://fantip.example', 'https://user:secret@fantip.example', 'https://fantip.example/pay',
    'https://fantip.example/?query=1', 'https://localhost', 'https://127.0.0.1', 'javascript:alert(1)']) {
    assert.throws(() => readBillingLiveActivation({ ...fixture(), appOrigin: origin }, now), BillingLiveActivationError);
    assert.throws(() => readBillingLiveActivation({ ...fixture(), clerkIssuer: origin }, now), BillingLiveActivationError);
  }
  for (const acceptedAt of ['2026-02-31T09:00:00.000Z', '2026-11-13T09:00:00.000Z', 'tomorrow']) {
    assert.throws(() => readBillingLiveActivation({ ...fixture(), acceptedAt }, now), BillingLiveActivationError);
  }
});
