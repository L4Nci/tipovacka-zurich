# Clerk-only login retirement — 9 November 2026

Prepared for owner-authorized retirement of old non-Clerk logins. This document
and migration are not evidence that cleanup has run. Preserve historical player
rows and game data; retire authentication identities, sessions and refresh tokens.

## Pre-change read-only inventory

The hosted database currently has13 legacy-only email Auth users and2 enabled
Clerk-backed profiles. Legacy users have55 sessions,12 memberships,1033 match
predictions,10 long-term predictions and own1 lobby; no legacy MMA predictions.
There are0 subscriptions and0 Storage objects. The only platform-admin profile
is legacy; neither Clerk profile is admin at inventory time. Recheck before acting.

The owner-selected target was independently verified as an existing enabled
Clerk-backed profile, absent from `auth.users`. Its ID is intentionally not
hardcoded in the generic migration or this runbook. Promotion is a separate,
owner-selected operation, not an automatic consequence of paying for VIP.

Important deployed facts:

- `profiles.id` no longer references `auth.users`. Deleting an Auth user therefore
  preserves its internal player, historical predictions, memberships and lobby
  ownership. Do not delete rows from `profiles` as part of this operation.
- Auth user deletion cascades to sessions and identities. Session deletion
  cascades to refresh tokens, but explicitly remove legacy refresh-token rows
  too so older rows without a session cannot survive.
- `subscriptions.user_id` still references Auth with CASCADE; stop if any candidate
  has a subscription. Resolve billing identity in its separate planned block.
- No public RLS policy or public/private app function still uses `auth.uid()`.
  Private game predicates use `current_player_id()` and guarded helpers.
- `current_player_id()` currently accepts the legacy issuer+UUID if its profile
  exists. Deleting Auth records alone does not close this access path.

## Implementation order

1. Save a private backup outside Git: schema/old function definitions, player and
   game data, identity maps and aggregate counts. If Auth credential/session data
   are backed up, use a protected/encrypted destination; never print tokens or
   password hashes into tool/chat logs. A minimal identity manifest is enough for
   an audit of intentionally removed logins; do not restore old sessions as part
   of rollback. Verify that the intended game-data export is readable.
2. Recheck the approved admin target against enabled Clerk mapping and issuer.
   Promote only that target with server authority; test its admin resolution.
   Do not guess by display name, email similarity or lobby ownership.
3. Review `20261109204030_clerk_only_identity_retirement.sql`. It changes only
   identity resolution and explicit grants, no player rows, scoring or locks.
4. First run candidate migration + `clerk_only_identity_retirement.sql` test in
   one transaction ending in ROLLBACK. Compose one outer transaction; remove the
   test's standalone BEGIN/ROLLBACK when embedding it. Do not apply migration
   permanently merely to make its first test possible.
5. Apply the reviewed migration, then run the standalone test again. It creates
   only rollback fixtures and simulates verified claims. Run the JS Clerk token
   tests separately; SQL claim emulation does not validate cryptography.
6. Re-evaluate candidates with a narrow transaction and the preconditions below;
   remove only their refresh/session/Auth records. Keep public profiles and all
   historical game relationships. Validate counts and Clerk admin/player access.
7. Disable obsolete Supabase-native sign-up/login providers in the intended Auth
   configuration after checking Third-Party Auth still accepts Clerk. Do not
   disable the Data API or third-party JWT verification. This configuration step
   is distinct from deleting users and must be verified against current settings.

## Cleanup transaction contract

This is an execution contract for the root operator, not a migration to run on
every environment. Build the approved candidate set from `auth.users` joined to
historical profiles, excluding **any** `player_auth_identities` mapping, including
disabled mappings. Freeze/recheck this classification for the short transaction.

Before the delete:

- `current_player_id` must already be Clerk-only; prove both legacy issuer forms
  return NULL under authenticated claim emulation while a valid Clerk identity
  still resolves.
- The approved target must resolve through enabled Clerk mapping and have the
  explicitly approved admin role. No arbitrary promotion or demotion.
- Candidate count must match the reviewed inventory (13 at preparation time),
  and no candidate may have a Clerk mapping, subscription or owned Storage object.
  A mismatch stops cleanup for review rather than broadening its WHERE clause.
- Save counts of profiles, mappings, lobbies, members, predictions, long-term and
  MMA predictions; include the target and historical owner references.

The relevant DML, **only after those guards and backup**, is:

```sql
-- legacy_cleanup_candidates is the frozen, reviewed TEMP table of UUID ids.
DELETE FROM auth.refresh_tokens t
USING legacy_cleanup_candidates c WHERE t.user_id = c.id::text;
DELETE FROM auth.sessions s
USING legacy_cleanup_candidates c WHERE s.user_id = c.id;
DELETE FROM auth.users u
USING legacy_cleanup_candidates c WHERE u.id = c.id;
```

Abort/ROLLBACK if any candidate Auth/session/refresh record remains or any saved
player/game count changes. Recheck admin target and both surviving Clerk mappings.
Only COMMIT when all assertions pass. Do not log returned Auth objects; they may
contain personal/security fields.

## Tests and limits

- New focused test: enabled Clerk player resolves, metadata cannot grant admin,
  legacy admin UUID denied before and after deleting its Auth fixture, historical
  player/prediction/owner survive, A can save its own open pick and B cannot read
  or write A's lobby; disabled mapping and foreign origin denied; service-only
  resolver still works and a scheduler service identity does not become a player.
- Existing `supabase/tests/clerk_identity_bridge.sql` ends with an assertion that
  legacy UUID login still works. Once retirement ships, change that final expected
  result to denial; do not keep contradictory active test expectations.
- Run targeted membership/lifecycle, long-term prediction and MMA RLS suites as
  applicable to the current Clerk harness. Older historical Supabase-only tests
  are not automatically current claim fixtures.
- Real signed Clerk A/B/owner/admin, removed/pending memberships, direct Data API,
  Netlify admin endpoints and production Clerk remain separate runtime checks.
- `src` and `public` source search found no service-role/server-secret reference
  in this pass. This does not inspect deployed bundles or certify all key handling.

## Current vendor documentation

Supabase permits direct deletion from `auth.users` or using its management UI;
the Admin API is a supported option, not an exclusive requirement. Deletion does
not itself invalidate an already-issued JWT before expiry. This is why the
Clerk-only resolver must be applied first. [User management](https://supabase.com/docs/guides/auth/managing-user-data).

`auth.admin.deleteUser` is server-only and needs service-role authority; do not
expose the key or log the returned user. Soft delete is not a reversible trash
operation. [Delete user](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser).
`auth.admin.signOut` requires a valid user JWT; do not collect dozens of session
tokens merely to call it when performing a guarded database retirement.
[Admin sign-out](https://supabase.com/docs/reference/javascript/auth-admin-signout).

No backup, role change, migration application, write-mode test or cleanup was
performed by the read-only audit agent. Execution results belong in a follow-up
record after the root operator verifies and runs the approved operation.

## Execution result —9 November2026

The root operator completed the later owner-authorized operation. This section
supersedes the pre-change state above:

- Private backup at `/private/tmp/fan-tipovacka-legacy-retirement-20261109`,
  directory0700/files0600,2.8MB snapshot read back and counted before changes.
  It contains game/profile/identity-map data and the prior resolver definition;
  no password hashes, JWTs or session tokens were exported. It is a temporary
  operational export, not a long-term backup/restore service.
- Candidate migration+suite first passed in one ROLLBACK transaction. Migration
  `20261109204030_clerk_only_identity_retirement` was then applied and its
  history version matched to the local file.
- Exact cleanup was separately rehearsed with ROLLBACK, then committed with
  candidate-count, mapping, subscription/Storage, admin and history-hash guards;
  lock timeout3s and statement/idle timeout20s.
-13 native Auth users,55 sessions and their refresh tokens removed. Post-query
  confirmed0 native users/sessions/refresh tokens.
-2 enabled Clerk profiles remain; exactly1 enabled Clerk profile is admin,
  matching the UUID explicitly supplied by the owner. Historical legacy
  profile roles do not authenticate and were not used as migration identity.
-15 profiles,2 lobbies,14 memberships,1038 match predictions,10 long-term picks
  and5 MMA picks preserved. Match/long-term/MMA prediction, lobby and membership
  hashes were unchanged across cleanup. Historical player rows intentionally
  remain; this is login retirement, not erasure of game history.
- Updated `clerk_identity_bridge.sql` and new
  `clerk_only_identity_retirement.sql` passed after deployment, both ROLLBACK.
  `npm run test:clerk` passed17 tests plus endpoint authorization scenarios.
- Post-change advisor returned the same categories of intentionally locked
  tables/public flags/authenticated SECURITY DEFINER RPC; no RLS/grants were
  widened. This does not certify every RPC or all runtime session behavior.

Native email/sign-up provider settings were not changed in this operation.
Verify/disable the unused native signup path separately before public release
without disabling Clerk Third-Party Auth. Production Clerk/domain/origins,
real browser admin/A/B sessions, coordinated GDPR account erasure and a full
disaster-recovery restore exercise remain separate work.

### Real browser admin check

Follow-up9 November: owner reported that Admin was not visible. Read-only DB
lookup confirmed the selected profile (Lanci) remained an enabled Clerk admin.
In the owner's signed-in Safari tab on the working Netlify site, the open view
was UFC2026, whose component does not render the legacy Admin tab.
Navigation Testovací rodeo → Premier League2026/27 → Admin opened the existing
administration and successfully loaded its protected operations summary.
No result-save, scoring, role or player-data mutation was performed.

This proves one real signed-in admin read path, not every admin action or
cross-account denial. Safari console logs were not inspected. A central Admin
entry from Home/Profile is a navigation follow-up; no such UI change was made.
The displayed Users0 is a separate confirmed metrics issue: the deployed
summary still counts `auth.users`, not Clerk identities.
