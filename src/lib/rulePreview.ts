export type FootballScoreMode = 'regulation' | 'final';
export type RuleExample = 'draw' | 'extra_time' | 'penalties';
// Sports facts remain separate. Shootout mode uses the shootout score itself.
export function previewScore(mode: FootballScoreMode, example: RuleExample) {
  if (mode === 'regulation' || example === 'draw') return { home: 1, away: 1 };
  return example === 'extra_time' ? { home: 2, away: 1 } : { home: 4, away: 3 };
}
