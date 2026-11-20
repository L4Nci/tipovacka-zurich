import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeScorePredictions } from './scorePredictionDistribution.ts';

const pick = (id: string, home: number, away: number) => ({
  player_id: id, predicted_home_score: home, predicted_away_score: away
});

test('the first saved pick is counted even when the lobby snapshot is empty', () => {
  assert.deepEqual(summarizeScorePredictions([], pick('me', 4, 1), true), { home: 100, draw: 0, away: 0 });
});

test('a saved update replaces stale data without counting the same player twice', () => {
  const rows = [pick('me', 4, 1), pick('other', 2, 1)];
  assert.deepEqual(summarizeScorePredictions(rows, pick('me', 1, 4), true), { home: 50, draw: 0, away: 50 });
});

test('a neutral empty state and non-draw sports do not report invented votes', () => {
  assert.deepEqual(summarizeScorePredictions([], null, true), { home: 0, draw: 0, away: 0 });
  assert.deepEqual(summarizeScorePredictions([pick('a', 1, 1), pick('b', 0, 1)], null, false), { home: 0, draw: 0, away: 100 });
});

test('three-way splits add up to one hundred percent', () => {
  assert.deepEqual(summarizeScorePredictions([pick('a', 2, 1), pick('b', 1, 1), pick('c', 1, 2)], null, true), {
    home: 34, draw: 33, away: 33
  });
});
