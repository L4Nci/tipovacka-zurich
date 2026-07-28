import assert from 'node:assert/strict';
import { buildAuthoritativeMatchScorePayloads } from './resultSync.ts';

const sharedPrediction = {
  user_id: '00000000-0000-4000-8000-000000000901',
  predicted_home_score: 2,
  predicted_away_score: 1
};

const exact = buildAuthoritativeMatchScorePayloads({
  lobbyPredictions: [{ ...sharedPrediction, lobby_id: 'lobby-1' }],
  eventPredictions: [{ ...sharedPrediction, event_id: 'event-1' }],
  homeScore: 2,
  awayScore: 1,
  sport: 'football'
});

assert.equal(exact.lobbyScores[0].points_earned, 5);
assert.equal(exact.eventScores[0].points_earned, 5);
assert.equal(
  exact.lobbyScores[0].points_earned,
  exact.eventScores[0].points_earned,
  'The same prediction must score identically in lobby and official-event contexts.'
);

const corrected = buildAuthoritativeMatchScorePayloads({
  lobbyPredictions: [{ ...sharedPrediction, lobby_id: 'lobby-1' }],
  eventPredictions: [{ ...sharedPrediction, event_id: 'event-1' }],
  homeScore: 3,
  awayScore: 1,
  sport: 'football'
});

assert.equal(corrected.lobbyScores[0].points_earned, 2);
assert.equal(corrected.eventScores[0].points_earned, 2);

const hockey = buildAuthoritativeMatchScorePayloads({
  lobbyPredictions: [{
    ...sharedPrediction,
    lobby_id: 'lobby-hockey',
    predicted_home_score: 1,
    predicted_away_score: 2
  }],
  eventPredictions: [{
    ...sharedPrediction,
    event_id: 'event-hockey',
    predicted_home_score: 1,
    predicted_away_score: 2
  }],
  homeScore: 2,
  awayScore: 3,
  sport: 'hockey'
});

assert.equal(hockey.lobbyScores[0].points_earned, 2);
assert.equal(hockey.eventScores[0].points_earned, 2);

console.log('Atomic result-sync scoring scenarios passed.');
