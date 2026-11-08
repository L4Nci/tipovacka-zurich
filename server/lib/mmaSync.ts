import type { SupabaseClient } from '@supabase/supabase-js';
import { readMmaCalendar, readMmaEvent, MmaCardPendingError, MmaProviderError, type MmaBatch } from './mmaProvider.ts';
import { runMmaPortraitSync } from './mmaPortraitSync.ts';

export async function submitMmaBatch(admin: SupabaseClient, batch: MmaBatch, dryRun: boolean) {
  const { data, error } = await admin.rpc('sync_mma_event', { batch_param: batch, dry_run_param: dryRun });
  if (error) throw new MmaProviderError('MMA database reconciliation failed (' + (/^[A-Z0-9]{5}$/.test(error.code) ? error.code : 'unknown') + ').');
  return data as Record<string, any>;
}

export async function runMmaCatalogSync(admin: SupabaseClient, dryRun: boolean, options: {
  enabled?: boolean; key?: string; transport?: typeof fetch;
} = {}) {
  if (!(options.enabled ?? process.env.MMA_SYNC_ENABLED === 'true')) return {
    competitions: { MMA: { skipped: true, disabled: true } }, failed: false, wrote_to_db: false, busy: false, conflicts: [],
  };
  const key = options.key ?? process.env.UFCAL_API_KEY ?? '';
  const results: Record<string, any> = {};
  if (!dryRun) {
    try {
      if (!key.trim()) throw new MmaProviderError('MMA provider key is not configured.');
      const claim = await admin.rpc('claim_mma_discovery');
      if (claim.error) throw new MmaProviderError('UFC calendar reservation failed.');
      if (claim.data) {
        const calendar = await readMmaCalendar(key, options.transport);
        const saved = await admin.rpc('complete_mma_discovery', { p_token: claim.data, p_events: calendar });
        if (saved.error) throw new MmaProviderError('UFC calendar registration failed.');
        results.MMA_CALENDAR = { wrote_to_db: true, events: saved.data };
      } else results.MMA_CALENDAR = { skipped: true, reason: 'Calendar cached or monthly request budget exhausted.' };
    } catch (error) {
      results.MMA_CALENDAR = { failed: true, error: error instanceof MmaProviderError ? error.message : 'UFC calendar could not be verified.' };
    }
  }
  const targets = await admin.rpc('list_mma_sync_targets', { p_due_only: !dryRun });
  if (targets.error || !Array.isArray(targets.data)) return {
    competitions: { ...results, MMA: { failed: true, error: 'MMA sync targets could not be verified.' } },
    failed: true, wrote_to_db: Object.values(results).some(result => result.wrote_to_db), busy: false, conflicts: [],
  };
  // At most two card calls + one daily calendar + one portrait per tick: within the Free rate limit.
  for (const event of targets.data.slice(0, 2)) {
    try {
      const tournamentId = event.tournament_id as string;
      if (!key.trim()) throw new MmaProviderError('MMA provider key is not configured.');
      if (!dryRun) {
        const claim = await admin.rpc('claim_mma_sync', { p_tournament_id: tournamentId });
        if (claim.error) throw new MmaProviderError('MMA sync reservation failed.');
        if (!claim.data) { results[tournamentId] = { skipped: true, reason: 'Not due or monthly request budget exhausted.' }; continue; }
      }
      results[tournamentId] = await submitMmaBatch(admin, await readMmaEvent(Number(event.provider_event_id), key, options.transport), dryRun);
    } catch (error) {
      results[event.tournament_id] = error instanceof MmaCardPendingError
        ? { skipped: true, wrote_to_db: false, reason: error.message }
        : { failed: true, error: error instanceof MmaProviderError ? error.message : 'MMA sync could not be verified.' };
    }
  }
  results.MMA_PORTRAITS = dryRun || Object.values(results).some(result => result.failed)
    ? { skipped: true, wrote_to_db: false, reason: 'Portrait refresh is skipped in dry-run or while result polling is unhealthy.' }
    : await runMmaPortraitSync(admin, key, options.transport);
  const values = Object.values(results);
  return { competitions: results, failed: values.some(result => result.failed),
    wrote_to_db: values.some(result => result.wrote_to_db), busy: false, conflicts: [] };
}
