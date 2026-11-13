# VIP custom scoring — proposed implementation contract

10 November 2026. Repository audit and bounded technical proposal only: no
scoring code, migration, awarded points, VIP access or payment behavior changed.
The owner confirmed custom scoring or our standard rules as a P0 VIP capability.
The owner subsequently accepted one personal VIP at CZK49 monthly or CZK499
annually, first lobby and invited players free, without a five-member paywall.
This supersedes the earlier CZK29/49 monthly price experiment.
The exact additional-lobby quota, seller and actual sale remain open;
see [the VIP proposal](vip-and-public-entry-proposal-2026-11-09.md).

## Source findings that determine the scope

| Current path | Verified behavior | Required consequence |
| --- | --- | --- |
| `calculatePoints`, football/hockey workers | Football uses exclusive exact5 / difference3 / winner2 / draw2 tiers; hockey exact5 / winner2 | Change weights, not category meaning or score normalization. |
| `sync_football_data_catalog` | Accepts worker-computed point rows after prediction-snapshot checks and a 0–5 range check | A UI-only or worker-only editor would leave another authority. |
| `sync_hockey_catalog` | Independently checks worker points against hardcoded SQL exact5 / winner2 | Both validation and application must use the same frozen context. |
| `sync_mma_event`, `mma_prediction_points` | SQL derives points from global card `rules_version`; MMA points are constrained to `{0,1,3,5}` | Card v1/v2 semantics must stay global; lobby weights are a separate layer. |
| `db.fetchLobbyLeaderboard`, `App.tsx` | Recalculate finished points in JS; exact hits/colors/history often use `points===5`, streaks use positive points | Stored custom points would currently be overwritten visually; correctness must come from facts. |
| `get_profile_summary`, `ProfileCommunityPanel` | Sum match and long-term points across contexts into one profile number; this SQL summary does not include MMA | Different scales cannot become a meaningful global score. |

Current tournament-winner scoring, football goal/shootout interpretation, hockey
final-goal semantics, MMA methods/lineup validity, result revision guards and
locks are outside the adjustable surface. No new sport, result source, cron,
Official prediction table or parallel scoring engine is needed.

## One immutable snapshot per lobby and competition

Use the existing `(lobby_id,tournament_id)` in `lobby_tournaments` as the scope.
Proposed storage is one append-only `tipovacka_private.lobby_scoring_rule_versions` relation plus
a protected current-version pointer and `scoring_locked_at` on that context.
A version contains UUID/revision, format, schema version, mode `default|custom`,
bounded weights and creation metadata. It contains no provider result or player
multiplier. Every member, including the owner and non-paying players, uses the
same snapshot.

New contexts start with our free defaults. Reading rules is not a purchase and
does not require VIP, but private-context reads still require existing Clerk
membership/owner authorization. Anonymous publication may expose only approved
public defaults, never arbitrary private context IDs or rule records.
Changing to custom requires the actual lobby owner,
enabled Clerk identity, the eventual server-verified capability and an eligible
active competition. Neither a lobby admin, platform-admin role alone, client
`isVIP` nor caller-supplied owner ID grants that capability. Registered public
CL/PL/UFC pools always use fixed defaults, even if their operator owns VIP.

Proposed RPC surface:

```text
get_lobby_scoring_rules(lobby_id, tournament_id)
  -> version_id, revision, format, mode, weights, locked_at, can_configure
set_lobby_scoring_rules(lobby_id, tournament_id, expected_revision, mode, weights)
  -> the new validated snapshot; stale/locked/unauthorized requests fail
```

Do not expose direct authenticated writes to versions, pointers or lock metadata.
The setter appends a version and advances the pointer atomically; stale editor
tabs cannot overwrite a newer choice. One ordinary owner may choose the free
default before locking without buying VIP. Already adopted custom rules do not
silently revert when VIP expires; further custom edits/new custom contexts need
a valid capability. Ownership transfer changes who may configure an unlocked
context, never the rules or points already played.

The first successful saved tip freezes the version atomically with that save.
This includes a long-term tip freezing context metadata, without changing its
scoring. Record the lock permanently; deleting tips, leaving/rejoining, removing
a member, expiry or moving an attachment must not unlock it. Backfill existing
contexts with protected defaults and freeze any context with historical tips;
do not rewrite historical picks, timestamps or points. Default resolution must
retain old MMA v1 cards at1 point rather than upgrading them through this work.

To prevent a first tip being saved under rules different from its preview, add
a nullable `scoring_rule_version_id` acknowledgement to score/MMA predictions.
New custom saves require the displayed current ID; stale/missing IDs fail and
request a refresh. Historical nulls stay interpretable as frozen legacy default,
without bulk rewriting records. A default-only legacy client may continue its
current flow; it cannot silently save into a custom context. Use the same row
lock/ordering for context edits and successful first saves, extending existing
match/event/fight locks without introducing a deadlock with sync.

## Adjustable numbers, unchanged criteria

All weights are strict integers **0–20**, with exactly the format's allowed keys;
reject strings, fractions, negatives, unknown keys and all-zero configurations.
Miss/unfinished/void/stale-lineup points stay0 and are not an editable field.
These are proposed engineering bounds for root review, not a price decision.

| Format | Default weights | Validation |
| --- | --- | --- |
| Football | exact5, difference3, winner2, draw2 | exact ≥ difference ≥ winner ≥0; exact ≥ draw ≥0 |
| Hockey | exact5, winner2 | exact ≥ winner ≥0 |
| MMA v2 | both5, winner3, method1 | both ≥ winner ≥ method ≥0 |

Awards are **one matching tier**, not the sum of the displayed weights.
Football exact includes an exact draw; another predicted draw gets only the
draw tier. A non-draw correct winner with the correct signed goal difference
gets difference, otherwise winner. Hockey uses exact or the correct final
winner; this does not allow drawn hockey tips.

For MMA v2, both means correct winner and normalized method; winner includes
an omitted or incorrect method; method-only requires the matching method and
wrong winner. Existing DQ/other handling awards winner only, and existing
unfinished/draw/no-contest/lineup rules still win over any positive weight.
Old `mma-winner-v1` remains fixed winner1: custom v2 weights do not reinterpret
those cards. New annual cards inherit the league snapshot while their card
semantics remain v2; the next annual league requires a new context/snapshot.

Owner preview shows the default and proposed outcomes side by side before
confirmation. For example football weights8/4/2/3 with result3:1 award8 for3:1,
4 for2:0, 2 for1:0 and0 for0:1; a1:1 result with tip2:2 awards3. Hockey8/2 awards8
for exact3:2 and2 for2:1. MMA8/4/1 awards8 for winner+method,4 for winner only
and1 for method only. Include zero-weight and cancelled examples. This is an
illustration, not a simulated real result or a rescore of existing players.

## Point authority and presentation

Extend the **existing sync RPCs** so persisted awards are derived in SQL from
verified sports facts plus the frozen lobby snapshot, following MMA's current
server-derived approach. Keep current prediction membership/snapshot and
result-revision checks. Worker-supplied `points_earned` must cease to be award
authority; deprecate it as a hint while retaining/transitioning the existing
payload's pick-snapshot safeguards. Do not merely widen 0–5 and trust new client
numbers. Update the hockey SQL hardcoding and MMA helper/constraint together.
Same/newer verified corrections recompute under the original frozen version;
pending results yield0. No entitlement check runs during scoring: expiration
cannot alter awarded points or another player's treatment.

TypeScript is the typed validator/classifier and synthetic preview, with shared
golden fixtures checked against SQL. It must not recalculate displayed real
points over the saved server value. `calculatePoints` retains an explicitly
tested default path; previews are not a second runtime award authority.
Preserve old writer compatibility deliberately, and keep custom creation off
until worker, DB and every affected reader ship together. The legacy TheSportsDB/
manual-result paths must remain default-only or explicitly use the same frozen
calculation; do not activate undeployed021/Official code to achieve this.

Exact/outcome counters, history symbols, colors and streak categories must use
result facts/classification, not `points===5` or positivity: an exact result may
be worth8, and a correct criterion may deliberately award0. Preserve the current
rendered football/hockey tie-break (points, exact, outcome hits, name) and MMA's
points/name/user-ID ordering; do not derive correctness from weight size.
The long-term-winner contribution remains unchanged.

Competition results remain local to that lobby, tournament and rules version.
Profile-wide point sums must be replaced or clearly scoped before custom rules
are enabled: show counts and per-competition point breakdowns, not a combined
custom/default/football/hockey/MMA ranking. Do not invent a global platform
leaderboard or normalize unrelated scales as part of this patch. Existing
fact-based badges can remain; context-winner badges must use that context's
persisted points and unchanged winner semantics.

## Exact implementation inventory and tests

| Layer | Tables/functions/files affected in a future reviewed patch |
| --- | --- |
| Rule storage/access | New versions table; `lobby_tournaments` protected pointer/lock; nullable version acknowledgement on `predictions`/`mma_predictions`; rules read/set RPC and new prediction-context freeze guards. `protect_longterm_prediction_context`/its save path adds only context freezing. Existing Clerk/RLS membership and point-write protections remain. |
| Awarding | `sync_football_data_catalog` from [multi-league migration](../supabase/migrations/20261105200636_multi_league_catalog.sql); `sync_hockey_catalog` from [hockey migration](../supabase/migrations/20261105201914_hockey_catalog_sync.sql); `sync_mma_event`, `mma_prediction_points`, MMA points CHECK from [method migration](../supabase/migrations/20261108114411_mma_finish_method_predictions.sql). Extend these via a forward migration, never edit old applied migrations. |
| Workers/preview | [scoring.ts](../src/lib/scoring.ts), [mma.ts](../src/lib/mma.ts); new pure typed rule validator/preview module; [footballDataSync.ts](../server/lib/footballDataSync.ts), [hockeySync.ts](../server/lib/hockeySync.ts). Audit [resultSync.ts](../server/lib/resultSync.ts), its admin endpoints and `apply_match_result_atomic` availability as compatibility boundaries; no new manual workflow. |
| Reads/UI | [db.ts](../src/lib/db.ts) `savePrediction`/`fetchLobbyLeaderboard`; [mmaDb.ts](../src/lib/mmaDb.ts), [mmaLobbyData.ts](../src/lib/mmaLobbyData.ts); [App.tsx](../src/App.tsx) card/rank/history calculations; [LeaderboardScreen](../src/components/LeaderboardScreen.tsx), [ProfileScreen](../src/components/ProfileScreen.tsx), [ProfileCommunityPanel](../src/components/ProfileCommunityPanel.tsx), [ScoringRulesPreview](../src/components/ScoringRulesPreview.tsx), [MmaRulesDialog](../src/components/MmaRulesDialog.tsx), [MmaFightCard](../src/components/MmaFightCard.tsx). `get_profile_summary`/`get_my_profile_overview` and achievement reconciliation require scoped-aggregation review. |

Required tests are production-function tests, not a duplicate standalone scorer:

- Default parity by importing production `calculatePoints`, `matchPresentation`
  cases, MMA methods and versioned v1/v2; golden custom/zero/invalid/monotonic
  fixtures in TS and SQL. `scoring_scenarios.ts` has a duplicate scorer and must
  not be treated as independent proof of the production implementation.
- Clerk A/B, owner/member/admin/VIP-expired, public-pool default protection,
  direct-table/pointer/version tampering, first-save versus editor concurrency,
  stale acknowledgements and permanent freeze after deleting/leaving.
- Extend `football_data_sync`, `football_data_self_healing`,
  `hockey_catalog_sync`, `mma_finish_method_predictions` and
  `public_competition_scoring` rollback suites: same fixture in default/custom/
  public contexts; different expected weights, repeated and corrected results,
  pending/stale results, old card rules and no change to saved selections/locks.
- Cards, rules dialogs, ranks/ties, zero-weight hit/streak presentation and
  profile breakdown agree with persisted SQL totals in all supported languages;
  no raw global sum or historical/default rescore. Typecheck/build and mobile QA.

## Decisions and next boundary

Root can review the proposed schema, bounds, tier precedence, locking and
authoritative SQL/read changes as implementation decisions. Owner decisions
still pending are the sold entitlement scope, price/payment model and Free
threshold; none should be inferred or seeded into this contract. Custom scoring
itself and the option to keep standard rules are already approved.

Next small block, only after review: pure typed validator/classifier and
synthetic preview parity tests, without DB writes or real point changes. Then
split storage/authorization, each provider's integration, and UI/stat migration
into separately verified patches. No custom rule activation until all dependent
paths pass; once a custom competition has tips, rollback preserves its snapshot
and compatible scorer/readers rather than resetting it to defaults.
