type ScorePick = {
  player_id: string;
  predicted_home_score: number;
  predicted_away_score: number;
};

export function summarizeScorePredictions(rows: readonly ScorePick[], own: ScorePick | null, allowDraw: boolean) {
  const byPlayer = new Map(rows.map(row => [row.player_id, row]));
  if (own) byPlayer.set(own.player_id, own);

  const counts = [0, 0, 0];
  for (const { predicted_home_score: home, predicted_away_score: away } of byPlayer.values()) {
    if (home > away) counts[0]++;
    else if (away > home) counts[2]++;
    else if (allowDraw) counts[1]++;
  }
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!total) return { home: 0, draw: 0, away: 0 };

  const shares = counts.map(count => count * 100 / total);
  const rounded = shares.map(Math.floor);
  const remainder = 100 - rounded.reduce((sum, share) => sum + share, 0);
  const ranked = [0, 1, 2].sort((a, b) => (shares[b] - rounded[b]) - (shares[a] - rounded[a]));
  for (const i of ranked.slice(0, remainder)) rounded[i]++;
  return { home: rounded[0], draw: rounded[1], away: rounded[2] };
}
