import { SupabaseClient } from "@supabase/supabase-js";
import { fetchTheSportsDbFixturesForLocalMatches } from "./resultProviders/theSportsDb.ts";
import type { TheSportsDbFixtureSummary } from "./resultProviders/theSportsDb.ts";
import { calculatePoints } from "../../src/lib/scoring.ts";

const WORLD_CUP_TOURNAMENT_ID = "fifa-world-cup-2026";

export type LocalMatch = {
  id: string;
  tournament_id: string;
  home_participant_id: string;
  away_participant_id: string;
  start_time_utc: string;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
  stage?: string | null;
  provider_name?: string | null;
  provider_match_id?: string | number | null;
};

export type Participant = {
  id: string;
  name?: string | null;
  short_name?: string | null;
};

type ApiFixtureSummary = {
  id: string | number | null;
  homeName: string;
  awayName: string;
  kickoffUtc: string | null;
  statusShort: string | null;
  statusLong: string | null;
  rawStatus?: string | null;
  score: {
    home: number | null;
    away: number | null;
    source: string;
  };
};

type MappingResult = {
  quality: "exact match" | "likely match" | "no match" | "conflict";
  match: LocalMatch | null;
  reason: string;
  score: number;
  candidates: Array<{
    match_id: string;
    quality: "exact match" | "likely match";
    score: number;
    reason: string;
    local_home: string;
    local_away: string;
    local_start_time_utc: string;
    local_provider_match_id: string | number | null;
  }>;
};

type SyncRequest = {
  provider: string;
  from?: string | null;
  to?: string | null;
  tournamentId?: string | null;
};

const utcDate = (date: Date) => date.toISOString().slice(0, 10);

const resolveDateWindow = (request: SyncRequest) => {
  if (request.from || request.to) {
    return {
      from: request.from || null,
      to: request.to || null,
      source: "explicit" as const
    };
  }

  const now = new Date();
  const fromDate = new Date(now);
  fromDate.setUTCDate(fromDate.getUTCDate() - 1);

  const toDate = new Date(now);
  toDate.setUTCDate(toDate.getUTCDate() + 1);

  return {
    from: utcDate(fromDate),
    to: utcDate(toDate),
    source: "default_dynamic" as const
  };
};

const normalizeName = (value?: string | null) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const TEAM_NAME_CANONICAL_ALIASES: Record<string, string> = {
  "bosnia herzegovina": "bosnia and herzegovina"
};

const canonicalName = (value?: string | null) => {
  const normalized = normalizeName(value);
  return TEAM_NAME_CANONICAL_ALIASES[normalized] || normalized;
};

const namesMatch = (apiName: string, participant?: Participant | null) => {
  const api = canonicalName(apiName);
  const candidates = [participant?.name, participant?.short_name, participant?.id]
    .map(canonicalName)
    .filter(Boolean);

  return candidates.some(candidate =>
    candidate === api || candidate.includes(api) || api.includes(candidate)
  );
};

const minutesBetween = (a?: string | null, b?: string | null) => {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (Number.isNaN(aMs) || Number.isNaN(bMs)) return Number.POSITIVE_INFINITY;
  return Math.abs(aMs - bMs) / 60000;
};

const describeLocalTeam = (participantId: string, participants: Map<string, Participant>) => {
  const participant = participants.get(participantId);
  return participant?.name || participant?.short_name || participantId;
};

const isGroupStageMatch = (match?: LocalMatch | null) =>
  Boolean(match?.stage && /^Group\b/i.test(match.stage));

const isKnownKnockoutStage = (stage: string) =>
  /^(Round of 32|Round of 16|Quarterfinal|Semifinal|Third place|Final)$/i.test(stage.trim());

const isTbaValue = (value?: string | null) =>
  normalizeName(value) === "tba" || String(value || "").trim().toLowerCase() === "football-tba";

export const getResultSyncWriteEligibility = (
  match: LocalMatch | null | undefined,
  participants: Map<string, Participant>
): { eligible: boolean; reason: string } => {
  if (!match) {
    return { eligible: false, reason: "Write guard: no local match mapped." };
  }

  const stage = String(match.stage || "").trim();
  if (!stage) {
    return { eligible: false, reason: "Write guard: local match stage is unknown." };
  }

  if (!isGroupStageMatch(match) && !isKnownKnockoutStage(stage)) {
    return { eligible: false, reason: `Write guard: unsupported local match stage ${stage}.` };
  }

  if (isTbaValue(match.home_participant_id) || isTbaValue(match.away_participant_id)) {
    return { eligible: false, reason: "Write guard: local match still has TBA participant id." };
  }

  const localHome = describeLocalTeam(match.home_participant_id, participants);
  const localAway = describeLocalTeam(match.away_participant_id, participants);
  if (isTbaValue(localHome) || isTbaValue(localAway)) {
    return { eligible: false, reason: "Write guard: local match still has TBA team name." };
  }

  return { eligible: true, reason: "Write guard: local match stage and teams are eligible." };
};

const findMappingCandidate = (
  apiFixture: ApiFixtureSummary,
  localMatches: LocalMatch[],
  participants: Map<string, Participant>
): MappingResult => {
  if (!apiFixture.id) {
    return { quality: "no match", match: null, reason: "API fixture has no fixture.id.", score: 0, candidates: [] };
  }

  const providerMatch = localMatches.find(match => String(match.provider_match_id || "") === String(apiFixture.id));
  if (providerMatch) {
    return {
      quality: "exact match",
      match: providerMatch,
      reason: "Matched by local provider_match_id.",
      score: 100,
      candidates: []
    };
  }

  const candidates = localMatches
    .map(match => {
      const homeParticipant = participants.get(match.home_participant_id);
      const awayParticipant = participants.get(match.away_participant_id);
      const timeDeltaMinutes = minutesBetween(apiFixture.kickoffUtc, match.start_time_utc);
      const homeMatches = namesMatch(apiFixture.homeName, homeParticipant);
      const awayMatches = namesMatch(apiFixture.awayName, awayParticipant);
      const swappedHomeMatches = namesMatch(apiFixture.homeName, awayParticipant);
      const swappedAwayMatches = namesMatch(apiFixture.awayName, homeParticipant);
      const sameTeams = homeMatches && awayMatches;
      const swappedTeams = swappedHomeMatches && swappedAwayMatches;
      const timeScore = timeDeltaMinutes <= 5 ? 60 : timeDeltaMinutes <= 60 ? 35 : timeDeltaMinutes <= 180 ? 15 : 0;
      const teamScore = sameTeams ? 40 : swappedTeams ? 10 : (homeMatches || awayMatches ? 15 : 0);
      const score = timeScore + teamScore;
      let quality: "exact match" | "likely match" | null = null;

      if (sameTeams && timeDeltaMinutes <= 5) quality = "exact match";
      else if (sameTeams && timeDeltaMinutes <= 180) quality = "likely match";
      else if (score >= 60) quality = "likely match";

      return {
        match,
        quality,
        score,
        reason: `time_delta_minutes=${Number.isFinite(timeDeltaMinutes) ? Math.round(timeDeltaMinutes) : "unknown"}; home_match=${homeMatches}; away_match=${awayMatches}; swapped_teams=${swappedTeams}`,
        local_home: describeLocalTeam(match.home_participant_id, participants),
        local_away: describeLocalTeam(match.away_participant_id, participants),
        local_start_time_utc: match.start_time_utc,
        local_provider_match_id: match.provider_match_id ?? null
      };
    })
    .filter(candidate => candidate.quality !== null)
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    return { quality: "no match", match: null, reason: "No local match had close kickoff time and matching home/away participants.", score: 0, candidates: [] };
  }

  const top = candidates[0];
  const tied = candidates.filter(candidate => candidate.score === top.score);
  if (tied.length > 1) {
    return {
      quality: "conflict",
      match: null,
      reason: "Multiple local matches have the same best mapping score.",
      score: top.score,
      candidates: tied.map(candidate => ({
        match_id: candidate.match.id,
        quality: candidate.quality!,
        score: candidate.score,
        reason: candidate.reason,
        local_home: candidate.local_home,
        local_away: candidate.local_away,
        local_start_time_utc: candidate.local_start_time_utc,
        local_provider_match_id: candidate.local_provider_match_id
      }))
    };
  }

  return {
    quality: top.quality!,
    match: top.match,
    reason: top.reason,
    score: top.score,
    candidates: candidates.slice(0, 3).map(candidate => ({
      match_id: candidate.match.id,
      quality: candidate.quality!,
      score: candidate.score,
      reason: candidate.reason,
      local_home: candidate.local_home,
      local_away: candidate.local_away,
      local_start_time_utc: candidate.local_start_time_utc,
      local_provider_match_id: candidate.local_provider_match_id
    }))
  };
};

const fetchWorldCupMatchesReadOnly = async (supabaseAdmin: SupabaseClient) => {
  const baseSelect = "id,tournament_id,home_participant_id,away_participant_id,start_time_utc,home_score,away_score,status,stage";
  const providerSelect = `${baseSelect},provider_name,provider_match_id`;

  const withProvider = await supabaseAdmin
    .from("matches")
    .select(providerSelect)
    .eq("tournament_id", WORLD_CUP_TOURNAMENT_ID)
    .order("start_time_utc", { ascending: true });

  if (!withProvider.error) {
    return {
      matches: (withProvider.data || []) as LocalMatch[],
      providerColumnsAvailable: true,
      providerColumnWarning: null as string | null
    };
  }

  const fallback = await supabaseAdmin
    .from("matches")
    .select(baseSelect)
    .eq("tournament_id", WORLD_CUP_TOURNAMENT_ID)
    .order("start_time_utc", { ascending: true });

  if (fallback.error) throw fallback.error;

  return {
    matches: (fallback.data || []).map(match => ({ ...match, provider_name: null, provider_match_id: null })) as LocalMatch[],
    providerColumnsAvailable: false,
    providerColumnWarning: withProvider.error.message
  };
};

async function loadWorldCupContext(supabaseAdmin: SupabaseClient) {
  const [{ matches, providerColumnsAvailable, providerColumnWarning }, participantsResult] = await Promise.all([
    fetchWorldCupMatchesReadOnly(supabaseAdmin),
    supabaseAdmin.from("participants").select("id,name,short_name")
  ]);

  if (participantsResult.error) throw participantsResult.error;

  const participants = new Map<string, Participant>();
  (participantsResult.data || []).forEach(participant => participants.set(participant.id, participant));

  return { matches, participants, providerColumnsAvailable, providerColumnWarning };
}

export async function applyMatchResult({
  supabaseAdmin,
  matchId,
  homeScore,
  awayScore,
  source,
  actor
}: {
  supabaseAdmin: SupabaseClient;
  matchId: string;
  homeScore: number;
  awayScore: number;
  source?: string;
  actor?: string;
}): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  void source;
  void actor;

  const { data: match, error: mErr } = await supabaseAdmin
    .from("matches")
    .select("tournament_id")
    .eq("id", matchId)
    .single();

  if (mErr || !match) {
    return { statusCode: 404, body: { error: "Zapas nenalezen v Supabase." } };
  }

  const sport = match.tournament_id === "ms-hockey-2026" ? "hockey" : "football";

  if (sport === "hockey" && homeScore === awayScore) {
    return { statusCode: 400, body: { error: "V hokeji neni remiza povolena. Vysledek po prodlouzeni nebo najezdech musi urcit viteze!" } };
  }

  const { data: predictions, error: predsErr } = await supabaseAdmin
    .from("predictions")
    .select("*")
    .eq("match_id", matchId);

  if (predsErr) throw predsErr;

  const previousPoints = new Map<string, number>();
  for (const pred of predictions || []) {
    previousPoints.set(`${pred.user_id}:${pred.lobby_id}`, pred.points_earned || 0);
  }

  const rollbackPredictionPoints = async () => {
    for (const pred of predictions || []) {
      const previous = previousPoints.get(`${pred.user_id}:${pred.lobby_id}`) || 0;
      const { error: rollbackErr } = await supabaseAdmin
        .from("predictions")
        .update({ points_earned: previous })
        .eq("user_id", pred.user_id)
        .eq("lobby_id", pred.lobby_id)
        .eq("match_id", matchId);

      if (rollbackErr) {
        console.error(`Rollback error for prediction user: ${pred.user_id}`, rollbackErr);
      }
    }
  };

  const recalculationFailures: Array<{ user_id: string; lobby_id: string; message: string }> = [];
  let updatedPredictionsCount = 0;

  for (const pred of predictions || []) {
    const points = calculatePoints(
      pred.predicted_home_score,
      pred.predicted_away_score,
      homeScore,
      awayScore,
      sport
    );

    const { data: updatedPredictionRows, error: updatePredErr } = await supabaseAdmin
      .from("predictions")
      .update({ points_earned: points })
      .eq("user_id", pred.user_id)
      .eq("lobby_id", pred.lobby_id)
      .eq("match_id", matchId)
      .select("user_id,lobby_id,match_id,points_earned");

    if (updatePredErr || !updatedPredictionRows || updatedPredictionRows.length !== 1) {
      recalculationFailures.push({
        user_id: pred.user_id,
        lobby_id: pred.lobby_id,
        message: updatePredErr?.message || `Expected 1 updated row, got ${updatedPredictionRows?.length ?? 0}`
      });
    } else {
      updatedPredictionsCount += 1;
    }
  }

  if (recalculationFailures.length > 0) {
    console.error("Prediction recalculation failures:", recalculationFailures);
    await rollbackPredictionPoints();
    return {
      statusCode: 500,
      body: {
        error: "Nepodarilo se prepocitat vsechny tipy, vysledek zapasu nebyl ulozen.",
        match_id: matchId,
        updated_predictions_count: updatedPredictionsCount,
        expected_predictions_count: predictions?.length || 0,
        result: { home_score: homeScore, away_score: awayScore },
        status: "not_saved",
        failures: recalculationFailures
      }
    };
  }

  const { data: verifiedPredictions, error: verifyErr } = await supabaseAdmin
    .from("predictions")
    .select("user_id,lobby_id,predicted_home_score,predicted_away_score,points_earned")
    .eq("match_id", matchId);

  if (verifyErr) throw verifyErr;

  const stalePredictions = (verifiedPredictions || []).filter(pred => {
    const expectedPoints = calculatePoints(
      pred.predicted_home_score,
      pred.predicted_away_score,
      homeScore,
      awayScore,
      sport
    );
    return pred.points_earned !== expectedPoints;
  });

  if (stalePredictions.length > 0) {
    console.error("Stale points detected after recalculation:", stalePredictions);
    await rollbackPredictionPoints();
    return {
      statusCode: 500,
      body: {
        error: "Po prepoctu zustaly nesedici body u nekterych tipu, vysledek zapasu nebyl ulozen.",
        match_id: matchId,
        updated_predictions_count: updatedPredictionsCount,
        expected_predictions_count: predictions?.length || 0,
        result: { home_score: homeScore, away_score: awayScore },
        status: "not_saved",
        stale_predictions_count: stalePredictions.length,
        stale_predictions: stalePredictions.map(pred => ({
          user_id: pred.user_id,
          lobby_id: pred.lobby_id,
          points_earned: pred.points_earned,
          expected_points: calculatePoints(
            pred.predicted_home_score,
            pred.predicted_away_score,
            homeScore,
            awayScore,
            sport
          )
        }))
      }
    };
  }

  const { error: matchUpdateErr } = await supabaseAdmin
    .from("matches")
    .update({
      home_score: homeScore,
      away_score: awayScore,
      status: "finished",
      updated_at: new Date().toISOString()
    })
    .eq("id", matchId);

  if (matchUpdateErr) {
    await rollbackPredictionPoints();
    throw matchUpdateErr;
  }

  return {
    statusCode: 200,
    body: {
      success: true,
      match_id: matchId,
      updated_predictions_count: updatedPredictionsCount,
      expected_predictions_count: predictions?.length || 0,
      result: { home_score: homeScore, away_score: awayScore },
      status: "finished"
    }
  };
}

const hasProviderScore = (apiFixture: TheSportsDbFixtureSummary) =>
  Number.isInteger(apiFixture.score.home) && Number.isInteger(apiFixture.score.away);

export const getProviderResultStatus = (apiFixture: TheSportsDbFixtureSummary) => {
  const status = apiFixture.statusShort || "unknown";
  const hasScore = hasProviderScore(apiFixture);

  if (status === "FT") {
    return { isFinished: true, hasScore, conflictReason: null as string | null, skipReason: null as string | null };
  }

  if (status === "AP") {
    if (!hasScore) {
      return {
        isFinished: false,
        hasScore,
        conflictReason: "TheSportsDB AP fixture is missing valid intHomeScoreExtra/intAwayScoreExtra final score.",
        skipReason: null as string | null
      };
    }

    if (apiFixture.score.home === apiFixture.score.away) {
      return {
        isFinished: false,
        hasScore,
        conflictReason: "TheSportsDB AP fixture final score is still a draw; refusing playoff draw write.",
        skipReason: null as string | null
      };
    }

    return { isFinished: true, hasScore, conflictReason: null as string | null, skipReason: null as string | null };
  }

  return {
    isFinished: false,
    hasScore,
    conflictReason: null as string | null,
    skipReason: `TheSportsDB status ${status} is not FT or valid AP.`
  };
};

function buildTheSportsDbItem(apiFixture: TheSportsDbFixtureSummary, localMatches: LocalMatch[], participants: Map<string, Participant>) {
  const mapping = findMappingCandidate(apiFixture, localMatches, participants);
  const localMatch = mapping.match;
  const providerResultStatus = getProviderResultStatus(apiFixture);

  let action: "mapping_candidate" | "would_update" | "skip_not_finished" | "skip_already_finished" | "conflict" | "unmapped" = "mapping_candidate";
  let reason = mapping.reason;

  if (mapping.quality === "conflict") {
    action = "conflict";
  } else if (!localMatch) {
    action = "unmapped";
  } else if (providerResultStatus.conflictReason) {
    action = "conflict";
    reason = providerResultStatus.conflictReason;
  } else if (!providerResultStatus.isFinished) {
    action = "skip_not_finished";
    reason = providerResultStatus.skipReason || `TheSportsDB status ${apiFixture.statusShort || "unknown"} is not FT.`;
  } else if (localMatch.status === "finished" || (localMatch.home_score !== null && localMatch.away_score !== null)) {
    action = "skip_already_finished";
    reason = "Local match already has a finished status or stored score; dry-run will not overwrite it.";
  } else if (!providerResultStatus.hasScore) {
    action = "conflict";
    reason = "TheSportsDB fixture is FT but final score is missing.";
  } else if (mapping.quality === "exact match" || mapping.quality === "likely match") {
    action = "would_update";
    reason = "Dry-run only: finished TheSportsDB event maps to an unfinished local match and would be eligible for the existing result flow later.";
  }

  return {
    api_fixture_id: apiFixture.id,
    provider_match_id: apiFixture.id,
    provider: "thesportsdb",
    api_home: apiFixture.homeName,
    api_away: apiFixture.awayName,
    api_kickoff_utc: apiFixture.kickoffUtc,
    api_status: {
      short: apiFixture.statusShort,
      long: apiFixture.statusLong,
      raw: apiFixture.rawStatus,
      is_finished: providerResultStatus.isFinished
    },
    api_score: apiFixture.score,
    mapping_quality: mapping.quality,
    mapping_score: mapping.score,
    matched_local_match_id: localMatch?.id || null,
    local_provider_name: localMatch?.provider_name ?? null,
    local_provider_match_id: localMatch?.provider_match_id ?? null,
    local_home: localMatch ? describeLocalTeam(localMatch.home_participant_id, participants) : null,
    local_away: localMatch ? describeLocalTeam(localMatch.away_participant_id, participants) : null,
    local_stage: localMatch?.stage || null,
    local_start_time_utc: localMatch?.start_time_utc || null,
    local_status: localMatch?.status || null,
    local_score: localMatch ? { home: localMatch.home_score, away: localMatch.away_score } : null,
    action,
    reason,
    candidates: mapping.candidates
  };
}

function countByAction(items: Array<{ action: string }>) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item.action] = (acc[item.action] || 0) + 1;
    return acc;
  }, {});
}

export async function buildTheSportsDbDryRunResponse(supabaseAdmin: SupabaseClient, request: SyncRequest) {
  if (request.provider !== "thesportsdb") {
    return { statusCode: 400, body: { error: `Unsupported dry-run provider: ${request.provider || "missing"}` } };
  }

  const tournamentId = String(request.tournamentId || WORLD_CUP_TOURNAMENT_ID);
  if (tournamentId !== WORLD_CUP_TOURNAMENT_ID) {
    return { statusCode: 400, body: { error: `Unsupported tournamentId for this dry-run: ${tournamentId}` } };
  }

  const dateWindow = resolveDateWindow(request);
  const { matches, participants, providerColumnsAvailable, providerColumnWarning } = await loadWorldCupContext(supabaseAdmin);
  const providerResult = await fetchTheSportsDbFixturesForLocalMatches({
    matches,
    participants,
    from: dateWindow.from,
    to: dateWindow.to
  });

  const items: Array<Record<string, any> & { action: string; mapping_quality: string }> =
    providerResult.fixtures.map(apiFixture => buildTheSportsDbItem(apiFixture, matches, participants));
  providerResult.misses.forEach(miss => {
    items.push({
      api_fixture_id: null,
      provider_match_id: null,
      provider: "thesportsdb",
      api_home: null,
      api_away: null,
      api_kickoff_utc: null,
      api_status: { short: null, long: null, raw: null, is_finished: false },
      api_score: { home: null, away: null, source: "not_found" },
      mapping_quality: "no match",
      mapping_score: 0,
      matched_local_match_id: miss.localMatch.id,
      local_provider_name: miss.localMatch.provider_name ?? null,
      local_provider_match_id: miss.localMatch.provider_match_id ?? null,
      local_home: miss.localHome,
      local_away: miss.localAway,
      local_stage: miss.localMatch.stage || null,
      local_start_time_utc: miss.localMatch.start_time_utc,
      local_status: miss.localMatch.status,
      local_score: { home: miss.localMatch.home_score, away: miss.localMatch.away_score },
      action: "unmapped",
      reason: miss.reason,
      candidates: [],
      provider_requests: miss.requests
    });
  });

  const counts = countByAction(items);

  return {
    statusCode: 200,
    body: {
      success: true,
      mode: "dry_run",
      dry_run: true,
      wrote_to_db: false,
      provider: "thesportsdb",
      requested_at: new Date().toISOString(),
      tournament_id: tournamentId,
      api_request: {
        endpoint: "searchfilename.php + searchevents.php",
        league: "4429",
        season: "2026",
        from: dateWindow.from,
        to: dateWindow.to,
        date_window_source: dateWindow.source,
        local_matches_in_window: providerResult.local_matches_in_window,
        provider_requests_count: providerResult.requests.length,
        provider_requests_failed: providerResult.provider_requests_failed,
        rate_limited_count: providerResult.rate_limited_count
      },
      local_schema: {
        provider_columns_available: providerColumnsAvailable,
        provider_column_warning: providerColumnWarning
      },
      summary: {
        api_fixtures_received: providerResult.fixtures.length,
        provider_matches_received: providerResult.fixtures.length,
        local_matches_checked: matches.length,
        local_matches_in_window: providerResult.local_matches_in_window,
        exact_matches: items.filter(item => item.mapping_quality === "exact match").length,
        likely_matches: items.filter(item => item.mapping_quality === "likely match").length,
        conflicts: counts.conflict || 0,
        unmapped: counts.unmapped || 0,
        would_update: counts.would_update || 0,
        skip_not_finished: counts.skip_not_finished || 0,
        skip_already_finished: counts.skip_already_finished || 0,
        mapping_candidates: counts.mapping_candidate || 0,
        provider_requests_count: providerResult.requests.length,
        provider_requests_failed: providerResult.provider_requests_failed,
        rate_limited_count: providerResult.rate_limited_count
      },
      safety: {
        db_writes_performed: false,
        matches_updated: 0,
        predictions_updated: 0,
        points_updated: 0,
        profiles_updated: 0,
        write_mode_endpoint_created: false
      },
      provider_error: providerResult.provider_error,
      provider_requests: providerResult.requests,
      items
    }
  };
}

export async function executeTheSportsDbWriteSync(supabaseAdmin: SupabaseClient, request: SyncRequest) {
  if (request.provider !== "thesportsdb") {
    return { statusCode: 400, body: { error: `Unsupported write provider: ${request.provider || "missing"}` } };
  }

  const tournamentId = String(request.tournamentId || WORLD_CUP_TOURNAMENT_ID);
  if (tournamentId !== WORLD_CUP_TOURNAMENT_ID) {
    return { statusCode: 400, body: { error: `Unsupported tournamentId for result sync: ${tournamentId}` } };
  }

  if (process.env.RESULT_SYNC_WRITE_ENABLED !== "true") {
    const dateWindow = resolveDateWindow(request);
    return {
      statusCode: 403,
      body: {
        success: false,
        mode: "write",
        provider: "thesportsdb",
        write_enabled: false,
        wrote_to_db: false,
        error: "Result sync write mode is disabled. Set RESULT_SYNC_WRITE_ENABLED=true to allow guarded writes.",
        api_request: {
          provider: "thesportsdb",
          from: dateWindow.from,
          to: dateWindow.to,
          date_window_source: dateWindow.source
        },
        summary: {
          provider_matches_received: 0,
          local_matches_checked: 0,
          local_matches_in_window: 0,
          updated: 0,
          skipped: 0,
          conflicts: 0,
          failed: 0
        },
        safety: {
          db_writes_performed: false,
          matches_updated: 0,
          predictions_updated: 0,
          points_updated: 0,
          profiles_updated: 0,
          direct_prediction_writes: false,
          direct_points_writes: false
        },
        items: []
      }
    };
  }

  const dateWindow = resolveDateWindow(request);
  const { matches, participants } = await loadWorldCupContext(supabaseAdmin);
  const providerResult = await fetchTheSportsDbFixturesForLocalMatches({
    matches,
    participants,
    from: dateWindow.from,
    to: dateWindow.to
  });

  const items: Array<Record<string, unknown> & { action: "updated" | "skipped" | "conflict" | "failed" }> = [];
  let matchesUpdated = 0;
  let predictionsUpdated = 0;
  let failed = 0;

  for (const apiFixture of providerResult.fixtures) {
    const mapping = findMappingCandidate(apiFixture, matches, participants);
    const localMatch = mapping.match;
    const providerResultStatus = getProviderResultStatus(apiFixture);
    const baseItem = buildTheSportsDbItem(apiFixture, matches, participants);

    if (mapping.quality === "conflict") {
      items.push({ ...baseItem, action: "conflict", reason: mapping.reason });
      continue;
    }
    if (!localMatch) {
      items.push({ ...baseItem, action: "conflict", reason: "No local match mapped for provider event." });
      continue;
    }
    if (mapping.quality !== "exact match") {
      items.push({ ...baseItem, action: "skipped", reason: "Write guard: mapping is not exact match." });
      continue;
    }
    const localEligibility = getResultSyncWriteEligibility(localMatch, participants);
    if (!localEligibility.eligible) {
      items.push({ ...baseItem, action: "skipped", reason: localEligibility.reason });
      continue;
    }
    if (providerResultStatus.conflictReason) {
      items.push({ ...baseItem, action: "conflict", reason: `Write guard: ${providerResultStatus.conflictReason}` });
      continue;
    }
    if (!providerResultStatus.isFinished) {
      items.push({ ...baseItem, action: "skipped", reason: `Write guard: ${providerResultStatus.skipReason || `TheSportsDB status ${apiFixture.statusShort || "unknown"} is not FT or valid AP.`}` });
      continue;
    }
    if (!providerResultStatus.hasScore) {
      items.push({ ...baseItem, action: "conflict", reason: "Write guard: provider score is missing or invalid." });
      continue;
    }
    if (localMatch.status === "finished" || (localMatch.home_score !== null && localMatch.away_score !== null)) {
      items.push({ ...baseItem, action: "skipped", reason: "Write guard: local match already has finished status or stored score." });
      continue;
    }

    const result = await applyMatchResult({
      supabaseAdmin,
      matchId: localMatch.id,
      homeScore: apiFixture.score.home!,
      awayScore: apiFixture.score.away!,
      source: "thesportsdb",
      actor: "result-sync"
    });

    if (result.statusCode === 200) {
      matchesUpdated += 1;
      const updatedPredictions = Number(result.body.updated_predictions_count || 0);
      predictionsUpdated += Number.isFinite(updatedPredictions) ? updatedPredictions : 0;
      items.push({ ...baseItem, action: "updated", result: result.body });
    } else {
      failed += 1;
      items.push({ ...baseItem, action: "failed", reason: "applyMatchResult rejected the result.", result: result.body });
    }
  }

  providerResult.misses.forEach(miss => {
    items.push({
      action: "conflict",
      provider: "thesportsdb",
      provider_match_id: null,
      matched_local_match_id: miss.localMatch.id,
      local_home: miss.localHome,
      local_away: miss.localAway,
      local_stage: miss.localMatch.stage || null,
      local_start_time_utc: miss.localMatch.start_time_utc,
      local_status: miss.localMatch.status,
      reason: miss.reason,
      provider_requests: miss.requests
    });
  });

  const counts = countByAction(items);

  return {
    statusCode: 200,
    body: {
      success: failed === 0,
      mode: "write",
      provider: "thesportsdb",
      write_enabled: true,
      wrote_to_db: matchesUpdated > 0,
      requested_at: new Date().toISOString(),
      tournament_id: tournamentId,
      api_request: {
        endpoint: "searchfilename.php + searchevents.php",
        league: "4429",
        season: "2026",
          from: dateWindow.from,
          to: dateWindow.to,
          date_window_source: dateWindow.source,
          local_matches_in_window: providerResult.local_matches_in_window,
          provider_requests_count: providerResult.requests.length,
          provider_requests_failed: providerResult.provider_requests_failed,
          rate_limited_count: providerResult.rate_limited_count
        },
        summary: {
          provider_matches_received: providerResult.fixtures.length,
          local_matches_checked: matches.length,
          local_matches_in_window: providerResult.local_matches_in_window,
          updated: counts.updated || 0,
          skipped: counts.skipped || 0,
          conflicts: counts.conflict || 0,
          failed: counts.failed || 0,
          provider_requests_count: providerResult.requests.length,
          provider_requests_failed: providerResult.provider_requests_failed,
          rate_limited_count: providerResult.rate_limited_count
        },
      safety: {
        db_writes_performed: matchesUpdated > 0,
        matches_updated: matchesUpdated,
        predictions_updated: predictionsUpdated,
        points_updated: predictionsUpdated,
        profiles_updated: 0,
        direct_prediction_writes: false,
        direct_points_writes: false
        },
        provider_error: providerResult.provider_error,
        items
      }
  };
}
