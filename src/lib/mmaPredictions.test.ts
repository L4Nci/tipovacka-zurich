import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeMmaPredictions } from './mmaPredictions.ts';
import type { MmaFight, MmaPrediction } from './mma.ts';

const fight = { id: 'bout-a', fighter_a_id: 1, fighter_b_id: 2, lineup_version: 2 } as MmaFight;
const pick = (user: string, winner: number, extra: Partial<MmaPrediction> = {}): MmaPrediction => ({
  lobby_id: 'kobra', fight_id: fight.id, user_id: user, predicted_winner_id: winner,
  lineup_version: 2, points_earned: 0, ...extra,
});
test('distribution includes each saved member once and rounds the two sides to 100%', () => {
  const own = pick('me', 1);
  const result = summarizeMmaPredictions('kobra', fight, [own, pick('b', 2), pick('c', 2), own], new Set(['me', 'b', 'c']));
  assert.equal(result.total, 3);
  assert.equal(result.homeCount, 1);
  assert.equal(result.awayCount, 2);
  assert.deepEqual([result.homePercent, result.awayPercent], [33, 67]);
});
test('other lobbies, bouts, removed members, old lineups and unrelated winners never enter the bar', () => {
  const rows = [pick('me', 1), pick('b', 2, { lobby_id: 'other' }), pick('b', 2, { fight_id: 'other' }),
    pick('b', 2, { lineup_version: 1 }), pick('b', 99), pick('removed', 2)];
  const result = summarizeMmaPredictions('kobra', fight, rows, new Set(['me', 'b']));
  assert.equal(result.total, 1);
  assert.deepEqual(result.predictions.map(row => row.user_id), ['me']);
  assert.deepEqual([result.homePercent, result.awayPercent], [100, 0]);
});
test('no saved picks and an unconfirmed lineup remain neutral instead of inventing a 50/50 split', () => {
  const empty = summarizeMmaPredictions('kobra', fight, [], new Set(['me']));
  assert.deepEqual([empty.homePercent, empty.awayPercent], [0, 0]);
  const tba = summarizeMmaPredictions('kobra', { ...fight, fighter_b_id: null }, [pick('me', 1)], new Set(['me']));
  assert.equal(tba.total, 0);
});
