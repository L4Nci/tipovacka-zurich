import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogs, initialLocale, intlLocale, normalizeLocale, pluralMessage, supportedLocales, translate } from './index.ts';
import { formatMatchKickoff } from '../lib/matchTime.ts';
import { formatTipsterCount } from '../lib/homeDashboard.ts';
import { getSeasonResultHeadline } from '../lib/productEvolution.ts';
import { formatMmaWeightClass } from './sports.ts';

test('locale preferences use canonical codes and retain old cz/region preferences', () => {
  for (const value of ['cz', 'CZ', 'cs', 'cs-CZ', 'cs_CZ']) assert.equal(normalizeLocale(value), 'cs');
  assert.equal(normalizeLocale('en-US'), 'en');
  assert.equal(normalizeLocale('unknown'), 'en');
  assert.equal(normalizeLocale(undefined), 'en');
  assert.equal(intlLocale('cz'), 'cs-CZ');
  assert.equal(initialLocale({ getItem: () => 'cz' }, ['en-US']), 'cs');
  assert.equal(initialLocale({ getItem: () => 'en' }, ['cs-CZ']), 'en');
  assert.equal(initialLocale({ getItem: () => 'invalid' }, ['pl-PL', 'cs-CZ']), 'cs');
  assert.equal(initialLocale({ getItem: () => { throw new Error('Storage disabled'); } }, ['cs']), 'cs');
  assert.equal(initialLocale(undefined, ['es-ES']), 'en');
});

test('every published catalog has all keys, matching placeholders and no empty messages', () => {
  const sourceKeys = Object.keys(catalogs.cs).sort();
  const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const locale of supportedLocales) {
    assert.deepEqual(Object.keys(catalogs[locale]).sort(), sourceKeys, locale);
    for (const key of sourceKeys as (keyof typeof catalogs.cs)[]) {
      const value = catalogs[locale][key];
      assert.ok(value.trim(), `${locale}:${key}`);
      assert.deepEqual(placeholders(value), placeholders(catalogs.cs[key]), `${locale}:${key}`);
    }
  }
});

test('interpolated lobby names remain literal text with accents, braces and dollar signs', () => {
  const name = 'Kobra ${x} <b>Čau</b>';
  assert.equal(translate('en', 'lobby.joined', { name }), `You joined lobby “${name}”.`);
  assert.equal(translate('cz', 'lobby.requestPending', { name: 'Kobra' }), 'Žádost o vstup do lobby „Kobra“ čeká na schválení.');
});

test('English fallback handles a missing catalog entry without breaking the UI', () => {
  const value = catalogs.cs.loading;
  try {
    delete catalogs.cs.loading;
    assert.equal(translate('cs', 'loading'), catalogs.en.loading);
  } finally { catalogs.cs.loading = value; }
});

test('counts follow Czech and English plural rules including zero', () => {
  assert.equal(pluralMessage('cs', 'waitingMatches', 0), '0 zápasů čeká');
  assert.equal(pluralMessage('cs', 'waitingMatches', 1), '1 zápas čeká');
  assert.equal(pluralMessage('cs', 'waitingMatches', 3), '3 zápasy čekají');
  assert.equal(pluralMessage('cs', 'waitingMatches', 5), '5 zápasů čeká');
  assert.equal(pluralMessage('en', 'waitingMatches', 1), '1 match is waiting');
  assert.equal(pluralMessage('en', 'waitingMatches', 5), '5 matches are waiting');
  assert.equal(formatTipsterCount(4, 'cs'), '4 tipéři');
  assert.equal(formatTipsterCount(4, 'en'), '4 tipsters');
});

test('language selection changes date wording without changing Prague kickoff or DST', () => {
  for (const locale of ['cs', 'en', 'cz'] as const) {
    assert.match(formatMatchKickoff('2026-11-24T17:45:00Z', locale), /18:45/);
    assert.match(formatMatchKickoff('2027-06-01T17:00:00Z', locale), /19:00/);
  }
  assert.notEqual(formatMatchKickoff('2026-11-24T17:45:00Z', 'cs'), formatMatchKickoff('2026-11-24T17:45:00Z', 'en'));
});

test('shared season-result copy uses the selected language; legacy callers keep Czech', () => {
  const result = { position: 2, participant_count: 25 };
  assert.equal(getSeasonResultHeadline(result), 'Skončil jsi 2. z 25 tipérů.');
  assert.equal(getSeasonResultHeadline(result, 'en'), 'You finished 2 of 25 tipsters.');
});

test('known MMA divisions are localized and unknown provider facts remain unchanged', () => {
  assert.equal(formatMmaWeightClass('Light Heavyweight', 'cs'), 'Polotěžká váha');
  assert.equal(formatMmaWeightClass("Women's Flyweight", 'cs'), 'Muší váha – ženy');
  assert.equal(formatMmaWeightClass('Heavyweight', 'en'), 'Heavyweight');
  assert.equal(formatMmaWeightClass('Unknown exhibition class', 'cs'), 'Unknown exhibition class');
  assert.equal(formatMmaWeightClass(null, 'en'), 'MMA');
});
