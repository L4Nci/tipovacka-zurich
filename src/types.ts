export type Player = {
  id: string;
  username: string;
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
  is_final_winner?: number;
};

export type Match = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  start_time_utc: string;
  home_score: number | null;
  away_score: number | null;
  status: 'scheduled' | 'finished';
  stage: string;
  tournament_id?: string;
  home_name: string;
  home_flag: string;
  away_name: string;
  away_flag: string;
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

export type Lobby = {
  id: string;
  name: string;
  owner_id: string;
  tournament_id: string; // legacy fallback
  short_description?: string | null;
  long_description?: string | null;
  join_code: string;
  visibility: 'private' | 'public';
  created_at?: string;
  is_owner?: boolean;
  lobby_role?: 'owner' | 'admin' | 'member';
  member_count?: number | null;
  tournaments?: LobbyTournament[];
  tournament_name?: string;
};

export type LobbyMember = {
  id: string;
  user_id: string;
  username: string;
  role: 'player' | 'admin';
  lobby_role: 'owner' | 'admin' | 'member';
  membership_status: 'pending' | 'active' | 'removed' | 'left';
  avatar_emoji?: string | null;
  avatar_bg?: string | null;
  joined_at: string;
  ended_at?: string | null;
  ended_by?: string | null;
  tournament_winner_id?: string | null;
};
