import type { SupabaseClient } from "@supabase/supabase-js";
import { isAuthoritativePlatformAdmin } from "./platformAuthorization.ts";

const DEFAULT_TOURNAMENT_ID = "fifa-world-cup-2026";
const TOURNAMENT_WINNER_POINTS = 10;

type TournamentWinnerInput = {
  teamId?: string | null;
  tournamentId?: string | null;
  confirm?: boolean;
  previewOnly?: boolean;
  authorizationHeader?: string | null;
};

type HttpError = Error & { statusCode?: number };

const httpError = (message: string, statusCode: number): HttpError => {
  const err = new Error(message) as HttpError;
  err.statusCode = statusCode;
  return err;
};

const isTbaParticipantId = (participantId: string) =>
  participantId === "football-tba" || participantId.startsWith("football-tba-");

const isValidParticipantId = (participantId: string) => /^[a-z0-9-]+$/i.test(participantId);

const bearerTokenFromHeader = (authorizationHeader?: string | null) => {
  const header = authorizationHeader || "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;
};

export const authorizeTournamentWinnerAdmin = async (
  supabaseAdmin: SupabaseClient,
  authorizationHeader?: string | null
) => {
  const bearerToken = bearerTokenFromHeader(authorizationHeader);

  if (!bearerToken) {
    throw httpError("Chybí přihlášení administrátora.", 401);
  }

  const { data, error } = await supabaseAdmin.auth.getUser(bearerToken);
  if (error || !data.user?.id) {
    throw httpError("Neplatné přihlášení administrátora.", 401);
  }

  const adminUserId = data.user.id;
  if (!await isAuthoritativePlatformAdmin(supabaseAdmin, adminUserId)) {
    throw httpError("Pouze administrátor může vyhlásit celkového vítěze.", 403);
  }

  return adminUserId;
};

const loadValidatedChampion = async (
  supabaseAdmin: SupabaseClient,
  tournamentId: string,
  teamId: string
) => {
  if (!isValidParticipantId(teamId)) {
    throw httpError("Neplatné ID účastníka.", 400);
  }

  if (isTbaParticipantId(teamId)) {
    throw httpError("Nelze vyhlásit TBA placeholder jako vítěze turnaje.", 400);
  }

  const { data: tournament, error: tournamentError } = await supabaseAdmin
    .from("tournaments")
    .select("id, sport_id, actual_tournament_winner_id")
    .eq("id", tournamentId)
    .single();

  if (tournamentError || !tournament) {
    throw httpError("Turnaj nebyl nalezen.", 404);
  }

  const { data: participant, error: participantError } = await supabaseAdmin
    .from("participants")
    .select("id, name, short_name, flag_code, sport_id")
    .eq("id", teamId)
    .single();

  if (participantError || !participant) {
    throw httpError("Vybraný účastník neexistuje.", 404);
  }

  if (participant.sport_id !== tournament.sport_id) {
    throw httpError("Vybraný účastník nepatří ke sportu tohoto turnaje.", 400);
  }

  const { data: matchRows, error: matchError } = await supabaseAdmin
    .from("matches")
    .select("id")
    .eq("tournament_id", tournamentId)
    .or(`home_participant_id.eq.${teamId},away_participant_id.eq.${teamId}`)
    .limit(1);

  if (matchError) throw matchError;
  if (!matchRows || matchRows.length === 0) {
    throw httpError("Vybraný účastník není součástí tohoto turnaje.", 400);
  }

  return { tournament, participant };
};

const loadTournamentCompletionState = async (
  supabaseAdmin: SupabaseClient,
  tournamentId: string
) => {
  const { data: matches, error } = await supabaseAdmin
    .from("matches")
    .select("id, status, home_score, away_score")
    .eq("tournament_id", tournamentId);

  if (error) throw error;

  const rows = matches || [];
  const unresolved = rows.filter((match: any) => (
    match.status !== "finished" ||
    match.home_score === null ||
    match.away_score === null
  ));

  return {
    total_matches: rows.length,
    unresolved_matches: unresolved.length,
    is_complete: rows.length > 0 && unresolved.length === 0
  };
};

export const buildTournamentWinnerPreview = async (
  supabaseAdmin: SupabaseClient,
  input: TournamentWinnerInput
) => {
  await authorizeTournamentWinnerAdmin(supabaseAdmin, input.authorizationHeader);

  const tournamentId = input.tournamentId || DEFAULT_TOURNAMENT_ID;
  const teamId = String(input.teamId || "");

  if (!teamId) {
    throw httpError("Chybějící vítěz turnaje.", 400);
  }

  const { tournament, participant } = await loadValidatedChampion(supabaseAdmin, tournamentId, teamId);
  const completion = await loadTournamentCompletionState(supabaseAdmin, tournamentId);

  const { data: predictions, error: predictionsError } = await supabaseAdmin
    .from("longterm_predictions")
    .select("id, lobby_id, user_id, predicted_participant_id, points_earned")
    .eq("tournament_id", tournamentId)
    .eq("prediction_type", "tournament_winner");

  if (predictionsError) throw predictionsError;

  const rows = predictions || [];
  const userIds = Array.from(new Set(rows.map((row: any) => row.user_id).filter(Boolean)));
  const participantIds = Array.from(new Set(rows.map((row: any) => row.predicted_participant_id).filter(Boolean)));

  const { data: profiles } = userIds.length > 0
    ? await supabaseAdmin.from("profiles").select("id, username").in("id", userIds)
    : { data: [] };

  const { data: participants } = participantIds.length > 0
    ? await supabaseAdmin.from("participants").select("id, name, short_name").in("id", participantIds)
    : { data: [] };

  const profileMap = new Map((profiles || []).map((row: any) => [row.id, row]));
  const participantMap = new Map((participants || []).map((row: any) => [row.id, row]));

  const preview = rows.map((prediction: any) => {
    const expectedPoints = prediction.predicted_participant_id === teamId ? TOURNAMENT_WINNER_POINTS : 0;
    const predictedTeam = participantMap.get(prediction.predicted_participant_id);
    const userProfile = profileMap.get(prediction.user_id);

    return {
      prediction_id: prediction.id,
      lobby_id: prediction.lobby_id,
      user_id: prediction.user_id,
      username: userProfile?.username || "Uživatel",
      predicted_participant_id: prediction.predicted_participant_id,
      predicted_team: predictedTeam?.name || prediction.predicted_participant_id,
      before_points: prediction.points_earned || 0,
      after_points: expectedPoints,
      would_change: (prediction.points_earned || 0) !== expectedPoints
    };
  });

  return {
    tournament_id: tournamentId,
    selected_champion: {
      id: participant.id,
      name: participant.name,
      short_name: participant.short_name,
      flag_code: participant.flag_code
    },
    current_champion_id: tournament.actual_tournament_winner_id || null,
    summary: {
      longterm_predictions: preview.length,
      users_receiving_10: preview.filter((row) => row.after_points === TOURNAMENT_WINNER_POINTS).length,
      users_receiving_0: preview.filter((row) => row.after_points === 0).length,
      rows_that_would_change: preview.filter((row) => row.would_change).length,
      total_matches: completion.total_matches,
      unresolved_matches: completion.unresolved_matches,
      tournament_complete: completion.is_complete
    },
    preview
  };
};

export const executeTournamentWinnerConfirmation = async (
  supabaseAdmin: SupabaseClient,
  input: TournamentWinnerInput
) => {
  const preview = await buildTournamentWinnerPreview(supabaseAdmin, input);

  if (input.previewOnly) {
    return {
      statusCode: 200,
      body: {
        success: true,
        mode: "preview",
        wrote_to_db: false,
        ...preview
      }
    };
  }

  if (!input.confirm) {
    return {
      statusCode: 400,
      body: {
        success: false,
        mode: "confirmation_required",
        wrote_to_db: false,
        error: "Vyhlášení vítěze vyžaduje explicitní potvrzení.",
        ...preview
      }
    };
  }

  if (!preview.summary.tournament_complete) {
    return {
      statusCode: 409,
      body: {
        success: false,
        mode: "blocked_unresolved_matches",
        wrote_to_db: false,
        error: "Vítěze turnaje lze potvrdit až po dohrání a zadání skóre všech zápasů.",
        ...preview
      }
    };
  }

  const now = new Date().toISOString();

  const { error: tournamentError } = await supabaseAdmin
    .from("tournaments")
    .update({
      actual_tournament_winner_id: preview.selected_champion.id
    })
    .eq("id", preview.tournament_id);

  if (tournamentError) throw tournamentError;

  const { data: winnerRows, error: winnerRowsError } = await supabaseAdmin
    .from("longterm_predictions")
    .update({
      points_earned: TOURNAMENT_WINNER_POINTS,
      updated_at: now
    })
    .eq("tournament_id", preview.tournament_id)
    .eq("prediction_type", "tournament_winner")
    .eq("predicted_participant_id", preview.selected_champion.id)
    .select("id");

  if (winnerRowsError) throw winnerRowsError;

  const { data: otherRows, error: otherRowsError } = await supabaseAdmin
    .from("longterm_predictions")
    .update({
      points_earned: 0,
      updated_at: now
    })
    .eq("tournament_id", preview.tournament_id)
    .eq("prediction_type", "tournament_winner")
    .neq("predicted_participant_id", preview.selected_champion.id)
    .select("id");

  if (otherRowsError) throw otherRowsError;

  const predictionsUpdated = (winnerRows?.length || 0) + (otherRows?.length || 0);

  return {
    statusCode: 200,
    body: {
      success: true,
      mode: "write",
      wrote_to_db: true,
      tournaments_updated: 1,
      longterm_predictions_updated: predictionsUpdated,
      ...preview
    }
  };
};

export const tournamentWinnerErrorResponse = (err: any) => ({
  statusCode: err?.statusCode || 500,
  body: {
    success: false,
    wrote_to_db: false,
    error: err?.message || "Chyba při nastavení vítěze turnaje."
  }
});
