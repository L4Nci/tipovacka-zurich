import { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchTheSportsDbPlayoffFixtures,
  type TheSportsDbFixtureStage,
  type TheSportsDbFixtureSummary
} from "./fixtureProviders/theSportsDbFixtures.ts";

const WORLD_CUP_TOURNAMENT_ID = "fifa-world-cup-2026";
const SUPPORTED_STAGES: TheSportsDbFixtureStage[] = ["Round of 16", "Quarterfinal", "Semifinal", "Third Place", "Final"];
const FINISHED_PROVIDER_STATUSES = new Set(["FT", "AP", "AET", "PEN"]);

type SyncRequest = {
  provider: string;
  tournamentId?: string | null;
};

type LocalFixtureMatch = {
  id: string;
  tournament_id: string;
  stage: TheSportsDbFixtureStage;
  home_participant_id: string;
  away_participant_id: string;
  start_time_utc: string;
  lock_time_utc: string;
  status: string | null;
  home_score: number | null;
  away_score: number | null;
  provider_name?: string | null;
  provider_match_id?: string | null;
  predictions_count?: number;
};

type Participant = {
  id: string;
  name?: string | null;
  short_name?: string | null;
};

type FixtureDryRunItem = {
  action: "would_update" | "skip_missing_provider" | "conflict" | "skipped";
  reason: string;
  provider: "thesportsdb";
  local_match_id: string;
  local_stage: TheSportsDbFixtureStage;
  old_home_participant_id: string;
  old_away_participant_id: string;
  old_start_time_utc: string;
  old_lock_time_utc: string;
  local_status: string | null;
  local_score: { home: number | null; away: number | null };
  predictions_count: number;
  provider_match_id: string | null;
  provider_stage: TheSportsDbFixtureStage | null;
  provider_round: string | null;
  provider_status: string | null;
  provider_home_name: string | null;
  provider_away_name: string | null;
  new_home_participant_id: string | null;
  new_away_participant_id: string | null;
  new_start_time_utc: string | null;
  new_lock_time_utc: string | null;
  mapping_confidence: number;
};

const normalizeName = (value?: string | null) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const canonicalName = (value?: string | null) => {
  const normalized = normalizeName(value);
  if (normalized === "usa") return "united states";
  return normalized;
};

const isTba = (value?: string | null) =>
  normalizeName(value) === "tba" || String(value || "").trim().toLowerCase().startsWith("football-tba");

const isLocalTbaMatch = (match: LocalFixtureMatch) =>
  isTba(match.home_participant_id) || isTba(match.away_participant_id);

const providerStatus = (fixture: TheSportsDbFixtureSummary) =>
  String(fixture.status || "unknown").toUpperCase();

const isProviderFinished = (fixture: TheSportsDbFixtureSummary) =>
  FINISHED_PROVIDER_STATUSES.has(providerStatus(fixture));

const lockTimeFromKickoff = (kickoffUtc: string) => {
  const date = new Date(kickoffUtc);
  date.setUTCMinutes(date.getUTCMinutes() - 5);
  return date.toISOString();
};

const groupByStage = <T extends { stage: TheSportsDbFixtureStage }>(items: T[]) => {
  const grouped = new Map<TheSportsDbFixtureStage, T[]>();
  SUPPORTED_STAGES.forEach(stage => grouped.set(stage, []));
  items.forEach(item => grouped.get(item.stage)?.push(item));
  return grouped;
};

const participantLookup = (participants: Participant[]) => {
  const byName = new Map<string, Participant[]>();

  participants.forEach(participant => {
    [participant.name, participant.short_name].forEach(value => {
      const key = canonicalName(value);
      if (!key) return;
      const matches = byName.get(key) || [];
      matches.push(participant);
      byName.set(key, matches);
    });
  });

  return (name: string) => {
    const matches = byName.get(canonicalName(name)) || [];
    const unique = new Map(matches.map(match => [match.id, match]));
    const uniqueMatches = [...unique.values()];
    if (uniqueMatches.length !== 1) {
      return {
        ok: false as const,
        participant: null,
        reason: uniqueMatches.length === 0
          ? `No participant matched provider team ${name}.`
          : `Multiple participants matched provider team ${name}.`
      };
    }

    return { ok: true as const, participant: uniqueMatches[0], reason: "Participant matched exactly." };
  };
};

async function loadLocalContext(supabaseAdmin: SupabaseClient) {
  const [matchesResult, participantsResult, predictionsResult] = await Promise.all([
    supabaseAdmin
      .from("matches")
      .select("id,tournament_id,stage,home_participant_id,away_participant_id,start_time_utc,lock_time_utc,status,home_score,away_score,provider_name,provider_match_id")
      .eq("tournament_id", WORLD_CUP_TOURNAMENT_ID)
      .in("stage", SUPPORTED_STAGES)
      .order("start_time_utc", { ascending: true }),
    supabaseAdmin
      .from("participants")
      .select("id,name,short_name")
      .eq("sport_id", "football"),
    supabaseAdmin
      .from("predictions")
      .select("match_id")
  ]);

  if (matchesResult.error) throw matchesResult.error;
  if (participantsResult.error) throw participantsResult.error;
  if (predictionsResult.error) throw predictionsResult.error;

  const predictionCounts = new Map<string, number>();
  (predictionsResult.data || []).forEach(prediction => {
    predictionCounts.set(prediction.match_id, (predictionCounts.get(prediction.match_id) || 0) + 1);
  });

  const matches = ((matchesResult.data || []) as LocalFixtureMatch[])
    .filter(match => SUPPORTED_STAGES.includes(match.stage))
    .map(match => ({
      ...match,
      predictions_count: predictionCounts.get(match.id) || 0
    }));

  return {
    matches,
    participants: (participantsResult.data || []) as Participant[]
  };
}

function buildItem({
  localMatch,
  providerFixture,
  participantForHome,
  participantForAway,
  action,
  reason,
  mappingConfidence
}: {
  localMatch: LocalFixtureMatch;
  providerFixture: TheSportsDbFixtureSummary | null;
  participantForHome?: Participant | null;
  participantForAway?: Participant | null;
  action: "would_update" | "skip_missing_provider" | "conflict" | "skipped";
  reason: string;
  mappingConfidence: number;
}): FixtureDryRunItem {
  return {
    action,
    reason,
    provider: "thesportsdb",
    local_match_id: localMatch.id,
    local_stage: localMatch.stage,
    old_home_participant_id: localMatch.home_participant_id,
    old_away_participant_id: localMatch.away_participant_id,
    old_start_time_utc: localMatch.start_time_utc,
    old_lock_time_utc: localMatch.lock_time_utc,
    local_status: localMatch.status,
    local_score: { home: localMatch.home_score, away: localMatch.away_score },
    predictions_count: localMatch.predictions_count || 0,
    provider_match_id: providerFixture?.provider_match_id || null,
    provider_stage: providerFixture?.stage || null,
    provider_round: providerFixture?.round || null,
    provider_status: providerFixture?.status || null,
    provider_home_name: providerFixture?.home_name || null,
    provider_away_name: providerFixture?.away_name || null,
    new_home_participant_id: participantForHome?.id || null,
    new_away_participant_id: participantForAway?.id || null,
    new_start_time_utc: providerFixture?.kickoff_utc || null,
    new_lock_time_utc: providerFixture?.kickoff_utc ? lockTimeFromKickoff(providerFixture.kickoff_utc) : null,
    mapping_confidence: mappingConfidence
  };
}

function countByAction(items: Array<{ action: string }>) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item.action] = (acc[item.action] || 0) + 1;
    return acc;
  }, {});
}

export async function buildTheSportsDbFixtureDryRunResponse(supabaseAdmin: SupabaseClient, request: SyncRequest) {
  if (request.provider !== "thesportsdb") {
    return { statusCode: 400, body: { error: `Unsupported fixture dry-run provider: ${request.provider || "missing"}` } };
  }

  const tournamentId = String(request.tournamentId || WORLD_CUP_TOURNAMENT_ID);
  if (tournamentId !== WORLD_CUP_TOURNAMENT_ID) {
    return { statusCode: 400, body: { error: `Unsupported tournamentId for fixture dry-run: ${tournamentId}` } };
  }

  const [{ matches, participants }, providerResult] = await Promise.all([
    loadLocalContext(supabaseAdmin),
    fetchTheSportsDbPlayoffFixtures()
  ]);

  const usedProviderIds = new Set(
    matches
      .filter(match => match.provider_name === "thesportsdb" && match.provider_match_id)
      .map(match => String(match.provider_match_id))
  );

  const localCandidates = matches
    .filter(match =>
      match.status === "scheduled" &&
      match.home_score === null &&
      match.away_score === null &&
      isLocalTbaMatch(match)
    )
    .sort((a, b) =>
      String(a.stage).localeCompare(String(b.stage)) ||
      String(a.start_time_utc).localeCompare(String(b.start_time_utc)) ||
      a.id.localeCompare(b.id)
    );

  const providerCandidates = providerResult.fixtures
    .filter(fixture => !usedProviderIds.has(String(fixture.provider_match_id || "")))
    .sort((a, b) =>
      String(a.stage).localeCompare(String(b.stage)) ||
      String(a.kickoff_utc || "").localeCompare(String(b.kickoff_utc || "")) ||
      String(a.provider_match_id || "").localeCompare(String(b.provider_match_id || ""))
    );

  const localByStage = groupByStage(localCandidates);
  const providerByStage = groupByStage(providerCandidates);
  const findParticipant = participantLookup(participants);
  const items: FixtureDryRunItem[] = [];

  for (const stage of SUPPORTED_STAGES) {
    const stageLocalMatches = (localByStage.get(stage) || []).sort((a, b) =>
      String(a.start_time_utc).localeCompare(String(b.start_time_utc)) || a.id.localeCompare(b.id)
    );
    const stageProviderFixtures = (providerByStage.get(stage) || []).sort((a, b) =>
      String(a.kickoff_utc || "").localeCompare(String(b.kickoff_utc || "")) ||
      String(a.provider_match_id || "").localeCompare(String(b.provider_match_id || ""))
    );

    stageLocalMatches.forEach((localMatch, index) => {
      const providerFixture = stageProviderFixtures[index] || null;
      if (!providerFixture) {
        items.push(buildItem({
          localMatch,
          providerFixture: null,
          action: "skip_missing_provider",
          reason: `TheSportsDB has no unused ${stage} fixture for this local TBA slot.`,
          mappingConfidence: 0
        }));
        return;
      }

      if (!providerFixture.provider_match_id) {
        items.push(buildItem({
          localMatch,
          providerFixture,
          action: "conflict",
          reason: "Provider fixture is missing idEvent.",
          mappingConfidence: 0
        }));
        return;
      }

      if (!providerFixture.kickoff_utc) {
        items.push(buildItem({
          localMatch,
          providerFixture,
          action: "conflict",
          reason: "Provider fixture is missing kickoff timestamp.",
          mappingConfidence: 0
        }));
        return;
      }

      if (isProviderFinished(providerFixture)) {
        items.push(buildItem({
          localMatch,
          providerFixture,
          action: "conflict",
          reason: `Provider fixture status ${providerStatus(providerFixture)} is finished; fixture sync will not update finished provider events.`,
          mappingConfidence: 0
        }));
        return;
      }

      const homeResult = findParticipant(providerFixture.home_name);
      const awayResult = findParticipant(providerFixture.away_name);
      if (!homeResult.ok || !awayResult.ok) {
        items.push(buildItem({
          localMatch,
          providerFixture,
          action: "conflict",
          reason: !homeResult.ok ? homeResult.reason : awayResult.reason,
          mappingConfidence: 0
        }));
        return;
      }

      items.push(buildItem({
        localMatch,
        providerFixture,
        participantForHome: homeResult.participant,
        participantForAway: awayResult.participant,
        action: "would_update",
        reason: `Dry-run only: chronological ${stage} provider fixture maps to chronological local TBA slot.`,
        mappingConfidence: 100
      }));
    });
  }

  const counts = countByAction(items);

  return {
    statusCode: 200,
    body: {
      success: true,
      mode: "dry_run",
      dry_run: true,
      provider: "thesportsdb",
      wrote_to_db: false,
      requested_at: new Date().toISOString(),
      tournament_id: tournamentId,
      api_request: {
        endpoint: "eventsround.php",
        league: "4429",
        season: "2026",
        rounds_requested: [
          { stage: "Round of 16", round: "16" },
          { stage: "Quarterfinal", round: "8" },
          { stage: "Semifinal", round: "4" },
          { stage: "Third Place", round: "3" },
          { stage: "Final", round: "1" }
        ],
        provider_requests_count: providerResult.requests.length,
        provider_requests_failed: providerResult.provider_requests_failed,
        rate_limited_count: providerResult.rate_limited_count
      },
      summary: {
        local_tba_matches_checked: localCandidates.length,
        provider_fixtures_received: providerResult.fixtures.length,
        provider_fixtures_unused: providerCandidates.length,
        would_update: counts.would_update || 0,
        skipped: counts.skipped || 0,
        skip_missing_provider: counts.skip_missing_provider || 0,
        conflicts: counts.conflict || 0,
        unmapped: counts.unmapped || 0,
        provider_requests_count: providerResult.requests.length,
        provider_requests_failed: providerResult.provider_requests_failed,
        rate_limited_count: providerResult.rate_limited_count
      },
      safety: {
        db_writes_performed: false,
        matches_updated: 0,
        predictions_updated: 0,
        points_updated: 0,
        scores_updated: 0,
        statuses_updated: 0
      },
      provider_error: providerResult.provider_error,
      provider_requests: providerResult.requests,
      items
    }
  };
}

const disabledFixtureWriteResponse = (request: SyncRequest) => ({
  statusCode: 403,
  body: {
    success: false,
    mode: "write",
    provider: "thesportsdb",
    write_enabled: false,
    wrote_to_db: false,
    error: "Fixture sync write mode is disabled. Set FIXTURE_SYNC_WRITE_ENABLED=true to allow guarded fixture writes.",
    api_request: {
      provider: request.provider || "missing",
      tournament_id: request.tournamentId || WORLD_CUP_TOURNAMENT_ID
    },
    summary: {
      local_tba_matches_checked: 0,
      provider_fixtures_received: 0,
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
      scores_updated: 0,
      statuses_updated: 0
    },
    items: []
  }
});

const isSafeWriteItem = (item: FixtureDryRunItem) =>
  item.action === "would_update" &&
  item.mapping_confidence === 100 &&
  item.provider_match_id &&
  item.new_home_participant_id &&
  item.new_away_participant_id &&
  item.new_start_time_utc &&
  item.new_lock_time_utc &&
  item.local_status === "scheduled" &&
  item.local_score.home === null &&
  item.local_score.away === null &&
  (isTba(item.old_home_participant_id) || isTba(item.old_away_participant_id)) &&
  SUPPORTED_STAGES.includes(item.local_stage);

export async function executeTheSportsDbFixtureWriteSync(supabaseAdmin: SupabaseClient, request: SyncRequest) {
  if (request.provider !== "thesportsdb") {
    return { statusCode: 400, body: { error: `Unsupported fixture write provider: ${request.provider || "missing"}` } };
  }

  const tournamentId = String(request.tournamentId || WORLD_CUP_TOURNAMENT_ID);
  if (tournamentId !== WORLD_CUP_TOURNAMENT_ID) {
    return { statusCode: 400, body: { error: `Unsupported tournamentId for fixture write: ${tournamentId}` } };
  }

  if (process.env.FIXTURE_SYNC_WRITE_ENABLED !== "true") {
    return disabledFixtureWriteResponse(request);
  }

  const dryRun = await buildTheSportsDbFixtureDryRunResponse(supabaseAdmin, request);
  if (dryRun.statusCode !== 200) return dryRun;

  const dryRunBody = dryRun.body as Record<string, any>;
  const dryRunItems = (dryRunBody.items || []) as FixtureDryRunItem[];
  const items: Array<Record<string, unknown> & { action: "updated" | "skipped" | "conflict" | "failed" }> = [];
  let matchesUpdated = 0;
  let failed = 0;

  for (const item of dryRunItems) {
    if (!isSafeWriteItem(item)) {
      items.push({
        ...item,
        action: item.action === "would_update" ? "conflict" : "skipped",
        reason: item.action === "would_update"
          ? "Write guard: dry-run item is missing one or more required safe-write fields."
          : item.reason
      });
      continue;
    }

    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from("matches")
      .update({
        home_participant_id: item.new_home_participant_id,
        away_participant_id: item.new_away_participant_id,
        start_time_utc: item.new_start_time_utc,
        lock_time_utc: item.new_lock_time_utc,
        provider_name: "thesportsdb",
        provider_match_id: item.provider_match_id,
        updated_at: new Date().toISOString()
      })
      .eq("id", item.local_match_id)
      .eq("tournament_id", tournamentId)
      .eq("stage", item.local_stage)
      .eq("status", "scheduled")
      .is("home_score", null)
      .is("away_score", null)
      .or("home_participant_id.eq.football-tba,away_participant_id.eq.football-tba")
      .select("id");

    if (updateError || !updatedRows || updatedRows.length !== 1) {
      failed += 1;
      items.push({
        ...item,
        action: "failed",
        reason: updateError?.message || `Write guard: expected 1 updated row, got ${updatedRows?.length ?? 0}.`
      });
      continue;
    }

    matchesUpdated += 1;
    items.push({
      ...item,
      action: "updated",
      reason: "Fixture sync wrote guarded TBA fixture metadata."
    });
  }

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
      api_request: dryRunBody.api_request,
      summary: {
        local_tba_matches_checked: dryRunBody.summary?.local_tba_matches_checked || 0,
        provider_fixtures_received: dryRunBody.summary?.provider_fixtures_received || 0,
        updated: counts.updated || 0,
        skipped: counts.skipped || 0,
        conflicts: counts.conflict || 0,
        failed: counts.failed || 0,
        provider_requests_count: dryRunBody.summary?.provider_requests_count || 0,
        provider_requests_failed: dryRunBody.summary?.provider_requests_failed || 0,
        rate_limited_count: dryRunBody.summary?.rate_limited_count || 0
      },
      safety: {
        db_writes_performed: matchesUpdated > 0,
        matches_updated: matchesUpdated,
        predictions_updated: 0,
        points_updated: 0,
        scores_updated: 0,
        statuses_updated: 0
      },
      provider_error: dryRunBody.provider_error,
      items
    }
  };
}
