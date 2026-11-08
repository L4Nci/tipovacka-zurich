import test from 'node:test';
import assert from 'node:assert/strict';
import { filterMmaSeason, mmaEventStandings } from './mmaSeason.ts';
import { isMmaTournament, mmaTournamentId, type MmaEvent, type MmaFight, type MmaPrediction } from './mma.ts';

const now = Date.parse('2026-11-08T12:00:00Z');
const events = [
  { tournament_id: 'a', status: 'scheduled', lock_time_utc: '2026-11-14T22:00:00Z' },
  { tournament_id: 'b', status: 'completed', lock_time_utc: '2026-11-01T22:00:00Z' },
] as MmaEvent[];
const fights = [
  { id: 'a1', tournament_id: 'a', status: 'scheduled', fighter_a_id: 1, fighter_b_id: 2, lineup_version: 1 },
  { id: 'a2', tournament_id: 'a', status: 'scheduled', fighter_a_id: 3, fighter_b_id: 4, lineup_version: 2 },
  { id: 'b1', tournament_id: 'b', status: 'finished', fighter_a_id: 1, fighter_b_id: 2, lineup_version: 1 },
] as MmaFight[];
const pick = (fight_id: string, extra = {}) => ({ lobby_id: 'kobra', user_id: 'me', fight_id, predicted_winner_id: 1,
  lineup_version: 1, points_earned: 0, ...extra }) as MmaPrediction;

test('season filters preserve card identity, show stale picks as missing and exclude finished cards from upcoming', () => {
  const picks = [pick('a1'), pick('a2')];
  assert.deepEqual(filterMmaSeason(events, fights, picks, 'all', 'all', now).map(f => f.id), ['a1', 'a2']);
  assert.deepEqual(filterMmaSeason(events, fights, picks, 'all', 'missing', now).map(f => f.id), ['a2']);
  assert.deepEqual(filterMmaSeason(events, fights, picks, 'b', 'results', now).map(f => f.id), ['b1']);
  assert.deepEqual(filterMmaSeason(events, fights, picks, 'b', 'missing', now), []);
  assert.deepEqual(filterMmaSeason(events, fights, [], 'a', 'missing', Date.parse(events[0].lock_time_utc)), []);
});
test('event ranking counts each stored pick once and never leaks points from another card/lobby/nonmember', () => {
  const members = [{ user_id: 'me', username: 'Me', points: 100, predictions_count: 10, avatar_emoji: null, avatar_bg: null },
    { user_id: 'friend', username: 'Friend', points: 3, predictions_count: 3, avatar_emoji: null, avatar_bg: null }];
  const valid = pick('b1', { points_earned: 1 });
  const result = mmaEventStandings('kobra', 'b', members, fights,
    [valid, valid, pick('a1', { points_earned: 1 }), pick('b1', { points_earned: 1, lobby_id: 'private' }),
      pick('b1', { points_earned: 1, user_id: 'outsider' })]);
  assert.equal(result[0].points, 1); assert.equal(result[0].predictions_count, 1);
  assert.equal(result[1].points, 0); assert.equal(members[0].points, 100);
});
test('annual and dynamically discovered MMA contexts route correctly while preserving pilot identities', () => {
  assert.equal(isMmaTournament('ufc-2026'), true); assert.equal(isMmaTournament('ufcal-event-2562'), true);
  assert.equal(isMmaTournament('premier-league-2026'), false);
  assert.equal(mmaTournamentId(2563), 'ufc-334-2026'); assert.equal(mmaTournamentId(2562), 'ufcal-event-2562');
});
