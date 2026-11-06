import type { SupabaseClient } from '@supabase/supabase-js';
import { MMA_PILOT_EVENTS } from '../../src/lib/mma.ts';
import { readMmaEvent, MmaProviderError, type MmaBatch } from './mmaProvider.ts';

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
  // Sequential: the provider has a 10 requests/minute limit and these are only two pilot cards.
  for (const event of MMA_PILOT_EVENTS) {
    try {
      if (!key.trim()) throw new MmaProviderError('MMA provider key is not configured.');
      if (!dryRun) {
        const claim = await admin.rpc('claim_mma_sync', { p_tournament_id: event.tournamentId });
        if (claim.error) throw new MmaProviderError('MMA sync reservation failed.');
        if (!claim.data) { results[event.tournamentId] = { skipped: true, reason: 'Not due or monthly request budget exhausted.' }; continue; }
      }
      results[event.tournamentId] = await submitMmaBatch(admin, await readMmaEvent(event.providerId, key, options.transport), dryRun);
    } catch (error) {
      results[event.tournamentId] = { failed: true, error: error instanceof MmaProviderError ? error.message : 'MMA sync could not be verified.' };
    }
  }
  const values = Object.values(results);
  return { competitions: results, failed: values.some(result => result.failed),
    wrote_to_db: values.some(result => result.wrote_to_db), busy: false, conflicts: [] };
}
