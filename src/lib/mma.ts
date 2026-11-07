import type { MmaPortrait } from './mmaPortraits.ts';

export const MMA_PILOT_EVENTS = [
  { tournamentId: 'ufc-334-2026', providerId: 2563, expectedDate: '2026-11-14', label: 'UFC 334' },
  { tournamentId: 'ufc-qatar-2026-11-21', providerId: 3533, expectedDate: '2026-11-21', label: 'UFC Qatar: Procházka–Stirling' },
] as const;

export const isMmaTournament = (id: string | null | undefined, sport?: string) =>
  sport === 'mma' || MMA_PILOT_EVENTS.some(event => event.tournamentId === id);

export type MmaFightStatus = 'scheduled' | 'finished' | 'draw' | 'void' | 'cancelled' | 'awaiting_result';
export type MmaFighter = { id: number; name: string; country_code: string | null; portrait?: MmaPortrait | null };
export type MmaFight = {
  id: string; tournament_id: string; provider_fight_id: number;
  fighter_a_id: number | null; fighter_b_id: number | null;
  ordering: number; card_section: string; weight_class: string | null; scheduled_rounds: number | null;
  status: MmaFightStatus; winner_fighter_id: number | null; method: string | null; finish_round: number | null;
  lineup_version: number;
};
export type MmaEvent = {
  tournament_id: string; provider_event_id: number; provider_slug: string;
  starts_at: string; main_card_at: string | null; lock_time_utc: string;
  status: 'announced' | 'scheduled' | 'live' | 'completed' | 'cancelled' | 'postponed';
  source_observed_at: string; rules_version: 'mma-winner-v1';
};
export type MmaPrediction = {
  lobby_id: string; fight_id: string; user_id: string; predicted_winner_id: number;
  lineup_version: number; points_earned: number;
};
export const canPredictMmaFight = (event: MmaEvent, fight: MmaFight, now = Date.now()) =>
  ['announced', 'scheduled'].includes(event.status) && Date.parse(event.lock_time_utc) > now &&
  fight.status === 'scheduled' && fight.fighter_a_id !== null && fight.fighter_b_id !== null;

export const mmaWinnerPoints = (pick: number, winner: number | null, status: MmaFightStatus,
  pickedVersion: number, currentVersion: number) =>
  status === 'finished' && winner !== null && pick === winner && pickedVersion === currentVersion ? 1 : 0;
