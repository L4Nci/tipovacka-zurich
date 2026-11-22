import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMmaStandings, filterMmaSeason, mmaResultEvents } from './mmaSeason.ts';
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
test('result options and groups use newest completed card first, regardless of feed order', () => {
  const cards = [
    { tournament_id: 'qatar', starts_at: '2026-11-21T16:00:00Z', status: 'completed' },
    { tournament_id: 'next', starts_at: '2026-12-05T16:00:00Z', status: 'scheduled' },
    { tournament_id: '334', starts_at: '2026-11-15T00:00:00Z', status: 'completed' },
    { tournament_id: 'live', starts_at: '2026-11-22T18:00:00Z', status: 'live' },
    { tournament_id: 'prior', starts_at: '2026-11-07T18:00:00Z', status: 'completed' },
  ] as MmaEvent[];
  const bouts = cards.map(event => ({ tournament_id: event.tournament_id,
    status: event.status === 'scheduled' ? 'scheduled' : 'finished' }) as MmaFight);
  assert.deepEqual(mmaResultEvents(cards, bouts).map(event => event.tournament_id), ['qatar', '334', 'prior', 'live']);
  assert.deepEqual(cards.map(event => event.tournament_id), ['qatar', 'next', '334', 'live', 'prior']);
});
test('event ranking counts each stored pick once and never leaks points from another card/lobby/nonmember', () => {
  const members = [{ user_id: 'me', username: 'Me', points: 100, predictions_count: 10, avatar_emoji: null, avatar_bg: null },
    { user_id: 'friend', username: 'Friend', points: 3, predictions_count: 3, avatar_emoji: null, avatar_bg: null }];
  const valid = pick('b1', { points_earned: 1 });
  const { rows: result } = buildMmaStandings('kobra', 'b', { events, fights, standings: members,
    lobbyPredictions: [valid, valid, pick('a1', { points_earned: 1 }), pick('b1', { points_earned: 1, lobby_id: 'private' }),
      pick('b1', { points_earned: 1, user_id: 'outsider' })] });
  assert.equal(result[0].points, 1); assert.equal(result[0].predictions_count, 1);
  assert.equal(result[1].points, 0); assert.equal(members[0].points, 100);
});
test('MMA hits count independently under the selected card rules without replacing stored points', () => {
  const data = {
    events: [{ ...events[0], rules_version: 'mma-winner-v1' }, { ...events[1], rules_version: 'mma-winner-method-v2' }] as MmaEvent[],
    standings: [{ user_id: 'me', username: 'Me', points: 42, predictions_count: 8, avatar_emoji: null, avatar_bg: null }],
    fights: [
      { ...fights[0], status: 'finished', winner_fighter_id: 1, method_normalized: 'ko_tko' },
      { ...fights[2], winner_fighter_id: 2, method_normalized: 'ko_tko' },
      { ...fights[2], id: 'decision', winner_fighter_id: 1, method_normalized: 'decision_unanimous' },
      { ...fights[2], id: 'winner-only', winner_fighter_id: 1, method_normalized: null },
      { ...fights[2], id: 'stale', winner_fighter_id: 1, method_normalized: 'ko_tko', lineup_version: 2 },
      { ...fights[2], id: 'void', status: 'void', winner_fighter_id: 1, method_normalized: 'no_contest' },
      { ...fights[2], id: 'foreign', winner_fighter_id: 1, method_normalized: 'ko_tko' },
    ] as MmaFight[],
    lobbyPredictions: [
      pick('a1', { predicted_method: 'ko_tko', points_earned: 1 }),
      pick('b1', { predicted_method: 'ko_tko', points_earned: 1 }),
      pick('b1', { predicted_method: 'ko_tko', points_earned: 1 }),
      pick('decision', { predicted_method: 'decision', points_earned: 5 }),
      pick('winner-only', { predicted_method: 'ko_tko', points_earned: 3 }),
      pick('stale', { predicted_method: 'ko_tko' }),
      pick('void', { predicted_method: 'ko_tko' }),
      pick('foreign', { predicted_method: 'ko_tko', lobby_id: 'private' }),
    ],
  };
  const stats = (eventId: string | null) => {
    const { rows: [row], showFinishHits } = buildMmaStandings('kobra', eventId, data);
    return [row.points, row.winnerHits, row.finishHits, showFinishHits];
  };
  assert.deepEqual(stats('a'), [1, 1, 0, false]);
  assert.deepEqual(stats('b'), [9, 2, 2, true]);
  assert.deepEqual(stats(null), [42, 3, 2, true]);
});
test('annual and dynamically discovered MMA contexts route correctly while preserving pilot identities', () => {
  assert.equal(isMmaTournament('ufc-2026'), true); assert.equal(isMmaTournament('ufcal-event-2562'), true);
  assert.equal(isMmaTournament('premier-league-2026'), false);
  assert.equal(mmaTournamentId(2563), 'ufc-334-2026'); assert.equal(mmaTournamentId(2562), 'ufcal-event-2562');
});
