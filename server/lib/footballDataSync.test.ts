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
const knockout = (stage = 'FINAL', id = 1000): any => ({
  ...structuredClone(season().matches[0]), id, stage, matchday: stage === 'FINAL' ? null : 1,
});
const withKnockouts = (...games: any[]) => {
  const data = season(); data.matches.push(...games); data.resultSet.count = data.matches.length; return data;
};

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

test('all 45 knockout fixtures extend the same 36-club catalog with stable identities', () => {
  let id = 1000;
  const games = Object.entries({ PLAYOFFS: 16, LAST_16: 16, QUARTER_FINALS: 8, SEMI_FINALS: 4, FINAL: 1 })
    .flatMap(([stage, count]) => Array.from({ length: count }, () => knockout(stage, id++)));
  const batch = normalizeFootballDataSeason(withKnockouts(...games), now);
  assert.equal(batch.matches.length, 189); assert.equal(batch.clubs.length, 36);
  assert.equal(batch.matches.at(-1)?.stage, 'Final'); assert.equal(batch.matches.at(-1)?.matchday, null);
  assert.equal(batch.scoring_rule, 'football-final-shootout-v1');
  for (const match of batch.matches.slice(144)) assert.equal(isFootballKnockoutStage(match.stage, 'uefa-champions-league-2026-27'), true);
});

test('future unknown teams or kickoff are deferred and later resolved without invented clubs or matches', () => {
  const game = knockout(); game.homeTeam = { id: null, name: null }; game.utcDate = null; game.status = 'SCHEDULED';
  const data = withKnockouts(game);
  const pending = normalizeFootballDataSeason(data, now);
  assert.equal(pending.matches.length, 144); assert.deepEqual(pending.awaiting_fixtures, [1000]);
  data.matches[data.matches.length - 1] = knockout();
  const ready = normalizeFootballDataSeason(data, now);
  assert.equal(ready.matches.length, 145); assert.deepEqual(ready.awaiting_fixtures, []);
  assert.equal(ready.matches.at(-1)?.id, 'football-data-match-1000');
});

test('knockouts use final extra-time goals or shootout-only score, preserving all provider facts', () => {
  const extra = { ...knockout('LAST_16'), status: 'FINISHED', utcDate: '2026-10-01T20:00:00Z', score: {
    duration: 'EXTRA_TIME', regularTime: { home: 3, away: 0 }, extraTime: { home: 0, away: 2 }, fullTime: { home: 3, away: 2 },
  } };
  const penalties = { ...knockout('FINAL', 1001), status: 'FINISHED', utcDate: '2026-10-02T20:00:00Z', score: {
    duration: 'PENALTY_SHOOTOUT', regularTime: { home: 1, away: 1 }, extraTime: { home: 0, away: 0 }, fullTime: { home: 5, away: 4 }, penalties: { home: 4, away: 3 },
  } };
  const batch = normalizeFootballDataSeason(withKnockouts(extra, penalties), now);
  assert.equal(batch.matches[144].home_score, 3); assert.equal(batch.matches[144].away_score, 2);
  assert.equal(batch.matches[145].home_score, 4); assert.equal(batch.matches[145].away_score, 3);
  assert.deepEqual(batch.matches[145].provider_score.fullTime, { home: 5, away: 4 });
  assert.deepEqual(batch.matches[145].provider_score.regularTime, { home: 1, away: 1 });
});

test('a two-leg match can draw while a finished final needs a winning game score', () => {
  const game = { ...knockout('LAST_16'), status: 'FINISHED', utcDate: '2026-10-01T20:00:00Z', score: { duration: 'REGULAR', fullTime: { home: 1, away: 1 } } };
  assert.equal(normalizeFootballDataSeason(withKnockouts(game), now).matches.at(-1)?.home_score, 1);
  game.stage = 'FINAL'; assert.throws(() => normalizeFootballDataSeason(withKnockouts(game), now));
});

test('invalid knockout identities, excessive fixtures and inconsistent shootouts stop the batch', () => {
  for (const modify of [
    (m: any) => { m.id = 1; }, (m: any) => { m.season.id = 2; },
    (m: any) => { m.competition.code = 'PL'; }, (m: any) => { m.homeTeam.id = 123456; },
    (m: any) => { m.matchday = 3; }, (m: any) => { m.utcDate = 'invalid'; },
    (m: any) => { m.status = 'FINISHED'; m.utcDate = null; },
    (m: any) => { m.status = 'FINISHED'; m.utcDate = '2026-10-01T20:00:00Z'; m.score = {
      duration: 'PENALTY_SHOOTOUT', regularTime: { home: 1, away: 1 }, extraTime: { home: 0, away: 0 }, fullTime: { home: 6, away: 4 }, penalties: { home: 4, away: 3 },
    }; },
  ]) { const game = knockout(); modify(game); assert.throws(() => normalizeFootballDataSeason(withKnockouts(game), now)); }
  assert.throws(() => normalizeFootballDataSeason(withKnockouts(knockout(), knockout('FINAL', 1001)), now));
});

test('extra time and ongoing shootouts stay live with no final score or premature points', () => {
  for (const status of ['EXTRA_TIME', 'PENALTY_SHOOTOUT']) {
    const game = knockout(); game.status = status; game.score.fullTime = { home: 1, away: 1 };
    const match = normalizeFootballDataSeason(withKnockouts(game), now).matches.at(-1)!;
    assert.equal(match.status, 'live'); assert.equal(match.home_score, null); assert.equal(match.away_score, null);
  }
});

test('shootout prediction points use 4:3 rather than the API combined 5:4 or the 1:1 after play', async () => {
  const game = { ...knockout(), status: 'FINISHED', utcDate: '2026-10-01T20:00:00Z', score: {
    duration: 'PENALTY_SHOOTOUT', regularTime: { home: 1, away: 1 }, extraTime: { home: 0, away: 0 }, fullTime: { home: 5, away: 4 }, penalties: { home: 4, away: 3 },
  } };
  const rows = [[4, 3], [1, 1], [5, 4]].map(([home, away], i) => ({ match_id: 'football-data-match-1000', user_id: `u${i}`, lobby_id: 'l', predicted_home_score: home, predicted_away_score: away }));
  const query: any = { select: () => query, in: () => query, order: () => query, range: async () => ({ data: rows, error: null }) };
  const batch = await prepareFootballDataBatch({ from: () => query } as any, withKnockouts(game), now);
  assert.deepEqual(batch.matches.at(-1)?.scores.map(row => row.points_earned), [5, 0, 3]);
});
