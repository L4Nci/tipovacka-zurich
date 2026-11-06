import { translate, type Locale, type MessageKey } from '../i18n/index.ts';
export const isGroupStage = (stage?: string | null): boolean => {
  const phase = (stage || "").trim().toLowerCase().replace(/[_\s-]+/g, ' ');
  return phase.startsWith('group') || ['league phase', 'league stage', 'regular season'].includes(phase);
};

// Explicit catalog IDs also cover code paths that only receive a match, not the catalog.
const hockeyTournaments = new Set(['ms-hockey-2026', 'nhl-2026-27', 'czech-extraliga-2026-27']);
export const isHockeyTournament = (tournamentId?: string | null, sportId?: string | null): boolean =>
  sportId ? sportId === 'hockey' : hockeyTournaments.has(tournamentId || '');
export const isFootballTournament = (tournamentId?: string | null): boolean => !isHockeyTournament(tournamentId);

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

export const formatStageLabel = (stage: string, lang: Locale): string => {
  if (/^regular[ _]season$/i.test(stage.trim())) return translate(lang, "matchRules.regularSeason");
  if (/^league[ _](phase|stage)$/i.test(stage.trim())) return translate(lang, "matchRules.leaguePhase");
  const labels: Record<string, MessageKey> = {
    Playoffs: 'stage.playoffs', 'Round of 16': 'stage.roundOf16', Quarterfinals: 'stage.quarterfinals', Semifinals: 'stage.semifinals', Final: 'stage.final',
  };
  if (Object.hasOwn(labels, stage)) return translate(lang, labels[stage]);
  const group = /^Group\s+(.+)$/i.exec(stage);
  return group ? translate(lang, 'stage.group', { group: group[1] }) : stage;
};
