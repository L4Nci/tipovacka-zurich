const THE_SPORTS_DB_BASE_URL = "https://www.thesportsdb.com/api/v1/json/123";
const THE_SPORTS_DB_WORLD_CUP_LEAGUE = "4429";
const THE_SPORTS_DB_WORLD_CUP_SEASON = "2026";

export type TheSportsDbFixtureStage = "Round of 16" | "Quarterfinal" | "Semifinal" | "Final";

export type TheSportsDbFixtureEvent = {
  idEvent?: string | null;
  idLeague?: string | null;
  strSeason?: string | null;
  strEvent?: string | null;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  intRound?: string | number | null;
  dateEvent?: string | null;
  strTime?: string | null;
  strTimestamp?: string | null;
  strStatus?: string | null;
  strProgress?: string | null;
  strFilename?: string | null;
};

export type TheSportsDbFixtureSummary = {
  provider: "thesportsdb";
  provider_match_id: string | null;
  stage: TheSportsDbFixtureStage;
  round: string;
  home_name: string;
  away_name: string;
  kickoff_utc: string | null;
  status: string | null;
  raw_status: string | null;
  filename: string | null;
};

export type TheSportsDbFixtureRequestLog = {
  stage: TheSportsDbFixtureStage;
  endpoint: string;
  query: Record<string, string>;
  http_status: number | null;
  results: number | null;
  error: string | null;
};

const STAGE_ROUNDS: Array<{ stage: TheSportsDbFixtureStage; round: string }> = [
  { stage: "Round of 16", round: "16" },
  { stage: "Quarterfinal", round: "8" },
  { stage: "Semifinal", round: "4" },
  { stage: "Final", round: "1" }
];

const QUARTERFINAL_FALLBACK_ROUND = "125";

type TheSportsDbPayload = {
  event?: TheSportsDbFixtureEvent[] | null;
  events?: TheSportsDbFixtureEvent[] | string | null;
  error?: string | null;
};

const kickoffUtcFromEvent = (event: TheSportsDbFixtureEvent) => {
  if (event.strTimestamp) {
    const timestamp = event.strTimestamp.endsWith("Z") ? event.strTimestamp : `${event.strTimestamp}Z`;
    return new Date(timestamp).toISOString();
  }

  if (event.dateEvent && event.strTime) {
    return new Date(`${event.dateEvent}T${event.strTime}Z`).toISOString();
  }

  if (event.dateEvent) {
    return new Date(`${event.dateEvent}T00:00:00Z`).toISOString();
  }

  return null;
};

const normalizeEvent = (
  event: TheSportsDbFixtureEvent,
  stage: TheSportsDbFixtureStage,
  round: string
): TheSportsDbFixtureSummary => ({
  provider: "thesportsdb",
  provider_match_id: event.idEvent || null,
  stage,
  round,
  home_name: event.strHomeTeam || "",
  away_name: event.strAwayTeam || "",
  kickoff_utc: kickoffUtcFromEvent(event),
  status: event.strStatus || null,
  raw_status: event.strStatus || null,
  filename: event.strFilename || null
});

const isPlausibleStageEvent = (event: TheSportsDbFixtureEvent, stage: TheSportsDbFixtureStage) => {
  if (stage !== "Final") return true;

  const eventText = `${event.strEvent || ""} ${event.strFilename || ""}`.toLowerCase();
  if (eventText.includes("final")) return true;

  // TheSportsDB currently uses r=1 for group round 1 too. Only keep a final
  // candidate without explicit text when it falls in the expected final window.
  return Boolean(event.dateEvent && event.dateEvent >= "2026-07-18");
};

const fetchRound = async (
  stage: TheSportsDbFixtureStage,
  round: string
): Promise<{ fixtures: TheSportsDbFixtureSummary[]; request: TheSportsDbFixtureRequestLog }> => {
  const endpoint = "eventsround.php";
  const query = {
    id: THE_SPORTS_DB_WORLD_CUP_LEAGUE,
    r: round,
    s: THE_SPORTS_DB_WORLD_CUP_SEASON
  };
  const url = new URL(`${THE_SPORTS_DB_BASE_URL}/${endpoint}`);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));

  let httpStatus: number | null = null;
  let payload: TheSportsDbPayload | null = null;
  let error: string | null = null;

  try {
    const response = await fetch(url);
    httpStatus = response.status;
    payload = await response.json().catch(() => null);
    if (!response.ok) {
      error = payload?.error || `TheSportsDB request failed with HTTP ${response.status}`;
    } else if (payload?.error) {
      error = payload.error;
    } else if (typeof payload?.events === "string") {
      error = payload.events;
    }
  } catch (err: any) {
    error = err?.message || String(err);
  }

  const events = Array.isArray(payload?.event)
    ? payload!.event!
    : Array.isArray(payload?.events)
      ? payload!.events
      : [];

  const fixtures = events
    .filter(event =>
      (!event.idLeague || event.idLeague === THE_SPORTS_DB_WORLD_CUP_LEAGUE) &&
      (!event.strSeason || event.strSeason === THE_SPORTS_DB_WORLD_CUP_SEASON) &&
      isPlausibleStageEvent(event, stage)
    )
    .map(event => normalizeEvent(event, stage, round))
    .sort((a, b) =>
      String(a.kickoff_utc || "").localeCompare(String(b.kickoff_utc || "")) ||
      String(a.provider_match_id || "").localeCompare(String(b.provider_match_id || ""))
    );

  return {
    fixtures,
    request: {
      stage,
      endpoint,
      query,
      http_status: httpStatus,
      results: events.length,
      error
    }
  };
};

export async function fetchTheSportsDbPlayoffFixtures() {
  const fixtures: TheSportsDbFixtureSummary[] = [];
  const requests: TheSportsDbFixtureRequestLog[] = [];

  for (const { stage, round } of STAGE_ROUNDS) {
    const result = await fetchRound(stage, round);
    fixtures.push(...result.fixtures);
    requests.push(result.request);

    if (stage === "Quarterfinal" && result.fixtures.length === 0) {
      const fallbackResult = await fetchRound(stage, QUARTERFINAL_FALLBACK_ROUND);
      fixtures.push(...fallbackResult.fixtures);
      requests.push(fallbackResult.request);
    }
  }

  const providerRequestsFailed = requests.filter(request =>
    request.error || (request.http_status !== null && request.http_status >= 400)
  ).length;
  const rateLimitedCount = requests.filter(request => request.http_status === 429).length;

  return {
    fixtures,
    requests,
    provider_requests_failed: providerRequestsFailed,
    rate_limited_count: rateLimitedCount,
    provider_error: providerRequestsFailed > 0
      ? {
          message: "One or more TheSportsDB fixture requests failed.",
          failed_requests: requests.filter(request =>
            request.error || (request.http_status !== null && request.http_status >= 400)
          )
        }
      : null
  };
}
