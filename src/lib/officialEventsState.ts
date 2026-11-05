import type {
  Lobby,
  OfficialEventCard,
  OfficialEventMatch,
  OnboardingState
} from '../types.ts';

export const isOfficialEventPlayable = (event: OfficialEventCard | null) => (
  Boolean(
    event &&
    event.status === 'active' &&
    event.onboarding_eligible &&
    event.open_match_count > 0
  )
);

export const shouldShowOfficialEventOnHome = (
  event: OfficialEventCard | null
) => Boolean(
  event &&
  event.is_participating &&
  event.participation_status === 'active'
);

export const shouldShowOfficialEventInPicker = (
  event: OfficialEventCard | null
) => Boolean(event && event.status === 'active');

export const shouldShowFirstTipOnboarding = ({
  enabled,
  hasInvite,
  lobbies,
  state
}: {
  enabled: boolean;
  hasInvite: boolean;
  lobbies: Lobby[];
  state: OnboardingState | null;
}) => (
  enabled &&
  !hasInvite &&
  lobbies.length === 0 &&
  Boolean(state && (state.status === 'not_started' || state.status === 'started'))
);

export const getFirstPredictableOfficialEventMatch = (
  matches: OfficialEventMatch[]
) => (
  matches
    .filter(match => (
      match.can_predict &&
      match.predicted_home_score === null &&
      match.predicted_away_score === null
    ))
    .sort((a, b) => (
      new Date(a.lock_time_utc).getTime() - new Date(b.lock_time_utc).getTime()
    ))[0] || null
);
