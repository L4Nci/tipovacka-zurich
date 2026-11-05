export type Player = {
  id: string;
  username: string;
  display_name?: string | null;
  locale?: 'cs' | 'en';
  email?: string | null;
  role: 'player' | 'admin';
  lobby_role?: 'owner' | 'admin' | 'member';
  avatar_emoji?: string | null;
  avatar_bg?: string | null;
  // TODO: Legacy (profiles.tournament_winner_id) - no longer used in new longterm_predictions logic
  tournament_winner_id?: string;
  winner_flag?: string;
  total_points?: number;
  exact_hits?: number;
  outcome_hits?: number;
  goal_difference_hits?: number;
  winner_hits?: number;
  draw_hits?: number;
};

export type AuthStatus =
  | 'initializing'
  | 'signed_out'
  | 'authenticating'
  | 'signing_up'
  | 'email_confirmation_pending'
  | 'password_recovery'
  | 'profile_onboarding'
  | 'authenticated'
  | 'auth_error';

export type Team = {
  id: string;
  name: string;
  flag_code: string;
  group_name: string;
  sport_id?: string;
  short_name?: string;
  logo_url?: string | null;
  is_final_winner?: number;
};

export type Match = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  start_time_utc: string;
  lock_time_utc?: string;
  home_score: number | null;
  away_score: number | null;
  status: 'scheduled' | 'finished';
  stage: string;
  tournament_id?: string;
  home_name: string;
  home_flag: string;
  away_name: string;
  away_flag: string;
  home_logo_url?: string | null;
  away_logo_url?: string | null;
  predicted_home_score?: number | null;
  predicted_away_score?: number | null;
  total_predictions?: number;
};

export type Prediction = {
  player_id: string;
  match_id: string;
  predicted_home_score: number;
  predicted_away_score: number;
  points_earned: number;
  username?: string;
  avatar_emoji?: string | null;
  avatar_bg?: string | null;
  winner_flag?: string;
};

export type Tournament = {
  id: string;
  name: string;
  sport_id: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  status: 'upcoming' | 'ongoing' | 'finished';
  winner_participant_id?: string;
  actual_tournament_winner_id?: string | null;
  external_id?: string;
  provider_name?: string;
  created_at?: string;
};

export type LobbyTournament = {
  id?: string;
  lobby_id: string;
  tournament_id: string;
  status: 'active' | 'archived';
  created_at?: string;
  updated_at?: string;
  tournament?: Tournament;
};

export type LobbyPrizeEntry = {
  position: number;
  label: string;
};

export type Lobby = {
  id: string;
  name: string;
  owner_id: string;
  tournament_id: string; // legacy fallback
  short_description?: string | null;
  long_description?: string | null;
  join_code: string;
  join_policy?: 'open' | 'approval_required';
  visibility: 'private' | 'public';
  created_at?: string;
  is_owner?: boolean;
  lobby_role?: 'owner' | 'admin' | 'member';
  member_count?: number | null;
  tournaments?: LobbyTournament[];
  tournament_name?: string;
  prizes_enabled?: boolean;
  prize_entries?: LobbyPrizeEntry[];
};

export type LobbyMember = {
  id: string;
  user_id: string;
  username: string;
  role: 'player' | 'admin';
  lobby_role: 'owner' | 'admin' | 'member';
  membership_status: 'active' | 'removed' | 'left';
  avatar_emoji?: string | null;
  avatar_bg?: string | null;
  joined_at: string;
  ended_at?: string | null;
  ended_by?: string | null;
  tournament_winner_id?: string | null;
};

export type LobbyJoinRequest = {
  id: string;
  lobby_id: string;
  user_id: string;
  username: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  avatar_emoji?: string | null;
  avatar_bg?: string | null;
  created_at: string;
};

export type HallOfFameEntry = {
  player_id: string;
  username: string;
  avatar_emoji?: string | null;
  avatar_bg?: string | null;
  total_points: number;
  completed_tournaments_count: number;
};

export type LobbyCommunity = {
  lobby_id: string;
  join_policy: 'open' | 'approval_required';
  viewer_role: 'owner' | 'admin' | 'member' | 'platform_admin';
  active_member_count: number;
  members: LobbyMember[];
  pending_requests: LobbyJoinRequest[];
  hall_of_fame: HallOfFameEntry[];
};

export type MembershipHomeItem = {
  item_type: 'join_request' | 'membership' | 'management';
  lobby_id: string;
  lobby_name: string;
  lobby_role: 'owner' | 'admin' | 'member' | null;
  join_policy: 'open' | 'approval_required';
  request_id: string | null;
  request_status: 'pending' | 'approved' | 'rejected' | null;
  membership_status: 'removed' | 'left' | null;
  pending_request_count: number;
  event_at: string;
};

export type ProfileStats = {
  predictions_total: number;
  evaluated_predictions: number;
  exact_predictions: number;
  match_points: number;
  longterm_predictions: number;
  longterm_points: number;
  completed_tournaments: number;
};

export type CommunityProfile = {
  visible: boolean;
  is_self?: boolean;
  is_public?: boolean;
  scope?: 'global' | 'lobby';
  profile?: {
    username: string;
    avatar_emoji?: string | null;
    avatar_bg?: string | null;
    bio?: string | null;
  };
  stats?: ProfileStats | null;
};

export type UserBadge = {
  id?: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold' | 'special';
  context_type: 'global' | 'lobby' | 'tournament' | 'lobby_tournament' | 'official_event';
  context_id: string;
  awarded_at: string;
  featured_position?: number | null;
};

export type AchievementProgress = {
  key: string;
  name: string;
  description: string;
  current_value: number;
  target_value: number;
  completed_at?: string | null;
};

export type BadgeOverview = {
  badges: UserBadge[];
  progress: AchievementProgress[];
};

export type LobbyTournamentCatalogItem = {
  tournament_id: string;
  tournament_name: string;
  sport_id: string;
  relation_status: 'active' | 'archived' | null;
  is_linked: boolean;
  is_completed: boolean;
  match_count: number;
};

export type ProductFeatureFlag = {
  enabled: boolean;
  payload: Record<string, unknown>;
};

export type ProductFeatureFlags = Record<string, ProductFeatureFlag>;

export type AdminOperationsSummary = {
  users: number;
  profiles: number;
  lobbies: number;
  active_memberships: number;
  registrations_7d: number;
  registrations_30d: number;
  active_tournaments: number;
  predictions_24h: number;
  predictions_7d: number;
  pending_join_requests: number;
  unresolved_matches: number;
  matches_without_participants: number;
  locked_without_result: number;
  orphan_memberships: number;
  orphan_predictions: number;
  duplicate_memberships: number;
  last_match_update: string | null;
};

export type OnboardingState = {
  onboarding_version: number;
  status: 'not_started' | 'started' | 'skipped' | 'completed';
  variant_key: string;
  completion_path: 'invite' | 'own_lobby' | 'start_event' | null;
  started_at: string | null;
  completed_at: string | null;
};

export type OfficialEventCard = {
  event_id: string;
  slug: string;
  name: string;
  description: string | null;
  cover_key: string | null;
  status: 'scheduled' | 'active' | 'completed';
  featured: boolean;
  onboarding_eligible: boolean;
  is_participating: boolean;
  participation_status: 'active' | 'left' | null;
  actionable_match_count: number;
  open_match_count: number;
  next_match: {
    id: string;
    lock_time_utc: string;
    home_name: string;
    away_name: string;
  } | null;
  partner_name?: string | null;
  partner_logo_url?: string | null;
  accent_color?: string;
  has_prizes?: boolean;
  terms_required?: boolean;
  participant_count?: number;
};

export type OfficialEventMatch = {
  id: string;
  start_time_utc: string;
  lock_time_utc: string;
  status: 'scheduled' | 'live' | 'finished';
  home_score: number | null;
  away_score: number | null;
  home_name: string;
  home_short_name: string | null;
  home_flag: string | null;
  away_name: string;
  away_short_name: string | null;
  away_flag: string | null;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  points_earned: number;
  can_predict: boolean;
};

export type OfficialEventDetail = {
  event_id: string;
  slug: string;
  name: string;
  description: string | null;
  cover_key: string | null;
  status: 'scheduled' | 'active' | 'completed' | 'archived';
  participation_status: 'active' | 'left' | null;
  partner?: {
    name?: string | null;
    logo_url?: string | null;
    url?: string | null;
    text?: string | null;
  };
  accent_color?: string;
  terms?: {
    version: number;
    summary?: string | null;
    url?: string | null;
    minimum_age?: number | null;
    eligible_regions?: string[];
    employees_excluded?: boolean;
    claim_instructions?: string | null;
    organizer_name?: string | null;
    organizer_contact_url?: string | null;
    accepted: boolean;
  };
  prizes?: OfficialEventPrize[];
  matches: OfficialEventMatch[];
};

export type OfficialEventPrize = {
  id?: string;
  rank_from: number;
  rank_to: number;
  title: string;
  description?: string | null;
  image_url?: string | null;
  partner_name?: string | null;
};

export type OfficialEventSeasonBadge = {
  id: string;
  name: string;
  description: string;
  icon: string;
  rule_type: 'winner' | 'top_10' | 'top_1_percent' | 'top_10_percent' | 'participant';
  featured_position?: number | null;
};

export type OfficialEventSeasonResult = {
  event_id: string;
  slug: string;
  event_name: string;
  partner_name: string | null;
  accent_color: string;
  position: number | null;
  participant_count: number;
  top_percent: number | null;
  better_than_percent: number | null;
  total_points: number;
  exact_hits: number;
  saved_predictions: number;
  evaluated_predictions: number;
  result_is_final: boolean;
  prize_eligibility: 'not_applicable' | 'pending_review' | 'eligible' | 'ineligible' | 'disqualified';
  badges: OfficialEventSeasonBadge[];
  qualifying_prizes: OfficialEventPrize[];
};

export type OfficialEventLeaderboardRow = {
  position: number;
  username: string;
  avatar_emoji: string | null;
  avatar_bg: string | null;
  total_points: number;
  exact_hits: number;
  is_current_user: boolean;
  featured_badges: Array<{ name: string; icon: string }>;
};

export type OfficialEventLeaderboard = {
  participant_count: number;
  current_position: number | null;
  points_to_next: number;
  rows: OfficialEventLeaderboardRow[];
};
