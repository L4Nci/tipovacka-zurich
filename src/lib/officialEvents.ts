import { supabase } from './supabase.ts';
import type {
  OfficialEventCard,
  OfficialEventDetail,
  OfficialEventLeaderboard,
  OfficialEventSeasonResult,
  OnboardingState
} from '../types.ts';

const missingRpcCodes = new Set(['42883', 'PGRST202']);

const returnNullForMissingRpc = (error: { code?: string } | null) => (
  Boolean(error?.code && missingRpcCodes.has(error.code))
);

export const fetchMyOnboardingState = async (): Promise<OnboardingState | null> => {
  const { data, error } = await supabase.rpc('get_my_onboarding_state');
  if (returnNullForMissingRpc(error)) return null;
  if (error) throw error;
  return data as OnboardingState;
};

export const updateMyOnboardingState = async ({
  version = 1,
  status,
  variantKey = 'control',
  completionPath = null
}: {
  version?: number;
  status: OnboardingState['status'];
  variantKey?: string;
  completionPath?: OnboardingState['completion_path'];
}): Promise<OnboardingState> => {
  const { data, error } = await supabase.rpc('update_my_onboarding_state', {
    onboarding_version_param: version,
    status_param: status,
    variant_key_param: variantKey,
    completion_path_param: completionPath
  });
  if (error) throw error;
  return data as OnboardingState;
};

export const fetchOfficialEventHomeCard = async (): Promise<OfficialEventCard | null> => {
  const { data, error } = await supabase.rpc('get_official_event_home_card');
  if (returnNullForMissingRpc(error)) return null;
  if (error) throw error;
  return data as OfficialEventCard | null;
};

export const resolveOfficialEventSlug = async (slug: string): Promise<string | null> => {
  const { data, error } = await supabase.rpc('resolve_official_event_slug', {
    slug_param: slug
  });
  if (returnNullForMissingRpc(error)) return null;
  if (error) throw error;
  return data ? String(data) : null;
};

export const joinOfficialEvent = async (eventId: string) => {
  const { data, error } = await supabase.rpc('join_official_event', {
    event_id_param: eventId
  });
  if (error) throw error;
  return data as { event_id: string; state: 'joined' | 'rejoined' | 'already_participating' };
};

export const acceptOfficialEventTermsAndJoin = async ({
  eventId,
  accepted,
  declaredAgeEligible,
  declaredRegionEligible
}: {
  eventId: string;
  accepted: boolean;
  declaredAgeEligible: boolean;
  declaredRegionEligible: boolean;
}) => {
  const { data, error } = await supabase.rpc('accept_official_event_terms_and_join', {
    event_id_param: eventId,
    accepted_param: accepted,
    declared_age_eligible_param: declaredAgeEligible,
    declared_region_eligible_param: declaredRegionEligible
  });
  if (error) throw error;
  return data as { event_id: string; state: 'joined' | 'rejoined' | 'already_participating' };
};

export const leaveOfficialEvent = async (eventId: string) => {
  const { error } = await supabase.rpc('leave_official_event', {
    event_id_param: eventId
  });
  if (error) throw error;
};

export const hideOfficialEvent = async (eventId: string) => {
  const { error } = await supabase.rpc('hide_official_event', {
    event_id_param: eventId
  });
  if (error) throw error;
};

export const fetchOfficialEventDetail = async (
  eventId: string
): Promise<OfficialEventDetail | null> => {
  const { data, error } = await supabase.rpc('get_official_event_detail', {
    event_id_param: eventId
  });
  if (error) throw error;
  return data as OfficialEventDetail | null;
};

export const saveOfficialEventPrediction = async ({
  eventId,
  matchId,
  homeScore,
  awayScore
}: {
  eventId: string;
  matchId: string;
  homeScore: number;
  awayScore: number;
}) => {
  const { data, error } = await supabase.rpc('save_official_event_prediction', {
    event_id_param: eventId,
    match_id_param: matchId,
    home_score_param: homeScore,
    away_score_param: awayScore
  });
  if (error) throw error;
  return data as { event_id: string; match_id: string; saved: boolean };
};

export const fetchOfficialEventLeaderboard = async (
  eventId: string
): Promise<OfficialEventLeaderboard | null> => {
  const { data, error } = await supabase.rpc('get_official_event_leaderboard', {
    event_id_param: eventId
  });
  if (error) throw error;
  return data as OfficialEventLeaderboard | null;
};

export const fetchOfficialEventSeasonResult = async (
  eventId: string
): Promise<OfficialEventSeasonResult | null> => {
  const { data, error } = await supabase.rpc('get_official_event_season_result', {
    event_id_param: eventId
  });
  if (returnNullForMissingRpc(error)) return null;
  if (error) throw error;
  return data as OfficialEventSeasonResult | null;
};
