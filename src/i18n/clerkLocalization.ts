import { csCZ } from '@clerk/localizations/cs-CZ';
import { enUS } from '@clerk/localizations/en-US';
import { normalizeLocale, type Locale, type LocaleInput } from './index.ts';

type ClerkLocalization = typeof enUS;
const createPasswordPlaceholder = {
  cs: 'Vytvoř heslo', en: 'Create a password', de: 'Passwort erstellen',
  pl: 'Utwórz hasło', sk: 'Vytvor heslo',
} satisfies Record<Locale, string>;

// Clerk's official resources omit this registration placeholder in some locales.
// Apply a narrow, stable override without modifying the installed package.
const withGameOverrides = (locale: Locale, resource: ClerkLocalization): ClerkLocalization => ({
  ...resource, formFieldInputPlaceholder__signUpPassword: createPasswordPlaceholder[locale],
});
const resources: Partial<Record<Locale, ClerkLocalization>> = {
  cs: withGameOverrides('cs', csCZ), en: withGameOverrides('en', enUS),
};
const resourceLoads = new Map<Locale, Promise<void>>();
const resourceLoaders = {
  de: () => import('@clerk/localizations/de-DE').then(module => module.deDE),
  pl: () => import('@clerk/localizations/pl-PL').then(module => module.plPL),
  sk: () => import('@clerk/localizations/sk-SK').then(module => module.skSK),
};

export function isClerkLocalizationLoaded(locale: LocaleInput): boolean {
  return Boolean(resources[normalizeLocale(locale)]);
}

export function getClerkLocalization(locale: LocaleInput): ClerkLocalization {
  return resources[normalizeLocale(locale)] ?? resources.en!;
}

export function loadClerkLocalization(input: LocaleInput): Promise<void> {
  const locale = normalizeLocale(input);
  if (isClerkLocalizationLoaded(locale)) return Promise.resolve();
  const pending = resourceLoads.get(locale);
  if (pending) return pending;
  const loader = resourceLoaders[locale as keyof typeof resourceLoaders];
  const request = loader().then(resource => { resources[locale] = withGameOverrides(locale, resource); }).finally(() => {
    resourceLoads.delete(locale);
  });
  resourceLoads.set(locale, request);
  return request;
}
