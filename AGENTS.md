# AGENTS.md — Tipovačka Agent Guide

Tipovačka is currently being rebuilt and tested in the existing Supabase project. The owner confirmed on 4–5 November 2026 that there is no active live competition and this is a development space. Historical predictions and results remain useful reference data. Do not describe the current project as live production or repeat the obsolete production warning.

## Product Context

**Expansion, 5 November evening:** the owner requested Premier League, then NHL
and Czech Extraliga. PL and NHL are active in Testovací rodeo. ELH's 363 imported
games are preserved, but its catalog is hidden/relationship archived: Hokej.cz
returns 403 from Netlify and the existing API-Sports Free key refuses season 2026.
The shared cron runs CL/PL/NHL; ELH is explicitly skipped by default unless
`ELH_SYNC_ENABLED=true` after source verification. NHL supports published playoffs;
ELH parsing currently supports the regular season only. See [docs/multi-sport-sync.md](docs/multi-sport-sync.md)
for validated data sources, score semantics, checks and operational boundaries.

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
- Sports data providers: historical competitions use TheSportsDB. The active Champions League 2026/27 catalog is imported from football-data.org and linked to Testovací rodeo; the owner chose full-season testing. Cron-job.org task 8799825 is active every 15 minutes and its first scheduled run succeeded. The full-season adapter/RPC support up to 45 knockout matches as the provider publishes known participants/times, with final goals or shootout-only scoring. Current-season API still contains only 144 league games. Per-lobby configurable scoring remains pending. See [docs/football-data-cron.md](docs/football-data-cron.md). API-Football docs/code may still exist as historical/provider context.
- Important docs: [PROJECT_RULES.md](PROJECT_RULES.md), [docs/ISSUE_WORKFLOW.md](docs/ISSUE_WORKFLOW.md), [docs/ROADMAP.md](docs/ROADMAP.md), [docs/thesportsdb-dry-run.md](docs/thesportsdb-dry-run.md), [docs/fixture-sync-cron.md](docs/fixture-sync-cron.md).

Useful commands:

- `npm run dev` — local Vite/Express dev server.
- `npm run lint` — TypeScript typecheck.
- `npm run build` — Vite build plus bundled local server.
- `npm run build:netlify` — Netlify-style static frontend build.
- `git diff --check` — whitespace/conflict marker check.

Focused test commands include `npm run test:env`, `npm run test:clerk` and `npm run test:football-data`. Transactional DB suites are in `supabase/tests`. Add the smallest relevant test approach within the task scope.

## Current Authorization and Restrictions — 2026-11-05

The owner has authorized rebuilding/cleaning the single existing database, Clerk integration, profiles, schema/RLS work, transactional tests, the agreed pilot implementation and the Champions League import with a protected sync endpoint. Continue this work without requesting the same approval again. Inspect dependencies, make appropriate backups, verify changes, and report results. A backup or rollback test does not by itself require another approval. Do not create a second beta database or environment.

The earlier live-production warning is historical and superseded by this authorization. See [PROJECT_RULES.md](PROJECT_RULES.md) and [the implementation scope](docs/beta-implementation-scope.md). Reassess operating rules when real live play resumes; do not automatically reinstate the old warning during the current rebuild.

Release authorization, 5 November: the owner explicitly requested push and publication of the current working version at `https://tipovacka-fotbal.netlify.app` and authorized Netlify CLI access. The necessary merge into `main`, configuration of that existing site and deployment of this package are authorized. Paid services and deferred Official Events/prize activation remain outside this release.

Result authority update, 5 November: the owner approved repairing local API-managed results from the same verified provider revision while ignoring older snapshots. The CL sync also reconciles stale finished-match points. `manual-admin` provenance is not an automatic permanent override in this API catalog; contradictory provider facts under the same finished-result revision remain conflicts. Future independent-source consensus (for example 2 of 3) is an accepted direction, not an implemented provider integration. See [docs/result-source-policy.md](docs/result-source-policy.md).

Unfinished API games earn zero points. A verified pending snapshot can clear a locally fabricated final, but a different pending snapshot cannot retract an API-confirmed final. Player predictions and elapsed locks remain protected.

Outside the owner's already authorized scope, an agent must not:

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

1. Read the relevant GitHub Issue when one exists.
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

Documentation maintenance:

If a change affects product behavior, architecture, workflow, application rules, sync, security, or another long-term decision, verify that the related documentation still matches the implementation. If docs no longer match, update them in the same PR/change or explicitly report that a follow-up documentation update is required. Do not knowingly leave the repository in a state where implementation and documentation describe different behavior.

After implementation:

1. Run relevant tests.
2. Run available lint, typecheck, and build checks.
3. Review `git diff` and `git diff --check`.
4. List changed files.
5. Report validation results.
6. Report risks and what was not verified.
7. Link the Pull Request to its Issue for non-trivial work.

## Definition of Done

- **Implemented**: code/docs are written.
- **Verified**: automated checks and available manual verification were completed by the agent.
- **Accepted**: the project owner or assigned reviewer confirms that the result matches the request.

An Issue may be closed automatically by merge only when its Definition of Done is truly satisfied and the PR uses a correct closing reference such as `Closes #123`.

For UI/UX changes, product behavior, scoring, auth, data sync, and hard-to-automate fixes, prefer owner review before merge. Agents must not mark work as done just because code was written.

## GitHub Issues and Roadmap

- GitHub Issues are lightweight project memory for concrete work: bugs, technical tasks, features, research, and decisions.
- Repository docs are the source of truth for long-term product and technical context.
- Pull Requests should reference a concrete Issue for non-trivial work.
- Use [docs/ISSUE_WORKFLOW.md](docs/ISSUE_WORKFLOW.md) for the lightweight Issue lifecycle.
- Use [docs/ROADMAP.md](docs/ROADMAP.md) for product direction.
- Do not copy detailed implementation task lists into the roadmap.

When the owner asks to create an Issue and GitHub write access is available, search open Issues first, avoid duplicates, choose a concise title/type/priority, and include the root problem, evidence, expected outcome, and constraints. If GitHub write access is unavailable, return the proposed title, body, and labels instead. Do not close Issues until the owner confirms acceptance, unless a reviewed merged PR explicitly closes them.
