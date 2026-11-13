import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getMessages, initialLocale, isLocaleLoaded, loadLocaleResources, locales, normalizeLocale, translate, type Locale, type MessageKey } from './index.ts';
import { isClerkLocalizationLoaded } from './clerkLocalization.ts';

const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => Promise<void> } | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [preferredLocale] = useState<Locale>(() => {
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Storage may be disabled. */ }
    return initialLocale(storage, navigator.languages?.length ? navigator.languages : [navigator.language],
      new URLSearchParams(window.location.search).get('lang'));
  });
  const [locale, updateLocale] = useState(preferredLocale);
  const [ready, setReady] = useState(() => isLocaleLoaded(preferredLocale) && isClerkLocalizationLoaded(preferredLocale));
  const [loadFailed, setLoadFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const languageRequest = useRef(0);

  useEffect(() => {
    let active = true;
    setLoadFailed(false);
    loadLocaleResources(preferredLocale).then(() => {
      if (active) setReady(true);
    }).catch(() => {
      if (active) setLoadFailed(true);
    });
    return () => { active = false; };
  }, [preferredLocale, retry]);

  // Keep the existing form tree mounted while another language loads. A failed
  // chunk leaves the current language intact and is reported to the caller.
  const setLocale = useCallback(async (value: Locale) => {
    const request = ++languageRequest.current;
    const next = normalizeLocale(value);
    await loadLocaleResources(next);
    if (request === languageRequest.current) updateLocale(next);
  }, []);
  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = locale;
    document.documentElement.dir = locales[locale].direction;
    document.title = getMessages(locale).loginTitle;
    try { localStorage.setItem('lang', locale); } catch { /* Switching still works without storage. */ }
  }, [locale, ready]);
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  if (!ready) {
    // The requested catalog may not have downloaded yet. Explicitly mark the
    // fallback text's actual language instead of presenting it as a translation.
    const textLocale = isLocaleLoaded(preferredLocale) ? preferredLocale : 'en';
    return <main lang={textLocale} className="min-h-screen grid place-content-center gap-4 p-6 text-center" aria-live="polite">
      <p role={loadFailed ? 'alert' : 'status'}>{translate(textLocale, loadFailed ? 'locale.loadError' : 'locale.loading')}</p>
      {loadFailed && <button type="button" className="rounded-xl border px-6 py-3" onClick={() => setRetry(value => value + 1)}>
        {translate(textLocale, 'locale.retry')}
      </button>}
    </main>;
  }
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
