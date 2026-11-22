import { MMA_METHODS, mmaMethodGroup, type MmaFight, type MmaPrediction, type MmaRulesVersion } from './mma.ts';

export type MmaPickMark = 'correct' | 'incorrect' | null;

export function mmaPickFeedback(fight: MmaFight, pick: MmaPrediction | undefined, rules: MmaRulesVersion):
  { winner: MmaPickMark; method: MmaPickMark } {
  if (!pick || pick.fight_id !== fight.id || pick.lineup_version !== fight.lineup_version
    || fight.status !== 'finished' || fight.winner_fighter_id === null
    || fight.method_normalized === 'draw' || fight.method_normalized === 'no_contest') {
    return { winner: null, method: null };
  }

  const method = mmaMethodGroup(fight.method_normalized);
  return {
    winner: pick.predicted_winner_id === fight.winner_fighter_id ? 'correct' : 'incorrect',
    method: rules === 'mma-winner-method-v2' && pick.predicted_method && method
      ? (pick.predicted_method === method ? 'correct' : 'incorrect') : null,
  };
}

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

export function summarizeMmaMethods(predictions: readonly MmaPrediction[]) {
  // Input is the existing, context/lineup/member-validated community distribution.
  const counts = MMA_METHODS.map(method => predictions.filter(pick => pick.predicted_method === method).length);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const percentages = counts.map(count => total ? Math.floor(count * 100 / total) : 0);
  if (total) {
    const remainders = counts.map((count, index) => ({ index, remainder: count * 100 % total }))
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
    const remaining = 100 - percentages.reduce((sum, value) => sum + value, 0);
    for (let index = 0; index < remaining; index++) percentages[remainders[index].index]++;
  }
  return { total, segments: MMA_METHODS.map((method, index) => ({ method, count: counts[index], percent: percentages[index] })) };
}
