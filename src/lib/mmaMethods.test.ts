import test from 'node:test';
import assert from 'node:assert/strict';
import { mmaMethodGroup, mmaPredictionPoints, type MmaFight, type MmaPrediction } from './mma.ts';
import { summarizeMmaMethods, summarizeMmaPredictions } from './mmaPredictions.ts';
import { formatMmaMethod } from '../i18n/sports.ts';

test('normalized finishes collapse to three options without guessing unknown, DQ or void outcomes', () => {
  assert.equal(mmaMethodGroup('ko_tko'), 'ko_tko');
  for (const method of ['submission', 'technical_submission'] as const) assert.equal(mmaMethodGroup(method), 'submission');
  for (const method of ['decision', 'decision_unanimous', 'decision_split', 'decision_majority'] as const) assert.equal(mmaMethodGroup(method), 'decision');
  for (const method of ['dq', 'other', 'draw', 'no_contest', null, undefined] as const) assert.equal(mmaMethodGroup(method), null);
  assert.equal(formatMmaMethod('decision', 'cs'), 'Na body');
  assert.equal(formatMmaMethod('submission', 'en'), 'Submission');
});
test('v2 awards 5/3/1/0, supports winner without a method and counts all decision/submission subtypes', () => {
  const score = (winner: number, method: any, pickMethod: any = 'ko_tko') =>
    mmaPredictionPoints('mma-winner-method-v2', 1, winner, 'finished', 1, 1, pickMethod, method);
  assert.equal(score(1, 'ko_tko'), 5);
  assert.equal(score(1, 'submission'), 3);
  assert.equal(score(2, 'ko_tko'), 1);
  assert.equal(score(2, 'submission'), 0);
  assert.equal(score(1, 'ko_tko', null), 3);
  assert.equal(score(2, 'ko_tko', null), 0);
  assert.equal(score(1, 'technical_submission', 'submission'), 5);
  assert.equal(score(1, 'decision_split', 'decision'), 5);
  assert.equal(score(2, 'decision_majority', 'decision'), 1);
  assert.equal(score(1, 'dq'), 3);
  assert.equal(score(1, 'other'), 3);
  assert.equal(score(1, null), 3);
  assert.equal(score(2, null), 0);
  assert.equal(score(1, null, null), 3);
  assert.equal(score(2, null, null), 0);
  assert.equal(score(1, 'draw'), 0);
  assert.equal(score(1, 'no_contest'), 0);
});
test('historical v1 stays one point; unfinished/void outcomes and invalid lineups never score', () => {
  assert.equal(mmaPredictionPoints('mma-winner-v1', 1, 1, 'finished', 1, 1, 'ko_tko', 'ko_tko'), 1);
  assert.equal(mmaPredictionPoints('mma-winner-method-v2', 1, 1, 'finished', 1, 2, 'ko_tko', 'ko_tko'), 0);
  for (const status of ['scheduled', 'draw', 'void', 'cancelled', 'awaiting_result'] as const) {
    assert.equal(mmaPredictionPoints('mma-winner-method-v2', 1, null, status, 1, 1, 'ko_tko', 'ko_tko'), 0);
  }
});
test('method shares exclude skipped methods and use exact integer totals, including thirds', () => {
  const pick = (method: any) => ({ predicted_method: method }) as MmaPrediction;
  const result = summarizeMmaMethods([pick('ko_tko'), pick('submission'), pick('decision'), pick(null), pick(undefined)]);
  assert.equal(result.total, 3);
  assert.deepEqual(result.segments.map(segment => segment.percent), [34, 33, 33]);
  assert.equal(result.segments.reduce((sum, segment) => sum + segment.percent, 0), 100);
  const empty = summarizeMmaMethods([pick(null)]);
  assert.equal(empty.total, 0); assert.deepEqual(empty.segments.map(segment => segment.percent), [0, 0, 0]);
});
test('finish distribution inherits lobby, lineup, membership and duplicate protection from winner picks', () => {
  const fight = { id: 'bout', fighter_a_id: 1, fighter_b_id: 2, lineup_version: 2 } as MmaFight;
  const valid = { lobby_id: 'kobra', fight_id: 'bout', user_id: 'me', predicted_winner_id: 1,
    lineup_version: 2, predicted_method: 'ko_tko' } as MmaPrediction;
  const validated = summarizeMmaPredictions('kobra', fight, [valid, valid,
    { ...valid, user_id: 'removed', predicted_method: 'submission' },
    { ...valid, lobby_id: 'private', predicted_method: 'decision' },
    { ...valid, user_id: 'friend', lineup_version: 1, predicted_method: 'submission' }], new Set(['me', 'friend']));
  const result = summarizeMmaMethods(validated.predictions);
  assert.equal(result.total, 1); assert.deepEqual(result.segments.map(segment => segment.percent), [100, 0, 0]);
});
