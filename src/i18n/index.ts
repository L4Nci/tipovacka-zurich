import { cs, type MessageKey } from './cs.ts';
import { en } from './en.ts';

export const locales = {
  cs: { label: 'Čeština', intl: 'cs-CZ', direction: 'ltr' },
  en: { label: 'English', intl: 'en-GB', direction: 'ltr' },
} as const;
export type Locale = keyof typeof locales;
export type LocaleInput = Locale | 'cz';
export const supportedLocales = Object.keys(locales) as Locale[];
export const catalogs: Record<Locale, Record<MessageKey, string>> = { cs, en };
export type { MessageKey };

/** Canonical BCP 47 language codes; retain the original app's `cz` preference. */
export function normalizeLocale(value: unknown): Locale {
  if (typeof value !== 'string') return 'en';
  const language = value.trim().toLowerCase().split(/[-_]/)[0];
  if (language === 'cz') return 'cs';
  return Object.hasOwn(locales, language) ? language as Locale : 'en';
}

export function initialLocale(storage: Pick<Storage, 'getItem'> | undefined, languages: readonly string[]): Locale {
  const isSupported = (value: string) => {
    const language = value.trim().toLowerCase().split(/[-_]/)[0];
    return language === 'cz' || Object.hasOwn(locales, language);
  };
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
