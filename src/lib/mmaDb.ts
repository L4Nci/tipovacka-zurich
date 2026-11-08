import { supabase } from './supabase.ts';
import type { MmaFight, MmaMethod, MmaRulesVersion } from './mma.ts';
import { loadMmaLobbyData, type MmaLobbyData } from './mmaLobbyData.ts';
export type { MmaStanding, MmaLobbyData } from './mmaLobbyData.ts';

export async function fetchMmaLobby(lobbyId: string, tournamentId: string, userId: string): Promise<MmaLobbyData> {
  return loadMmaLobbyData(supabase, lobbyId, tournamentId, userId);
}

export async function saveMmaPrediction(lobbyId: string, userId: string, fight: MmaFight, winnerId: number,
  method: MmaMethod | null = null, rules: MmaRulesVersion = 'mma-winner-v1') {
  const { error } = await supabase.from('mma_predictions').upsert({
    lobby_id: lobbyId, user_id: userId, fight_id: fight.id,
    predicted_winner_id: winnerId, lineup_version: fight.lineup_version,
    ...(rules === 'mma-winner-method-v2' ? { predicted_method: method } : {}),
  }, { onConflict: 'lobby_id,fight_id,user_id' });
  if (error) throw new Error(error.code === '40001' ? 'MMA_LINEUP_CHANGED' : 'MMA_SAVE_FAILED');
}
