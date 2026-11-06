import { supabase } from './supabase.ts';
import type { MmaEvent, MmaFight, MmaFighter, MmaPrediction } from './mma.ts';

export type MmaStanding = { user_id: string; username: string; avatar_emoji: string | null;
  avatar_bg: string | null; points: number; predictions_count: number };
export type MmaLobbyData = { event: MmaEvent; fights: MmaFight[]; fighters: MmaFighter[];
  predictions: MmaPrediction[]; standings: MmaStanding[] };

export async function fetchMmaLobby(lobbyId: string, tournamentId: string, userId: string): Promise<MmaLobbyData> {
  // The gated leaderboard proves current lobby access; RLS also protects every prediction read.
  const [event, fights, predictions, standings] = await Promise.all([
    supabase.from('mma_events').select('*').eq('tournament_id', tournamentId).single(),
    supabase.from('mma_fights').select('*').eq('tournament_id', tournamentId).order('ordering').order('id'),
    supabase.from('mma_predictions').select('*').eq('lobby_id', lobbyId).eq('user_id', userId),
    supabase.rpc('get_mma_lobby_leaderboard', { p_lobby_id: lobbyId, p_tournament_id: tournamentId }),
  ]);
  if (event.error || fights.error || predictions.error || standings.error) throw new Error('MMA_LOBBY_LOAD_FAILED');
  const ids = [...new Set((fights.data ?? []).flatMap(f => [f.fighter_a_id, f.fighter_b_id]).filter(id => id !== null))];
  const fighters = await supabase.from('mma_fighters').select('id,name,country_code').in('id', ids);
  if (fighters.error) throw new Error('MMA_LOBBY_LOAD_FAILED');
  return { event: event.data, fights: fights.data ?? [], fighters: fighters.data ?? [], predictions: predictions.data ?? [],
    standings: (standings.data ?? []).map((row: any) => ({ ...row, points: Number(row.points), predictions_count: Number(row.predictions_count) })) };
}

export async function saveMmaPrediction(lobbyId: string, userId: string, fight: MmaFight, winnerId: number) {
  const { error } = await supabase.from('mma_predictions').upsert({
    lobby_id: lobbyId, user_id: userId, fight_id: fight.id,
    predicted_winner_id: winnerId, lineup_version: fight.lineup_version,
  }, { onConflict: 'lobby_id,fight_id,user_id' });
  if (error) throw new Error(error.code === '40001' ? 'MMA_LINEUP_CHANGED' : 'MMA_SAVE_FAILED');
}
