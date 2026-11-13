import { cs, type MessageKey } from './cs.ts';
import { en } from './en.ts';

export const locales = {
  cs: { label: 'Čeština', intl: 'cs-CZ', direction: 'ltr' },
  en: { label: 'English', intl: 'en-GB', direction: 'ltr' },
  de: { label: 'Deutsch', intl: 'de-DE', direction: 'ltr' },
  pl: { label: 'Polski', intl: 'pl-PL', direction: 'ltr' },
  sk: { label: 'Slovenčina', intl: 'sk-SK', direction: 'ltr' },
} as const;
export type Locale = keyof typeof locales;
export type LocaleInput = Locale | 'cz';
export const supportedLocales = Object.keys(locales) as Locale[];
type Catalog = Record<MessageKey, string>;
export const catalogs: Partial<Record<Locale, Catalog>> & { cs: Catalog; en: Catalog } = { cs, en };
const catalogLoads = new Map<Locale, Promise<void>>();
const catalogLoaders = {
  de: () => import('./de.ts').then(module => module.de),
  pl: () => import('./pl.ts').then(module => module.pl),
  sk: () => import('./sk.ts').then(module => module.sk),
};

/** Native review is still required; completeness and proofreading are separate gates. */
export const translationReviewStatus = {
  cs: 'existing', en: 'existing', de: 'draft', pl: 'draft', sk: 'draft',
} as const satisfies Record<Locale, 'existing' | 'draft'>;
export type { MessageKey };

export function isLocaleLoaded(locale: LocaleInput): boolean {
  return Boolean(catalogs[normalizeLocale(locale)]);
}

/** Load only the requested additional catalog. Concurrent requests share one import. */
export function loadLocaleCatalog(input: LocaleInput): Promise<void> {
  const locale = normalizeLocale(input);
  if (isLocaleLoaded(locale)) return Promise.resolve();
  const pending = catalogLoads.get(locale);
  if (pending) return pending;
  const loader = catalogLoaders[locale as keyof typeof catalogLoaders];
  const request = loader().then(catalog => { catalogs[locale] = catalog; }).finally(() => {
    catalogLoads.delete(locale);
  });
  catalogLoads.set(locale, request);
  return request;
}

/** Keep game strings and Clerk widgets on the same language before changing UI/profile. */
export async function loadLocaleResources(locale: LocaleInput): Promise<void> {
  await Promise.all([
    loadLocaleCatalog(locale),
    import('./clerkLocalization.ts').then(module => module.loadClerkLocalization(locale)),
  ]);
}

/** Canonical BCP 47 language codes; retain the original app's `cz` preference. */
export function normalizeLocale(value: unknown): Locale {
  if (typeof value !== 'string') return 'en';
  const language = value.trim().toLowerCase().split(/[-_]/)[0];
  if (language === 'cz') return 'cs';
  return Object.hasOwn(locales, language) ? language as Locale : 'en';
}

export function initialLocale(storage: Pick<Storage, 'getItem'> | undefined, languages: readonly string[], requestedLocale?: unknown): Locale {
  const isSupported = (value: string) => {
    const language = value.trim().toLowerCase().split(/[-_]/)[0];
    return language === 'cz' || Object.hasOwn(locales, language);
  };
  // The landing is a separate origin. A canonical URL preference carries the
  // chosen language into registration without sharing browser storage or PII.
  if (typeof requestedLocale === 'string' && isSupported(requestedLocale)) return normalizeLocale(requestedLocale);
  try {
    const saved = storage?.getItem('lang');
    if (saved && isSupported(saved)) return normalizeLocale(saved);
  } catch { /* Browser privacy settings can disable storage. */ }
  const language = languages.find(isSupported);
  return normalizeLocale(language);
}

export function getMessages(locale: LocaleInput): Record<MessageKey, string> {
  return catalogs[normalizeLocale(locale)] ?? en;
}

/** React renders the returned string as text; never insert it as HTML. */
export function translate(locale: LocaleInput, key: MessageKey, values: Record<string, string | number> = {}): string {
  const message = getMessages(locale)[key] ?? en[key] ?? key;
  return message.replace(/\{(\w+)\}/g, (token, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : token);
}

export function intlLocale(locale: LocaleInput): string {
  return locales[normalizeLocale(locale)].intl;
}

/** Intl supplies Czech one/few/other and other languages' plural categories. */
export function pluralCategory(locale: LocaleInput, count: number): Intl.LDMLPluralRule {
  return new Intl.PluralRules(intlLocale(locale)).select(count);
}

export type PluralMessage = 'waitingMatches' | 'nextPredictions' | 'tipsters' | 'rounds';
export function pluralMessage(locale: LocaleInput, key: PluralMessage, count: number): string {
  const categoryKey = `${key}_${pluralCategory(locale, count)}` as MessageKey;
  const messageKey = Object.hasOwn(getMessages(locale), categoryKey) ? categoryKey : `${key}_other` as MessageKey;
  return translate(locale, messageKey, { count: new Intl.NumberFormat(intlLocale(locale)).format(count) });
}
