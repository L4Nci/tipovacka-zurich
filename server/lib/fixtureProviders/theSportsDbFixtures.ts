const THE_SPORTS_DB_BASE_URL = "https://www.thesportsdb.com/api/v1/json/123";
const THE_SPORTS_DB_WORLD_CUP_LEAGUE = "4429";
const THE_SPORTS_DB_WORLD_CUP_SEASON = "2026";

export type TheSportsDbFixtureStage = "Round of 16" | "Quarterfinal" | "Semifinal" | "Third Place" | "Final";

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

type StageConfig = {
  stage: TheSportsDbFixtureStage;
  round: string;
  discoveryDates: string[];
};

const STAGE_CONFIGS: StageConfig[] = [
  { stage: "Round of 16", round: "16", discoveryDates: ["2026-07-04", "2026-07-05", "2026-07-06", "2026-07-07"] },
  { stage: "Quarterfinal", round: "8", discoveryDates: ["2026-07-09", "2026-07-10", "2026-07-11", "2026-07-12"] },
  { stage: "Semifinal", round: "4", discoveryDates: ["2026-07-14", "2026-07-15"] },
  { stage: "Third Place", round: "3", discoveryDates: ["2026-07-18"] },
  { stage: "Final", round: "1", discoveryDates: ["2026-07-19"] }
];

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
  const eventText = `${event.strEvent || ""} ${event.strFilename || ""}`.toLowerCase();
  const eventDate = event.dateEvent || "";

  if (stage === "Round of 16") return eventDate >= "2026-07-04" && eventDate <= "2026-07-07";
  if (stage === "Quarterfinal") return eventDate >= "2026-07-09" && eventDate <= "2026-07-12";
  if (stage === "Semifinal") return eventDate >= "2026-07-14" && eventDate <= "2026-07-15";
  if (stage === "Third Place") return eventDate === "2026-07-18" || eventText.includes("third place");
  if (eventText.includes("final")) return true;

  // TheSportsDB currently uses r=1 for group round 1 too. Only keep a final
  // candidate without explicit text when it falls in the expected final window.
  return Boolean(eventDate && eventDate >= "2026-07-19");
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

const fetchDay = async (
  stage: TheSportsDbFixtureStage,
  date: string
): Promise<{ fixtures: TheSportsDbFixtureSummary[]; request: TheSportsDbFixtureRequestLog }> => {
  const endpoint = "eventsday.php";
  const query = {
    d: date,
    l: THE_SPORTS_DB_WORLD_CUP_LEAGUE
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
    .map(event => normalizeEvent(event, stage, String(event.intRound ?? "unknown")))
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

const uniqueFixtures = (items: TheSportsDbFixtureSummary[]) => {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = item.provider_match_id || `${item.stage}:${item.home_name}:${item.away_name}:${item.kickoff_utc}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export async function fetchTheSportsDbPlayoffFixtures() {
  const fixtures: TheSportsDbFixtureSummary[] = [];
  const requests: TheSportsDbFixtureRequestLog[] = [];

  for (const { stage, round, discoveryDates } of STAGE_CONFIGS) {
    const result = await fetchRound(stage, round);
    fixtures.push(...result.fixtures);
    requests.push(result.request);

    if (result.fixtures.length === 0) {
      const discoveredFixtures: TheSportsDbFixtureSummary[] = [];
      for (const date of discoveryDates) {
        const fallbackResult = await fetchDay(stage, date);
        discoveredFixtures.push(...fallbackResult.fixtures);
        requests.push(fallbackResult.request);
      }
      fixtures.push(...uniqueFixtures(discoveredFixtures));
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
