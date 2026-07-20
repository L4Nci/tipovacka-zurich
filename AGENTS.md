# AGENTS.md — Tipovačka Agent Guide

Tipovačka is a live/beta production app. Real users can have real predictions, match scores, and leaderboard data in the database. Treat every change touching data, scoring, auth, sync, roles, or deployment as production-sensitive.

## Product Context

Tipovačka is a private sports prediction league app for groups of friends, colleagues, or family. Users join a lobby, predict match scores, pick a long-term tournament winner, and compare points in a leaderboard.

Current repository scope, based on the app and docs:

- private lobby flow,
- FIFA World Cup 2026 football predictions,
- IIHF/MS hockey tournament support,
- match prediction cards and leaderboard,
- long-term tournament winner prediction,
- admin result entry,
- guarded result sync and fixture/TBA sync through TheSportsDB,
- Supabase-backed authentication, data storage, and role checks,
- Netlify production deployment through static frontend plus Netlify Functions.

Out of current confirmed scope:

- betting, payments, or in-app settlement,
- complex GitHub Projects, sprint, or capacity-planning workflow,
- native mobile app,
- public or enterprise workflow, unless future roadmap docs say otherwise.

Do not invent product direction that is not documented in the repository or a GitHub Issue. Open product questions are tracked in [PROJECT_RULES.md](PROJECT_RULES.md) and should later be summarized in [docs/ROADMAP.md](docs/ROADMAP.md).

## Technical Context

- Frontend: React, TypeScript, Vite, Tailwind CSS, `motion`, `lucide-react`.
- Main frontend files: [src/App.tsx](src/App.tsx), [src/lib/db.ts](src/lib/db.ts), [src/lib/scoring.ts](src/lib/scoring.ts), [src/lib/matchRules.ts](src/lib/matchRules.ts), [src/types.ts](src/types.ts).
- Local backend: [server.ts](server.ts), used by `npm run dev` and the bundled server build.
- Production backend endpoints: Netlify Functions in [netlify/functions](netlify/functions), wired through [netlify.toml](netlify.toml).
- Database/Auth: Supabase client in [src/lib/supabase.ts](src/lib/supabase.ts), service-role helper in [server/lib/supabaseAdmin.ts](server/lib/supabaseAdmin.ts), schema in [supabase/migrations](supabase/migrations), seed data in [supabase/seed](supabase/seed).
- Sports data providers: TheSportsDB is the current result/fixture sync provider. API-Football dry-run docs/code may still exist as historical/provider context.
- Important docs: [PROJECT_RULES.md](PROJECT_RULES.md), [docs/ISSUE_WORKFLOW.md](docs/ISSUE_WORKFLOW.md), [docs/ROADMAP.md](docs/ROADMAP.md), [docs/thesportsdb-dry-run.md](docs/thesportsdb-dry-run.md), [docs/fixture-sync-cron.md](docs/fixture-sync-cron.md).

Useful commands:

- `npm run dev` — local Vite/Express dev server.
- `npm run lint` — TypeScript typecheck.
- `npm run build` — Vite build plus bundled local server.
- `npm run build:netlify` — Netlify-style static frontend build.
- `git diff --check` — whitespace/conflict marker check.

There is no dedicated `test` script in `package.json` at the time of writing. If an Issue needs automated tests, add the smallest relevant test approach within that Issue scope.

## Critical Restrictions

Before risky work, use this canonical production warning:

> Jsme v ostrém provozu. Tipy v DB jsou reálné. Neprováděj žádné zápisy do predictions, matches ani profiles bez výslovného schválení. Neprováděj destruktivní změny. Nejdřív udělej audit, napiš rizika, navrhni plán a počkej na potvrzení.

Without explicit owner approval, an agent must not:

- change production data,
- mutate production `matches`, `predictions`, `points_earned`, `profiles`, lobby members, or roles,
- directly update player points or locked user predictions,
- run irreversible database operations,
- change database schema, migrations, or RLS policies,
- weaken RLS, auth, permission checks, or other security controls,
- expose service-role keys or secrets in frontend code,
- commit plaintext passwords, service-role keys, secrets, or `.env` files,
- change scoring rules, tournament-winner scoring, leaderboard calculation, or `calculatePoints`,
- change match locking rules,
- change login/auth flow, roles, Supabase Auth settings, or service-role logic,
- change the sports data provider or result/fixture sync behavior,
- build an API that overwrites manually confirmed results without explicit guardrails,
- change monetization or pricing rules,
- run write-mode validation against production,
- deploy to production,
- merge into `main`,
- close an Issue that has not been verified or accepted.

Additional production safety rules and release checklists are in [PROJECT_RULES.md](PROJECT_RULES.md). Link to that document instead of copying long checklist text.

## Agent Workflow

Before changing code or docs:

1. Read the relevant GitHub Issue.
2. Read this file and relevant linked docs.
3. Find the real implementation in code.
4. Verify that the Issue matches the current repository state.
5. Report ambiguities, missing context, and risks.

During implementation:

1. Stay inside the Issue scope.
2. Avoid unrelated refactors and formatting churn.
3. Add or update tests when the change has testable behavior.
4. Preserve existing architecture unless the Issue explicitly asks for a design change.
5. Do not silently fix side findings; propose a separate Issue.

After implementation:

1. Run relevant tests.
2. Run available lint, typecheck, and build checks.
3. Review `git diff` and `git diff --check`.
4. List changed files.
5. Report validation results.
6. Report risks and what was not verified.
7. Link the Pull Request to its Issue.

## Definition of Done

- **Implemented**: code/docs are written.
- **Verified**: automated checks and available manual verification were completed by the agent.
- **Accepted**: the project owner or assigned reviewer confirms that the result matches the request.

An Issue may be closed automatically by merge only when its Definition of Done is truly satisfied and the PR uses a correct closing reference such as `Closes #123`.

For UI/UX changes, product behavior, scoring, auth, data sync, and hard-to-automate fixes, prefer owner review before merge. Agents must not mark work as done just because code was written.

## GitHub Issues and Roadmap

- GitHub Issues are the source of truth for concrete work: bugs, technical tasks, features, research, and decisions.
- Repository docs are the source of truth for long-term product and technical context.
- Pull Requests should reference a concrete Issue unless the change is truly trivial.
- Use [docs/ISSUE_WORKFLOW.md](docs/ISSUE_WORKFLOW.md) for the lightweight Issue lifecycle.
- Use [docs/ROADMAP.md](docs/ROADMAP.md) for product direction.
- Do not copy detailed implementation task lists into the roadmap.
