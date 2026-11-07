import 'dotenv/config';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSupabaseAdmin } from '../server/lib/supabaseAdmin.ts';
import { runMmaPortraitSync } from '../server/lib/mmaPortraitSync.ts';

async function main() {
  const [mode = '--dry-run', selector] = process.argv.slice(2);
  if (!['--dry-run', '--write'].includes(mode) || process.argv.length > 4
      || (selector && !/^(--fighters=\d+(,\d+){0,9}|--limit=([1-9]|[1-4]\d|50))$/.test(selector))) throw new Error();
  const ids = selector?.startsWith('--fighters=') ? selector.slice('--fighters='.length).split(',').map(Number) : [];
  const limit = selector?.startsWith('--limit=') ? Number(selector.slice('--limit='.length)) : 1;
  if (ids.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== ids.length) throw new Error();
  if (new URL(process.env.VITE_SUPABASE_URL || '').hostname !== 'hkhkbtzdyjbdeeoiurvw.supabase.co') throw new Error();
  const admin = getSupabaseAdmin();
  const before = await admin.from('mma_fighters').select('*').order('id');
  if (before.error) throw new Error();
  if (mode === '--dry-run') {
    console.log(JSON.stringify({ mode, fighters: before.data.length, cached: before.data.filter(f => f.portrait_checked_at).length,
      portraits: before.data.filter(f => f.portrait).length, provider_requests: 0 }));
    return;
  }
  if (!process.env.UFCAL_API_KEY?.trim()) throw new Error();
  const directory = mkdtempSync(join(tmpdir(), 'tipovacka-mma-portraits-backup-'));
  writeFileSync(join(directory, 'fighters.json'), JSON.stringify(before.data), { mode: 0o600 });
  console.log(JSON.stringify({ backup: directory }));
  // Explicit IDs for a small seed, otherwise one due fighter. Shared DB claims still gate every request.
  const targets = ids.length ? ids : Array.from({ length: limit }, () => undefined);
  for (const [index, id] of targets.entries()) {
    if (index) await new Promise(resolve => setTimeout(resolve, 11000));
    const result = await runMmaPortraitSync(admin, process.env.UFCAL_API_KEY, fetch, id);
    console.log(JSON.stringify(result));
    if (result.skipped && !ids.length) break;
  }
}
main().catch(() => { console.error('MMA portrait import failed. Use --dry-run|--write [--fighters=196,102,116|--limit=1..50]. Credentials are not printed.'); process.exitCode = 1; });
