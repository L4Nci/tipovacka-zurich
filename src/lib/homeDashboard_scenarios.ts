import assert from 'node:assert/strict';
import {
  classifyHomeDashboardSummary,
  getAttentionHomeDashboardSummaries,
  getLobbyCompetitionStatus,
  isUntippedMatchForDisplay,
  summarizeHomeDashboardContext,
  type HomeDashboardContextInput,
  type HomeDashboardMatchInput
} from './homeDashboard.ts';

const now = Date.parse('2026-06-11T12:00:00.000Z');
const hoursAfterNow = (hours: number) => new Date(now + hours * 60 * 60 * 1000).toISOString();
const context: HomeDashboardContextInput = {
  lobby_id: 'lobby-friends',
  lobby_name: 'Friends',
  lobby_role: 'member',
  member_count: 8,
  tournament_id: 'world-cup',
  tournament_name: 'World Cup',
  tournament_status: 'active',
  actual_tournament_winner_id: null
};
const match = (overrides: Partial<HomeDashboardMatchInput> = {}): HomeDashboardMatchInput => ({
  id: 'match-1',
  tournament_id: 'world-cup',
  home_participant_id: 'football-cze',
  away_participant_id: 'football-fra',
  lock_time_utc: '2026-06-12T12:00:00.000Z',
  status: 'scheduled',
  home_score: null,
  away_score: null,
  ...overrides
});

const actionable = summarizeHomeDashboardContext(context, [match()], new Set(), now);
assert.equal(actionable.actionable_match_count, 1);
assert.equal(classifyHomeDashboardSummary(actionable), 'actionable');

const allPredicted = summarizeHomeDashboardContext(context, [match()], new Set(['match-1']), now);
assert.equal(allPredicted.all_known_unlocked_predicted, true);
assert.equal(classifyHomeDashboardSummary(allPredicted), 'all_predicted');

const later = summarizeHomeDashboardContext(
  context,
  [match({ lock_time_utc: '2026-06-16T12:00:00.000Z' })],
  new Set(),
  now
);
assert.equal(later.actionable_match_count, 0);
assert.equal(classifyHomeDashboardSummary(later), 'later');

const pending = summarizeHomeDashboardContext(
  { ...context, lobby_role: 'owner' },
  [match({ home_participant_id: 'football-tba', away_participant_id: 'football-tba-2' })],
  new Set(),
  now
);
assert.equal(pending.schedule_state, 'schedule_pending');
assert.equal(classifyHomeDashboardSummary(pending), 'owner_attention');

const completed = summarizeHomeDashboardContext(
  { ...context, actual_tournament_winner_id: 'football-esp' },
  [match({ status: 'finished', home_score: 1, away_score: 2, lock_time_utc: '2026-06-10T12:00:00.000Z' })],
  new Set(),
  now
);
assert.equal(completed.is_completed, true);
assert.equal(classifyHomeDashboardSummary(completed), 'completed');
assert.deepEqual(
  getLobbyCompetitionStatus(
    context.lobby_id,
    [completed],
    [{ tournament_id: context.tournament_id, status: 'active' }]
  ),
  { activeCount: 0, completedCount: 1 }
);

const sameTournamentOtherLobby = {
  ...actionable,
  lobby_id: 'lobby-pub',
  lobby_name: 'Pub',
  actionable_match_count: 2,
  next_actionable_lock_time: '2026-06-12T10:00:00.000Z'
};
assert.deepEqual(
  getAttentionHomeDashboardSummaries([actionable, sameTournamentOtherLobby]).map(item => item.lobby_id),
  ['lobby-pub', 'lobby-friends']
);

assert.equal(isUntippedMatchForDisplay({
  status: 'scheduled',
  home_team_id: 'football-cze',
  away_team_id: 'football-can',
  start_time_utc: hoursAfterNow(2),
  lock_time_utc: hoursAfterNow(1),
  predicted_home_score: null
}, now), true);
assert.equal(isUntippedMatchForDisplay({
  status: 'scheduled',
  home_team_id: 'football-cze',
  away_team_id: 'football-tba',
  start_time_utc: hoursAfterNow(2),
  lock_time_utc: hoursAfterNow(1),
  predicted_home_score: null
}, now), false);
assert.equal(isUntippedMatchForDisplay({
  status: 'scheduled',
  home_team_id: 'football-cze',
  away_team_id: 'football-can',
  start_time_utc: hoursAfterNow(2),
  lock_time_utc: hoursAfterNow(1),
  predicted_home_score: 2
}, now), false);

console.log('Home dashboard scenarios passed.');
