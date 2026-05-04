export type Player = {
  id: string;
  username: string;
  role: 'player' | 'admin';
  tournament_winner_id?: string;
  winner_flag?: string;
  total_points?: number;
  exact_scores?: number;
  correct_winners?: number;
};

export type Team = {
  id: string;
  name: string;
  flag_code: string;
  group_name: string;
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
};
