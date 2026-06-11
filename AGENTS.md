# AGENTS.md — Tipovačka Production Rules

This repository is treated as a live/beta production app. Real users can have real predictions in the database.

## Non-negotiable operating mode

Before making changes, assume:

- predictions in the database are real user data,
- points must never be edited manually,
- predictions must never be changed outside the normal user flow,
- match results are the only allowed source input for scoring changes,
- any intervention in match results must be controlled, reviewed, and auditable.

## Mandatory AI prompt before risky work

Use this operating assumption before every change touching data, auth, roles, scoring, results, or production configuration:

> Jsme v ostrém provozu. Tipy v DB jsou reálné. Neprováděj žádné zápisy do predictions, matches ani profiles bez výslovného schválení. Neprováděj destruktivní změny. Nejdřív udělej audit, napiš rizika, navrhni plán a počkej na potvrzení.

## What AI agents may do without approval

AI agents may independently perform read-only or low-risk work:

- audit admin result flows,
- audit scoring and leaderboard logic,
- audit stale `points_earned` risks,
- audit database schema and RLS policies,
- audit secrets/environment variable usage,
- audit deployment flow,
- create documentation and checklists,
- prepare validation `SELECT` queries,
- run lint/build/type checks,
- implement small UI polish that does not change auth, DB schema, scoring, locking, or production data.

## Work requiring explicit owner approval

AI agents must not do the following without explicit approval from Viktor/project owner:

- change database schema,
- add or remove tables/columns,
- change RLS policies,
- delete or mutate production data,
- edit production predictions,
- edit points directly,
- edit match results directly,
- change login/auth flow,
- change roles or promote users,
- change service-role logic,
- change Supabase Auth settings,
- change scoring rules,
- change tournament-winner scoring,
- change leaderboard calculation,
- change lock logic,
- run write-mode validation scripts against production,
- create test predictions in a live lobby,
- reset results,
- delete players,
- change lobby members.

## Red lines

Never do these:

- commit plaintext passwords,
- commit service-role keys or secrets,
- commit `.env` files,
- expose service-role keys in frontend code,
- directly update player points,
- directly update locked user predictions,
- build an API that automatically overwrites manually confirmed results,
- apply a quick production DB fix without backup,
- merge without lint/build checks,
- merge without manual core-flow testing for user-facing changes.

## Source-of-truth rules

The backend is the source of truth for:

- scoring,
- match lock state,
- leaderboard standings,
- permissions,
- result confirmation,
- playoff progression when implemented.

The frontend may provide UX checks only. Client-side validation must never be the authoritative safety layer.

## Architecture boundaries

- Keep scoring logic centralized.
- Do not duplicate business logic between frontend and backend.
- Keep auth/permission decisions out of presentation components.
- Do not add direct production data writes from UI shortcuts.
- Prefer documented service/repository boundaries for future data access refactors.
- Any architecture change that affects auth, scoring, storage, multi-season behavior, or permissions needs a short ADR.

## Required checks before merge

- `git status` only shows intended files.
- No `.env` files or secrets are staged.
- `npm run lint` passes.
- `npm run build` passes for release-impacting changes.
- Manual core flow is tested when UI/backend behavior changes.
- PR description explains risk, verification, and rollback.
