import type { SupabaseClient } from '@supabase/supabase-js';
import type { MmaEvent, MmaFight, MmaFighter, MmaPrediction } from './mma.ts';

export type MmaStanding = { user_id: string; username: string; avatar_emoji: string | null;
  avatar_bg: string | null; points: number; predictions_count: number };
export type MmaLobbyData = { event: MmaEvent; fights: MmaFight[]; fighters: MmaFighter[];
  predictions: MmaPrediction[]; lobbyPredictions: MmaPrediction[]; standings: MmaStanding[] };

async function readAllRows<T>(query: any): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < 20; page++) {
    const { data, error } = await query.range(page * 1000, page * 1000 + 999);
    if (error) throw new Error('MMA_LOBBY_LOAD_FAILED');
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
  // Never present a partial page as the whole lobby's distribution.
  throw new Error('MMA_LOBBY_LOAD_FAILED');
}

export async function loadMmaLobbyData(client: SupabaseClient, lobbyId: string, tournamentId: string,
  userId: string): Promise<MmaLobbyData> {
  // The gated RPC proves current membership before we load the community's picks.
  const [event, fights, standings] = await Promise.all([
    client.from('mma_events').select('*').eq('tournament_id', tournamentId).single(),
    client.from('mma_fights').select('*').eq('tournament_id', tournamentId).order('ordering').order('id'),
    readAllRows<MmaStanding>(client.rpc('get_mma_lobby_leaderboard', {
      p_lobby_id: lobbyId, p_tournament_id: tournamentId,
    }).order('points', { ascending: false }).order('username').order('user_id')),
  ]);
  if (event.error || fights.error) throw new Error('MMA_LOBBY_LOAD_FAILED');
  const eventFights = (fights.data ?? []) as MmaFight[];
  const ids = [...new Set(eventFights.flatMap(f => [f.fighter_a_id, f.fighter_b_id]).filter(id => id !== null))];
  const [fighters, lobbyPredictions] = await Promise.all([
    ids.length ? client.from('mma_fighters').select('id,name,country_code').in('id', ids)
      : Promise.resolve({ data: [], error: null }),
    eventFights.length ? readAllRows<MmaPrediction>(client.from('mma_predictions')
      .select('lobby_id,fight_id,user_id,predicted_winner_id,lineup_version,points_earned')
      .eq('lobby_id', lobbyId).in('fight_id', eventFights.map(fight => fight.id))
      .order('fight_id').order('user_id')) : Promise.resolve([] as MmaPrediction[]),
  ]);
  if (fighters.error) throw new Error('MMA_LOBBY_LOAD_FAILED');
  return { event: event.data, fights: eventFights, fighters: fighters.data ?? [], lobbyPredictions,
    predictions: lobbyPredictions.filter(pick => pick.user_id === userId),
    standings: standings.map(row => ({ ...row, points: Number(row.points), predictions_count: Number(row.predictions_count) })) };
}
