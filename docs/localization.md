# Application localization

10 November 2026. The local application supports **Czech (`cs`), English (`en`),
German (`de`), Polish (`pl`) and Slovak (`sk`)**. DE/PL/SK are complete translation
drafts, pending native-language proofreading and integrated browser checks;
The coordinator verified DE/PL/SK Clerk registration rendering and preservation
of a synthetic typed email. Hosted profile validation and all five preferences
passed a rollback suite. This is not acceptance for public launch. This is
interface localization; it does not publish the landing, launch a new market,
or complete the payment/legal journey. See the [implementation handoff](localization-implementation-2026-11-10.md).

## Shared contract

- `src/i18n/cs.ts` is the canonical key set; every other catalog must provide the same keys.
  Use stable semantic keys, complete sentences and `{named}` placeholders.
- `src/i18n/index.ts` owns locale normalization, the language registry, English
  fallback, interpolation and Intl-based plurals. No HTML from translations.
- `LocaleProvider` owns the browser preference for both App and Clerk. Stored
  `cz`, region-qualified and underscore-separated preferences normalize to the
  registered canonical language code. The historical `cz` alias remains `cs`.
  An allowlisted `?lang` from the separate landing origin wins first, followed
  by the saved preference and then browser languages. Invalid URL values do
  not override a supported preference. After account load,
  the existing completed profile preference wins; profile changes still save
  through the same `complete_my_profile` RPC before updating the interface.
  Requested catalog and Clerk resources load before saving or displaying the
  new language. A failed import leaves the current form and language intact;
  first-load failure shows a retry action. Additional catalogs/resources load
  on demand, with concurrent requests sharing an in-flight import.
- Storage denial does not break language switching. The document language,
  direction and title follow the selected locale. Sign-out does not discard it.
- Dates use the registered Intl locale, while sports kickoff/deadline instants
  continue using **Europe/Prague**, including daylight saving. This change does
  not silently switch users to a different time zone.
- Clerk embedded sign-in, registration and account components use official
  `@clerk/localizations` CS/EN/DE/PL/SK resources. Provider branding, development
  notices and the external hosted Account Portal can remain English; see
  [Clerk's localization documentation](https://clerk.com/docs/guides/customizing-clerk/localization).
  A narrow local override supplies the missing sign-up password placeholder in
  every language; installed Clerk resources are not modified.
- Known match stages and MMA divisions have display translations. Participant
  names, user-created lobby names/descriptions, provider catalog titles, badges,
  prizes and event terms remain source content. Do not automatically translate
  stored identifiers or sporting facts. Server/database errors are still their
  existing protocol; local UI fallback messages are translated. Stable error
  codes and human-reviewed content translations are a separate next step.

## Adding another language

1. Translate the complete catalog and review placeholders, plural forms, sports
   vocabulary and long labels. Use full sentences rather than joining fragments.
2. Register its canonical code/Intl format/direction, catalog and Clerk resource.
   For multiple additional catalogs/resources, load only the requested language
   rather than adding every translation to the initial browser bundle.
3. Extend the DB profile locale constraint and `complete_my_profile` validation,
   account normalization and shared profile types in a reviewed migration.
   The prepared five-language contract is `cs`/`en`/`de`/`pl`/`sk`. Verify the
   migration is applied in the intended database before releasing the selector;
   a frontend catalog alone does not change database validation.
4. Run `npm run test:i18n`, typecheck, both builds and affected UI checks. Verify
   invitation/OAuth return URLs, profile persistence, reload, lock dates, counts,
   mobile labels and language changes without losing form input.

Do not enable a language just because its code was added to the selector. RTL
layout and localized content/legal rules require their own review before launch.

## Verification

The locale suite checks all five catalogs (663 keys each), placeholder parity,
non-empty text, legacy/regional preferences, denied storage, interpolation,
fallback, lazy/concurrent resource loading, five-language account normalization,
Czech/English/German/Polish/Slovak plurals, Prague winter/summer kickoff and MMA
terminology. `npm run test:i18n` passes 10 tests; `npm run test:clerk` passes 17
tests and tournament-winner authorization scenarios; TypeScript passes.

The earlier CS/EN browser QA checked the actual local Clerk sign-in in both languages and Czech
preference after reload. A separate fixture-only preview checked Home, MMA
cards/rules, profile language controls and onboarding at 390 px; it performs no
DB writes. That profile preview proves UI behavior, not a new real OAuth login
or a hosted account preference write. New DE/PL/SK browser, persisted-profile and
OAuth-return checks must be recorded separately; the earlier CS/EN evidence does
not prove those paths. Existing Clerk SQL tests separately check the profile RPC
in a rollback transaction. No paid service, tracker or analytics SDK was added.
