import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forgetPublicJoin, publicPlayPath, publicPlayRoute, readPublicJoin, rememberPublicJoin } from './publicPlayIntent.ts';

const store = () => {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
};

test('public routes accept canonical slugs; invite/query/open-redirect strings never become a target', () => {
  assert.deepEqual(publicPlayRoute('/play'), { slug: null });
  assert.deepEqual(publicPlayRoute('/play/ufc-2026/'), { slug: 'ufc-2026' });
  for (const path of ['/join/ABC123', '/play/../admin', '/play/%2fjoin%2fSECRET', '/play//evil.example', '/play/CL', '/play/ufc?join=PRIVATE']) {
    assert.equal(publicPlayRoute(path), null, path);
  }
  assert.equal(publicPlayPath('champions-league-2026'), '/play/champions-league-2026');
  assert.throws(() => publicPlayPath('https://evil.example'));
  assert.deepEqual(publicPlayRoute(`/play/${'a'.repeat(80)}`), { slug: 'a'.repeat(80) });
  assert.equal(publicPlayRoute(`/play/${'a'.repeat(81)}`), null);
});

test('merely resolving a public route never records consent to join', () => {
  const storage = store();
  publicPlayRoute('/play/ufc-2026');
  assert.equal(readPublicJoin(storage, 'ufc-2026', 'user_playerA', 100), null);
  assert.equal(storage.values.size, 0);
});

test('explicit intent survives an OAuth callback only for its slug and within 30 minutes', () => {
  const storage = store();
  rememberPublicJoin(storage, 'ufc-2026', null, 1000);
  assert.equal(readPublicJoin(storage, 'ufc-2026', 'user_playerA', 1500)?.slug, 'ufc-2026');
  assert.equal(readPublicJoin(storage, 'premier-league', 'user_playerA', 1500), null);
  assert.equal(readPublicJoin(storage, 'ufc-2026', 'user_playerA', 999), null);
  assert.equal(readPublicJoin(storage, 'ufc-2026', 'user_playerA', 1000 + 30 * 60 * 1000 + 1), null);
});

test('identity-bound intent cannot follow another account and is explicitly removable', () => {
  const storage = store();
  rememberPublicJoin(storage, 'ufc-2026', 'user_playerA', 1000);
  assert.ok(readPublicJoin(storage, 'ufc-2026', 'user_playerA', 1500));
  assert.equal(readPublicJoin(storage, 'ufc-2026', 'user_playerB', 1500), null);
  assert.equal(readPublicJoin(storage, 'ufc-2026', null, 1500), null);
  forgetPublicJoin(storage);
  assert.equal(readPublicJoin(storage, 'ufc-2026', 'user_playerA', 1500), null);
});

test('blocked or corrupt browser storage fails closed without breaking sign-in', () => {
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  assert.doesNotThrow(() => rememberPublicJoin(blocked, 'ufc-2026', null, 1000));
  assert.equal(readPublicJoin(blocked, 'ufc-2026', null, 1500), null);
  assert.doesNotThrow(() => forgetPublicJoin(blocked));
  for (const text of ['not-json', '{}', '{"version":1,"slug":"ufc-2026","createdAt":1000,"subject":"other"}']) {
    assert.equal(readPublicJoin({ ...store(), getItem: () => text }, 'ufc-2026', 'user_playerA', 1500), null);
  }
});
