import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MMA_PILOT_EVENTS } from '../src/lib/mma.ts';
import { readMmaEvent, MmaProviderError } from '../server/lib/mmaProvider.ts';
import { submitMmaBatch } from '../server/lib/mmaSync.ts';
import { getSupabaseAdmin } from '../server/lib/supabaseAdmin.ts';

async function main() {
  const mode = process.argv[2] ?? '--dry-run';
  if (!['--dry-run', '--write'].includes(mode) || process.argv.length > 3) throw new MmaProviderError('Usage: npm run mma:import -- --dry-run|--write');
  if (new URL(process.env.VITE_SUPABASE_URL || '').hostname !== 'hkhkbtzdyjbdeeoiurvw.supabase.co') throw new MmaProviderError('Unexpected database target.');
  const admin = getSupabaseAdmin();
  if (mode === '--write') execFileSync(process.execPath, ['--import', 'tsx', 'scripts/football-data-import.ts', '--backup-only'], { stdio: 'inherit' });
  const snapshots = [];
  for (const event of MMA_PILOT_EVENTS) snapshots.push(await readMmaEvent(event.providerId, process.env.UFCAL_API_KEY ?? ''));
  const directory = mkdtempSync(join(tmpdir(), 'tipovacka-before-mma-'));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (mode === '--write') {
    const backup: Record<string, unknown> = { captured_at: new Date().toISOString() };
    const tables = { mma_events: ['tournament_id'], mma_fighters: ['id'], mma_fights: ['id'],
      mma_predictions: ['lobby_id', 'fight_id', 'user_id'] };
    for (const [table, keys] of Object.entries(tables)) {
      const rows = [];
      for (let page = 0; ; page++) {
        let query = admin.from(table).select('*');
        for (const key of keys) query = query.order(key);
        const { data, error } = await query.range(page * 1000, page * 1000 + 999);
        if (error) throw new MmaProviderError('MMA backup failed; no event import was performed.');
        rows.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
      }
      backup[table] = rows;
    }
    writeFileSync(join(directory, 'mma-data.json'), JSON.stringify(backup), { mode: 0o600 });
  }
  writeFileSync(join(directory, 'provider-snapshots.json'), JSON.stringify(snapshots), { mode: 0o600 });
  for (const batch of snapshots) {
    const preview = await submitMmaBatch(admin, batch, true);
    console.log(JSON.stringify(preview));
  }
  if (mode === '--write') {
    for (const batch of snapshots) console.log(JSON.stringify(await submitMmaBatch(admin, batch, false)));
    const { data: lobby, error: lookupError } = await admin.from('lobbies').select('id').eq('id', 'lobby-c95b9dbc84d962b2ff9b40fd').single();
    if (lookupError || !lobby) throw new MmaProviderError('Pilot lobby could not be verified; catalog imported without attaching.');
    const { error } = await admin.from('lobby_tournaments').upsert([...new Set(snapshots.map(batch => 'ufc-' + batch.event.starts_at.slice(0, 4)))].map(tournamentId => ({
      lobby_id: lobby.id, tournament_id: tournamentId, status: 'active',
    })), { onConflict: 'lobby_id,tournament_id' });
    if (error) throw new MmaProviderError('MMA catalog imported but pilot lobby attachment failed.');
    console.log(JSON.stringify({ attached_to_pilot: true, events: snapshots.length, snapshots: directory }));
  }
}
main().catch(error => {
  console.error(error instanceof MmaProviderError ? error.message : 'MMA import failed. Check configuration; credentials are not printed.');
  process.exitCode = 1;
});
