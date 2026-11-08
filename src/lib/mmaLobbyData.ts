import type { SupabaseClient } from '@supabase/supabase-js';
import { isMmaSeason, type MmaEvent, type MmaFight, type MmaFighter, type MmaPrediction } from './mma.ts';

export type MmaStanding = { user_id: string; username: string; avatar_emoji: string | null;
  avatar_bg: string | null; points: number; predictions_count: number };
export type MmaLobbyData = { events: MmaEvent[]; fights: MmaFight[]; fighters: MmaFighter[];
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
  const [events, standings] = await Promise.all([
    readAllRows<any>(client.from('mma_events').select('*,tournament:tournaments(name)')
      .eq(isMmaSeason(tournamentId) ? 'season_tournament_id' : 'tournament_id', tournamentId).order('starts_at').order('tournament_id')),
    readAllRows<MmaStanding>(client.rpc('get_mma_lobby_leaderboard', {
      p_lobby_id: lobbyId, p_tournament_id: tournamentId,
    }).order('points', { ascending: false }).order('username').order('user_id')),
  ]);
  if (!events.length) throw new Error('MMA_LOBBY_LOAD_FAILED');
  const eventFights = await readAllRows<MmaFight>(client.from('mma_fights').select('*')
    .in('tournament_id', events.map(event => event.tournament_id)).order('ordering').order('id'));
  const ids = [...new Set(eventFights.flatMap(f => [f.fighter_a_id, f.fighter_b_id]).filter(id => id !== null))];
  // Bound URL length for a whole year's cards; Supabase otherwise truncates large unpaged reads.
  const chunks = <T,>(values: T[]) => Array.from({ length: Math.ceil(values.length / 100) }, (_, index) => values.slice(index * 100, (index + 1) * 100));
  const [fighters, lobbyPredictions] = await Promise.all([
    Promise.all(chunks(ids).map(chunk => readAllRows<MmaFighter>(client.from('mma_fighters')
      .select('id,name,country_code,portrait').in('id', chunk).order('id')))).then(rows => rows.flat()),
    Promise.all(chunks(eventFights.map(fight => fight.id)).map(chunk => readAllRows<MmaPrediction>(client.from('mma_predictions')
      .select('lobby_id,fight_id,user_id,predicted_winner_id,lineup_version,points_earned')
      .eq('lobby_id', lobbyId).in('fight_id', chunk)
      .order('fight_id').order('user_id')))).then(rows => rows.flat()),
  ]);
  return { events: events.map(event => ({ ...event, event_name: event.tournament?.name })),
    fights: eventFights, fighters, lobbyPredictions,
    predictions: lobbyPredictions.filter(pick => pick.user_id === userId),
    standings: standings.map(row => ({ ...row, points: Number(row.points), predictions_count: Number(row.predictions_count) })) };
}
