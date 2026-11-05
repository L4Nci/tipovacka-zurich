import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeSeason, createProviderReader, readFinalScore } from './football-data-dry-run.mjs';

const now = new Date('2026-11-05T09:00:00Z');
function completeSeason() {
  const matches = [];
  for (let round = 0; round < 8; round++) {
    for (let i = 0; i < 18; i++) {
      const a = i + 1, b = 19 + (i + round) % 18;
      matches.push({
        id: round * 18 + i + 1, competition: { code: 'CL' }, season: { id: 1, startDate: '2026-09-08' },
        stage: 'LEAGUE_STAGE', matchday: round + 1, status: 'TIMED',
        utcDate: new Date(Date.UTC(2026, 10, 24 + round * 7, 20)).toISOString(),
        homeTeam: { id: round % 2 ? b : a }, awayTeam: { id: round % 2 ? a : b },
        score: { duration: 'REGULAR', fullTime: { home: null, away: null } },
      });
    }
  }
  return { resultSet: { count: matches.length }, matches };
}

test('complete league phase validates and proposes three complete confirmed future rounds', () => {
  const report = analyzeSeason(completeSeason(), { now });
  assert.equal(report.validationPassed, true);
  assert.equal(report.teams, 36);
  assert.equal(report.matches, 144);
  assert.deepEqual(report.candidatePilotRounds, [1, 2, 3]);
  assert.equal(report.candidatePilotMatches, 54);
  assert.equal(report.databaseWrites, 0);
});

test('truncated response or a duplicate ID prevents any pilot proposal', () => {
  const truncated = completeSeason();
  truncated.matches.pop();
  const missing = analyzeSeason(truncated, { now });
  assert.equal(missing.validationPassed, false);
  assert(missing.issues.some(i => i.code === 'reported_count_mismatch'));
  assert.equal(missing.pilotReady, false);
  const duplicate = completeSeason();
  duplicate.matches.at(-1).id = duplicate.matches[0].id;
  assert(analyzeSeason(duplicate, { now }).issues.some(i => i.code === 'invalid_or_duplicate_match_id'));
});

test('mixed competition/season, unknown teams and missing kickoff are blocking data issues', () => {
  for (const modify of [
    m => { m.competition.code = 'PL'; }, m => { m.season.startDate = '2025-09-08'; },
    m => { m.homeTeam.id = null; }, m => { m.utcDate = null; },
  ]) {
    const data = completeSeason(); modify(data.matches[0]);
    const result = analyzeSeason(data, { now });
    assert.equal(result.validationPassed, false);
    assert.deepEqual(result.candidatePilotRounds, []);
  }
});

test('duplicate opponents are rejected even if round and team counts remain balanced', () => {
  const data = completeSeason();
  [data.matches[18].homeTeam, data.matches[35].homeTeam] = [data.matches[35].homeTeam, data.matches[18].homeTeam];
  const report = analyzeSeason(data, { now });
  assert(report.issues.some(i => i.code === 'duplicate_phase_fixture'));
  assert(!report.issues.some(i => i.code === 'unbalanced_team_schedule'));
  assert.equal(report.pilotReady, false);
});

test('invalid provider identifiers and statuses are not reflected as arbitrary output', () => {
  const data = completeSeason();
  data.matches[0].id = 'private-fixture-token';
  data.matches[0].status = 'private-fixture-token';
  const report = analyzeSeason(data, { now });
  assert.equal(report.validationPassed, false);
  assert(!JSON.stringify(report).includes('private-fixture-token'));
});

test('partially started or unconfirmed rounds cannot be selected as whole future rounds', () => {
  const data = completeSeason();
  data.matches[0].utcDate = '2026-11-04T20:00:00Z';
  for (const match of data.matches.filter(m => m.matchday === 2)) match.status = 'SCHEDULED';
  const result = analyzeSeason(data, { now });
  assert.equal(result.validationPassed, true);
  assert.deepEqual(result.candidatePilotRounds, [3, 4, 5]);
});

test('null pending scores stay pending; an unplayed 0:0 is not treated as an empty result', () => {
  assert.equal(readFinalScore({ status: 'TIMED', score: { fullTime: { home: null, away: null } } }).gameScoreCandidate, null);
  const data = completeSeason(); data.matches[0].score.fullTime = { home: 0, away: 0 };
  assert(analyzeSeason(data, { now }).issues.some(i => i.code === 'unplayed_match_has_score'));
  assert.deepEqual(readFinalScore({ status: 'FINISHED', score: { duration: 'REGULAR', fullTime: { home: 0, away: 0 } } }).officialGoals, { home: 0, away: 0 });
});

test('extra time uses period goals and shootouts use explicit penalties, not fullTime totals', () => {
  const extra = readFinalScore({ status: 'FINISHED', score: {
    duration: 'EXTRA_TIME', fullTime: { home: 3, away: 2 }, regularTime: { home: 3, away: 0 }, extraTime: { home: 0, away: 2 },
  } });
  assert.deepEqual(extra.officialGoals, { home: 3, away: 2 });
  const shootout = readFinalScore({ status: 'FINISHED', score: {
    duration: 'PENALTY_SHOOTOUT', fullTime: { home: 5, away: 4 }, regularTime: { home: 1, away: 1 },
    extraTime: { home: 0, away: 0 }, penalties: { home: 4, away: 3 },
  } });
  assert.deepEqual(shootout.officialGoals, { home: 1, away: 1 });
  assert.deepEqual(shootout.gameScoreCandidate, { home: 4, away: 3 });
  assert.notDeepEqual(shootout.gameScoreCandidate, { home: 5, away: 4 });
});

test('missing, inconsistent or invalid final-score components require review', () => {
  for (const score of [
    { duration: 'REGULAR', fullTime: { home: -1, away: 0 } },
    { duration: 'REGULAR', fullTime: { home: null, away: null } },
    { duration: 'PENALTY_SHOOTOUT', fullTime: { home: 5, away: 4 } },
    { duration: 'EXTRA_TIME', fullTime: { home: 3, away: 2 }, regularTime: { home: 1, away: 1 }, extraTime: { home: 0, away: 0 } },
  ]) assert.equal(readFinalScore({ status: 'FINISHED', score }).kind, 'needs_review');
});

test('reader sends a token only to the fixed API origin, with GET and redirect rejection', async () => {
  const calls = [];
  const reader = createProviderReader('test-fixture-token', async (url, options) => {
    calls.push({ url, options }); return Response.json({ ok: true });
  });
  await reader.matches('CL', 2026);
  assert.equal(calls[0].url, 'https://api.football-data.org/v4/competitions/CL/matches?season=2026');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers['X-Auth-Token'], 'test-fixture-token');
  for (const code of ['https://untrusted.invalid', '__proto__', 'constructor', 'CL/../../other']) {
    await assert.rejects(reader.matches(code, 2026), /Unsupported/);
  }
  assert.equal(calls.length, 1);
});

test('HTTP and transport failures do not leak reflected token values', async () => {
  const token = 'private-fixture-token';
  const denied = createProviderReader(token, async () => Response.json({ message: token }, { status: 403 }));
  await assert.rejects(denied.matches('CL', 2026), e => /HTTP 403/.test(e.message) && !e.message.includes(token));
  const broken = createProviderReader(token, async () => { throw new Error(token); });
  await assert.rejects(broken.matches('CL', 2026), e => !e.message.includes(token));
  assert.throws(() => createProviderReader(''), /Missing or invalid/);
});
