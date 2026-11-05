import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSupabaseAdmin } from '../server/lib/supabaseAdmin.ts';
import { FOOTBALL_DATA_TOURNAMENT, runFootballDataSync } from '../server/lib/footballDataSync.ts';

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && !['--write', '--backup-only'].includes(args[0]))) throw new Error('Usage: npm run football-data:import -- [--write|--backup-only]');
  if (new URL(process.env.VITE_SUPABASE_URL || '').hostname !== 'hkhkbtzdyjbdeeoiurvw.supabase.co') {
    throw new Error('Unexpected database target; import stopped.');
  }
  const admin = getSupabaseAdmin();
  const write = args[0] === '--write';
  if (write || args[0] === '--backup-only') {
    const backup: Record<string, unknown> = { captured_at: new Date().toISOString(), project: 'hkhkbtzdyjbdeeoiurvw' };
    const order: Record<string, string[]> = {
      tournaments: ['id'], participants: ['id'], matches: ['id'], predictions: ['user_id','lobby_id','match_id'],
      profiles: ['id'], lobbies: ['id'], lobby_members: ['lobby_id','user_id'], lobby_tournaments: ['id'],
    };
    for (const [table, keys] of Object.entries(order)) {
      const rows = [];
      for (let page = 0; ; page++) {
        let query = admin.from(table).select('*');
        for (const key of keys) query = query.order(key);
        const { data, error } = await query.range(page * 1000, page * 1000 + 999);
        if (error) throw new Error('Database backup failed; import stopped.');
        rows.push(...(data || []));
        if ((data || []).length < 1000) break;
      }
      backup[table] = rows;
    }
    const directory = mkdtempSync(join(tmpdir(), 'tipovacka-before-football-import-'));
    const json = JSON.stringify(backup);
    const path = join(directory, 'public-data.json');
    writeFileSync(path, json, { mode: 0o600 });
    console.log(JSON.stringify({ backup: path, sha256: createHash('sha256').update(json).digest('hex') }));
  }
  if (args[0] === '--backup-only') return;
  const result = await runFootballDataSync(admin, { dryRun: !write, bootstrap: true });
  console.log(JSON.stringify({ ...result, tournament_id: FOOTBALL_DATA_TOURNAMENT }, null, 2));
  if (result.busy || result.conflicts?.length) process.exitCode = 1;
}
main().catch(() => { console.error('Football data import failed. No credentials are printed. Inspect the checked provider and DB configuration.'); process.exitCode = 1; });
