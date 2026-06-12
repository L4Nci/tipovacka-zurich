const THE_SPORTS_DB_BASE_URL = "https://www.thesportsdb.com/api/v1/json/123";
const THE_SPORTS_DB_WORLD_CUP_LEAGUE = "4429";
const THE_SPORTS_DB_WORLD_CUP_SEASON = "2026";

export type TheSportsDbLocalMatch = {
  id: string;
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

export type TheSportsDbParticipant = {
  id: string;
  name?: string | null;
  short_name?: string | null;
};

export type TheSportsDbFixtureSummary = {
  id: string | null;
  provider: "thesportsdb";
  homeName: string;
  awayName: string;
  kickoffUtc: string | null;
  statusShort: string | null;
  statusLong: string | null;
  rawStatus: string | null;
  source: string;
  matchedLocalMatchId: string;
  score: {
    home: number | null;
    away: number | null;
    source: string;
  };
};

export type TheSportsDbRequestLog = {
  local_match_id: string;
  endpoint: string;
  query: Record<string, string>;
  http_status: number | null;
  results: number | null;
  error: string | null;
};

export type TheSportsDbLocalMiss = {
  localMatch: TheSportsDbLocalMatch;
  localHome: string;
  localAway: string;
  reason: string;
  requests: TheSportsDbRequestLog[];
};

type TheSportsDbEvent = {
  idEvent?: string | null;
  idLeague?: string | null;
  strSeason?: string | null;
  strEvent?: string | null;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  dateEvent?: string | null;
  strTime?: string | null;
  strTimestamp?: string | null;
  intHomeScore?: string | number | null;
  intAwayScore?: string | number | null;
  strStatus?: string | null;
  strProgress?: string | null;
  strPostponed?: string | null;
};

type TheSportsDbPayload = {
  event?: TheSportsDbEvent[] | null;
  events?: TheSportsDbEvent[] | null;
  error?: string | null;
};

const PROVIDER_REQUEST_DELAY_MS = 750;

const TEAM_NAME_ALIASES: Record<string, string> = {
  "Bosnia and Herzegovina": "Bosnia-Herzegovina",
  "United States": "USA"
};

const normalizeName = (value?: string | null) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const parseScore = (value?: string | number | null) => {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isInteger(numberValue) ? numberValue : null;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const toDateOnly = (iso: string) => iso.slice(0, 10);

const inDateWindow = (match: TheSportsDbLocalMatch, from?: string | null, to?: string | null) => {
  const date = toDateOnly(match.start_time_utc);
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
};

const isPlaceholderParticipant = (participantId: string) =>
  participantId === "football-tba" || participantId.startsWith("football-tba-");

const describeLocalTeam = (participantId: string, participants: Map<string, TheSportsDbParticipant>) => {
  const participant = participants.get(participantId);
  return participant?.name || participant?.short_name || participantId;
};

const providerTeamName = (participantId: string, participants: Map<string, TheSportsDbParticipant>) => {
  const localName = describeLocalTeam(participantId, participants);
  return TEAM_NAME_ALIASES[localName] || localName;
};

const eventToken = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[’']/g, "");

const kickoffUtcFromEvent = (event: TheSportsDbEvent) => {
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

const buildProviderError = (requests: TheSportsDbRequestLog[]) => {
  const failedRequests = requests.filter(request => request.error || (request.http_status !== null && request.http_status >= 400));
  if (failedRequests.length === 0) return null;

  return {
    message: "One or more TheSportsDB provider requests failed.",
    failed_requests: failedRequests.map(request => ({
      endpoint: request.endpoint,
      query: request.query,
      http_status: request.http_status,
      error: request.error
    }))
  };
};

const normalizeEvent = (event: TheSportsDbEvent, localMatch: TheSportsDbLocalMatch, source: string): TheSportsDbFixtureSummary => ({
  id: event.idEvent || null,
  provider: "thesportsdb",
  homeName: event.strHomeTeam || "",
  awayName: event.strAwayTeam || "",
  kickoffUtc: kickoffUtcFromEvent(event),
  statusShort: event.strStatus || null,
  statusLong: event.strProgress || event.strStatus || null,
  rawStatus: event.strStatus || null,
  source,
  matchedLocalMatchId: localMatch.id,
  score: {
    home: parseScore(event.intHomeScore),
    away: parseScore(event.intAwayScore),
    source: "intHomeScore/intAwayScore"
  }
});

const eventMatchesLocal = (
  event: TheSportsDbEvent,
  localMatch: TheSportsDbLocalMatch,
  participants: Map<string, TheSportsDbParticipant>
) => {
  const localHome = providerTeamName(localMatch.home_participant_id, participants);
  const localAway = providerTeamName(localMatch.away_participant_id, participants);
  return normalizeName(event.strHomeTeam) === normalizeName(localHome) &&
    normalizeName(event.strAwayTeam) === normalizeName(localAway);
};

const chooseEvent = (
  events: TheSportsDbEvent[],
  localMatch: TheSportsDbLocalMatch,
  participants: Map<string, TheSportsDbParticipant>
) => {
  const localDate = toDateOnly(localMatch.start_time_utc);
  const leagueEvents = events.filter(event =>
    (!event.idLeague || event.idLeague === THE_SPORTS_DB_WORLD_CUP_LEAGUE) &&
    (!event.strSeason || event.strSeason === THE_SPORTS_DB_WORLD_CUP_SEASON)
  );

  const sameTeamsAndDate = leagueEvents.find(event =>
    event.dateEvent === localDate && eventMatchesLocal(event, localMatch, participants)
  );
  if (sameTeamsAndDate) return sameTeamsAndDate;

  const sameTeams = leagueEvents.find(event => eventMatchesLocal(event, localMatch, participants));
  if (sameTeams) return sameTeams;

  if (leagueEvents.length === 1) return leagueEvents[0];
  return null;
};

const fetchTheSportsDb = async (
  endpoint: string,
  query: Record<string, string>,
  localMatchId: string
): Promise<{ events: TheSportsDbEvent[]; log: TheSportsDbRequestLog }> => {
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
    }
  } catch (err: any) {
    error = err?.message || String(err);
  }

  const events = Array.isArray(payload?.event)
    ? payload!.event!
    : Array.isArray(payload?.events)
      ? payload!.events!
      : [];

  return {
    events,
    log: {
      local_match_id: localMatchId,
      endpoint,
      query,
      http_status: httpStatus,
      results: events.length,
      error
    }
  };
};

export async function fetchTheSportsDbFixturesForLocalMatches({
  matches,
  participants,
  from,
  to
}: {
  matches: TheSportsDbLocalMatch[];
  participants: Map<string, TheSportsDbParticipant>;
  from?: string | null;
  to?: string | null;
}) {
  const windowMatches = matches.filter(match =>
    inDateWindow(match, from, to) &&
    !isPlaceholderParticipant(match.home_participant_id) &&
    !isPlaceholderParticipant(match.away_participant_id)
  );

  const fixtures: TheSportsDbFixtureSummary[] = [];
  const misses: TheSportsDbLocalMiss[] = [];
  const requests: TheSportsDbRequestLog[] = [];
  const seenEventIds = new Set<string>();
  const matchedLocalMatchIds = new Set<string>();
  const matchesByDate = new Map<string, TheSportsDbLocalMatch[]>();
  const failedDailyRequests = new Map<string, TheSportsDbRequestLog>();

  for (const match of windowMatches) {
    const localDate = toDateOnly(match.start_time_utc);
    const dateMatches = matchesByDate.get(localDate) || [];
    dateMatches.push(match);
    matchesByDate.set(localDate, dateMatches);
  }

  const uniqueDates = [...matchesByDate.keys()].sort();
  for (const [index, localDate] of uniqueDates.entries()) {
    if (index > 0) await sleep(PROVIDER_REQUEST_DELAY_MS);

    const dayResult = await fetchTheSportsDb(
      "eventsday.php",
      { d: localDate, l: THE_SPORTS_DB_WORLD_CUP_LEAGUE },
      `date:${localDate}`
    );
    requests.push(dayResult.log);
    if (dayResult.log.error || (dayResult.log.http_status !== null && dayResult.log.http_status >= 400)) {
      failedDailyRequests.set(localDate, dayResult.log);
      continue;
    }

    for (const match of matchesByDate.get(localDate) || []) {
      const event = chooseEvent(dayResult.events, match, participants);
      if (!event) continue;

      if (event.idEvent && seenEventIds.has(event.idEvent)) continue;
      if (event.idEvent) seenEventIds.add(event.idEvent);
      matchedLocalMatchIds.add(match.id);
      fixtures.push(normalizeEvent(event, match, "eventsday"));
    }
  }

  for (const [index, match] of windowMatches.filter(match => !matchedLocalMatchIds.has(match.id)).entries()) {
    const localDate = toDateOnly(match.start_time_utc);
    const home = providerTeamName(match.home_participant_id, participants);
    const away = providerTeamName(match.away_participant_id, participants);
    const requestLogs: TheSportsDbRequestLog[] = [];
    const failedDailyRequest = failedDailyRequests.get(localDate);

    if (failedDailyRequest) {
      misses.push({
        localMatch: match,
        localHome: home,
        localAway: away,
        reason: `TheSportsDB daily request failed for ${localDate}; targeted fallback skipped to avoid amplifying provider rate limits.`,
        requests: [failedDailyRequest]
      });
      continue;
    }

    if (requests.length > 0 || index > 0) await sleep(PROVIDER_REQUEST_DELAY_MS);

    const filenameQuery = `FIFA_World_Cup_${localDate}_${eventToken(home)}_vs_${eventToken(away)}`;
    const filenameResult = await fetchTheSportsDb("searchfilename.php", { e: filenameQuery }, match.id);
    requests.push(filenameResult.log);
    requestLogs.push(filenameResult.log);

    let event = chooseEvent(filenameResult.events, match, participants);
    let source = "searchfilename";

    if (!event) {
      const searchQuery = `${eventToken(home)}_vs_${eventToken(away)}`;
      const searchResult = await fetchTheSportsDb("searchevents.php", { e: searchQuery, s: THE_SPORTS_DB_WORLD_CUP_SEASON }, match.id);
      requests.push(searchResult.log);
      requestLogs.push(searchResult.log);
      event = chooseEvent(searchResult.events, match, participants);
      source = "searchevents";
    }

    if (!event) {
      misses.push({
        localMatch: match,
        localHome: home,
        localAway: away,
        reason: "TheSportsDB did not return a matching event from searchfilename or searchevents.",
        requests: requestLogs
      });
      continue;
    }

    if (event.idEvent && seenEventIds.has(event.idEvent)) continue;
    if (event.idEvent) seenEventIds.add(event.idEvent);
    matchedLocalMatchIds.add(match.id);
    fixtures.push(normalizeEvent(event, match, source));
  }

  const providerRequestsFailed = requests.filter(request =>
    request.error || (request.http_status !== null && request.http_status >= 400)
  ).length;
  const rateLimitedCount = requests.filter(request => request.http_status === 429).length;
  const providerError = buildProviderError(requests);

  return {
    fixtures,
    misses,
    requests,
    provider_requests_failed: providerRequestsFailed,
    rate_limited_count: rateLimitedCount,
    provider_error: providerError,
    local_matches_in_window: windowMatches.length
  };
}
