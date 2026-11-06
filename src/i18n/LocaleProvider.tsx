import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getMessages, initialLocale, locales, normalizeLocale, translate, type Locale, type MessageKey } from './index.ts';

const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void } | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>(() => {
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Storage may be disabled. */ }
    return initialLocale(storage, navigator.languages?.length ? navigator.languages : [navigator.language]);
  });
  const setLocale = useCallback((value: Locale) => updateLocale(normalizeLocale(value)), []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locales[locale].direction;
    document.title = getMessages(locale).loginTitle;
    try { localStorage.setItem('lang', locale); } catch { /* Switching still works without storage. */ }
  }, [locale]);
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('LocaleProvider is required.');
  return value;
}

export function LocalizedText({ message }: { message: MessageKey }) {
  const { locale } = useLocale();
  return translate(locale, message);
}
