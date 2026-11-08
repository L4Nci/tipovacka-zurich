import { canPredictMmaFight, type MmaEvent, type MmaFight, type MmaPrediction } from './mma.ts';
import type { MmaStanding } from './mmaLobbyData.ts';

export function filterMmaSeason(events: readonly MmaEvent[], fights: readonly MmaFight[], picks: readonly MmaPrediction[],
  eventId: string, filter: 'all' | 'missing' | 'results', now: number) {
  const eventById = new Map(events.map(event => [event.tournament_id, event]));
  const byFight = new Map(picks.map(pick => [pick.fight_id, pick]));
  return fights.filter(fight => {
    const event = eventById.get(fight.tournament_id);
    if (!event || (eventId !== 'all' && eventId !== event.tournament_id)) return false;
    if (filter === 'results') return fight.status !== 'scheduled';
    if (filter === 'missing') return canPredictMmaFight(event, fight, now)
      && byFight.get(fight.id)?.lineup_version !== fight.lineup_version;
    return fight.status === 'scheduled' && !['completed', 'cancelled'].includes(event.status);
  });
}

export function mmaEventStandings(lobbyId: string, eventId: string, members: readonly MmaStanding[],
  fights: readonly MmaFight[], predictions: readonly MmaPrediction[]): MmaStanding[] {
  const fightById = new Map(fights.filter(fight => fight.tournament_id === eventId).map(fight => [fight.id, fight]));
  const byUser = new Map(members.map(member => [member.user_id, { ...member, points: 0, predictions_count: 0 }]));
  const seen = new Set<string>();
  for (const pick of predictions) {
    const fight = fightById.get(pick.fight_id);
    const member = byUser.get(pick.user_id);
    const key = pick.user_id + ':' + pick.fight_id;
    if (!fight || !member || pick.lobby_id !== lobbyId || seen.has(key)) continue;
    seen.add(key);
    member.predictions_count++;
    member.points += pick.points_earned;
  }
  return [...byUser.values()].sort((a, b) => b.points - a.points || a.username.localeCompare(b.username) || a.user_id.localeCompare(b.user_id));
}
