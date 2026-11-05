# Onboarding to First Tip and Official Tournaments

> **Architecture status — 2026-11-03:** The owner accepted one persistent
> organizer lobby containing competitions with their own participation and
> standings, with event-specific invitations. See the [accepted product model](ROADMAP.md#accepted-organizer-model--2026-11-03)
> and [active plan](product-restart-plan.md). The separate Official Events domain
> below describes the existing local implementation and its historical decisions,
> not the target product architecture. The historical “Variant B” in this document
> is a different label from the newly accepted product model B. Existing `020`/`021`
> dependencies and rollout gates remain valid while the current backend is retained;
> this decision does not authorize removing migrations, tables, safeguards or data.

Status: local foundation implemented and integration-tested. Migrations `020`
and `021`, frontend flags, and all Official Events features remain unapplied and
disabled in production.

This document defines both a first-run funnel and a reusable Official Events
platform for periodic public PvP competitions. An event can be an onboarding
destination, but it is not a permanent tutorial lobby. Commercial metadata,
prizes, eligibility and season-result decisions are documented in
[official-public-tournaments.md](official-public-tournaments.md).

## Product objective

A new user should understand the product within 10 seconds and reach a real
saved prediction within 60–90 seconds. The onboarding is not a tutorial carousel:
each step either establishes value, teaches the score input through interaction,
or moves the user into a real playing context.

Success means:

1. The user has an authenticated Supabase session and application profile.
2. An invite is preserved and resolved when present.
3. The user joins a lobby, creates a lobby, or enters an official onboarding
   event.
4. The first real prediction is stored through an authoritative server contract.
5. The user sees a clear confirmation and one next action.

## Current first-run audit

### What already works

- Supabase session is the only authentication source of truth.
- `getSession()` restores the initial session and `onAuthStateChange()` handles
  later lifecycle changes.
- Invite links use `/join/<code>` and preserve the code through Auth.
- Secure lobby join and create RPCs derive identity from `auth.uid()`.
- Email confirmation, recovery, logout and profile provisioning are established.
- The Home read models use request-id protection and do not poll.
- Match prediction RLS checks the user, active lobby membership, match context
  and lock time.
- The result-sync implementation imports the one TypeScript
  `calculatePoints()` function and verifies recalculated rows before storing a
  result.

### First-run gaps

- After an organic registration the product has no versioned onboarding state.
- A user without a lobby reaches a valid but low-context Home instead of an
  immediate path to a first tip.
- The current prediction table is deliberately lobby-scoped. It cannot represent
  an official event without a lobby ID.
- The current Home RPCs understand lobby contexts and membership requests, not
  official event participation.
- Existing achievements and Hall of Fame are derived from lobby predictions.
  Reusing them for an official event would silently change their meaning.
- Current mobile Home inspection at 390 px showed horizontal clipping in the
  checked working-copy state. This is pre-existing and must be rechecked before
  any onboarding acceptance is marked complete.

## Product funnel

### Invite-first path

```text
/join/<code>
  -> Auth with "Máš pozvánku"
  -> email confirmation/profile completion if needed
  -> lobby confirmation
  -> join or approval request
  -> first relevant unlocked match
```

The generic three-step onboarding is skipped until the invite is resolved.
Successful entry records `completed_via_invite`. An approval-required lobby
shows the existing pending request state; it must not pretend that the user can
already predict.

### Organic path

```text
Auth
  -> value
  -> local score demo
  -> choose playing context
     -> enter invite
     -> create lobby
     -> active official tournament
  -> first real prediction
  -> confirmation and one next action
```

Skip always leads to the existing Home with the same three actionable choices.
It never leads to a dead or explanatory-only screen.

## Screens and microcopy

### Step 1: value

Heading:

> Tipuj zápasy. Poraz kamarády.

Supporting copy:

> Soukromé soutěže pro tvoji partu. Bez sázení o peníze — hraješ o body a
> reputaci.

Primary CTA: `Jdeme na to`

Secondary action: `Přeskočit`

A short, non-blocking score-to-points transition may play once. It is decorative
and never delays the CTA.

### Step 2: score demo

Heading:

> Zkus si první tip

Demo:

```text
Česko        2 : 1        Německo
```

Only three explanations are visible:

- `Přesný výsledek = 5 bodů`
- `Správný vítěz = 2 body`
- `Tip můžeš změnit do uzávěrky`

Primary CTA after the first score interaction: `Vyzkoušet tip`

The demo is local component state. It never calls a prediction API, never creates
an award and never changes a statistic.

### Step 3: playing context

Heading:

> Kde chceš hrát?

Choices:

- `Mám pozvánku`
- `Založit vlastní lobby`
- `Zapojit se do oficiálního turnaje`

The third choice is displayed only when an active official event has at least one
predictable match. Otherwise it is replaced with a short neutral message and the
two valid paths remain.

### First real prediction

After a successful save:

> První tip je doma.

Secondary state:

- before results: `Počkej na výsledek`
- after ranking exists: `Jsi 184. z 627 tipérů`

Exactly one main CTA follows. The initial recommendation is
`Pozvat kamarády`; a future measured variant may use `Založit vlastní lobby`.

## Interaction and motion

- Screen transition: fade and 8–12 px slide, 180–220 ms.
- Score stepper: 0.98-to-1 scale, 120–160 ms.
- Successful real save: inline check scale/fade, 180–220 ms.
- Skeletons are used for event and match reads; no full-screen spinner after Auth.
- Buttons show inline progress and reject duplicate submission.
- Navigation and security errors are immediate.
- `prefers-reduced-motion` removes movement and keeps only state replacement.
- No confetti, forced delay, autoplay loop or full-screen celebration.

## Onboarding state

Use one row per user and keep event analytics out of this table.

```text
user_onboarding_state
  user_id              uuid primary key -> auth.users.id
  onboarding_version   integer not null
  status               not_started | started | skipped | completed
  variant_key          text not null
  completion_path      invite | own_lobby | start_event | null
  started_at           timestamptz
  completed_at         timestamptz
  updated_at           timestamptz
```

The requested `completed_via_*` states are represented as
`status = completed + completion_path`. This avoids invalid combinations and
keeps future versions and experiments readable.

No random A/B assignment is introduced now. The frontend accepts a server-owned
`variant_key`, with `control` as the only seeded value.

## Architecture comparison

| Variant | Advantages | Disadvantages | Decision |
| --- | --- | --- | --- |
| A. Ordinary public lobby | Reuses lobby predictions and current scoring immediately | One membership per participant, public-lobby semantics, member-directory and privacy pressure, Hall/badge contamination, weak large-event UX | Reject |
| B. Official event with participation | Correct domain boundary, no public member list, explicit lifecycle, scalable leaderboard, independent Home/history semantics | Requires an authoritative scoring integration for a second prediction table | Selected |
| C. Event predictions without participation | Fewer tables | Participation, hide/leave, season history, participant count and duplicate control become implicit and fragile | Reject |

## Architecture decision

Choose Variant B: an official event with explicit participation and a separate
prediction table.

Do not auto-enroll all users and do not create a normal lobby membership for
every participant. The official event is a separate product surface that reuses
global tournaments, matches and the existing scoring formula.

### Authoritative scoring decision

The owner approved a narrow additive result-sync extension. The implementation
keeps `calculatePoints()` as the only scoring formula:

1. the trusted server loads both prediction layers;
2. it calculates every row with the imported existing `calculatePoints()`;
3. it submits complete snapshots to `apply_match_result_atomic()`;
4. PostgreSQL locks the match and both prediction sets;
5. the transaction rejects missing, duplicate or stale snapshot rows;
6. one transaction updates lobby points, event points, event score aggregates
   and the match result;
7. any error rolls the complete call back automatically.

An authenticated prediction-write trigger now takes a share lock on the match.
This closes the race where a prediction could otherwise be inserted between the
server read and the atomic result transaction. A changed snapshot returns a
serialization failure; the operation remains safe to retry from a fresh read.

Repeated identical results are idempotent. Corrections recalculate both layers
from the same TypeScript formula. Preview, provider guards, manual-result
authorization and fixture sync remain unchanged.

## Target data model

### `official_events`

- `id`
- `slug` unique
- `name`
- `tournament_id` foreign key
- `status`: `draft | scheduled | active | completed | archived`
- `registration_opens_at`
- `registration_closes_at`
- `starts_at`
- `ends_at`
- `featured`
- `onboarding_eligible`
- `prize_metadata`
- `created_by`
- `created_at`

Only a platform admin can change lifecycle state. An event references an existing
supported tournament; it does not create a second sports data source. An event
with predictions cannot change tournament, completed events cannot be reopened,
and a partial unique index allows only one active featured onboarding event.

### `official_event_participations`

- `event_id`
- `user_id`
- `status`: `active | left`
- `joined_at`
- `ended_at`
- `hidden_at`
- primary key `(event_id, user_id)`

Participation is idempotent. It is not a public member directory and does not
create lobby membership. Hiding is a presentation preference (`hidden_at`), not
a second participation lifecycle state.

### `official_event_predictions`

- `event_id`
- `user_id`
- `match_id`
- `predicted_home_score`
- `predicted_away_score`
- `points_earned` default `0`
- `created_at`
- `updated_at`
- primary key `(event_id, user_id, match_id)`

The client cannot set or change `points_earned`. A guard preserves authoritative
points on normal user writes, matching the existing prediction security
principle.

## RLS and RPC model

All tables have RLS enabled. Direct table mutation grants are revoked from
`anon` and `authenticated`. Mutation RPCs derive identity only from
`auth.uid()`. Any necessary `SECURITY DEFINER` function uses
`SET search_path = ''`, schema-qualified names and minimal grants.

Proposed contracts:

- `get_my_onboarding_state()`
- `update_my_onboarding_state(version, status, variant_key, completion_path)`
- `manage_official_event_secure(...)`
- `join_official_event(event_id)`
- `leave_official_event(event_id)`
- `save_official_event_prediction(event_id, match_id, home_score, away_score)`
- `get_official_event_home_card()`
- `get_official_event_detail(event_id)`
- `get_official_event_leaderboard(event_id)`
- `hide_official_event(event_id)`

No RPC accepts an authoritative caller `user_id`.

`save_official_event_prediction` verifies:

- authenticated caller and active participation;
- event status and availability window;
- match belongs to the event tournament;
- participants are known;
- score values satisfy existing sport rules;
- server-side lock time has not passed;
- no result already exists.

Unknown, inaccessible and non-participating reads use non-enumerating responses.
The feature flag hides rollout UI but is never an authorization boundary.

## Leaderboard read model

The initial read returns:

- top three;
- current user's row;
- two rows above and below;
- participant count;
- points required to overtake the next position;
- safe display name and avatar only.

It does not return e-mail, UUID, platform role, lobby membership or full profile.
Rows are deterministically ordered by total points, exact predictions, first
prediction time, participation time and finally an internal UUID. The UUID is
used only as the final stable tie-breaker and is never returned. The response
marks the caller with `is_current_user` instead of exposing the user ID.

A future full leaderboard uses an opaque cursor and a page limit of 25 (maximum
50). The Home and event landing views never fetch every participant.

Recommended indexes:

- prediction lookup by `(event_id, match_id)`;
- ranking support by `(event_id, points_earned)`;
- participation lookup by `(user_id, status, event_id)`;
- event lifecycle lookup by `(status, featured, onboarding_eligible, starts_at, ends_at)`.

For large events, aggregate totals should be maintained by the same trusted
result application path, not recalculated from all predictions on each read.

## Home integration

An official card is visually distinct and is not inserted into the lobby list.

```text
TIPOVAČKA START
Tvůj první otevřený event
3 zápasy čekají
[Tipovat]
```

Priority:

- no private lobby and actionable event: official card first;
- active private lobby exists: private lobbies remain primary and the event moves
  below them;
- event completed: show results, then demote after the onboarding season;
- event hidden, archived or inactive: omit from the primary Home.

The card read is additive to the existing Home read models and uses the same
request-id stale-response protection. It adds no polling.

## Event lifecycle

- `draft`: admin-only preparation.
- `scheduled`: may be announced, but cannot be the onboarding destination until
  at least one match is predictably available.
- `active`: participation and unlocked predictions allowed.
- `completed`: read-only ranking and results.
- `archived`: removed from primary Home; history retained.

Only one event is the current onboarding destination for a configured cohort.
The next scheduled season should overlap operationally with the closing season.
If no event has an unlocked match, Step 3 falls back to invite/create rather than
opening an empty event.

A last-day entrant may join only while at least one match remains unlocked. An
event with no schedule or no usable participants is not presented as playable.

## Profile, badges and Hall of Fame

Version 1 keeps official event data separate:

- no private-lobby Hall of Fame contribution;
- no completed-private-competition count;
- no lobby winner or veteran badge;
- no automatic change to existing global profile statistics;
- no automatic award from result sync.

`První tip je doma` is product feedback, not an achievement award. Migration
`020` includes disabled event-specific badge definitions and award storage.
Direct client award writes are revoked. No rule is active and no award is
reconciled automatically in this phase; activation still requires a separate
review of each authoritative rule.

## Privacy and abuse

- No public participation directory.
- No UUID, e-mail, role or membership data in leaderboard responses.
- Private profile visibility does not expose a full profile; competition identity
  is limited to the display name/avatar needed for the event.
- Unique constraints prevent duplicate participation and duplicate predictions.
- Rate limits should cover join, prediction mutation and leaderboard pagination.
- Uniform errors reduce event and account enumeration.
- The user can hide the official card and can leave an active event without
  deleting historical predictions.
- Multi-account abuse remains a residual product risk. Email confirmation,
  provider protections, rate limits and optional CAPTCHA reduce it; v1 does not
  claim Sybil resistance.
- Invite/referral spam remains outside this feature. No client-supplied referrer
  identity is accepted.

## Edge cases

- Invite arrives during onboarding: invite takes priority and preserves state.
- Reload mid-onboarding: restore the versioned step from the server state.
- Email confirmation opens on another device: session restores, then invite or
  onboarding resumes.
- Approval-required invite: complete through the pending request state, not Start.
- Event closes while screen is open: save RPC rejects by server time and UI offers
  invite/create.
- Match becomes locked while editing: preserve input locally, show the lock
  message and move to the next available match.
- Event completes before rank load: replace prediction CTA with results.
- User has private lobbies: Start is non-dominant and can be hidden.
- User hides or leaves: no deletion of historical predictions or ranking audit
  data.
- Season rollover: participation never carries automatically to a new event.
- Tied rank: deterministic competition ranking and `points_to_next = 0` where
  appropriate.

## Performance budget

- One onboarding-state read after authenticated profile bootstrap.
- One current-event summary read only while the feature flag is enabled.
- One compact leaderboard RPC after first tip or when opening the event.
- No member-directory fetch and no client aggregation.
- Lazy-load the demo and event surfaces.
- Reuse current match and participant display components where contracts allow.
- Preserve Home request-id protection and focus/visibility refresh behavior.

## Local implementation

### Phase 1: onboarding state and local demo — implemented

- Add versioned state and disabled public feature flag.
- Implement the three-step UI and invite-first branching.
- Keep the demo entirely local.

### Phase 2: event foundation — implemented

- Add event and participation schema.
- Add admin lifecycle and safe event-summary RPCs.
- Keep the feature disabled.

### Phase 3: authoritative predictions and scoring — implemented locally

- Add event predictions and points guard.
- Use one atomic database result application after the existing TypeScript
  calculation.
- Run stale-snapshot, rollback, correction, concurrency and 500-row tests.

### Phase 4: leaderboard and Home — implemented behind flags

- Add compact ranking RPC.
- Add the distinct official Home card.
- Keep private lobby Home and Hall contracts unchanged.

### Phase 5: controlled acceptance — not started

- Create one clearly named QA event.
- Test organic, invite, skip and first-tip paths.
- Verify scoring, ranking, privacy, mobile resume and season lifecycle.
- Enable only after integrity and regression gates pass.

## Test plan

- onboarding not-started/started/skipped/completed states;
- completion through invite, own lobby and Start;
- local demo creates no database write;
- invite survives Auth and confirmation;
- duplicate event participation is idempotent;
- prediction before lock succeeds and after lock fails;
- caller spoofing and direct table writes fail;
- rank top-three and neighborhood are stable under ties;
- private identity response contains no sensitive fields;
- completed and archived event behavior;
- season rollover and no-playable-event fallback;
- user with and without private lobbies;
- reload, stale request and focus refresh protection;
- reduced-motion behavior;
- full regression for Auth, Home, lobby navigation, membership, scoring,
  long-term scoring, Hall of Fame, badges, result sync and invite QR.

Browser acceptance must cover 390×844 and 1280×900 with no horizontal overflow,
blank callback state, duplicate CTA or console warning.

## Rollout gates

1. Migration and SQL tests pass on isolated PostgreSQL. **Passed locally.**
2. Result-sync failure-injection tests prove two-table rollback and verification.
   **Passed locally.**
3. Review request-size and execution-time limits using the intended beta cohort.
   The local atomic test covers 500 event predictions; this is not evidence for
   an unbounded public event.
4. Apply `020`, then `021`, never a broad migration push.
5. Verify grants, owners, search paths and both false feature flags.
6. Deploy server and frontend with both flags false.
7. Existing Auth, lobby, prediction, scoring, leaderboard and Hall baselines match.
8. Create one explicitly approved QA event and pass first-run/privacy acceptance.
9. Enable Official Events, then onboarding, for a limited cohort.

Preferred recovery is to disable the feature flag and forward-fix. Deployed
event history should not be destructively removed.

## Proposed commit and PR chain

1. `docs: decide onboarding and official event architecture`
2. `feat: add versioned onboarding foundation`
3. `feat: add official event participation foundation`
4. `security: add authoritative official event predictions`
5. `feat: add official event leaderboard and Home integration`
6. `feat: add first-tip onboarding experience`
7. `docs: document controlled onboarding rollout`

The scoring integration should be its own reviewable commit and deployment gate.
No broad migration push, production write, feature enablement or automatic QA
data creation is part of architecture approval.
