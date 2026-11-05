import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HOCKEY_COMPETITIONS, type HockeyCompetition } from '../server/lib/hockeyProvider.ts';
import { prepareHockeyBatch, submitHockeyBatch } from '../server/lib/hockeySync.ts';
import { getSupabaseAdmin } from '../server/lib/supabaseAdmin.ts';

async function main() {
  const [competition, mode, snapshotPath] = process.argv.slice(2) as [HockeyCompetition, string?, string?];
  if (!Object.hasOwn(HOCKEY_COMPETITIONS, competition) || ![undefined, '--capture', '--write'].includes(mode)
    || (snapshotPath && mode !== '--write') || process.argv.length > 5) throw new Error('Usage: npm run hockey:import -- NHL|ELH [--capture|--write [snapshot.json]]');
  if (new URL(process.env.VITE_SUPABASE_URL || '').hostname !== 'hkhkbtzdyjbdeeoiurvw.supabase.co') throw new Error('Unexpected database target.');
  const admin = getSupabaseAdmin();
  if (mode === '--write') execFileSync(process.execPath, ['--import', 'tsx', 'scripts/football-data-import.ts', '--backup-only'], { stdio: 'inherit' });
  const snapshot = snapshotPath ? JSON.parse(readFileSync(snapshotPath, 'utf8')) : null;
  if (snapshot && (snapshot.batch?.competition !== competition || !Number.isFinite(Date.parse(snapshot.captured_at))
    || Date.now() - Date.parse(snapshot.captured_at) > 15 * 60000 || Date.parse(snapshot.captured_at) > Date.now())) throw new Error('Snapshot is stale or has the wrong scope. Capture again.');
  const batch = snapshot?.batch ?? await prepareHockeyBatch(admin, competition);
  if (mode === '--capture') {
    const path = join(mkdtempSync(join(tmpdir(), 'tipovacka-hockey-')), 'snapshot.json');
    writeFileSync(path, JSON.stringify({ captured_at: new Date().toISOString(), batch }), { mode: 0o600 });
    console.log(JSON.stringify({ snapshot: path, competition, matches: batch.matches.length, clubs: batch.clubs.length,
      finished: batch.matches.filter((m: any) => m.status === 'finished').length, awaiting: batch.awaiting_fixtures.length, databaseWrites: 0 }));
    return;
  }
  const preview = await submitHockeyBatch(admin, batch, true, true);
  if (preview.busy || preview.conflicts?.length) throw new Error('Hockey dry-run has conflicts; import stopped.');
  const result = mode === '--write' ? await submitHockeyBatch(admin, batch, false, true) : preview;
  console.log(JSON.stringify(result, null, 2));
  if (result.busy || result.conflicts?.length) process.exitCode = 1;
}
main().catch(error => {
  // Provider/DB errors may reflect credentials or response data; print only our own controlled stage messages.
  console.error('Hockey import failed. Check source validation and DB configuration; credentials are not printed.');
  if (/^(Invalid|Unknown|Wrong|NHL |ELH |Hockey kickoff|Conflicting|Unbalanced|Snapshot |Usage:|Unexpected|Hockey dry-run)/.test(error?.message || '')) console.error(error.message);
  process.exitCode = 1;
});
