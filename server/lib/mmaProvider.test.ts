import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMmaEvent, readMmaEvent, MmaProviderError } from './mmaProvider.ts';
import { canPredictMmaFight, mmaWinnerPoints, type MmaEvent, type MmaFight } from '../../src/lib/mma.ts';
import { runMmaCatalogSync } from './mmaSync.ts';

const person = (id: number) => ({ id, name: 'Fighter ' + id, country_code: id === 1 ? 'CZ' : 'NZ' });
const bout = () => ({ id: 100, ordering: 1, card_section: 'main', sport: 'mma', weight_class: 'Light Heavyweight',
  scheduled_rounds: 5, status: 'announced', fighter_a: person(1), fighter_b: person(2), result: null as any });
const event = () => ({ id: 3533, slug: 'ufc-fight-night-2026-11-21', title: 'Prochazka vs Stirling', org: 'ufc', sport: 'mma',
  starts_at: '2026-11-21T15:00:00Z', main_card_at: '2026-11-21T18:00:00Z', status: 'scheduled', card: [bout()] });
const observed = new Date('2026-11-06T12:00:00Z');

test('MMA preserves full card and separate first-bell/main-card clocks', () => {
  const raw = event(); raw.card.push({ ...bout(), id: 101, status: 'cancelled' });
  const batch = normalizeMmaEvent(raw, 3533, observed);
  assert.equal(batch.fights.length, 2);
  assert.equal(batch.fights[1].status, 'cancelled');
  assert.equal(batch.event.starts_at, '2026-11-21T15:00:00.000Z');
  assert.equal(new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit' }).format(new Date(batch.event.starts_at)), '16:00');
  assert.equal(batch.snapshot_hash, normalizeMmaEvent(raw, 3533, new Date(observed.getTime() + 1000)).snapshot_hash);
  assert.notEqual(batch.snapshot_hash, normalizeMmaEvent({ ...raw, card: [{ ...bout(), fighter_b: person(3) }] }, 3533, observed).snapshot_hash);
});
test('MMA settles winner, draw, no contest and unknown results without invented scores', () => {
  const raw = event(); raw.card[0].status = 'completed';
  raw.card[0].result = { winner_fighter_id: 1, method: 'Decision - Unanimous', method_normalized: 'decision_unanimous', round: 5 };
  assert.equal(normalizeMmaEvent(raw, 3533).fights[0].status, 'finished');
  raw.card[0].result = { winner_fighter_id: null, method_normalized: 'draw' };
  assert.equal(normalizeMmaEvent(raw, 3533).fights[0].status, 'draw');
  raw.card[0].status = 'no_contest'; raw.card[0].result.method_normalized = 'no_contest';
  assert.equal(normalizeMmaEvent(raw, 3533).fights[0].status, 'void');
  raw.card[0].status = 'completed'; raw.card[0].result = null;
  assert.equal(normalizeMmaEvent(raw, 3533).fights[0].status, 'awaiting_result');
});
test('MMA rejects foreign identity, impossible winner, duplicate fight and ambiguous clock', () => {
  assert.throws(() => normalizeMmaEvent(event(), 2563), MmaProviderError);
  const raw = event(); raw.card[0].status = 'completed'; raw.card[0].result = { winner_fighter_id: 999 };
  assert.throws(() => normalizeMmaEvent(raw, 3533), MmaProviderError);
  assert.throws(() => normalizeMmaEvent({ ...event(), card: [bout(), bout()] }, 3533), MmaProviderError);
  assert.throws(() => normalizeMmaEvent({ ...event(), starts_at: '2026-11-21T15:00:00' }, 3533), MmaProviderError);
});
test('winner-only contract gives points only to a valid current lineup and never opens at lock', () => {
  assert.equal(mmaWinnerPoints(1, 1, 'finished', 1, 1), 1);
  assert.equal(mmaWinnerPoints(1, 2, 'finished', 1, 1), 0);
  assert.equal(mmaWinnerPoints(1, 1, 'finished', 1, 2), 0);
  assert.equal(mmaWinnerPoints(1, null, 'void', 1, 1), 0);
  const e = { status: 'scheduled', lock_time_utc: '2026-11-21T15:00:00Z' } as MmaEvent;
  const f = { status: 'scheduled', fighter_a_id: 1, fighter_b_id: 2 } as MmaFight;
  assert.equal(canPredictMmaFight(e, f, Date.parse(e.lock_time_utc) - 1), true);
  assert.equal(canPredictMmaFight(e, f, Date.parse(e.lock_time_utc)), false);
});
test('provider key stays on fixed origin and transport errors cannot reflect secrets', async () => {
  await assert.rejects(readMmaEvent(3533, 'private-key', (async (url: any, init: any) => {
    assert.equal(url, 'https://api.ufcalendar.com/v1/events/3533');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.authorization, 'Bearer private-key');
    throw new Error('private-key');
  }) as typeof fetch), error => error instanceof MmaProviderError && !error.message.includes('private-key'));
  await assert.rejects(readMmaEvent(9999, 'private-key'), MmaProviderError);
});
test('disabled MMA costs no provider calls and not-due events do not fetch', async () => {
  let calls = 0;
  const transport = (async () => { calls++; throw new Error('Unexpected fetch'); }) as typeof fetch;
  assert.equal((await runMmaCatalogSync({} as any, false, { enabled: false, transport })).failed, false);
  const admin = { rpc: async () => ({ data: false, error: null }) } as any;
  const result = await runMmaCatalogSync(admin, false, { enabled: true, key: 'test', transport });
  assert.equal(result.failed, false);
  assert.equal(Object.values(result.competitions).every((row: any) => row.skipped), true);
  assert.equal(calls, 0);
});
test('one failed card does not prevent the other card from syncing', async () => {
  const submitted: string[] = [];
  const admin = { rpc: async (name: string, args: any) => {
    if (name === 'claim_mma_sync') return { data: true, error: null };
    if (name === 'claim_mma_fighter_portrait') return { data: [], error: null };
    submitted.push(args.batch_param.event.tournament_id);
    return { data: { wrote_to_db: true }, error: null };
  } } as any;
  const transport = (async (url: any) => {
    if (String(url).endsWith('/2563')) throw new Error('private-key');
    return new Response(JSON.stringify({ data: event() }));
  }) as typeof fetch;
  const result = await runMmaCatalogSync(admin, false, { enabled: true, key: 'private-key', transport });
  assert.equal(result.failed, true);
  assert.equal(result.wrote_to_db, true);
  assert.deepEqual(submitted, ['ufc-qatar-2026-11-21']);
  assert.equal(JSON.stringify(result).includes('private-key'), false);
  assert.equal(result.competitions.MMA_PORTRAITS.skipped, true);
});

test('an optional portrait outage does not turn a healthy result poll into failure', async () => {
  const admin = { rpc: async (name: string) => ({ error: null, data:
    name === 'claim_mma_sync' ? false : name === 'claim_mma_fighter_portrait'
      ? [{ fighter_id: 196, claim_token: 'lease' }] : true }) } as any;
  const result = await runMmaCatalogSync(admin, false, { enabled: true, key: 'private-key',
    transport: (async () => { throw new Error('private-key'); }) as typeof fetch });
  assert.equal(result.failed, false);
  assert.equal(typeof result.competitions.MMA_PORTRAITS.warning, 'string');
  assert.equal(JSON.stringify(result).includes('private-key'), false);
});
