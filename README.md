🏆 Tipovačka 2026

Moderní webová aplikace pro soukromé sportovní tipovací ligy mezi přáteli, kolegy nebo rodinou.

Cílem projektu je nabídnout jednoduchou, rychlou a přehlednou platformu, kde si může každý vytvořit vlastní lobby, pozvat ostatní hráče a soutěžit o co nejlepší skóre během velkých sportovních událostí.

✨ Hlavní funkce

* 👥 Zakládání a správa soukromých tipovacích lobby
* ⚽ Podpora různých turnajů (FIFA World Cup, IIHF, EURO a další)
* 📊 Přehledný leaderboard s průběžným pořadím hráčů
* 🎯 Tipování výsledků jednotlivých zápasů
* 🏆 Bonusové dlouhodobé tipy (např. vítěz turnaje)
* 🔒 Automatické uzamčení tipů před začátkem utkání
* 📱 Responzivní design pro mobil i desktop
* 🌍 Připraveno pro vícejazyčné prostředí
* 🔄 Automatická synchronizace výsledků přes sportovní API
* 👑 Administrace zápasů, turnajů a bodování

🎮 Bodovací systém

Systém odměňuje přesnost tipů:

* přesný výsledek,
* správný vítěz a brankový rozdíl,
* správný vítěz,
* správná remíza ve skupinové fázi fotbalu,
* bonusové body za dlouhodobou predikci vítěze turnaje.

Bodovací pravidla jsou produkčně citlivá. Jejich zdrojem pravdy je aktuální implementace v kódu a související produkční pravidla, ne starší návrhové dokumenty.

🚀 Filosofie projektu

Tipovačka není klasická sázková kancelář.

Je navržena jako společenská platforma pro přátelské soutěžení, kde si skupina lidí může vytvořit vlastní uzavřenou ligu, porovnávat své tipy a sledovat vývoj pořadí v reálném čase.

Veškeré případné finanční vyrovnání mezi hráči probíhá mimo aplikaci.

🛠️ Technologie

* React
* TypeScript
* Vite
* Tailwind CSS
* Supabase
* Netlify
* GitHub
* TheSportsDB API

📈 Roadmap

Produkt už není MVP. Aktuální produktový směr je v [docs/ROADMAP.md](docs/ROADMAP.md).

Aktuální plán další verze, otevřená rozhodnutí a checklist pilotu jsou v [docs/product-restart-plan.md](docs/product-restart-plan.md). Nejdřív uzavíráme zadání, potom implementaci a testování na Netlify.

Aktuální základy:

* ✅ Soukromé lobby a přihlašování
* ✅ Fotbalový turnaj FIFA World Cup 2026
* ✅ Základní hokejová turnajová podpora
* ✅ Automatické načítání výsledků
* ✅ Automatické doplňování playoff/TBA fixture
* ✅ Statistiky hráčů
* ✅ Vlastní avatar a profil
* ✅ Historie soutěží a Hall of Fame
* ⏳ Veřejné žebříčky, pokud je owner později potvrdí
* ⏳ Mobilní/PWA směr je otevřené produktové rozhodnutí

❤️ Proč vznikla?

Projekt vznikl z jednoduché myšlenky – zpříjemnit sledování sportovních akcí a odstranit chaos excelových tabulek a ručního počítání bodů.

Stačí vytvořit lobby, pozvat přátele, natipovat zápasy a nechat aplikaci počítat vše za vás.

## Contributor / Development workflow

Konkrétní práce se eviduje v GitHub Issues. Pro netriviální změny vytvoř nebo najdi Issue, drž se jeho scope a propoj Pull Request s daným Issue.

## Documentation map

Product implementation: [implementation scope](docs/beta-implementation-scope.md),
[code baseline](docs/beta-baseline-plan.md), and
[account/profile contract](docs/beta-account-contract.md).
The application uses the existing Supabase project `hkhkbtzdyjbdeeoiurvw`.
Local development uses the ordinary, Git-ignored `.env`, loaded by the existing
Express/dotenv and Vite setup. Copy missing variable names from
[.env.example](.env.example); keep existing Supabase credentials and add the Clerk
publishable key, full HTTPS issuer URL and allowed application origins.
There is no separate beta configuration or launcher.

Offline checks and local startup:

```sh
npm run test:env
npm run test:clerk
npm run env:check
npm run dev
```

`env:check` reads `.env` by default; an explicit file path is optional. It checks
required settings, conflicting inherited values, frontend/server targets, legacy
key project references, trusted origins and matching Clerk key environments
without printing values. It cannot verify credentials or database permissions.

For Netlify, configure the same variable names in the site's environment settings.
`VITE_CLERK_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are
public build-time values; server credentials must never have a `VITE_` prefix.
Restart local development after editing `.env`; changed frontend values on Netlify
require a new build. No remote settings or deployment are changed by these commands.

Both Clerk development (`pk_test_`) and production (`pk_live_`) keys are supported.
Use the same Clerk instance in frontend, server and Supabase Third-Party Auth.
An `*.clerk.accounts.dev` issuer belongs to development; public launch requires the
production instance, its keys, domain setup and matching Supabase trust configuration.
See [Clerk production setup](https://clerk.com/docs/guides/development/deployment/production).

Read-only football-data.org checks use the server-only `FOOTBALL_DATA_API_TOKEN`
from the same `.env`. They do not import matches, score predictions or enable a cron:

```sh
npm run test:football-data
npm run football-data:dry-run -- CL 2026
```

The CLI writes provider data and a validation report to a private temporary directory.
See [verified season coverage and score semantics](docs/champions-league-data-source.md)
for the Champions League pilot and the later Premier League expansion.
The Champions League catalog is imported and active in the existing DB, linked
to Testovací rodeo. Testing covers the whole season; there is no three-round limit.
The 144 league-phase games are available now; the adapter supports automatic addition of up to 45 knockout fixtures when the API publishes their participants and kickoff. The protected local/Netlify sync endpoint and cron-job.org configuration
are described in the [import and cron runbook](docs/football-data-cron.md).
The endpoint is deployed on the working Netlify site; cron-job.org task 8799825 runs every 15 minutes, with failure notifications. `npm run football-data:import` previews DB
changes; explicit `-- --write` backs up the public tables and imports the catalog.

The repository is linked to the owner's existing Clerk application **Tipovačka**
(`app_3LdaRuXTIBtmKluY8rhCW5DPJY6`). It already has a provider and sign-in/sign-up
screens; do not rerun `clerk init` or create a replacement application.
`clerk doctor` verifies the CLI link, not successful registration into our database.
Its missing-secret warning does not require adding a secret: our backend validates
session signatures using public JWKS, then resolves the internal player UUID through
a service-only Supabase RPC. Database role checks still control administrator access.

The main-database SQL suite in
[supabase/tests/clerk_identity_bridge.sql](supabase/tests/clerk_identity_bridge.sql)
passed with rollback on 4 November 2026. It tests bootstrap/profile and row/role/points
restrictions using simulated verified claims. Separately, the owner enabled native
Supabase Third-Party Auth and completed a real Clerk sign-up and profile on localhost.
Current DB verification confirms 15 profiles and two Clerk player accounts. The owner
verified logout/login and created a lobby shared by both Google accounts and a legacy
Supabase test account. That legacy account retains its existing platform-admin role.
Release [#16](https://github.com/L4Nci/tipovacka-zurich/pull/16) published the Clerk
frontend and football-data sync to [the working site](https://tipovacka-fotbal.netlify.app)
on 5 November 2026 (app commit `0e6aece`). The Clerk sign-in screen and API guards
were verified there. Authenticated sync dry-run returned 200, 144 unchanged matches,
no conflicts and no DB writes. The owner still needs to verify the signed-in game
flow on this hostname. The existing Clerk development instance remains in use for
this working test. The owner subsequently confirmed real saved predictions on the
working site. Cron dry-run/write tests and the first scheduled run succeeded.
The Champions League scoring contract is final goals after extra time, or the
shootout score alone when penalties decide the game; provider facts stay separate.
Configurable per-lobby scoring and mid-season rule changes remain future work.

Migration `20261104193538_prediction_result_write_guard.sql` closes a reproduced
direct-API gap: a recorded result or finished match now blocks prediction writes
even when its stored lock time is still in the future. The expanded rollback SQL
suite verifies independent member tips, cross-player denial, idempotent joining and
owner protection. All 1,032 saved predictions and 104 matches retained identical
data fingerprints. A real Clerk API 403 and the full live prediction/result journey
remain unverified. See the [Champions League data-source check](docs/champions-league-data-source.md).

Current source-of-truth documents:

* Product direction: [docs/ROADMAP.md](docs/ROADMAP.md)
* Current planning, decisions and pilot checklist: [docs/product-restart-plan.md](docs/product-restart-plan.md)
* Accepted organizer-lobby model (persistent lobby, competitions and event-specific invitations): [docs/ROADMAP.md](docs/ROADMAP.md#accepted-organizer-model--2026-11-03)
* Concrete work and project memory: GitHub Issues
* Agent and production safety: [AGENTS.md](AGENTS.md) and [PROJECT_RULES.md](PROJECT_RULES.md)
* Issue workflow: [docs/ISSUE_WORKFLOW.md](docs/ISSUE_WORKFLOW.md)
* Authentication security and OAuth setup: [docs/auth-security.md](docs/auth-security.md) and [docs/oauth-setup.md](docs/oauth-setup.md)
* Lobby membership security: [docs/membership-security.md](docs/membership-security.md)
* Product, community, badges, sharing, entitlements and rollout boundaries: [docs/product-growth-architecture.md](docs/product-growth-architecture.md)
* Public-beta polish decisions and deferred identity/onboarding foundations: [docs/beta-polish-sprint-01.md](docs/beta-polish-sprint-01.md)
* Existing local Official Events implementation, prizes and legacy rollout constraints (not the next-version product model): [docs/official-public-tournaments.md](docs/official-public-tournaments.md)
* Result sync and TheSportsDB provider behavior: [docs/thesportsdb-dry-run.md](docs/thesportsdb-dry-run.md)
* Fixture/TBA sync cron setup: [docs/fixture-sync-cron.md](docs/fixture-sync-cron.md)

Historical audits, migration plans, and earlier provider designs remain in the repository for context, but they are not operational instructions unless they explicitly say they are current.
