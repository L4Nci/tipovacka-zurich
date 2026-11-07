import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMmaPortraitProfile, readMmaPortrait, runMmaPortraitSync } from './mmaPortraitSync.ts';
const portrait = () => ({ url: 'https://d33t2v9cbr12gb.cloudfront.net/commons/' + 'a'.repeat(64) + '.webp',
  width: 520, height: 679, artist: 'Show Jana Krause', license: 'CC BY 3.0',
  license_url: 'https://creativecommons.org/licenses/by/3.0', source_page: 'https://commons.wikimedia.org/wiki/File:JiriProchazka2022.png' });

test('profile identity is checked and a compact portrait wins over a wide photograph', () => {
  const image = portrait();
  const p = normalizeMmaPortraitProfile({ data: { id: 196, images: [
    { ...image, width: 1440, height: 810 }, { ...image, artist: '<a href="https://example.com">Show Jana Krause</a>' },
  ] } }, 196);
  assert.deepEqual(p, image);
  assert.equal(normalizeMmaPortraitProfile({ data: { id: 196, images: [] } }, 196), null);
  assert.throws(() => normalizeMmaPortraitProfile({ data: { id: 102, images: [image] } }, 196));
  assert.throws(() => normalizeMmaPortraitProfile({ data: { id: 196 } }, 196));
});

test('cached/budget-denied profiles cost no provider request, successful empty results are cached', async () => {
  let requests = 0; const calls: any[] = [];
  const transport = (async () => { requests++; return new Response(JSON.stringify({ data: { id: 196, images: [] } })); }) as typeof fetch;
  const denied = { rpc: async () => ({ data: [], error: null }) } as any;
  assert.equal((await runMmaPortraitSync(denied, 'private', transport)).skipped, true);
  assert.equal(requests, 0);
  const admin = { rpc: async (name: string, args: any) => {
    calls.push([name, args]);
    return { data: name === 'claim_mma_fighter_portrait' ? [{ fighter_id: 196, claim_token: 'claim' }] : true, error: null };
  } } as any;
  assert.equal((await runMmaPortraitSync(admin, 'private', transport)).has_portrait, false);
  assert.equal(requests, 1);
  assert.equal(calls[1][1].p_portrait, null);
  assert.equal(calls[1][1].p_success, true);
});

test('provider errors retain the cache, defer retries and cannot expose credentials', async () => {
  const calls: any[] = [];
  const admin = { rpc: async (name: string, args: any) => {
    calls.push([name, args]);
    return { data: name === 'claim_mma_fighter_portrait' ? [{ fighter_id: 196, claim_token: 'claim' }] : true, error: null };
  } } as any;
  const result = await runMmaPortraitSync(admin, 'private-secret', (async () => { throw new Error('private-secret'); }) as typeof fetch);
  assert.equal(result.wrote_to_db, false);
  assert.equal(JSON.stringify(result).includes('private-secret'), false);
  assert.equal(calls[1][1].p_success, false);
});

test('fighter requests stay on the fixed provider origin with header credentials and redirects disabled', async () => {
  await readMmaPortrait(196, 'private', (async (url, init) => {
    assert.equal(url, 'https://api.ufcalendar.com/v1/fighters/196');
    assert.equal((init?.headers as any).authorization, 'Bearer private');
    assert.equal(init?.redirect, 'error');
    return new Response(JSON.stringify({ data: { id: 196, images: [portrait()] } }));
  }) as typeof fetch);
  await assert.rejects(readMmaPortrait(-1, 'private'));
});
