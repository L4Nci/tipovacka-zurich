export const isGroupStage = (stage?: string | null): boolean => {
  const phase = (stage || "").trim().toLowerCase().replace(/[_\s-]+/g, ' ');
  return phase.startsWith('group') || ['league phase', 'league stage', 'regular season'].includes(phase);
};

export const isFootballTournament = (tournamentId?: string | null): boolean => {
  return tournamentId !== "ms-hockey-2026";
};

export const isFootballKnockoutStage = (stage?: string | null, tournamentId?: string | null): boolean => {
  const phase = (stage || '').trim().toLowerCase().replace(/[_\s-]+/g, ' ');
  return isFootballTournament(tournamentId) && [
    'round of 32', 'round of 16', 'last 32', 'last 16', 'playoffs', 'play offs',
    'quarterfinal', 'quarterfinals', 'quarter finals', 'semifinal', 'semifinals', 'semi finals',
    'third place', 'final', 'finals',
  ].includes(phase);
};

export const isDrawPrediction = (home: number, away: number): boolean => {
  return home === away;
};

export const requiresFootballWinner = (
  stage?: string | null, tournamentId?: string | null, mode: 'regulation' | 'final' = 'final'
): boolean => {
  if (mode === 'regulation' || !isFootballKnockoutStage(stage, tournamentId)) return false;
  // A two-legged tie can have a drawn individual match even when a team advances.
  const phase = (stage || '').trim().toLowerCase().replace(/[_\s-]+/g, ' ');
  return tournamentId === 'fifa-world-cup-2026' || ['final', 'finals', 'third place'].includes(phase);
};

export const formatStageLabel = (stage: string, lang: 'cz' | 'en'): string => {
  if (/^league[ _](phase|stage)$/i.test(stage.trim())) return lang === 'cz' ? 'Ligová fáze' : 'League phase';
  if (lang === 'en') return stage;
  const labels: Record<string, string> = {
    Playoffs: 'Play-off', 'Round of 16': 'Osmifinále', Quarterfinals: 'Čtvrtfinále', Semifinals: 'Semifinále', Final: 'Finále',
  };
  return Object.hasOwn(labels, stage) ? labels[stage] : stage.replace(/^Group\s+/i, 'Skupina ');
};
