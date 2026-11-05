import assert from 'node:assert/strict';
import test from 'node:test';
import { handleFootballDataSyncRequest, normalizeFootballDataSeason, prepareFootballDataBatch } from './footballDataSync.ts';
import { isFootballKnockoutStage, isGroupStage } from '../../src/lib/matchRules.ts';

function season() {
  const matches = Array.from({ length: 144 }, (_, i) => {
    const round = Math.floor(i / 18), a = i % 18 + 1, b = 19 + (i % 18 + round) % 18;
    const team = (id: number) => ({ id, name: `Team ${id}`, tla: `T${id}` });
    return {
      id: i + 1, competition: { code: 'CL' }, season: { id: 1, startDate: '2026-09-08' },
      homeTeam: team(round % 2 ? b : a), awayTeam: team(round % 2 ? a : b),
      stage: 'LEAGUE_STAGE', matchday: round + 1, status: 'TIMED',
      utcDate: '2026-11-24T20:00:00Z', lastUpdated: '2026-11-05T08:00:00Z',
      score: { duration: 'REGULAR', fullTime: { home: null, away: null } },
    };
  });
  return { resultSet: { count: 144 }, matches };
}
const now = new Date('2026-11-05T09:00:00Z');
const secret = 'test-only-sync-secret-with-at-least-32-characters';
const request = (body: any = {}) => ({ httpMethod: 'POST', headers: { authorization: `Bearer ${secret}` }, body: JSON.stringify(body) });

test('normalization produces stable scoped identities without inventing results or selecting pilot rounds', () => {
  const data = season();
  Object.assign(data.matches[0].homeTeam, { crest: 'https://crests.football-data.org/1.png' });
  const batch = normalizeFootballDataSeason(data, now);
  assert.equal(batch.clubs.find(team => team.id === 'football-data-team-1')?.logo_url, 'https://crests.football-data.org/1.png');
  assert.equal(batch.clubs.length, 36); assert.equal(batch.matches.length, 144);
  assert.equal(batch.matches[0].id, 'football-data-match-1');
  assert.equal(batch.matches[0].home_score, null);
  assert.equal(isGroupStage('League Phase'), true);
  assert.equal(isGroupStage('Group A'), true);
  assert.equal(isFootballKnockoutStage('Final', 'fifa-world-cup-2026'), true);
  assert.equal(isFootballKnockoutStage('League Phase', 'uefa-champions-league-2026-27'), false);
});

test('normalization refuses incomplete revisions, club conflicts and out-of-scope knockout score semantics', () => {
  for (const modify of [
    (m: any) => { m.lastUpdated = null; },
    (m: any) => { m.homeTeam.name = ''; },
    (m: any) => { m.status = 'FINISHED'; m.utcDate = '2026-10-01T20:00:00Z'; m.score = {
      duration: 'EXTRA_TIME', regularTime: { home: 1, away: 1 }, extraTime: { home: 1, away: 0 }, fullTime: { home: 2, away: 1 },
    }; },
  ]) { const data = season(); modify(data.matches[0]); assert.throws(() => normalizeFootballDataSeason(data, now)); }
});

test('scoring reads beyond 1,000 predictions and uses the existing authoritative calculatePoints function', async () => {
  const data = season();
  Object.assign(data.matches[0], { status: 'FINISHED', utcDate: '2026-10-01T20:00:00Z', score: { duration: 'REGULAR', fullTime: { home: 2, away: 1 } } });
  const all = Array.from({ length: 1001 }, (_, i) => ({ match_id: 'football-data-match-1', user_id: `user-${i}`, lobby_id: 'lobby', predicted_home_score: i ? 1 : 2, predicted_away_score: i ? 0 : 1 }));
  const query: any = { select: () => query, in: () => query, order: () => query,
    range: async (from: number, to: number) => ({ data: all.slice(from, to + 1), error: null }) };
  const batch = await prepareFootballDataBatch({ from: () => query } as any, data, now);
  assert.equal(batch.matches[0].scores.length, 1001);
  assert.equal(batch.matches[0].scores[0].points_earned, 5);
  assert.equal(batch.matches[0].scores[1000].points_earned, 3);
});

test('HTTP method and secret checks reject callers before any provider or database work', async () => {
  let calls = 0; const deps = { secret, tokenConfigured: true, sync: async () => { calls++; return {}; } };
  assert.equal((await handleFootballDataSyncRequest({ httpMethod: 'GET' }, deps)).statusCode, 405);
  assert.equal((await handleFootballDataSyncRequest({ ...request(), headers: {} }, deps)).statusCode, 401);
  assert.equal((await handleFootballDataSyncRequest({ ...request(), headers: { authorization: `Bearer ${'x'.repeat(secret.length)}` } }, deps)).statusCode, 401);
  assert.equal(calls, 0);
});

test('write mode needs an explicit boolean and a server gate; callers cannot bootstrap or change scope', async () => {
  const calls: boolean[] = []; const deps = { secret, tokenConfigured: true, writesEnabled: false, sync: async (dry: boolean) => { calls.push(dry); return { dry_run: dry }; } };
  assert.equal((await handleFootballDataSyncRequest(request(), deps)).statusCode, 200);
  assert.deepEqual(calls, [true]);
  assert.equal((await handleFootballDataSyncRequest(request({ dryRun: false }), deps)).statusCode, 503);
  for (const body of [{ dryRun: 'false' }, { bootstrap: true }, { tournamentId: 'other' }, [], null]) {
    assert.equal((await handleFootballDataSyncRequest(request(body), deps)).statusCode, 400);
  }
  assert.equal((await handleFootballDataSyncRequest(request({ dryRun: false }), { ...deps, writesEnabled: true })).statusCode, 200);
  assert.deepEqual(calls, [true, false]);
});

test('HTTP reports conflicts/busy state and hides reflected upstream secrets', async () => {
  const deps = { secret, tokenConfigured: true };
  for (const result of [{ busy: true }, { conflicts: [{ reason: 'confirmed_result_conflict' }] }]) {
    assert.equal((await handleFootballDataSyncRequest(request(), { ...deps, sync: async () => result })).statusCode, 409);
  }
  const result = await handleFootballDataSyncRequest(request(), { ...deps, sync: async () => { throw new Error(secret); } });
  assert.equal(result.statusCode, 502); assert(!result.body.includes(secret));
});
