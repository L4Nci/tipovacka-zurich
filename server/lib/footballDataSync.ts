import { timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { analyzeSeason, createProviderReader, readFinalScore } from './footballDataProvider.mjs';
import { calculatePoints } from '../../src/lib/scoring.ts';
import { clubCrestUrl } from '../../src/lib/teamAssets.ts';
import { getSupabaseAdmin } from './supabaseAdmin.ts';
import { runHockeyCatalogSync } from './hockeySync.ts';
import { runMmaCatalogSync } from './mmaSync.ts';

export const FOOTBALL_DATA_TOURNAMENT = 'uefa-champions-league-2026-27';
export const FOOTBALL_DATA_SCORING_RULE = 'football-final-shootout-v1';
export const FOOTBALL_DATA_COMPETITIONS = {
  CL: { tournamentId: FOOTBALL_DATA_TOURNAMENT, stage: 'LEAGUE_STAGE', label: 'League Phase' },
  PL: { tournamentId: 'premier-league-2026-27', stage: 'REGULAR_SEASON', label: 'Regular Season' },
} as const;
export type FootballCompetition = keyof typeof FOOTBALL_DATA_COMPETITIONS;
const knockoutStages: Record<string, { label: string; maximum: number }> = {
  PLAYOFFS: { label: 'Playoffs', maximum: 16 },
  LAST_16: { label: 'Round of 16', maximum: 16 },
  QUARTER_FINALS: { label: 'Quarterfinals', maximum: 8 },
  SEMI_FINALS: { label: 'Semifinals', maximum: 4 },
  FINAL: { label: 'Final', maximum: 1 },
};
export class FootballDataSyncError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}

export function normalizeFootballDataSeason(payload: any, now = new Date(), competition: FootballCompetition = 'CL') {
  const config = FOOTBALL_DATA_COMPETITIONS[competition];
  if (!config) throw new FootballDataSyncError(422, 'Unsupported competition.');
  if (!Array.isArray(payload?.matches) || payload.resultSet?.count !== payload.matches.length) {
    throw new FootballDataSyncError(422, 'Season response is incomplete.');
  }
  if (competition === 'PL' && payload.matches.some((m: any) => m?.stage !== config.stage)) {
    throw new FootballDataSyncError(422, 'Unexpected Premier League phase.');
  }
  const league = payload.matches.filter((m: any) => m?.stage === config.stage);
  const report = analyzeSeason({ ...payload, matches: league, resultSet: { count: league.length } }, { competition, season: 2026, now });
  if (!report.validationPassed) throw new FootballDataSyncError(422, 'Season validation failed; no import was submitted.');
  const clubs = new Map<string, { id: string; name: string; short_name: string; logo_url: string | null }>();
  const roster = new Set<number>(league.flatMap((m: any) => [m.homeTeam.id, m.awayTeam.id]));
  const seasonId = league[0].season.id;
  const seen = new Set<number>();
  const phaseCounts = new Map<string, number>();
  const awaitingFixtures: number[] = [];
  const fixtures = payload.matches.filter((m: any) => {
    if (!m || (m.stage !== config.stage && !(competition === 'CL' && Object.hasOwn(knockoutStages, m.stage)))) return false;
    if (!Number.isSafeInteger(m.id) || m.id <= 0 || seen.has(m.id)
      || m.competition?.code !== competition || m.season?.id !== seasonId
      || !String(m.season?.startDate ?? '').startsWith('2026-')) {
      throw new FootballDataSyncError(422, 'Fixture identity does not match the season.');
    }
    seen.add(m.id);
    if (m.stage === config.stage) return true;
    const count = (phaseCounts.get(m.stage) ?? 0) + 1;
    phaseCounts.set(m.stage, count);
    if (count > knockoutStages[m.stage].maximum) throw new FootballDataSyncError(422, 'Knockout phase contains too many fixtures.');
    if (!m.homeTeam?.id || !m.awayTeam?.id || !m.utcDate) {
      if (!['SCHEDULED', 'TIMED', 'POSTPONED'].includes(m.status)) throw new FootballDataSyncError(422, 'Played fixture has unresolved participants or time.');
      awaitingFixtures.push(m.id);
      return false;
    }
    if (!roster.has(m.homeTeam.id) || !roster.has(m.awayTeam.id) || m.homeTeam.id === m.awayTeam.id
      || (m.matchday != null && ![1, 2].includes(m.matchday))
      || !['SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT', 'FINISHED', 'SUSPENDED', 'POSTPONED', 'CANCELLED', 'AWARDED'].includes(m.status)
      || typeof m.utcDate !== 'string' || !/^\d{4}-\d{2}-\d{2}T.+Z$/.test(m.utcDate) || !Number.isFinite(Date.parse(m.utcDate))) {
      throw new FootballDataSyncError(422, 'Invalid knockout fixture.');
    }
    return true;
  });
  const matches = fixtures.map((m: any) => {
    for (const team of [m.homeTeam, m.awayTeam]) {
      if (typeof team.name !== 'string' || !team.name.trim() || team.name.length > 160) {
        throw new FootballDataSyncError(422, 'Club identity is incomplete.');
      }
      const id = `football-data-team-${team.id}`;
      if (clubs.has(id) && clubs.get(id)!.name !== team.name.trim()) {
        throw new FootballDataSyncError(422, 'Conflicting club names in one snapshot.');
      }
      clubs.set(id, { id, name: team.name.trim(), short_name: String(team.tla || team.shortName || team.name).slice(0, 40), logo_url: clubCrestUrl(team.crest) ?? clubs.get(id)?.logo_url ?? null });
    }
    if (typeof m.lastUpdated !== 'string' || !m.lastUpdated.endsWith('Z') || !Number.isFinite(Date.parse(m.lastUpdated))) {
      throw new FootballDataSyncError(422, 'Fixture revision time is missing.');
    }
    const score = readFinalScore(m);
    if (m.status === 'FINISHED' && (
      !['regular', 'extra_time', 'penalties'].includes(score.kind)
      || (m.stage === config.stage && score.kind !== 'regular')
      || Date.parse(m.utcDate) > +now
      || !score.gameScoreCandidate || Object.values(score.gameScoreCandidate).some(n => Number(n) > 99)
      || (m.stage === 'FINAL' && score.gameScoreCandidate.home === score.gameScoreCandidate.away)
    )) {
      throw new FootballDataSyncError(422, 'Finished result does not match the scoring contract.');
    }
    if (['TIMED', 'SCHEDULED'].includes(m.status) && (m.score?.fullTime?.home != null || m.score?.fullTime?.away != null)) {
      throw new FootballDataSyncError(422, 'Unplayed fixture already has a score.');
    }
    return {
      id: `football-data-match-${m.id}`, provider_match_id: String(m.id),
      home_id: `football-data-team-${m.homeTeam.id}`, away_id: `football-data-team-${m.awayTeam.id}`,
      kickoff: m.utcDate, matchday: m.matchday ?? null, stage: m.stage === config.stage ? config.label : knockoutStages[m.stage].label, provider_status: m.status,
      provider_updated_at: m.lastUpdated,
      provider_score: Object.fromEntries(['duration', 'fullTime', 'halfTime', 'regularTime', 'extraTime', 'penalties']
        .filter(key => m.score?.[key] !== undefined).map(key => [key, m.score[key]])),
      home_score: score.gameScoreCandidate?.home ?? null, away_score: score.gameScoreCandidate?.away ?? null,
      status: m.status === 'FINISHED' ? 'finished' : ['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'].includes(m.status) ? 'live' : 'scheduled',
      scores: [] as any[],
    };
  });
  return { competition, season: 2026, scoring_rule: FOOTBALL_DATA_SCORING_RULE, awaiting_fixtures: awaitingFixtures, clubs: [...clubs.values()], matches };
}

export async function prepareFootballDataBatch(admin: SupabaseClient, payload: any, now = new Date(), competition: FootballCompetition = 'CL') {
  const batch = normalizeFootballDataSeason(payload, now, competition);
  const byId = new Map(batch.matches.map((m: any) => [m.id, m]));
  const ids = batch.matches.filter((m: any) => m.status === 'finished').map((m: any) => m.id);
  // Stable composite ordering and explicit pagination: PostgREST normally caps at 1,000 rows.
  for (let offset = 0; offset < ids.length; offset += 40) {
    for (let page = 0; ; page++) {
      const { data, error } = await admin.from('predictions')
        .select('match_id,user_id,lobby_id,predicted_home_score,predicted_away_score')
        .in('match_id', ids.slice(offset, offset + 40))
        .order('match_id').order('user_id').order('lobby_id').range(page * 1000, page * 1000 + 999);
      if (error) throw new FootballDataSyncError(503, 'Prediction snapshot could not be loaded.');
      for (const prediction of data || []) {
        const match: any = byId.get(prediction.match_id);
        if (!match) throw new FootballDataSyncError(503, 'Prediction snapshot does not match the season.');
        const { match_id: _, ...row } = prediction;
        match.scores.push({ ...row, points_earned: calculatePoints(
          row.predicted_home_score, row.predicted_away_score, match.home_score, match.away_score, 'football',
        ) });
      }
      if ((data || []).length < 1000) break;
    }
  }
  return batch;
}

export async function runFootballDataSync(admin: SupabaseClient, options: {
  dryRun: boolean; bootstrap?: boolean; token?: string; transport?: typeof fetch; competition?: FootballCompetition;
}) {
  const competition = options.competition ?? 'CL';
  const reader = createProviderReader(options.token ?? process.env.FOOTBALL_DATA_API_TOKEN, options.transport);
  const payload = await reader.matches(competition, 2026);
  const batch = await prepareFootballDataBatch(admin, payload, new Date(), competition);
  const { data, error } = await admin.rpc('sync_football_data_catalog', {
    batch_param: batch, dry_run_param: options.dryRun, bootstrap_param: options.bootstrap === true,
  });
  if (error) {
    if (error.code === '40001') throw new FootballDataSyncError(409, 'Prediction snapshot changed; retry the sync.');
    if (error.code === '55000') throw new FootballDataSyncError(503, 'Sync target is disabled or requires configuration.');
    throw new FootballDataSyncError(503, 'Database sync could not be confirmed; retry idempotently.');
  }
  return data as Record<string, any>;
}

/** Independent transactions: one unavailable league must not stop the other league's results. */
export async function runFootballDataCatalogSync(admin: SupabaseClient, dryRun: boolean,
  sync = (competition: FootballCompetition) => runFootballDataSync(admin, { dryRun, competition })) {
  const competitions: Record<string, any> = {};
  for (const competition of Object.keys(FOOTBALL_DATA_COMPETITIONS) as FootballCompetition[]) {
    try { competitions[competition] = await sync(competition); }
    catch (error) {
      competitions[competition] = { failed: true, status: error instanceof FootballDataSyncError ? error.statusCode : 502,
        error: error instanceof FootballDataSyncError ? error.message : 'Provider sync failed; retry.' };
    }
  }
  const results = Object.values(competitions);
  return { dry_run: dryRun, wrote_to_db: results.some(result => result.wrote_to_db === true), competitions,
    failed: results.some(result => result.failed), busy: results.some(result => result.busy),
    conflicts: results.flatMap(result => result.conflicts ?? []) };
}

type Request = { httpMethod?: string; headers?: Record<string, string | undefined>; body?: string | null };
type Dependencies = {
  secret?: string; writesEnabled?: boolean; tokenConfigured?: boolean;
  sync?: (dryRun: boolean) => Promise<Record<string, any>>;
};
const response = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', allow: 'POST' },
  body: JSON.stringify(body),
});

export async function handleFootballDataSyncRequest(event: Request, dependencies: Dependencies = {}) {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed.' });
  const secret = dependencies.secret ?? process.env.FOOTBALL_DATA_SYNC_SECRET;
  if (!secret || secret.length < 32) return response(503, { error: 'Football data sync secret is not configured.' });
  const header = Object.entries(event.headers || {}).find(([key]) => key.toLowerCase() === 'authorization')?.[1] || '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (Buffer.byteLength(provided) !== Buffer.byteLength(secret)
    || !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) return response(401, { error: 'Unauthorized.' });
  let body: any;
  try { body = JSON.parse(event.body || '{}'); } catch { return response(400, { error: 'Invalid JSON.' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'dryRun')
    || (body.dryRun !== undefined && typeof body.dryRun !== 'boolean')) {
    return response(400, { error: 'Only a boolean dryRun option is accepted.' });
  }
  const dryRun = body.dryRun !== false;
  if (!dryRun && !(dependencies.writesEnabled ?? process.env.FOOTBALL_DATA_SYNC_WRITE_ENABLED === 'true')) {
    return response(503, { error: 'Football data sync writes are disabled.' });
  }
  if (!(dependencies.tokenConfigured ?? Boolean(process.env.FOOTBALL_DATA_API_TOKEN))) {
    return response(503, { error: 'Football data provider token is not configured.' });
  }
  try {
    const result = await (dependencies.sync ?? (async dry => {
      const admin = getSupabaseAdmin();
      const [football, hockey, mma] = await Promise.all([runFootballDataCatalogSync(admin, dry), runHockeyCatalogSync(admin, dry), runMmaCatalogSync(admin, dry)]);
      return { ...football, competitions: { ...football.competitions, ...hockey.competitions, ...mma.competitions },
        failed: football.failed || hockey.failed || mma.failed, busy: football.busy || hockey.busy || mma.busy,
        wrote_to_db: football.wrote_to_db || hockey.wrote_to_db || mma.wrote_to_db,
        conflicts: [...football.conflicts, ...hockey.conflicts, ...mma.conflicts] };
    }))(dryRun);
    return response(result.failed ? 502 : result.busy ? 409 : result.conflicts?.length ? 409 : 200, result);
  } catch (error) {
    if (error instanceof FootballDataSyncError) return response(error.statusCode, { error: error.message });
    // Upstream failures may reflect credentials. Never return or log their text.
    return response(502, { error: 'Football data sync failed; check provider availability and retry.' });
  }
}
