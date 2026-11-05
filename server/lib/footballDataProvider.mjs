const shapes = {
  CL: { stage: 'LEAGUE_STAGE', teams: 36, rounds: 8, perRound: 18, home: 4 },
  PL: { stage: 'REGULAR_SEASON', teams: 20, rounds: 38, perRound: 10, home: 19 },
};
const supportedCompetition = value => typeof value === 'string' && Object.hasOwn(shapes, value);
const positiveId = value => Number.isSafeInteger(value) && value > 0;
const supportedStatuses = new Set(['SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED', 'FINISHED', 'SUSPENDED', 'POSTPONED', 'CANCELLED', 'AWARDED']);
const pair = value => value && [value.home, value.away].every(n => Number.isSafeInteger(n) && n >= 0)
  ? { home: value.home, away: value.away } : null;
const add = (a, b) => ({ home: a.home + b.home, away: a.away + b.away });

/** Read-only interpretation of provider facts. This does not select or persist scoring rules. */
export function readFinalScore(match) {
  if (match.status !== 'FINISHED') return { kind: 'pending', officialGoals: null, penalties: null, gameScoreCandidate: null };
  const score = match.score ?? {};
  const fullTime = pair(score.fullTime);
  const regular = pair(score.regularTime);
  const extra = pair(score.extraTime);
  const penalties = pair(score.penalties);
  if (score.duration === 'REGULAR' && fullTime) {
    return { kind: 'regular', officialGoals: fullTime, penalties: null, gameScoreCandidate: fullTime };
  }
  if (regular && extra) {
    const officialGoals = add(regular, extra);
    if (score.duration === 'EXTRA_TIME' && fullTime
      && fullTime.home === officialGoals.home && fullTime.away === officialGoals.away) {
      return { kind: 'extra_time', officialGoals, penalties: null, gameScoreCandidate: officialGoals };
    }
    if (score.duration === 'PENALTY_SHOOTOUT' && penalties && penalties.home !== penalties.away) {
      return { kind: 'penalties', officialGoals, penalties, gameScoreCandidate: penalties };
    }
  }
  return { kind: 'needs_review', officialGoals: null, penalties: null, gameScoreCandidate: null };
}

/** Validate the exact phase required for the pilot; later knockout fixtures may be additional. */
export function analyzeSeason(payload, { competition = 'CL', season = 2026, now = new Date() } = {}) {
  const shape = supportedCompetition(competition) ? shapes[competition] : null;
  if (!shape || !Number.isInteger(season) || season < 2000 || season > 2100 || !Number.isFinite(+new Date(now))) {
    throw new Error('Invalid dry-run competition, season or reference time.');
  }
  if (!payload || !Array.isArray(payload.matches)) throw new Error('Provider response has no match list.');
  const issues = [];
  const issue = (code, matchId) => issues.push({ code, ...(positiveId(matchId) ? { matchId } : {}) });
  const matches = payload.matches;
  if (payload.resultSet?.count !== matches.length) issue('reported_count_mismatch');
  const ids = new Set();
  const teams = new Map();
  const rounds = new Map();
  const fixtures = new Set();
  const seasonIds = new Set();
  const statuses = {};
  const results = {};
  const mainPhase = matches.filter(m => m?.stage === shape.stage);
  if (mainPhase.length !== shape.rounds * shape.perRound) issue('incomplete_main_phase');
  for (const match of matches) {
    if (!match || typeof match !== 'object') { issue('invalid_match'); continue; }
    if (!positiveId(match.id) || ids.has(match.id)) issue('invalid_or_duplicate_match_id', match.id);
    ids.add(match.id);
    if (match.competition?.code !== competition) issue('wrong_competition', match.id);
    if (!String(match.season?.startDate ?? '').startsWith(`${season}-`)) issue('wrong_season', match.id);
    if (typeof match.utcDate !== 'string' || !/^\d{4}-\d{2}-\d{2}T.+Z$/.test(match.utcDate)
      || !Number.isFinite(Date.parse(match.utcDate))) issue('invalid_utc_kickoff', match.id);
    if (!supportedStatuses.has(match.status)) issue('unsupported_match_status', match.id);
    else statuses[match.status] = (statuses[match.status] ?? 0) + 1;
    const result = readFinalScore(match);
    results[result.kind] = (results[result.kind] ?? 0) + 1;
    if (result.kind === 'needs_review') issue('unusable_finished_score', match.id);
    if (['TIMED', 'SCHEDULED'].includes(match.status)
      && (match.score?.fullTime?.home != null || match.score?.fullTime?.away != null)) issue('unplayed_match_has_score', match.id);
    if (match.stage !== shape.stage) continue;
    if (!Number.isInteger(match.matchday) || match.matchday < 1 || match.matchday > shape.rounds) issue('invalid_matchday', match.id);
    const home = match.homeTeam?.id, away = match.awayTeam?.id;
    if (!positiveId(home) || !positiveId(away) || home === away) issue('unknown_or_invalid_team', match.id);
    if (!positiveId(match.season?.id)) issue('invalid_season_id', match.id);
    seasonIds.add(match.season?.id);
    const fixture = competition === 'CL' ? [home, away].sort((a, b) => a - b).join(':') : `${home}:${away}`;
    if (fixtures.has(fixture)) issue('duplicate_phase_fixture', match.id);
    fixtures.add(fixture);
    for (const [id, side] of [[home, 'home'], [away, 'away']]) {
      const team = teams.get(id) ?? { games: 0, home: 0, away: 0 };
      team.games++; team[side]++; teams.set(id, team);
    }
    const group = rounds.get(match.matchday) ?? [];
    group.push(match); rounds.set(match.matchday, group);
  }
  if (teams.size !== shape.teams) issue('unexpected_team_count');
  if (seasonIds.size !== 1) issue('mixed_season_ids');
  for (const team of teams.values()) {
    if (team.games !== shape.rounds || team.home !== shape.home || team.away !== shape.home) {
      issue('unbalanced_team_schedule'); break;
    }
  }
  const roundReports = [...rounds].sort(([a], [b]) => a - b).map(([round, games]) => {
    const kickoffs = games.map(m => m.utcDate).filter(v => typeof v === 'string' && Number.isFinite(Date.parse(v))).sort();
    const uniqueTeams = new Set(games.flatMap(m => [m.homeTeam?.id, m.awayTeam?.id])).size;
    const complete = games.length === shape.perRound && uniqueTeams === shape.teams;
    if (!complete) issues.push({ code: 'incomplete_round', round });
    const first = kickoffs[0] ?? null;
    return {
      round, matches: games.length, teams: uniqueTeams, complete,
      firstKickoffUtc: first, lastKickoffUtc: kickoffs.at(-1) ?? null,
      datesUtc: [...new Set(kickoffs.map(v => v.slice(0, 10)))],
      confirmedFuture: complete && kickoffs.length === games.length && Date.parse(first) > +new Date(now)
        && games.every(m => m.status === 'TIMED'),
    };
  });
  const candidates = issues.length ? [] : roundReports.filter(r => r.confirmedFuture).slice(0, 3);
  return {
    provider: 'football-data.org', competition, season, checkedAt: new Date(now).toISOString(),
    validationPassed: issues.length === 0, matches: matches.length, mainPhaseMatches: mainPhase.length,
    teams: teams.size, statuses, results, issues, rounds: roundReports,
    pilotReady: candidates.length === 3,
    candidatePilotRounds: candidates.map(r => r.round),
    candidatePilotMatches: candidates.reduce((sum, r) => sum + r.matches, 0),
    databaseWrites: 0,
  };
}

/** Fixed provider origin and GET-only access; never log headers or reflected response errors. */
export function createProviderReader(token, transport = fetch) {
  if (typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token)) throw new Error('Missing or invalid FOOTBALL_DATA_API_TOKEN.');
  const get = async (competition, season) => {
    if (!supportedCompetition(competition) || (season !== undefined && (!Number.isInteger(season) || season < 2000 || season > 2100))) {
      throw new Error('Unsupported dry-run target.');
    }
    const pathname = `/v4/competitions/${competition}${season === undefined ? '' : `/matches?season=${season}`}`;
    let response;
    try {
      response = await transport(`https://api.football-data.org${pathname}`, {
        method: 'GET', headers: { 'X-Auth-Token': token.trim() }, redirect: 'error', signal: AbortSignal.timeout(20_000),
      });
    } catch { throw new Error('Football-data request failed or timed out.'); }
    if (!response.ok) throw new Error(`Football-data returned HTTP ${response.status}.`);
    try { return await response.json(); } catch { throw new Error('Football-data returned invalid JSON.'); }
  };
  return { competition: code => get(code), matches: (code, season) => get(code, season) };
}
