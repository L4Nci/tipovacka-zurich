import assert from 'node:assert/strict';
import test from 'node:test';
import type { Match, Player, Prediction, Team } from '../types.ts';
import {
  buildLeaderboardWithStreaks,
  hasAwardedTournamentWinner,
  resolveLeaderboardPickTeam
} from './leaderboard.ts';

const match: Match = {
  id: 'match-final',
  tournament_id: 'tournament-a',
  home_team_id: 'team-a',
  away_team_id: 'team-b',
  start_time_utc: '2026-07-19T18:00:00.000Z',
  home_score: 2,
  away_score: 1,
  status: 'finished',
  stage: 'Final',
  home_name: 'Team A',
  home_flag: 'A',
  away_name: 'Team B',
  away_flag: 'B'
};

const player = (id: string, winnerId: string, longtermPoints: number): Player => ({
  id,
  username: id,
  role: 'player',
  tournament_winner_id: winnerId,
  longterm_points: longtermPoints,
  match_points: 0,
  total_points: longtermPoints
});

const prediction = (playerId: string, home: number, away: number, points: number): Prediction => ({
  player_id: playerId,
  match_id: match.id,
  predicted_home_score: home,
  predicted_away_score: away,
  points_earned: points,
  home_score: match.home_score,
  away_score: match.away_score,
  start_time_utc: match.start_time_utc,
  tournament_id: match.tournament_id
});

test('leaderboard preserves different winner picks and uses stored long-term points', () => {
  const rows = buildLeaderboardWithStreaks(
    [player('alpha', 'team-a', 10), player('beta', 'team-b', 0)],
    [prediction('alpha', 0, 1, 0), prediction('beta', 2, 1, 5)],
    [match],
    'football'
  );

  assert.deepEqual(rows.map(row => row.id), ['alpha', 'beta']);
  assert.deepEqual(rows.map(row => row.total_points), [10, 5]);
  assert.equal(rows.find(row => row.id === 'alpha')?.tournament_winner_id, 'team-a');
  assert.equal(rows.find(row => row.id === 'beta')?.tournament_winner_id, 'team-b');
});

test('matching participant metadata cannot award a bonus when stored points are zero', () => {
  const [row] = buildLeaderboardWithStreaks(
    [player('alpha', 'team-a', 0)],
    [prediction('alpha', 2, 1, 5)],
    [match],
    'football'
  );

  assert.equal(row.total_points, 5);
  assert.equal(row.longterm_points, 0);
});

test('rank movement excludes only the latest match and keeps authoritative long-term points', () => {
  const earlierMatch = { ...match, id: 'match-earlier', start_time_utc: '2026-07-18T18:00:00.000Z' };
  const rows = buildLeaderboardWithStreaks(
    [player('alpha', 'team-a', 10), player('beta', 'team-b', 0)],
    [
      { ...prediction('alpha', 0, 1, 0), match_id: earlierMatch.id, start_time_utc: earlierMatch.start_time_utc },
      { ...prediction('beta', 2, 1, 5), match_id: earlierMatch.id, start_time_utc: earlierMatch.start_time_utc },
      prediction('alpha', 0, 1, 0),
      prediction('beta', 2, 1, 5)
    ],
    [earlierMatch, match],
    'football'
  );

  assert.equal(rows.find(row => row.id === 'alpha')?.total_points, 10);
  assert.equal(rows.find(row => row.id === 'beta')?.total_points, 10);
  assert.equal(rows.find(row => row.id === 'beta')?.rankChange, 1);
});

test('leaderboard total uses awarded points instead of recalculating them in the browser', () => {
  const [row] = buildLeaderboardWithStreaks(
    [player('alpha', 'team-b', 0)],
    [prediction('alpha', 2, 1, 2)],
    [match],
    'football'
  );

  assert.equal(row.total_points, 2);
  assert.equal(row.exact_hits, 1);
});

test('team badges resolve per player and the winner badge requires an awarded pick', () => {
  const teams = [
    { id: 'team-a', name: 'Team A', flag_code: 'A', group_name: 'A' },
    { id: 'team-b', name: 'Team B', flag_code: 'B', group_name: 'B' }
  ] satisfies Team[];
  const alpha = player('alpha', 'team-a', 10);
  const beta = player('beta', 'team-b', 0);

  assert.equal(resolveLeaderboardPickTeam(alpha, teams)?.id, 'team-a');
  assert.equal(resolveLeaderboardPickTeam(beta, teams)?.id, 'team-b');
  assert.equal(hasAwardedTournamentWinner(alpha, 'team-a'), true);
  assert.equal(hasAwardedTournamentWinner(beta, 'team-a'), false);
  assert.equal(hasAwardedTournamentWinner({ ...alpha, longterm_points: 0 }, 'team-a'), false);
});
