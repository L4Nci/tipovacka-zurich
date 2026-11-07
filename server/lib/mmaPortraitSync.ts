import type { SupabaseClient } from '@supabase/supabase-js';
import { load } from 'cheerio';
import { safeMmaPortrait, type MmaPortrait } from '../../src/lib/mmaPortraits.ts';
import { MmaProviderError } from './mmaProvider.ts';

export function normalizeMmaPortraitProfile(payload: any, fighterId: number): MmaPortrait | null {
  if (!Number.isSafeInteger(fighterId) || fighterId < 1 || payload?.data?.id !== fighterId
      || !Array.isArray(payload.data.images) || payload.data.images.length > 100 || payload.error) {
    throw new MmaProviderError('MMA fighter portrait response could not be verified.');
  }
  const images = payload.data.images.flatMap((image: any) => {
    if (typeof image?.artist !== 'string' || image.artist.length > 2000) return [];
    const html = load(image.artist); html('script,style').remove();
    const portrait = safeMmaPortrait({ ...image, artist: html.root().text().replace(/\s+/g, ' ').trim() });
    return portrait ? [portrait] : [];
  }) as MmaPortrait[];
  // Prefer a modest portrait over a wide event photograph; retain provider order on ties.
  const score = (p: MmaPortrait) => p.width && p.height
    ? Math.abs(p.width / p.height - 0.8) + Math.max(0, p.width - 1000) / 10000 : 10;
  return images.sort((a, b) => score(a) - score(b))[0] ?? null;
}

export async function readMmaPortrait(fighterId: number, key: string, transport: typeof fetch = fetch) {
  if (!Number.isSafeInteger(fighterId) || fighterId < 1 || !key.trim()) throw new MmaProviderError('MMA portrait configuration is invalid.');
  try {
    const response = await transport('https://api.ufcalendar.com/v1/fighters/' + fighterId, {
      headers: { authorization: 'Bearer ' + key.trim() }, redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new MmaProviderError('MMA portrait provider request failed.');
    const text = await response.text();
    if (text.length > 2000000) throw new MmaProviderError('MMA portrait response is too large.');
    return normalizeMmaPortraitProfile(JSON.parse(text), fighterId);
  } catch { throw new MmaProviderError('MMA portrait provider is unavailable or the response could not be verified.'); }
}

export async function runMmaPortraitSync(admin: SupabaseClient, key: string, transport: typeof fetch = fetch,
  fighterId?: number) {
  if (!key.trim()) return { skipped: true, wrote_to_db: false, warning: 'MMA portrait key is not configured.' };
  try {
    const claim = await admin.rpc('claim_mma_fighter_portrait', { p_fighter_id: fighterId ?? null });
    if (claim.error) throw new Error();
    const lease = Array.isArray(claim.data) ? claim.data[0] : null;
    if (!lease) return { skipped: true, wrote_to_db: false, reason: 'Portraits are cached, reserved or outside their request budget.' };
    let portrait: MmaPortrait | null;
    try { portrait = await readMmaPortrait(Number(lease.fighter_id), key, transport); }
    catch {
      const failed = await admin.rpc('complete_mma_fighter_portrait', {
        p_fighter_id: lease.fighter_id, p_claim_token: lease.claim_token, p_portrait: null, p_success: false,
      });
      if (failed.error) throw new Error();
      return { skipped: false, wrote_to_db: false, warning: 'Portrait lookup failed; existing image retained and retry deferred.' };
    }
    const completed = await admin.rpc('complete_mma_fighter_portrait', {
      p_fighter_id: lease.fighter_id, p_claim_token: lease.claim_token, p_portrait: portrait, p_success: true,
    });
    if (completed.error || completed.data !== true) throw new Error();
    return { skipped: false, wrote_to_db: true, fighter_id: Number(lease.fighter_id), has_portrait: portrait !== null };
  } catch {
    // Optional cosmetics must not fail or expose provider errors in result sync.
    return { skipped: false, wrote_to_db: false, warning: 'Portrait cache could not be refreshed.' };
  }
}
