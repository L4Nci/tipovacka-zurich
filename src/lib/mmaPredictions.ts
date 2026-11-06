import type { MmaFight, MmaPrediction } from './mma.ts';

export function summarizeMmaPredictions(lobbyId: string, fight: MmaFight,
  predictions: readonly MmaPrediction[], activeMemberIds: ReadonlySet<string>) {
  const byUser = new Map<string, MmaPrediction>();
  if (fight.fighter_a_id !== null && fight.fighter_b_id !== null) {
    for (const pick of predictions) {
      if (pick.lobby_id === lobbyId && pick.fight_id === fight.id && activeMemberIds.has(pick.user_id)
        && pick.lineup_version === fight.lineup_version
        && (pick.predicted_winner_id === fight.fighter_a_id || pick.predicted_winner_id === fight.fighter_b_id)) {
        byUser.set(pick.user_id, pick);
      }
    }
  }
  const valid = [...byUser.values()];
  const homeCount = valid.filter(pick => pick.predicted_winner_id === fight.fighter_a_id).length;
  const awayCount = valid.length - homeCount;
  const homePercent = valid.length ? Math.round(homeCount / valid.length * 100) : 0;
  return { predictions: valid, total: valid.length, homeCount, awayCount, homePercent,
    awayPercent: valid.length ? 100 - homePercent : 0 };
}
