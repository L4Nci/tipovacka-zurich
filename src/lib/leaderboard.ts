import type { Match, Player, Prediction, Team } from '../types.ts';
import { calculatePoints, type SportId } from './scoring.ts';

type LeaderboardHistory = { points: number; res: 'W' | 'L' | 'E' };

export type LeaderboardViewPlayer = Player & {
  currentStreak: number;
  bestStreak: number;
  rankChange: number;
  history: LeaderboardHistory[];
};

type CalculatedStats = {
  id: string;
  username: string;
  total: number;
  exact: number;
  outcomeHits: number;
  goalDifferenceHits: number;
  winnerHits: number;
  drawHits: number;
  currentStreak: number;
  tempStreak: number;
  history: LeaderboardHistory[];
};

export const resolveLeaderboardPickTeam = (
  player: Pick<Player, 'tournament_winner_id'>,
  teams: Team[],
  fallbackTeams: Team[] = []
) => teams.find(team => team.id === player.tournament_winner_id)
  || fallbackTeams.find(team => team.id === player.tournament_winner_id)
  || null;

export const hasAwardedTournamentWinner = (
  player: Pick<Player, 'tournament_winner_id' | 'longterm_points'>,
  officialWinnerId?: string | null
) => Boolean(
  officialWinnerId &&
  player.tournament_winner_id === officialWinnerId &&
  (player.longterm_points ?? 0) > 0
);

export const buildLeaderboardWithStreaks = (
  players: Player[],
  predictions: Prediction[],
  matches: Match[],
  sport: SportId
): LeaderboardViewPlayer[] => {
  const lastFinishedMatchId = matches
    .filter(match => match.home_score !== null && match.away_score !== null)
    .sort((a, b) => new Date(b.start_time_utc).getTime() - new Date(a.start_time_utc).getTime())[0]?.id;

  const calculateRanks = (excludeMatchId?: string) => {
    const statsByUserId = new Map<string, CalculatedStats>();

    players.forEach(player => {
      statsByUserId.set(player.id, {
        id: player.id,
        username: player.username,
        // Long-term points are assigned by the trusted winner endpoint. The UI
        // must not derive them again from participant metadata.
        total: player.longterm_points ?? 0,
        exact: 0,
        outcomeHits: 0,
        goalDifferenceHits: 0,
        winnerHits: 0,
        drawHits: 0,
        currentStreak: 0,
        tempStreak: 0,
        history: []
      });
    });

    predictions.forEach(prediction => {
      const matchHome = prediction.home_score;
      const matchAway = prediction.away_score;
      const isFinished = matchHome !== null && matchAway !== null &&
        matchHome !== undefined && matchAway !== undefined;
      if (!isFinished || (excludeMatchId && prediction.match_id === excludeMatchId)) return;

      const stats = statsByUserId.get(prediction.player_id);
      if (!stats) return;

      const classifiedPoints = calculatePoints(
        prediction.predicted_home_score,
        prediction.predicted_away_score,
        matchHome,
        matchAway,
        sport
      );
      const awardedPoints = prediction.points_earned || 0;

      stats.total += awardedPoints;
      if (classifiedPoints === 5) {
        stats.exact++;
      } else if (classifiedPoints > 0) {
        stats.outcomeHits++;

        if (sport !== 'hockey') {
          const isActualDraw = matchHome === matchAway;
          const isPredictedDraw = prediction.predicted_home_score === prediction.predicted_away_score;
          const correctWinner = (
            prediction.predicted_home_score > prediction.predicted_away_score && matchHome > matchAway
          ) || (
            prediction.predicted_away_score > prediction.predicted_home_score && matchAway > matchHome
          );

          if (isActualDraw && isPredictedDraw) {
            stats.drawHits++;
          } else if (
            correctWinner &&
            prediction.predicted_home_score - prediction.predicted_away_score === matchHome - matchAway
          ) {
            stats.goalDifferenceHits++;
          } else if (correctWinner) {
            stats.winnerHits++;
          }
        }
      }

      if (classifiedPoints > 0) stats.tempStreak++;
      else stats.tempStreak = 0;
      stats.currentStreak = stats.tempStreak;
      stats.history.push({
        points: awardedPoints,
        res: classifiedPoints === 5 ? 'E' : classifiedPoints > 0 ? 'W' : 'L'
      });
    });

    return Array.from(statsByUserId.values())
      .map(({ tempStreak, ...stats }) => stats)
      .sort((a, b) => (
        b.total - a.total ||
        b.exact - a.exact ||
        b.outcomeHits - a.outcomeHits ||
        a.username.localeCompare(b.username)
      ));
  };

  const currentResults = calculateRanks();
  const previousResults = lastFinishedMatchId ? calculateRanks(lastFinishedMatchId) : currentResults;
  const currentStatsByUserId = new Map(
    currentResults.map((result, index) => [result.id, { ...result, index }])
  );
  const previousIndexByUserId = new Map(previousResults.map((result, index) => [result.id, index]));

  const finishedPredictionsByUserId = new Map<string, Prediction[]>();
  predictions.forEach(prediction => {
    if (prediction.home_score === null || prediction.away_score === null ||
      prediction.home_score === undefined || prediction.away_score === undefined) return;

    const existing = finishedPredictionsByUserId.get(prediction.player_id);
    if (existing) existing.push(prediction);
    else finishedPredictionsByUserId.set(prediction.player_id, [prediction]);
  });

  return players.map(player => {
    const stats = currentStatsByUserId.get(player.id);
    const previousIndex = previousIndexByUserId.get(player.id) ?? -1;
    const currentIndex = stats?.index ?? -1;
    const userPredictions = (finishedPredictionsByUserId.get(player.id) || [])
      .slice()
      .sort((a, b) => new Date(a.start_time_utc || 0).getTime() - new Date(b.start_time_utc || 0).getTime());

    let bestStreak = 0;
    let currentRun = 0;
    userPredictions.forEach(prediction => {
      const classifiedPoints = calculatePoints(
        prediction.predicted_home_score,
        prediction.predicted_away_score,
        prediction.home_score as number,
        prediction.away_score as number,
        sport
      );
      if (classifiedPoints > 0) currentRun++;
      else currentRun = 0;
      bestStreak = Math.max(bestStreak, currentRun);
    });

    return {
      ...player,
      total_points: stats?.total ?? (player.longterm_points ?? 0),
      exact_hits: stats?.exact ?? 0,
      outcome_hits: stats?.outcomeHits ?? 0,
      goal_difference_hits: stats?.goalDifferenceHits ?? 0,
      winner_hits: stats?.winnerHits ?? 0,
      draw_hits: stats?.drawHits ?? 0,
      currentStreak: stats?.currentStreak ?? 0,
      bestStreak,
      history: stats?.history.slice(-10) ?? [],
      rankChange: previousIndex === -1 || currentIndex === -1 ? 0 : previousIndex - currentIndex
    };
  }).sort((a, b) => (
    (b.total_points ?? 0) - (a.total_points ?? 0) ||
    (b.exact_hits ?? 0) - (a.exact_hits ?? 0) ||
    (b.outcome_hits ?? 0) - (a.outcome_hits ?? 0) ||
    a.username.localeCompare(b.username)
  ));
};
