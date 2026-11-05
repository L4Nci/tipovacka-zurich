import { timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { analyzeSeason, createProviderReader, readFinalScore } from './footballDataProvider.mjs';
import { calculatePoints } from '../../src/lib/scoring.ts';
import { clubCrestUrl } from '../../src/lib/teamAssets.ts';
import { getSupabaseAdmin } from './supabaseAdmin.ts';

export const FOOTBALL_DATA_TOURNAMENT = 'uefa-champions-league-2026-27';
export class FootballDataSyncError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}

export function normalizeFootballDataSeason(payload: any, now = new Date()) {
  const report = analyzeSeason(payload, { competition: 'CL', season: 2026, now });
  if (!report.validationPassed) throw new FootballDataSyncError(422, 'Season validation failed; no import was submitted.');
  const clubs = new Map<string, { id: string; name: string; short_name: string; logo_url: string | null }>();
  const matches = payload.matches.filter((m: any) => m.stage === 'LEAGUE_STAGE').map((m: any) => {
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
    // This importer supports league phase only; knockout rules are a separate step.
    if (m.status === 'FINISHED' && (score.kind !== 'regular' || Date.parse(m.utcDate) > +now)) {
      throw new FootballDataSyncError(422, 'League-phase result requires review.');
    }
    return {
      id: `football-data-match-${m.id}`, provider_match_id: String(m.id),
      home_id: `football-data-team-${m.homeTeam.id}`, away_id: `football-data-team-${m.awayTeam.id}`,
      kickoff: m.utcDate, matchday: m.matchday, provider_status: m.status,
      provider_updated_at: m.lastUpdated,
      provider_score: Object.fromEntries(['duration', 'fullTime', 'halfTime', 'regularTime', 'extraTime', 'penalties']
        .filter(key => m.score?.[key] !== undefined).map(key => [key, m.score[key]])),
      home_score: score.officialGoals?.home ?? null, away_score: score.officialGoals?.away ?? null,
      status: m.status === 'FINISHED' ? 'finished' : ['IN_PLAY', 'PAUSED'].includes(m.status) ? 'live' : 'scheduled',
      scores: [] as any[],
    };
  });
  return { competition: 'CL', season: 2026, clubs: [...clubs.values()], matches };
}

export async function prepareFootballDataBatch(admin: SupabaseClient, payload: any, now = new Date()) {
  const batch = normalizeFootballDataSeason(payload, now);
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
  dryRun: boolean; bootstrap?: boolean; token?: string; transport?: typeof fetch;
}) {
  const reader = createProviderReader(options.token ?? process.env.FOOTBALL_DATA_API_TOKEN, options.transport);
  const payload = await reader.matches('CL', 2026);
  const batch = await prepareFootballDataBatch(admin, payload);
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
    const result = await (dependencies.sync ?? (dry => runFootballDataSync(getSupabaseAdmin(), { dryRun: dry })))(dryRun);
    return response(result.busy ? 409 : result.conflicts?.length ? 409 : 200, result);
  } catch (error) {
    if (error instanceof FootballDataSyncError) return response(error.statusCode, { error: error.message });
    // Upstream failures may reflect credentials. Never return or log their text.
    return response(502, { error: 'Football data sync failed; check provider availability and retry.' });
  }
}
