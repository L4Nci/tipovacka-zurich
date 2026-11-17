# Five-language application handoff

10 November 2026. Local implementation for B12 and the Slovak part of P1.
No commit, push, deployment or database write was performed by the localization
worker. Human proofreading and integrated acceptance remain separate gates.

## Implemented

- Canonical CS/EN/DE/PL/SK contract, 663 explicit keys per catalog, including
  public entry and account errors. DE/PL/SK are marked `draft` in code and each
  catalog; they are not an English fallback presented as completed translation.
- Additional UI catalogs and official Clerk resources load only when requested.
  Shared imports are deduplicated. The initial tree waits for both resources;
  subsequent switches preserve the mounted form and current language until the
  requested resources finish. First-load failure has an error/retry state.
  A stable local override fills Clerk's missing sign-up password placeholder in
  all five languages; node_modules remains unchanged.
- `cz` remains `cs`; saved browser preference still precedes browser languages,
  and a completed account preference wins after bootstrap. Profile normalization
  retains all five canonical languages and the existing Czech default for an
  absent/unsupported profile value. Roles/identity validation remain unchanged.
- Intl plurals include Polish `many`; all five languages retain Prague kickoff
  time and daylight-saving behavior. Provider names and user content stay intact.

Changed implementation files: `src/i18n/{cs,en,de,pl,sk,index,index.test}.ts`,
`src/i18n/LocaleProvider.tsx`, `src/i18n/clerkLocalization.ts`,
`src/lib/clerkAccount.ts`, `src/lib/clerkSession.tsx`, and only `Player.locale`
in `src/types.ts`. The existing profile selector maps the registry, so its
layout was not rewritten.

## Integration contract

`loadLocaleResources(locale): Promise<void>` is exported from `src/i18n/index.ts`.
Await it before a language-changing profile RPC, and await `setLocale` after
saving. Resource failures reject, preserving the old language/profile when the
caller follows this ordering. `loadLocaleCatalog` and `isLocaleLoaded` support
pure translation callers and tests. `translate` retains the existing English
fallback if called before a requested catalog has loaded.

Root owns App/database integration. The database constraint
`profiles_locale_supported` and `complete_my_profile` validation must both accept
exactly `cs`, `en`, `de`, `pl`, `sk`; no additional profile validation, default,
permissions, scoring or timezone behavior needs changing. Verify migration and
rollback-suite results in root's release evidence before deployment.

## Verification and remaining gates

- `npm run test:i18n`: 10/10 passed, including lazy imports, every key and
  placeholder, all new profile locales, Polish 1/2/5/22 and Prague winter/summer.
- `npm run test:clerk`: 17/17 and tournament-winner authorization scenarios passed.
- `npm run lint` and `git diff --check`: passed.
- Root owns the browser smoke and final builds. This worker did not manipulate
  a concurrent browser, create an account or write a hosted profile.

Before public acceptance: native DE/PL/SK proofreading; long-label/mobile checks;
reload and profile persistence; actual OAuth invite/public-return paths. Landing
routes/SEO and payment/legal translations belong to their respective blocks and
are not proven by game-catalog parity. Existing source-content badges, names,
prizes and event terms are not automatically translated.
