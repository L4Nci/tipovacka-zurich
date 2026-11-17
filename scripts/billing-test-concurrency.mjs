/** Existing LOCAL harness only. Synthetic committed fixtures are removed in finally.
 * Transactional policy/ACL tests remain in supabase/tests/billing_test_sandbox.sql.
 * Run after applying the current candidate locally; this script never applies schema.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const host = process.env.BILLING_TEST_PGHOST || '/private/tmp/fan-public-pools-local-pg-20261109';
const port = process.env.BILLING_TEST_PGPORT || '54378';
const database = process.env.BILLING_TEST_PGDATABASE || 'fan_public_pool_final';
if (!/^\/(?:private\/)?tmp\/[A-Za-z0-9_./-]+$/.test(host) || !/^\d{4,5}$/.test(port)
  || !/^fan_[a-z0-9_]+$/.test(database)) throw new Error('Only the existing local Unix-socket harness is allowed.');
const suffix = randomUUID().replaceAll('-', '');
const account = `acct_Concurrency${suffix}`;
const player = randomUUID();
const customer = `cus_Concurrency${suffix}`;
const fingerprint = 'e'.repeat(64);
const sqlText = value => `'${String(value).replaceAll("'", "''")}'`;
const a = sqlText(account), p = `${sqlText(player)}::uuid`, c = sqlText(customer), fp = sqlText(fingerprint);

function query(statement) {
  return new Promise((resolve, reject) => {
    const process = spawn('psql', ['-X', '-h', host, '-p', port, '-d', database, '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', errors = '';
    process.stdout.on('data', bytes => { output += bytes; });
    process.stderr.on('data', bytes => { errors += bytes; });
    process.on('error', reject);
    process.on('close', code => code === 0 ? resolve(output.trim().split('\n').filter(Boolean))
      : reject(new Error(`Local psql failed (${code}): ${errors}`)));
  });
}
const json = lines => JSON.parse(lines.find(line => line.startsWith('{') || line.startsWith('[')) || 'null');
const service = statement => query(`SET ROLE service_role; ${statement}`);
const normalTables = ['profiles', 'subscriptions', 'plans', 'entitlements', 'plan_entitlements', 'matches', 'predictions', 'lobbies', 'lobby_members'];
const digest = () => query(`SELECT jsonb_build_object(${normalTables.map(table => `${sqlText(table)},
  (SELECT md5(COALESCE(string_agg(row_to_json(item)::text,'|' ORDER BY row_to_json(item)::text),'')) FROM public.${table} item)`).join(',')});`).then(json);
const baseline = await digest();
let passed = 0;
try {
  const seed = json(await query(`BEGIN; INSERT INTO public.profiles(id,username) VALUES(${p},${sqlText(`billing_concurrency_${suffix}`)});
    SET LOCAL ROLE service_role; SELECT public.billing_test_reserve_checkout(${a},${p},'fan_vip_monthly');
    SELECT public.billing_test_bind_customer(${a},${p},${c}); COMMIT;`));
  const reservations = await Promise.all([0, 1].map(() => query(`BEGIN; SET LOCAL ROLE service_role;
    SELECT public.billing_test_reserve_checkout(${a},${p},'fan_vip_annual'); SELECT pg_sleep(0.4); ROLLBACK;`)));
  for (const result of reservations.map(json)) {
    assert.equal(result.id, seed.id); assert.equal(result.customerIdempotencyKey, seed.customerIdempotencyKey);
    assert.equal(result.offerKey, 'fan_vip_monthly');
  }
  passed++; console.log('PASS concurrent reservations retain one durable immutable seed');

  const eventIds = [`evt_${suffix}A`, `evt_${suffix}B`];
  const leases = await Promise.all(eventIds.map(id => service(`SELECT public.billing_test_begin_reconciliation(${a},${c},${sqlText(id)},'invoice.paid',${fp});`).then(json)));
  assert.equal(leases.filter(value => value.kind === 'claimed').length, 1);
  assert.equal(leases.filter(value => value.kind === 'busy').length, 1);
  const winnerIndex = leases.findIndex(value => value.kind === 'claimed');
  const winner = leases[winnerIndex], winnerEvent = eventIds[winnerIndex];
  await service(`SELECT public.billing_test_fail_reconciliation(${a},${p},${sqlText(winnerEvent)},${fp},
    ${sqlText(winner.leaseToken)}::uuid,${winner.leaseVersion});`);
  const nextEvent = `evt_${suffix}Next`;
  const next = json(await service(`SELECT public.billing_test_begin_reconciliation(${a},${c},${sqlText(nextEvent)},'app.status',${fp});`));
  assert.equal(next.kind, 'claimed'); assert.ok(next.leaseVersion > winner.leaseVersion);
  const stale = await service(`SELECT public.billing_test_complete_reconciliation(${a},${p},${sqlText(winnerEvent)},${fp},
    ${sqlText(winner.leaseToken)}::uuid,${winner.leaseVersion},${sqlText(seed.id)}::uuid,NULL,NULL,NULL,'pending');`);
  assert.equal(stale.at(-1), 'f');
  await service(`SELECT public.billing_test_fail_reconciliation(${a},${p},${sqlText(nextEvent)},${fp},
    ${sqlText(next.leaseToken)}::uuid,${next.leaseVersion});`);
  passed++; console.log('PASS independent connections serialize buyer claims and fence a stale worker');

  // Keep the 12 concurrent requests within one server-clock minute bucket.
  const seconds = Number((await query('SELECT extract(second FROM clock_timestamp());')).at(-1));
  if (seconds > 55) await new Promise(resolve => setTimeout(resolve, (61 - seconds) * 1000));
  const limits = await Promise.all(Array.from({ length: 12 }, () => service(`SELECT public.billing_test_consume_rate_limit(${a},${p},'checkout');`)));
  assert.equal(limits.filter(lines => lines.at(-1) === 't').length, 6);
  passed++; console.log('PASS distributed rate limit allows exactly six of twelve concurrent checkout requests');

  for (const ending of ['InboxA', 'InboxB']) {
    const event = { id: `evt_${suffix}${ending}`, type: 'charge.refunded', livemode: false, customerId: null,
      objectId: `ch_${suffix}${ending}`, chargeId: `ch_${suffix}${ending}` };
    await service(`SELECT public.billing_test_enqueue_event(${a},${sqlText(JSON.stringify(event))}::jsonb,${fp});`);
  }
  const inboxClaims = await Promise.all([0, 1].map(() => query(`BEGIN; SET LOCAL ROLE service_role;
    SELECT public.billing_test_list_pending_events(${a},1); SELECT pg_sleep(0.4); ROLLBACK;`).then(json)));
  assert.equal(inboxClaims[0].length, 1); assert.equal(inboxClaims[1].length, 1);
  assert.notEqual(inboxClaims[0][0].id, inboxClaims[1][0].id);
  passed++; console.log('PASS concurrent inbox claimers select disjoint events with SKIP LOCKED');
} finally {
  await query(`BEGIN;
    DELETE FROM billing_test_private.invoice_reviews WHERE account_id=${a};
    DELETE FROM billing_test_private.funding_periods WHERE account_id=${a};
    DELETE FROM billing_test_private.outcomes WHERE account_id=${a};
    DELETE FROM billing_test_private.checkout_intents WHERE account_id=${a};
    DELETE FROM billing_test_private.events WHERE account_id=${a};
    DELETE FROM billing_test_private.rate_limits WHERE account_id=${a};
    DELETE FROM billing_test_private.customers WHERE account_id=${a};
    DELETE FROM public.profiles WHERE id=${p}; COMMIT;`);
  assert.deepEqual(await digest(), baseline, 'Normal game/subscription tables changed after fixture cleanup');
  console.log('PASS fixture cleanup restores all normal-table content digests');
}
console.log(`${passed} concurrency checks passed; no hosted database or provider contacted.`);
