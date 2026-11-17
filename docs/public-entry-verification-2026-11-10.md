# P0/P1 implementation and verification — 10 November 2026

This is a progress record, not completed P0/P1 or public-launch acceptance.
The owner requested implementation through the active goal. No new commit,
push, merge, Netlify release, Sites publication, campaign or purchase occurred.
Existing private lobbies and historical player data remain in the same database.

## Implemented and verified in this block

| Area | Concrete result | Evidence and boundary |
| --- | --- | --- |
| Public entry | `/play` and `/play/:slug`, read-only metadata before account, explicit participation, direct return to the selected game context | Actual frontend hook tested through a local React development StrictMode harness; real Clerk OAuth-to-public-game acceptance is still pending. |
| Public backend | A constrained registry maps each competition/season to one dedicated system lobby; ordinary prediction tables and sync remain the only scoring path | Migration `20261110084040_public_competition_pools.sql` applied in existing Supabase. Gate remains false; zero real pools provisioned. |
| Participation | Caller identity comes from Clerk; no supplied player UUID. Removed users receive no usable context. Closed results open only for existing active members | Hosted `public_competition_pools.sql` passed and ended in ROLLBACK, including grants, private/cross-pool isolation and current-user `is_member`. |
| Automatic points | Existing score and MMA sync RPCs score separate public/private predictions; repeated results do not duplicate points | Hosted `public_competition_scoring.sql` passed and ended in ROLLBACK. Synthetic football: 5 public / 3 private; MMA v2: 5 public / 1 private. This is RPC evidence, not a new observed scheduled cron run. |
| Languages | CS/EN/DE/PL/SK game catalogs, 663 keys each, lazy extra catalogs and official Clerk resources; profile preference accepts the same five languages | `20261110084056_profile_locales.sql` applied; hosted profile suite passed with ROLLBACK. DE/PL/SK are translation drafts. Landing still CS/EN. |
| Identity return | Fresh explicit public intent has a 30-minute session-only lifetime and binds to the first verified subject before bootstrap/profile completion | Five intent unit tests and six CUA lifecycle scenarios; private invite codes/full URLs are never stored in this public-intent object. |
| Brand/PWA | Original local cup mark, accessible primary CTA colour, favicon/Apple/PWA/maskable assets, updated name/metadata and zoom enabled | Asset sizes/maskable safe area and browser rendering verified. Native install/update and real iOS/Android acceptance remain pending. Semantic result/error colours remain. |
| Landing | One empty-start hero demo with optional method, evaluate/reset and 5/3/1/0; three screenshots rendered from actual app views | Local private Sites checkout; synthetic names/counts, no real portraits/accounts. Screens explicitly labelled sample data, including Czech UI disclosure in EN. Not published. |
| Growth | A small CS community experiment, channel rules, CS/EN/DE/PL draft communication and owner handoff | Preparation only; no outreach, recruitment, campaign or retention experiment has run. |

## Hosted change controls

Before migration, captured the previous profile function/constraint and aggregate
counts in `/private/tmp/fan-public-entry-preflight-20261110.json`. This is a small
schema-change recovery reference, not a full disaster-recovery backup. The prior
legacy-retirement backup remains a separate artefact. No credentials were exported.

Only the two named migrations above were applied. Do not run an unreviewed full
`db push` over the historical migration directory: old Official/prize migrations
are deliberately not the target implementation.

After all three hosted rollback suites: 15 profiles, 2 lobbies, 14 memberships,
1,039 score predictions and 5 MMA predictions — the same aggregate counts as this
block's preflight. No locale/public-pool/scoring fixture issuer, profile, match,
fight or registry row remained. Public catalogue returns `[]`; public gate is
false. These counts are not marketing/user analytics and do not prove row-for-row
data integrity on their own. The transactional boundary preserves the test writes.

Publication rollback closes discovery/new entry; it does not revoke existing
memberships. Provision real CL/PL/annual-UFC pools only in the coordinated release
step. [Backend contract and boundaries](public-competition-backend-2026-11-10.md).

## Browser verification

Target flows: entry → explicit CTA → identity/profile completion → selected game;
language change → same form; landing sample pick → score → reset.

- Real local registration at `localhost:3000`: DE/PL/SK Clerk content, translated
  sign-up password placeholder and a synthetic typed email preserved across
  language change. No registration was submitted. Restored Czech/empty input.
- Actual `/play` loads the intentional closed-publication state without an app
  error. The known Clerk development-key warning remains; production identity
  still needs the owner's domain and Clerk configuration.
- Offline hook harness: no CTA creates zero joins; explicit join opens the right
  competition once; a late A response cannot navigate B; an intent bound during
  A bootstrap cannot autojoin B; cancelling to the catalogue ignores the pending
  reply; remounting A ignores the old reply and opens once from the replacement.
  All six passed under development StrictMode, with no remote requests/errors.
  This does not emulate cryptographic Clerk validation.
- Actual HomeDashboard/MmaFightCard/LeaderboardScreen on synthetic fixtures at
  390×844: controls render, CTA changes after a selection, no horizontal overflow
  or relevant console errors. Screenshot labels identify all data as synthetic.
- Landing at 1280×900 and 390×844: identity/content/console/overflow checks passed;
  one hero demo produced 5/3/1/0 for the four intended branches, optional-method
  toggle and reset worked. Gallery uses actual rendered app screenshots.

Temporary fixtures and CUA evidence are outside the repository under
`/private/tmp/fan-showcase-20261110`, `/private/tmp/fan-showcase-shots-20261110` and
`/private/tmp/fan-launch-qa-20261110`. They are not application routes or committed
QA tools. Browser automation used the available CUA surface; no Playwright CLI
or additional browser dependency was installed.

## Still required

P0/P1 remains active. [The owner checklist](owner-launch-actions-2026-11-09.md)
collects the four decisions: VIP offer/price/limits, seller and countries, domain,
first reachable organiser/test group. Billing, legal/licensing acceptance, consent
and player-activity measurement, basic alert/recovery evidence, DE/PL landing,
native proofreading, real-device checks and the actual campaign are not completed
by this block. Admin UI is explicitly deferred.

The landing's published-app links remain on the existing private-lobby signup
flow until the new public entry is approved for release. Update campaign CTAs to
the published competition path in that release; do not send people to an empty
gated catalogue or advertise unprovisioned public games.

New frontend work and the prior dependency patch are still local and need a
reviewed release package. A green build, local simulation or SQL suite is not a
claim that the whole product is secure, scalable, legally cleared or accepted.
