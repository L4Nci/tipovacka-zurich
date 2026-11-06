# Application localization

6 November 2026. Published languages in this change: **Czech (`cs`) and English
(`en`)**. No additional translated language is enabled yet. This is interface
localization; it does not launch the landing page, SEO pages or a new market.

## Shared contract

- `src/i18n/cs.ts` is the canonical key set; `en.ts` must provide the same keys.
  Use stable semantic keys, complete sentences and `{named}` placeholders.
- `src/i18n/index.ts` owns locale normalization, the language registry, English
  fallback, interpolation and Intl-based plurals. No HTML from translations.
- `LocaleProvider` owns the browser preference for both App and Clerk. Stored
  `cz`, `cs-CZ` and `en-US` preferences normalize to canonical `cs`/`en`.
  An explicit saved preference wins over browser languages. After account load,
  the existing completed profile preference wins; profile changes still save
  through the same `complete_my_profile` RPC before updating the interface.
- Storage denial does not break language switching. The document language,
  direction and title follow the selected locale. Sign-out does not discard it.
- Dates use the registered Intl locale, while sports kickoff/deadline instants
  continue using **Europe/Prague**, including daylight saving. This change does
  not silently switch users to a different time zone.
- Clerk embedded sign-in, registration and account components use official
  `@clerk/localizations` Czech/English resources. Provider branding, development
  notices and the external hosted Account Portal can remain English; see
  [Clerk's localization documentation](https://clerk.com/docs/guides/customizing-clerk/localization).
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
   They intentionally still accept only `cs`/`en` in this release.
4. Run `npm run test:i18n`, typecheck, both builds and affected UI checks. Verify
   invitation/OAuth return URLs, profile persistence, reload, lock dates, counts,
   mobile labels and language changes without losing form input.

Do not enable a language just because its code was added to the selector. RTL
layout and localized content/legal rules require their own review before launch.

## Verification

The locale suite checks catalog key/placeholder parity, non-empty text, legacy
preferences, disabled storage, interpolation, fallback, Czech/English plural
forms, Prague winter/summer kickoff and MMA terminology. Existing dashboard,
product evolution and match-presentation scenarios remain compatible.

Browser QA checked the actual local Clerk sign-in in both languages and Czech
preference after reload. A separate fixture-only preview checked Home, MMA
cards/rules, profile language controls and onboarding at 390 px; it performs no
DB writes. That profile preview proves UI behavior, not a new real OAuth login
or a hosted account preference write. Existing Clerk SQL tests separately check
the profile RPC in a rollback transaction. No paid service, tracker or analytics
SDK was added.
