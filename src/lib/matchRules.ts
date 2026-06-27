export const isGroupStage = (stage?: string | null): boolean => {
  return (stage || "").trim().startsWith("Group");
};

export const isFootballTournament = (tournamentId?: string | null): boolean => {
  return tournamentId !== "ms-hockey-2026";
};

export const isFootballKnockoutStage = (stage?: string | null, tournamentId?: string | null): boolean => {
  return isFootballTournament(tournamentId) && !isGroupStage(stage);
};

export const isDrawPrediction = (home: number, away: number): boolean => {
  return home === away;
};
