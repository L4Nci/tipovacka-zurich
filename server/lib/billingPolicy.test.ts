import assert from 'node:assert/strict';
import test from 'node:test';
import { getFanVipOffer, projectVipAccess, type CanonicalVipBillingSnapshot } from './billingPolicy.ts';

const now = new Date('2026-11-10T12:00:00Z');
const paid = (): CanonicalVipBillingSnapshot => ({
  environment: 'test', offerKey: 'fan_vip_monthly', subscriptionState: 'active',
  cancelAtPeriodEnd: false,
  paidPeriod: { startsAt: '2026-11-01T12:00:00Z', endsAt: '2026-12-01T12:00:00Z', paymentState: 'paid' },
});

test('offers resolve only exact server-owned keys and immutable CZK prices', () => {
  assert.deepEqual(getFanVipOffer('fan_vip_monthly'), {
    key: 'fan_vip_monthly', planKey: 'fan_vip', currency: 'CZK',
    amountMinor: 4900, interval: 'month', intervalCount: 1,
  });
  assert.deepEqual(getFanVipOffer('fan_vip_annual'), {
    key: 'fan_vip_annual', planKey: 'fan_vip', currency: 'CZK',
    amountMinor: 49900, interval: 'year', intervalCount: 1,
  });
  for (const input of [null, undefined, 'free', 'fan_vip', 'monthly', 'fan_vip_monthly ',
    'FAN_VIP_MONTHLY', '__proto__', 'constructor', 49, { key: 'fan_vip_monthly', amountMinor: 1 }]) {
    assert.equal(getFanVipOffer(input), null);
  }
  assert.equal(Object.isFrozen(getFanVipOffer('fan_vip_monthly')), true);
  assert.throws(() => { (getFanVipOffer('fan_vip_monthly') as any).amountMinor = 1; }, TypeError);
});

test('verified funded periods project finite active access without creating records', () => {
  const input = paid();
  const before = structuredClone(input);
  const result = projectVipAccess(input, now);
  assert.deepEqual(result, {
    kind: 'projected', environment: 'test', planKey: 'fan_vip', offerKey: 'fan_vip_monthly',
    eligible: true, reason: 'paid', localStatus: 'active',
    validFrom: '2026-11-01T12:00:00.000Z', validUntil: '2026-12-01T12:00:00.000Z', renewalStopped: false,
  });
  assert.deepEqual(input, before);
  assert.deepEqual(projectVipAccess(input, now), result);
});

test('cancellation and an overdue renewal preserve the existing paid-through boundary', () => {
  for (const state of ['active', 'cancelled', 'past_due'] as const) {
    const input = { ...paid(), subscriptionState: state, cancelAtPeriodEnd: state !== 'past_due' };
    const result = projectVipAccess(input, now);
    assert.equal(result.kind, 'projected');
    if (result.kind !== 'projected') assert.fail('Expected projection');
    assert.equal(result.eligible, true, state);
    assert.equal(result.localStatus, 'active', state);
    assert.equal(result.validUntil, '2026-12-01T12:00:00.000Z');
    assert.equal(result.renewalStopped, state !== 'past_due');
  }
});

test('paid periods use inclusive start and exclusive end on the server clock', () => {
  const input = paid();
  for (const [time, eligible, reason] of [
    ['2026-11-01T11:59:59.999Z', false, 'not_started'],
    ['2026-11-01T12:00:00.000Z', true, 'paid'],
    ['2026-12-01T11:59:59.999Z', true, 'paid'],
    ['2026-12-01T12:00:00.000Z', false, 'expired'],
  ] as const) {
    const result = projectVipAccess(input, new Date(time));
    assert.equal(result.kind, 'projected');
    if (result.kind !== 'projected') assert.fail('Expected projection');
    assert.equal(result.eligible, eligible);
    assert.equal(result.reason, reason);
  }
});

test('an annual payment uses the canonical paid interval, not 365-day arithmetic', () => {
  const input: CanonicalVipBillingSnapshot = { ...paid(), offerKey: 'fan_vip_annual',
    paidPeriod: { startsAt: '2027-03-01T12:00:00Z', endsAt: '2028-03-01T12:00:00Z', paymentState: 'paid' } };
  const result = projectVipAccess(input, new Date('2028-02-29T12:00:00Z'));
  assert.equal(result.kind, 'projected');
  if (result.kind !== 'projected') assert.fail('Expected projection');
  assert.equal(result.eligible, true);
  assert.equal(result.validUntil, '2028-03-01T12:00:00.000Z');
});

test('unpaid and pending periods never grant access despite an active subscription label', () => {
  for (const paymentState of ['unpaid', 'pending'] as const) {
    const input = { ...paid(), paidPeriod: { ...paid().paidPeriod!, paymentState } };
    const result = projectVipAccess(input, now);
    assert.equal(result.kind, 'projected');
    if (result.kind !== 'projected') assert.fail('Expected projection');
    assert.equal(result.eligible, false);
    assert.equal(result.reason, paymentState === 'pending' ? 'payment_pending' : 'payment_unpaid');
    assert.notEqual(result.localStatus, 'active');
  }
  const input = { ...paid(), paidPeriod: null };
  const result = projectVipAccess(input, now);
  assert.equal(result.kind, 'projected');
  if (result.kind !== 'projected') assert.fail('Expected projection');
  assert.equal(result.eligible, false);
  assert.equal(result.localStatus, null);
});

test('funding-payment reversals and suspension explicitly deny even a current paid period', () => {
  for (const paymentState of ['refunded', 'chargeback'] as const) {
    const input = { ...paid(), paidPeriod: { ...paid().paidPeriod!, paymentState } };
    const result = projectVipAccess(input, now);
    assert.equal(result.kind, 'projected');
    if (result.kind !== 'projected') assert.fail('Expected projection');
    assert.equal(result.eligible, false);
    assert.equal(result.localStatus, 'cancelled');
    assert.equal(result.reason, paymentState);
  }
  for (const [subscriptionState, reason] of [['suspended', 'suspended'], ['trialing', 'trial_not_offered'], ['pending', 'subscription_pending']] as const) {
    const result = projectVipAccess({ ...paid(), subscriptionState }, now);
    assert.equal(result.kind, 'projected');
    if (result.kind !== 'projected') assert.fail('Expected projection');
    assert.equal(result.eligible, false);
    assert.equal(result.reason, reason);
  }
});

test('missing, invalid and backwards expiry reject instead of producing lifetime access or a revocation', () => {
  for (const paidPeriod of [
    {}, { ...paid().paidPeriod!, endsAt: null }, { ...paid().paidPeriod!, endsAt: '' },
    { ...paid().paidPeriod!, startsAt: '2026-12-01T12:00:00Z' },
    { ...paid().paidPeriod!, endsAt: '2026-10-01T12:00:00Z' },
    { ...paid().paidPeriod!, startsAt: '2026-02-30T12:00:00Z' },
    { ...paid().paidPeriod!, endsAt: '2026-12-01 12:00:00' },
    { ...paid().paidPeriod!, paymentState: 'partially_refunded' },
  ]) assert.deepEqual(projectVipAccess({ ...paid(), paidPeriod }, now), { kind: 'rejected', reason: 'invalid_paid_period' });
});

test('unknown offers, environments, states and malformed snapshots fail closed', () => {
  for (const input of [null, [], 'paid', { ...paid(), environment: 'production' },
    { ...paid(), environment: undefined }, { ...paid(), subscriptionState: 'future-provider-status' },
    { ...paid(), cancelAtPeriodEnd: 'false' }, { ...paid(), paidPeriod: undefined }]) {
    assert.equal(projectVipAccess(input, now).kind, 'rejected');
  }
  assert.deepEqual(projectVipAccess({ ...paid(), offerKey: 'free' }, now), { kind: 'rejected', reason: 'unknown_offer' });
  assert.deepEqual(projectVipAccess(paid(), new Date('invalid')), { kind: 'rejected', reason: 'invalid_clock' });
});

test('test/live provenance remains explicit; this projection cannot mint database access', () => {
  const testResult = projectVipAccess(paid(), now);
  const liveResult = projectVipAccess({ ...paid(), environment: 'live' }, now);
  assert.equal(testResult.kind, 'projected'); assert.equal(liveResult.kind, 'projected');
  if (testResult.kind !== 'projected' || liveResult.kind !== 'projected') assert.fail('Expected projections');
  assert.equal(testResult.environment, 'test'); assert.equal(liveResult.environment, 'live');
  assert.equal('userId' in testResult, false);
  assert.equal('entitlements' in testResult, false);
});
