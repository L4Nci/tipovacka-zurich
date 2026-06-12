import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cookieParser from "cookie-parser";
import cors from "cors";
import "dotenv/config";
import { getSupabaseAdmin } from "./server/lib/supabaseAdmin.ts";
import { fetchTheSportsDbFixturesForLocalMatches } from "./server/lib/resultProviders/theSportsDb.ts";
import { calculatePoints } from "./src/lib/scoring.ts";


const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
const API_FOOTBALL_WORLD_CUP_LEAGUE = "1";
const API_FOOTBALL_WORLD_CUP_SEASON = "2026";
const WORLD_CUP_TOURNAMENT_ID = "fifa-world-cup-2026";
const FINISHED_API_STATUSES = new Set(["FT", "AET", "PEN"]);

type LocalMatch = {
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

type Participant = {
  id: string;
  name?: string | null;
  short_name?: string | null;
};

type ApiFootballFixture = {
  fixture?: {
    id?: number;
    date?: string;
    status?: {
      short?: string;
      long?: string;
    };
  };
  teams?: {
    home?: { name?: string };
    away?: { name?: string };
  };
  goals?: {
    home?: number | null;
    away?: number | null;
  };
  score?: {
    fulltime?: { home?: number | null; away?: number | null };
    extratime?: { home?: number | null; away?: number | null };
    penalty?: { home?: number | null; away?: number | null };
  };
};

type ApiFixtureSummary = {
  id: string | number | null;
  provider?: string;
  homeName: string;
  awayName: string;
  kickoffUtc: string | null;
  statusShort: string | null;
  statusLong: string | null;
  rawStatus?: string | null;
  source?: string;
  score: {
    home: number | null;
    away: number | null;
    source: string;
    fulltime?: { home: number | null; away: number | null };
    extratime?: { home: number | null; away: number | null };
    penalty?: { home: number | null; away: number | null };
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

const normalizeApiFixture = (fixture: ApiFootballFixture): ApiFixtureSummary => {
  const statusShort = fixture.fixture?.status?.short || null;
  const fulltime = fixture.score?.fulltime || { home: null, away: null };
  const extratime = fixture.score?.extratime || { home: null, away: null };
  const penalty = fixture.score?.penalty || { home: null, away: null };

  let home = fixture.goals?.home ?? fulltime.home ?? null;
  let away = fixture.goals?.away ?? fulltime.away ?? null;
  let source = fixture.goals?.home !== undefined || fixture.goals?.away !== undefined ? "goals" : "score.fulltime";

  if (statusShort === "PEN" && penalty.home !== null && penalty.home !== undefined && penalty.away !== null && penalty.away !== undefined) {
    const baseHome = home ?? 0;
    const baseAway = away ?? 0;
    home = baseHome + penalty.home;
    away = baseAway + penalty.away;
    source = "goals_plus_penalty";
  }

  return {
    id: fixture.fixture?.id ?? null,
    homeName: fixture.teams?.home?.name || "",
    awayName: fixture.teams?.away?.name || "",
    kickoffUtc: fixture.fixture?.date || null,
    statusShort,
    statusLong: fixture.fixture?.status?.long || null,
    score: {
      home,
      away,
      source,
      fulltime: { home: fulltime.home ?? null, away: fulltime.away ?? null },
      extratime: { home: extratime.home ?? null, away: extratime.away ?? null },
      penalty: { home: penalty.home ?? null, away: penalty.away ?? null }
    }
  };
};

const describeLocalTeam = (participantId: string, participants: Map<string, Participant>) => {
  const participant = participants.get(participantId);
  return participant?.name || participant?.short_name || participantId;
};

const isGroupStageMatch = (match?: LocalMatch | null) =>
  Boolean(match?.stage && /^Group\b/i.test(match.stage));

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

const fetchWorldCupMatchesReadOnly = async (supabaseAdmin: ReturnType<typeof getSupabaseAdmin>) => {
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

async function applyMatchResult({
  supabaseAdmin,
  matchId,
  homeScore,
  awayScore,
  source,
  actor
}: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
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
    return { statusCode: 404, body: { error: "Zápas nenalezen v Supabase." } };
  }

  const sport = match.tournament_id === "ms-hockey-2026" ? "hockey" : "football";

  if (sport === "hockey" && homeScore === awayScore) {
    return { statusCode: 400, body: { error: "V hokeji není remíza povolena. Výsledek po prodloužení nebo nájezdech musí určit vítěze!" } };
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
        error: "Nepodařilo se přepočítat všechny tipy, výsledek zápasu nebyl uložen.",
        match_id: matchId,
        updated_predictions_count: updatedPredictionsCount,
        expected_predictions_count: predictions?.length || 0,
        result: {
          home_score: homeScore,
          away_score: awayScore
        },
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
        error: "Po přepočtu zůstaly nesedící body u některých tipů, výsledek zápasu nebyl uložen.",
        match_id: matchId,
        updated_predictions_count: updatedPredictionsCount,
        expected_predictions_count: predictions?.length || 0,
        result: {
          home_score: homeScore,
          away_score: awayScore
        },
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
      result: {
        home_score: homeScore,
        away_score: awayScore
      },
      status: "finished"
    }
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(cors());


  app.post("/api/admin/sync-results-dry-run", async (req, res) => {
    const authHeader = req.header("authorization") || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
    const providedSecret = bearerToken || req.header("x-result-sync-secret") || req.body?.secret;
    const expectedSecret = process.env.RESULT_SYNC_SECRET;
    const provider = String(req.query.provider || req.body?.provider || "api-football");

    if (!expectedSecret) {
      return res.status(503).json({ error: "RESULT_SYNC_SECRET is not configured." });
    }

    if (!providedSecret || providedSecret !== expectedSecret) {
      return res.status(401).json({ error: "Unauthorized dry-run request." });
    }

    const tournamentId = String(req.body?.tournamentId || WORLD_CUP_TOURNAMENT_ID);
    if (tournamentId !== WORLD_CUP_TOURNAMENT_ID) {
      return res.status(400).json({ error: `Unsupported tournamentId for this dry-run: ${tournamentId}` });
    }

    if (provider !== "api-football" && provider !== "thesportsdb") {
      return res.status(400).json({ error: `Unsupported dry-run provider: ${provider}` });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();
      const [{ matches: localMatches, providerColumnsAvailable, providerColumnWarning }, participantsResult] = await Promise.all([
        fetchWorldCupMatchesReadOnly(supabaseAdmin),
        supabaseAdmin.from("participants").select("id,name,short_name")
      ]);

      if (participantsResult.error) throw participantsResult.error;

      const participants = new Map<string, Participant>();
      (participantsResult.data || []).forEach(participant => participants.set(participant.id, participant));

      if (provider === "thesportsdb") {
        const providerResult = await fetchTheSportsDbFixturesForLocalMatches({
          matches: localMatches,
          participants,
          from: req.body?.from ? String(req.body.from) : null,
          to: req.body?.to ? String(req.body.to) : null
        });

        const items: Array<{
          action: "mapping_candidate" | "would_update" | "skip_not_finished" | "skip_already_finished" | "conflict" | "unmapped";
          mapping_quality: MappingResult["quality"];
          [key: string]: unknown;
        }> = providerResult.fixtures.map(apiFixture => {
          const mapping = findMappingCandidate(apiFixture, localMatches, participants);
          const localMatch = mapping.match;
          const isFinished = apiFixture.statusShort === "FT";
          const hasScore = Number.isInteger(apiFixture.score.home) && Number.isInteger(apiFixture.score.away);

          let action: "mapping_candidate" | "would_update" | "skip_not_finished" | "skip_already_finished" | "conflict" | "unmapped" = "mapping_candidate";
          let reason = mapping.reason;

          if (mapping.quality === "conflict") {
            action = "conflict";
          } else if (!localMatch) {
            action = "unmapped";
          } else if (!isFinished) {
            action = "skip_not_finished";
            reason = `TheSportsDB status ${apiFixture.statusShort || "unknown"} is not FT.`;
          } else if (localMatch.status === "finished" || (localMatch.home_score !== null && localMatch.away_score !== null)) {
            action = "skip_already_finished";
            reason = "Local match already has a finished status or stored score; dry-run will not overwrite it.";
          } else if (!hasScore) {
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
              is_finished: isFinished
            },
            api_score: apiFixture.score,
            mapping_quality: mapping.quality,
            mapping_score: mapping.score,
            matched_local_match_id: localMatch?.id || null,
            local_provider_name: localMatch?.provider_name ?? null,
            local_provider_match_id: localMatch?.provider_match_id ?? null,
            local_home: localMatch ? describeLocalTeam(localMatch.home_participant_id, participants) : null,
            local_away: localMatch ? describeLocalTeam(localMatch.away_participant_id, participants) : null,
            local_start_time_utc: localMatch?.start_time_utc || null,
            local_status: localMatch?.status || null,
            local_score: localMatch ? { home: localMatch.home_score, away: localMatch.away_score } : null,
            action,
            reason,
            candidates: mapping.candidates
          };
        });

        providerResult.misses.forEach(miss => {
          items.push({
            api_fixture_id: null,
            provider_match_id: null,
            provider: "thesportsdb",
            api_home: null,
            api_away: null,
            api_kickoff_utc: null,
            api_status: {
              short: null,
              long: null,
              raw: null,
              is_finished: false
            },
            api_score: { home: null, away: null, source: "not_found" },
            mapping_quality: "no match",
            mapping_score: 0,
            matched_local_match_id: miss.localMatch.id,
            local_provider_name: miss.localMatch.provider_name ?? null,
            local_provider_match_id: miss.localMatch.provider_match_id ?? null,
            local_home: miss.localHome,
            local_away: miss.localAway,
            local_start_time_utc: miss.localMatch.start_time_utc,
            local_status: miss.localMatch.status,
            local_score: { home: miss.localMatch.home_score, away: miss.localMatch.away_score },
            action: "unmapped",
            reason: miss.reason,
            candidates: [],
            provider_requests: miss.requests
          });
        });

        const countByAction = items.reduce<Record<string, number>>((acc, item) => {
          acc[item.action] = (acc[item.action] || 0) + 1;
          return acc;
        }, {});

        return res.json({
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
            from: req.body?.from || null,
            to: req.body?.to || null,
            local_matches_in_window: providerResult.local_matches_in_window,
            provider_requests_count: providerResult.requests.length
          },
          local_schema: {
            provider_columns_available: providerColumnsAvailable,
            provider_column_warning: providerColumnWarning
          },
          summary: {
            api_fixtures_received: providerResult.fixtures.length,
            provider_matches_received: providerResult.fixtures.length,
            local_matches_checked: localMatches.length,
            local_matches_in_window: providerResult.local_matches_in_window,
            exact_matches: items.filter(item => item.mapping_quality === "exact match").length,
            likely_matches: items.filter(item => item.mapping_quality === "likely match").length,
            conflicts: countByAction.conflict || 0,
            unmapped: countByAction.unmapped || 0,
            would_update: countByAction.would_update || 0,
            skip_not_finished: countByAction.skip_not_finished || 0,
            skip_already_finished: countByAction.skip_already_finished || 0,
            mapping_candidates: countByAction.mapping_candidate || 0
          },
          safety: {
            db_writes_performed: false,
            matches_updated: 0,
            predictions_updated: 0,
            points_updated: 0,
            profiles_updated: 0,
            write_mode_endpoint_created: false
          },
          provider_requests: providerResult.requests,
          items
        });
      }

      const apiKey = process.env.API_FOOTBALL_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: "API_FOOTBALL_KEY is not configured." });
      }

      const apiUrl = new URL(`${process.env.API_FOOTBALL_BASE_URL || API_FOOTBALL_BASE_URL}/fixtures`);
      apiUrl.searchParams.set("league", String(req.body?.league || API_FOOTBALL_WORLD_CUP_LEAGUE));
      apiUrl.searchParams.set("season", String(req.body?.season || API_FOOTBALL_WORLD_CUP_SEASON));

      if (req.body?.from) apiUrl.searchParams.set("from", String(req.body.from));
      if (req.body?.to) apiUrl.searchParams.set("to", String(req.body.to));
      if (Array.isArray(req.body?.fixtureIds) && req.body.fixtureIds.length > 0) {
        apiUrl.searchParams.set("ids", req.body.fixtureIds.map(String).join("-"));
      }

      const apiResponse = await fetch(apiUrl, {
        headers: {
          "x-apisports-key": apiKey
        }
      });

      const apiPayload = await apiResponse.json().catch(() => null);
      if (!apiResponse.ok) {
        return res.status(apiResponse.status).json({
          error: "API-Football request failed.",
          status: apiResponse.status,
          provider: "api-football",
          dry_run: true,
          wrote_to_db: false,
          api_error: apiPayload?.errors || apiPayload?.message || "Unknown API-Football error"
        });
      }

      const apiFixtures = Array.isArray(apiPayload?.response) ? apiPayload.response as ApiFootballFixture[] : [];
      const items = apiFixtures.map(rawFixture => {
        const apiFixture = normalizeApiFixture(rawFixture);
        const mapping = findMappingCandidate(apiFixture, localMatches, participants);
        const localMatch = mapping.match;
        const isFinished = apiFixture.statusShort ? FINISHED_API_STATUSES.has(apiFixture.statusShort) : false;
        const hasScore = Number.isInteger(apiFixture.score.home) && Number.isInteger(apiFixture.score.away);

        let action: "mapping_candidate" | "would_update" | "skip_not_finished" | "skip_already_finished" | "conflict" | "unmapped" = "mapping_candidate";
        let reason = mapping.reason;

        if (mapping.quality === "conflict") {
          action = "conflict";
        } else if (!localMatch) {
          action = "unmapped";
        } else if (!isFinished) {
          action = "skip_not_finished";
          reason = `API status ${apiFixture.statusShort || "unknown"} is not in finished statuses FT/AET/PEN.`;
        } else if (localMatch.status === "finished" || (localMatch.home_score !== null && localMatch.away_score !== null)) {
          action = "skip_already_finished";
          reason = "Local match already has a finished status or stored score; dry-run will not overwrite it.";
        } else if (!hasScore) {
          action = "conflict";
          reason = "API fixture is finished but final score is missing.";
        } else if (mapping.quality === "exact match" || mapping.quality === "likely match") {
          action = "would_update";
          reason = "Dry-run only: finished API fixture maps to an unfinished local match and would be eligible for the existing result flow later.";
        }

        return {
          api_fixture_id: apiFixture.id,
          api_home: apiFixture.homeName,
          api_away: apiFixture.awayName,
          api_kickoff_utc: apiFixture.kickoffUtc,
          api_status: {
            short: apiFixture.statusShort,
            long: apiFixture.statusLong,
            is_finished: isFinished
          },
          api_score: apiFixture.score,
          mapping_quality: mapping.quality,
          mapping_score: mapping.score,
          matched_local_match_id: localMatch?.id || null,
          local_provider_name: localMatch?.provider_name ?? null,
          local_provider_match_id: localMatch?.provider_match_id ?? null,
          local_home: localMatch ? describeLocalTeam(localMatch.home_participant_id, participants) : null,
          local_away: localMatch ? describeLocalTeam(localMatch.away_participant_id, participants) : null,
          local_start_time_utc: localMatch?.start_time_utc || null,
          local_status: localMatch?.status || null,
          local_score: localMatch ? { home: localMatch.home_score, away: localMatch.away_score } : null,
          action,
          reason,
          candidates: mapping.candidates
        };
      });

      const countByAction = items.reduce<Record<string, number>>((acc, item) => {
        acc[item.action] = (acc[item.action] || 0) + 1;
        return acc;
      }, {});

      res.json({
        success: true,
        mode: "dry_run",
        dry_run: true,
        wrote_to_db: false,
        provider: "api-football",
        requested_at: new Date().toISOString(),
        tournament_id: tournamentId,
        api_request: {
          endpoint: "/fixtures",
          league: apiUrl.searchParams.get("league"),
          season: apiUrl.searchParams.get("season"),
          from: apiUrl.searchParams.get("from"),
          to: apiUrl.searchParams.get("to"),
          ids_count: req.body?.fixtureIds?.length || 0
        },
        local_schema: {
          provider_columns_available: providerColumnsAvailable,
          provider_column_warning: providerColumnWarning
        },
        summary: {
          api_fixtures_received: apiFixtures.length,
          local_matches_checked: localMatches.length,
          exact_matches: items.filter(item => item.mapping_quality === "exact match").length,
          likely_matches: items.filter(item => item.mapping_quality === "likely match").length,
          conflicts: countByAction.conflict || 0,
          unmapped: countByAction.unmapped || 0,
          would_update: countByAction.would_update || 0,
          skip_not_finished: countByAction.skip_not_finished || 0,
          skip_already_finished: countByAction.skip_already_finished || 0,
          mapping_candidates: countByAction.mapping_candidate || 0
        },
        safety: {
          db_writes_performed: false,
          matches_updated: 0,
          predictions_updated: 0,
          points_updated: 0,
          profiles_updated: 0,
          write_mode_endpoint_created: false
        },
        items
      });
    } catch (err: any) {
      console.error("API-Football dry-run error:", err);
      res.status(500).json({
        error: "Chyba při API-Football dry-runu: " + err.message,
        dry_run: true,
        wrote_to_db: false
      });
    }
  });

  app.post("/api/admin/sync-results", async (req, res) => {
    const authHeader = req.header("authorization") || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
    const providedSecret = bearerToken || req.header("x-result-sync-secret") || req.body?.secret;
    const expectedSecret = process.env.RESULT_SYNC_SECRET;
    const provider = String(req.query.provider || req.body?.provider || "");
    const writeEnabled = process.env.RESULT_SYNC_WRITE_ENABLED === "true";

    if (!expectedSecret) {
      return res.status(503).json({ error: "RESULT_SYNC_SECRET is not configured." });
    }

    if (!providedSecret || providedSecret !== expectedSecret) {
      return res.status(401).json({ error: "Unauthorized result sync request." });
    }

    if (provider !== "thesportsdb") {
      return res.status(400).json({ error: `Unsupported write provider: ${provider || "missing"}` });
    }

    const tournamentId = String(req.body?.tournamentId || WORLD_CUP_TOURNAMENT_ID);
    if (tournamentId !== WORLD_CUP_TOURNAMENT_ID) {
      return res.status(400).json({ error: `Unsupported tournamentId for result sync: ${tournamentId}` });
    }

    if (!writeEnabled) {
      return res.status(403).json({
        success: false,
        mode: "write",
        provider: "thesportsdb",
        write_enabled: false,
        wrote_to_db: false,
        error: "Result sync write mode is disabled. Set RESULT_SYNC_WRITE_ENABLED=true to allow guarded writes.",
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
      });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();
      const [{ matches: localMatches }, participantsResult] = await Promise.all([
        fetchWorldCupMatchesReadOnly(supabaseAdmin),
        supabaseAdmin.from("participants").select("id,name,short_name")
      ]);

      if (participantsResult.error) throw participantsResult.error;

      const participants = new Map<string, Participant>();
      (participantsResult.data || []).forEach(participant => participants.set(participant.id, participant));

      const providerResult = await fetchTheSportsDbFixturesForLocalMatches({
        matches: localMatches,
        participants,
        from: req.body?.from ? String(req.body.from) : null,
        to: req.body?.to ? String(req.body.to) : null
      });

      const items: Array<Record<string, unknown> & { action: "updated" | "skipped" | "conflict" | "failed" }> = [];
      let matchesUpdated = 0;
      let predictionsUpdated = 0;
      let failed = 0;

      for (const apiFixture of providerResult.fixtures) {
        const mapping = findMappingCandidate(apiFixture, localMatches, participants);
        const localMatch = mapping.match;
        const isFinished = apiFixture.statusShort === "FT";
        const hasScore = Number.isInteger(apiFixture.score.home) && Number.isInteger(apiFixture.score.away);
        const baseItem = {
          provider_match_id: apiFixture.id,
          provider: "thesportsdb",
          api_home: apiFixture.homeName,
          api_away: apiFixture.awayName,
          api_kickoff_utc: apiFixture.kickoffUtc,
          api_status: {
            short: apiFixture.statusShort,
            long: apiFixture.statusLong,
            raw: apiFixture.rawStatus,
            is_finished: isFinished
          },
          api_score: apiFixture.score,
          mapping_quality: mapping.quality,
          mapping_score: mapping.score,
          matched_local_match_id: localMatch?.id || null,
          local_home: localMatch ? describeLocalTeam(localMatch.home_participant_id, participants) : null,
          local_away: localMatch ? describeLocalTeam(localMatch.away_participant_id, participants) : null,
          local_stage: localMatch?.stage || null,
          local_start_time_utc: localMatch?.start_time_utc || null,
          local_status: localMatch?.status || null,
          local_score: localMatch ? { home: localMatch.home_score, away: localMatch.away_score } : null,
          candidates: mapping.candidates
        };

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

        if (!isGroupStageMatch(localMatch)) {
          items.push({ ...baseItem, action: "skipped", reason: "Write guard: local match is not group-stage." });
          continue;
        }

        if (!isFinished) {
          items.push({ ...baseItem, action: "skipped", reason: `Write guard: TheSportsDB status ${apiFixture.statusShort || "unknown"} is not FT.` });
          continue;
        }

        if (!hasScore) {
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

      const countByAction = items.reduce<Record<string, number>>((acc, item) => {
        acc[item.action] = (acc[item.action] || 0) + 1;
        return acc;
      }, {});

      res.json({
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
          from: req.body?.from || null,
          to: req.body?.to || null,
          local_matches_in_window: providerResult.local_matches_in_window,
          provider_requests_count: providerResult.requests.length
        },
        summary: {
          provider_matches_received: providerResult.fixtures.length,
          local_matches_checked: localMatches.length,
          local_matches_in_window: providerResult.local_matches_in_window,
          updated: countByAction.updated || 0,
          skipped: countByAction.skipped || 0,
          conflicts: countByAction.conflict || 0,
          failed: countByAction.failed || 0
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
        items
      });
    } catch (err: any) {
      console.error("TheSportsDB result sync error:", err);
      res.status(500).json({
        error: "Chyba při TheSportsDB result syncu: " + err.message,
        mode: "write",
        provider: "thesportsdb",
        wrote_to_db: false
      });
    }
  });

  app.post("/api/admin/set-tournament-winner", async (req, res) => {
    const { userId, teamId, tournamentId = "fifa-world-cup-2026" } = req.body;

    if (!userId || !teamId) {
      return res.status(400).json({ error: "Chybějící parametry." });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();

      const { data: profile, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

      if (pErr || profile?.role !== 'admin') {
        return res.status(403).json({ error: "Pouze administrátor může vyhlásit celkového vítěze." });
      }

      const { error: tErr } = await supabaseAdmin
        .from("tournaments")
        .update({ actual_tournament_winner_id: teamId })
        .eq("id", tournamentId);

      if (tErr) throw tErr;

      const { data: predictions, error: predsErr } = await supabaseAdmin
        .from("longterm_predictions")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("prediction_type", "tournament_winner");

      if (predsErr) throw predsErr;

      for (const pred of predictions || []) {
        const points = pred.predicted_participant_id === teamId ? 10 : 0;
        const { error: scoreErr } = await supabaseAdmin
          .from("longterm_predictions")
          .update({ points_earned: points })
          .eq("id", pred.id);

        if (scoreErr) {
          console.error(`Error scoring longterm prediction ${pred.id}:`, scoreErr);
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Set tournament winner admin error:", err);
      res.status(500).json({ error: "Chyba při nastavení vítěze turnaje: " + err.message });
    }
  });

  app.post("/api/admin/match-result", async (req, res) => {
    const { userId, matchId, homeScore, awayScore } = req.body;
    
    if (!userId || !matchId) {
      return res.status(400).json({ error: "Chybějící parametry." });
    }

    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) {
      return res.status(400).json({ error: "Skóre musí být nezáporné celé číslo." });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();

      const { data: profile, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

      if (pErr || profile?.role !== 'admin') {
        return res.status(403).json({ error: "Pouze administrátor může vkládat výsledky a spouštět vyhodnocení." });
      }

      const result = await applyMatchResult({
        supabaseAdmin,
        matchId,
        homeScore,
        awayScore,
        source: "manual-admin",
        actor: userId
      });

      res.status(result.statusCode).json(result.body);
    } catch (err: any) {
      console.error("Match result admin error:", err);
      res.status(500).json({ error: "Chyba při ukládání výsledků: " + err.message });
    }
  });

  app.post("/api/lobby/update-name", async (req, res) => {
    const { userId, lobbyId, newName, shortDescription, longDescription } = req.body;
    
    if (!userId || !lobbyId || !newName) {
      return res.status(400).json({ error: "Chybějí povinné parametry." });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();

      const { data: lobby, error: lobbyErr } = await supabaseAdmin
        .from("lobbies")
        .select("owner_id")
        .eq("id", lobbyId)
        .single();
      
      if (lobbyErr || !lobby) {
        return res.status(404).json({ error: "Lobby nenalezena." });
      }

      if (lobby.owner_id !== userId) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .single();

        if (profile?.role !== 'admin') {
          return res.status(403).json({ error: "Pouze zakladatel lobby může měnit její název." });
        }
      }

      const updatePayload: Record<string, string | null> = {
        name: String(newName).trim()
      };

      if ("shortDescription" in req.body) {
        updatePayload.short_description = String(shortDescription || "").trim() || null;
      }
      if ("longDescription" in req.body) {
        updatePayload.long_description = String(longDescription || "").trim() || null;
      }

      const { error: updateErr } = await supabaseAdmin
        .from("lobbies")
        .update(updatePayload)
        .eq("id", lobbyId);

      if (updateErr) throw updateErr;

      res.json({ success: true });
    } catch (err: any) {
      console.error("/api/lobby/update-name err:", err);
      res.status(500).json({ error: err.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
