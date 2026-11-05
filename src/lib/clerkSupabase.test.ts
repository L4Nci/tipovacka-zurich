import assert from 'node:assert/strict';
import test from 'node:test';
import { bindClerkAccessTokenGetter, createClerkSupabaseClient, getClerkAccessToken } from './clerkSupabase.ts';
import { normalizeAccountProfile } from './clerkAccount.ts';

test('the bridge requires explicit initialization and stale cleanup preserves the active session', async () => {
  await assert.rejects(getClerkAccessToken(), /připravené/);
  const oldUnbind = bindClerkAccessTokenGetter(async () => 'old-session');
  const unbind = bindClerkAccessTokenGetter(async () => 'active-session');
  oldUnbind();
  assert.equal(await getClerkAccessToken(), 'active-session');
  unbind();
  await assert.rejects(getClerkAccessToken(), /připravené/);
});

test('Supabase RPC requests use the current Clerk token and cannot read a legacy auth session', async t => {
  const originalFetch = globalThis.fetch;
  const headers: string[] = [];
  globalThis.fetch = async (_url, options) => {
    headers.push(new Headers(options?.headers).get('Authorization') || '');
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  let currentToken: string | null = 'clerk-session-one';
  const unbind = bindClerkAccessTokenGetter(async () => currentToken);
  t.after(unbind);
  const client = createClerkSupabaseClient('https://example.supabase.co', 'sb_publishable_example', getClerkAccessToken);
  assert.equal((await client.rpc('bootstrap_my_account')).error, null);
  currentToken = 'clerk-session-refreshed';
  assert.equal((await client.rpc('complete_my_profile')).error, null);
  assert.deepEqual(headers, ['Bearer clerk-session-one', 'Bearer clerk-session-refreshed']);
  assert.throws(() => client.auth.getSession(), /accessToken/);
  currentToken = null;
  assert.equal(await getClerkAccessToken(), null);
});

test('account bootstrap accepts only an internal UUID and returns database-controlled role/profile', () => {
  const raw = {
    id: 'e7385820-c176-4ba1-8560-5653c9bbaf59',
    username: 'player_internal',
    display_name: 'Viktor',
    role: 'player',
    avatar_emoji: '⚽',
    avatar_bg: '#fee2e2',
    locale: 'en',
    needs_profile_completion: false,
  };
  const profile = normalizeAccountProfile(raw);
  assert.equal(profile.id, raw.id);
  assert.equal(profile.username, 'Viktor');
  assert.equal(profile.role, 'player');
  assert.equal(profile.locale, 'en');
  assert.equal(profile.needs_profile_completion, false);
  assert.equal('email' in profile, false);
  assert.throws(() => normalizeAccountProfile({ ...raw, id: 'user_clerk_subject' }), /Účet/);
  assert.throws(() => normalizeAccountProfile({ ...raw, role: 'owner' }), /Účet/);
  assert.throws(() => normalizeAccountProfile({ ...raw, needs_profile_completion: undefined }), /Účet/);
  assert.equal(normalizeAccountProfile({ ...raw, display_name: null, needs_profile_completion: true }).username, raw.username);
});
