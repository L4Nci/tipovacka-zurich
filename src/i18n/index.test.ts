import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogs, initialLocale, intlLocale, isLocaleLoaded, loadLocaleCatalog, loadLocaleResources, normalizeLocale, pluralMessage, supportedLocales, translate, translationReviewStatus } from './index.ts';
import { getClerkLocalization, isClerkLocalizationLoaded } from './clerkLocalization.ts';
import { normalizeAccountProfile } from '../lib/clerkAccount.ts';
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
  assert.equal(initialLocale({ getItem: () => 'invalid' }, ['pl-PL', 'cs-CZ']), 'pl');
  assert.equal(initialLocale({ getItem: () => 'de-AT' }, ['cs-CZ']), 'de');
  assert.equal(initialLocale(undefined, ['sk-SK', 'en-US']), 'sk');
  assert.equal(normalizeLocale('PL_pl'), 'pl');
  assert.equal(normalizeLocale('sk-SK'), 'sk');
  assert.equal(initialLocale({ getItem: () => { throw new Error('Storage disabled'); } }, ['cs']), 'cs');
  assert.equal(initialLocale(undefined, ['es-ES']), 'en');
  assert.equal(initialLocale({ getItem: () => 'cs' }, ['cs-CZ'], 'de'), 'de');
  assert.equal(initialLocale({ getItem: () => 'cs' }, ['cs-CZ'], 'PL_pl'), 'pl');
  assert.equal(initialLocale({ getItem: () => 'sk' }, ['cs-CZ'], 'javascript:alert(1)'), 'sk');
  assert.equal(initialLocale(undefined, ['en-GB'], null), 'en');
});

test('additional catalogs load on demand and concurrent requests share one load', async () => {
  assert.equal(isLocaleLoaded('de'), false);
  assert.equal(isLocaleLoaded('pl'), false);
  assert.equal(isLocaleLoaded('sk'), false);
  assert.equal(isClerkLocalizationLoaded('de'), false);
  const first = loadLocaleCatalog('de');
  assert.equal(first, loadLocaleCatalog('de'));
  await first;
  assert.equal(isLocaleLoaded('de'), true);
  assert.equal(isLocaleLoaded('pl'), false);
  assert.equal(translate('de', 'publicPlay.start'), 'Jetzt tippen');
  await loadLocaleResources('de');
  assert.equal(isClerkLocalizationLoaded('de'), true);
  assert.notEqual(getClerkLocalization('de'), getClerkLocalization('en'));
  assert.equal(translationReviewStatus.de, 'draft');
  assert.equal(translationReviewStatus.pl, 'draft');
  assert.equal(translationReviewStatus.sk, 'draft');
});

test('every catalog has all keys, matching placeholders and no empty messages', async () => {
  await Promise.all(supportedLocales.map(loadLocaleResources));
  const sourceKeys = Object.keys(catalogs.cs).sort();
  const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const locale of supportedLocales) {
    const catalog = catalogs[locale];
    assert.ok(catalog, locale);
    assert.ok(getClerkLocalization(locale).formFieldInputPlaceholder__signUpPassword?.trim(), `${locale}:Clerk sign-up password`);
    assert.deepEqual(Object.keys(catalog).sort(), sourceKeys, locale);
    for (const key of sourceKeys as (keyof typeof catalogs.cs)[]) {
      const value = catalog[key];
      assert.ok(value.trim(), `${locale}:${key}`);
      assert.deepEqual(placeholders(value), placeholders(catalogs.cs[key]), `${locale}:${key}`);
    }
  }
  assert.equal(getClerkLocalization('cs').formFieldInputPlaceholder__signUpPassword, 'Vytvoř heslo');
  assert.equal(getClerkLocalization('de').formFieldInputPlaceholder__signUpPassword, 'Passwort erstellen');
  assert.equal(getClerkLocalization('pl').formFieldInputPlaceholder__signUpPassword, 'Utwórz hasło');
  assert.equal(getClerkLocalization('sk').formFieldInputPlaceholder__signUpPassword, 'Vytvor heslo');
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
  assert.equal(pluralMessage('de', 'waitingMatches', 1), '1 Spiel wartet');
  assert.equal(pluralMessage('de', 'waitingMatches', 5), '5 Spiele warten');
  assert.equal(pluralMessage('pl', 'waitingMatches', 1), '1 mecz czeka');
  assert.equal(pluralMessage('pl', 'waitingMatches', 2), '2 mecze czekają');
  assert.equal(pluralMessage('pl', 'waitingMatches', 5), '5 meczów czeka');
  assert.equal(pluralMessage('pl', 'waitingMatches', 22), '22 mecze czekają');
  assert.equal(pluralMessage('pl', 'rounds', 5), '5 rund');
  assert.equal(pluralMessage('sk', 'waitingMatches', 1), '1 zápas čaká');
  assert.equal(pluralMessage('sk', 'waitingMatches', 3), '3 zápasy čakajú');
  assert.equal(pluralMessage('sk', 'waitingMatches', 5), '5 zápasov čaká');
});

test('language selection changes date wording without changing Prague kickoff or DST', () => {
  for (const locale of [...supportedLocales, 'cz'] as const) {
    assert.match(formatMatchKickoff('2026-11-24T17:45:00Z', locale), /18:45/);
    assert.match(formatMatchKickoff('2027-06-01T17:00:00Z', locale), /19:00/);
  }
  assert.notEqual(formatMatchKickoff('2026-11-24T17:45:00Z', 'cs'), formatMatchKickoff('2026-11-24T17:45:00Z', 'en'));
});

test('account bootstrap retains supported profile locales without changing the role contract', () => {
  const raw = {
    id: 'e7385820-c176-4ba1-8560-5653c9bbaf59', username: 'player_internal',
    role: 'player', needs_profile_completion: false,
  };
  for (const locale of supportedLocales) {
    assert.equal(normalizeAccountProfile({ ...raw, locale }).locale, locale);
  }
  assert.equal(normalizeAccountProfile({ ...raw, locale: 'cz' }).locale, 'cs');
  assert.equal(normalizeAccountProfile({ ...raw, locale: 'unsupported' }).locale, 'cs');
  assert.equal(normalizeAccountProfile(raw).locale, 'cs');
  assert.throws(() => normalizeAccountProfile({ ...raw, role: 'owner', locale: 'pl' }), /Účet/);
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
