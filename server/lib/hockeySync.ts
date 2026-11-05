import type { SupabaseClient } from '@supabase/supabase-js';
import { calculatePoints } from '../../src/lib/scoring.ts';
import { HOCKEY_COMPETITIONS, NHL_CLUBS, mapLimit, readHockeySource, normalizeNhlSchedules, normalizeElhSeason,
  type HockeyCompetition, type HockeyCache } from './hockeyProvider.ts';

export async function hockeyCache(admin: SupabaseClient, competition: HockeyCompetition): Promise<HockeyCache> {
  const cache: HockeyCache = new Map();
  for (let page = 0; ; page++) {
    const { data, error } = await admin.from('matches').select('id,provider_updated_at,provider_score')
      .eq('tournament_id', HOCKEY_COMPETITIONS[competition].tournamentId).order('id').range(page * 1000, page * 1000 + 999);
    if (error) throw new Error('Hockey cache could not be loaded.');
    for (const row of data || []) cache.set(row.id, row);
    if ((data || []).length < 1000) return cache;
  }
}

export async function prepareHockeyBatch(admin: SupabaseClient, competition: HockeyCompetition, transport: typeof fetch = fetch) {
  const cache = await hockeyCache(admin, competition);
  const now = new Date();
  const read = (url: string) => readHockeySource(url, transport);
  let batch: any;
  if (competition === 'NHL') {
    const schedules = await mapLimit(NHL_CLUBS, 6, async club => ({ club, payload: JSON.parse(await read(`https://api-web.nhle.com/v1/club-schedule-season/${club}/20262027`)) }));
    batch = normalizeNhlSchedules(schedules, now, cache);
  } else {
    const base = 'https://www.hokej.cz/tipsport-extraliga/zapasy?matchList-filter-season=2026';
    const [html, calendar] = await Promise.all([read(`${base}&do=matchList-view-all`), read(`${base}&do=events&start=2026-08-01&end=2027-08-01`)]);
    batch = await normalizeElhSeason(html, JSON.parse(calendar), id => read(`https://www.hokej.cz/zapas/${id}`), now, cache);
  }
  const finished = batch.matches.filter((m: any) => m.status === 'finished');
  const byId = new Map<string, any>(finished.map((m: any) => [m.id, m]));
  for (let offset = 0; offset < finished.length; offset += 40) {
    for (let page = 0; ; page++) {
      const { data, error } = await admin.from('predictions').select('match_id,user_id,lobby_id,predicted_home_score,predicted_away_score')
        .in('match_id', finished.slice(offset, offset + 40).map((m: any) => m.id))
        .order('match_id').order('user_id').order('lobby_id').range(page * 1000, page * 1000 + 999);
      if (error) throw new Error('Hockey prediction snapshot could not be loaded.');
      for (const prediction of data || []) {
        const m = byId.get(prediction.match_id)!;
        const { match_id, ...p } = prediction;
        m.scores.push({ ...p, points_earned: calculatePoints(p.predicted_home_score, p.predicted_away_score, m.home_score, m.away_score, 'hockey') });
      }
      if ((data || []).length < 1000) break;
    }
  }
  return batch;
}

export async function submitHockeyBatch(admin: SupabaseClient, batch: any, dryRun: boolean, bootstrap = false) {
  const { data, error } = await admin.rpc('sync_hockey_catalog', { batch_param: batch, dry_run_param: dryRun, bootstrap_param: bootstrap });
  if (error) throw new Error(error.code === '40001' ? 'Hockey predictions changed; retry.' : 'Hockey database sync could not be confirmed.');
  return data as Record<string, any>;
}

export async function runHockeyCatalogSync(admin: SupabaseClient, dryRun: boolean) {
  const entries = await Promise.all((Object.keys(HOCKEY_COMPETITIONS) as HockeyCompetition[]).map(async competition => {
    try { return [competition, await submitHockeyBatch(admin, await prepareHockeyBatch(admin, competition), dryRun)] as const; }
    catch { return [competition, { failed: true, error: `${competition} sync failed; check source availability, validation and initialization.` }] as const; }
  }));
  const competitions = Object.fromEntries(entries); const results = Object.values(competitions);
  return { competitions, failed: results.some(r => r.failed), wrote_to_db: results.some(r => r.wrote_to_db === true),
    busy: results.some(r => r.busy), conflicts: results.flatMap(r => r.conflicts ?? []) };
}
