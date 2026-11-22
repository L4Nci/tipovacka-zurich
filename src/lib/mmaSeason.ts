import { canPredictMmaFight, type MmaEvent, type MmaFight, type MmaPrediction } from './mma.ts';
import type { MmaLobbyData } from './mmaLobbyData.ts';
import { mmaPickFeedback } from './mmaPredictions.ts';

const hasMmaResultRow = (fight: MmaFight) => fight.status !== 'scheduled';

export function mmaResultEvents(events: readonly MmaEvent[], fights: readonly MmaFight[]) {
  const eventIds = new Set(fights.filter(hasMmaResultRow).map(fight => fight.tournament_id));
  return events.filter(event => eventIds.has(event.tournament_id)).sort((a, b) =>
    Number(b.status === 'completed') - Number(a.status === 'completed')
    || Date.parse(b.starts_at) - Date.parse(a.starts_at)
    || a.tournament_id.localeCompare(b.tournament_id));
}

export function filterMmaSeason(events: readonly MmaEvent[], fights: readonly MmaFight[], picks: readonly MmaPrediction[],
  eventId: string, filter: 'all' | 'missing' | 'results', now: number) {
  const eventById = new Map(events.map(event => [event.tournament_id, event]));
  const byFight = new Map(picks.map(pick => [pick.fight_id, pick]));
  return fights.filter(fight => {
    const event = eventById.get(fight.tournament_id);
    if (!event || (eventId !== 'all' && eventId !== event.tournament_id)) return false;
    if (filter === 'results') return hasMmaResultRow(fight);
    if (filter === 'missing') return canPredictMmaFight(event, fight, now)
      && byFight.get(fight.id)?.lineup_version !== fight.lineup_version;
    return fight.status === 'scheduled' && !['completed', 'cancelled'].includes(event.status);
  });
}

export function buildMmaStandings(lobbyId: string, eventId: string | null,
  { events, fights, lobbyPredictions, standings }: Pick<MmaLobbyData, 'events' | 'fights' | 'lobbyPredictions' | 'standings'>) {
  const eventsInScope = eventId ? events.filter(event => event.tournament_id === eventId) : events;
  const rulesByEvent = new Map(eventsInScope.map(event => [event.tournament_id, event.rules_version]));
  const showFinishHits = eventsInScope.some(event => event.rules_version === 'mma-winner-method-v2');
  const fightById = new Map(fights.filter(fight => !eventId || fight.tournament_id === eventId).map(fight => [fight.id, fight]));
  const byUser = new Map(standings.map(member => [member.user_id, {
    ...member,
    points: eventId ? 0 : member.points,
    predictions_count: eventId ? 0 : member.predictions_count,
    winnerHits: 0,
    finishHits: 0,
  }]));
  const seen = new Set<string>();
  for (const pick of lobbyPredictions) {
    const fight = fightById.get(pick.fight_id);
    const member = byUser.get(pick.user_id);
    const key = pick.user_id + ':' + pick.fight_id;
    if (!fight || !member || pick.lobby_id !== lobbyId || seen.has(key)) continue;
    seen.add(key);
    if (eventId) {
      member.predictions_count++;
      member.points += pick.points_earned;
    }

    const rules = rulesByEvent.get(fight.tournament_id);
    if (!rules || (pick.predicted_winner_id !== fight.fighter_a_id && pick.predicted_winner_id !== fight.fighter_b_id)) continue;
    const feedback = mmaPickFeedback(fight, pick, rules);
    if (feedback.winner === 'correct') member.winnerHits++;
    if (feedback.method === 'correct') member.finishHits++;
  }
  const rows = [...byUser.values()];
  // Only the event view sorts here; overall standings retain the RPC's order and points.
  if (eventId) rows.sort((a, b) => b.points - a.points || a.username.localeCompare(b.username) || a.user_id.localeCompare(b.user_id));
  return { rows, showFinishHits };
}
