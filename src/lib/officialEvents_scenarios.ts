import assert from 'node:assert/strict';
import {
  getFirstPredictableOfficialEventMatch,
  isOfficialEventPlayable,
  shouldPromoteOfficialEventCard,
  shouldShowFirstTipOnboarding
} from './officialEventsState.ts';
import type { Lobby, OfficialEventCard, OfficialEventMatch, OnboardingState } from '../types.ts';

const onboardingState: OnboardingState = {
  onboarding_version: 1,
  status: 'not_started',
  variant_key: 'control',
  completion_path: null,
  started_at: null,
  completed_at: null
};

const event: OfficialEventCard = {
  event_id: 'event-1',
  slug: 'start',
  name: 'Tipovačka Start',
  description: null,
  cover_key: null,
  status: 'active',
  featured: true,
  onboarding_eligible: true,
  is_participating: false,
  participation_status: null,
  actionable_match_count: 2,
  open_match_count: 2,
  next_match: null
};

const lobby = { id: 'lobby-1' } as Lobby;

assert.equal(isOfficialEventPlayable(event), true);
assert.equal(isOfficialEventPlayable({ ...event, open_match_count: 0 }), false);
assert.equal(isOfficialEventPlayable({ ...event, status: 'completed' }), false);

assert.equal(shouldShowFirstTipOnboarding({
  enabled: true,
  hasInvite: false,
  lobbies: [],
  state: onboardingState
}), true);
assert.equal(shouldShowFirstTipOnboarding({
  enabled: true,
  hasInvite: true,
  lobbies: [],
  state: onboardingState
}), false);
assert.equal(shouldShowFirstTipOnboarding({
  enabled: true,
  hasInvite: false,
  lobbies: [lobby],
  state: onboardingState
}), false);
assert.equal(shouldShowFirstTipOnboarding({
  enabled: true,
  hasInvite: false,
  lobbies: [],
  state: { ...onboardingState, status: 'skipped' }
}), false);

assert.equal(shouldPromoteOfficialEventCard(event, []), true);
assert.equal(shouldPromoteOfficialEventCard(event, [lobby]), false);

const matches: OfficialEventMatch[] = [
  {
    id: 'later',
    start_time_utc: '2026-06-01T12:00:00Z',
    lock_time_utc: '2026-06-01T11:55:00Z',
    status: 'scheduled',
    home_score: null,
    away_score: null,
    home_name: 'A',
    home_short_name: 'A',
    home_flag: null,
    away_name: 'B',
    away_short_name: 'B',
    away_flag: null,
    predicted_home_score: null,
    predicted_away_score: null,
    points_earned: 0,
    can_predict: true
  },
  {
    id: 'earlier',
    start_time_utc: '2026-06-01T10:00:00Z',
    lock_time_utc: '2026-06-01T09:55:00Z',
    status: 'scheduled',
    home_score: null,
    away_score: null,
    home_name: 'C',
    home_short_name: 'C',
    home_flag: null,
    away_name: 'D',
    away_short_name: 'D',
    away_flag: null,
    predicted_home_score: null,
    predicted_away_score: null,
    points_earned: 0,
    can_predict: true
  }
];

assert.equal(getFirstPredictableOfficialEventMatch(matches)?.id, 'earlier');
assert.equal(getFirstPredictableOfficialEventMatch([
  { ...matches[0], predicted_home_score: 1, predicted_away_score: 0 }
]), null);

console.log('Official event and onboarding scenarios passed.');
