# Membership Security

This document describes the membership security foundation established in
Phase 010 and extended with lifecycle states in Phase 011. Phase 012 and
Phase 013 add approval-based entry, member management, and membership-aware
Home/Hall of Fame read models. The production migration ledger is the
authoritative deployment record.

## Authoritative model

- `auth.uid()` is the only caller identity accepted by membership RPCs.
- `lobbies.owner_id` is the only source of truth for lobby ownership.
- `lobby_members.role` values are only `admin` or `member`.
- Legacy `owner` membership rows are normalized to `member`; ownership remains
  derived exclusively from `lobbies.owner_id`.
- Membership lifecycle values are `active`, `removed`, and `left`. Only
  `active` membership grants lobby access.
- Pending access is represented only by `lobby_join_requests`; it is never a
  membership row.
- Platform administration remains separate in `profiles.role` under the Phase 0
  protection. Membership lifecycle does not change platform authorization.

## Write boundary

`create_lobby_secure(...)` performs one atomic database operation:

1. derives the owner from `auth.uid()`,
2. generates a cryptographically random lobby ID and join code,
3. inserts the lobby,
4. inserts the `lobby_tournaments` relation,
5. inserts the owner as a plain membership `member`.

`join_lobby_secure(join_code_param)` accepts only the join code. It derives the
user from `auth.uid()` and never accepts a role or user ID. Open lobbies
activate a new or previously-left member on the single existing membership
row. Approval-required lobbies create at most one pending
`lobby_join_requests` row and do not create a membership until approval.
Removed members cannot self-activate.

Lifecycle changes use narrow RPCs:

- `leave_lobby_secure(lobby_id_param)` lets a non-owner member leave,
- `remove_lobby_member_secure(lobby_id_param, member_user_id_param)` lets the
  lobby owner remove a non-owner member,
- `restore_lobby_member_secure(lobby_id_param, member_user_id_param)` lets the
  owner reactivate a removed member.
- `resolve_lobby_join_request(request_id_param, decision_param)` atomically
  approves or rejects a pending request,
- `cancel_lobby_join_request(request_id_param)` lets the applicant cancel their
  own pending request,
- `set_lobby_join_policy(lobby_id_param, join_policy_param)` lets the owner
  choose `open` or `approval_required`.

These operations update the existing membership row. They do not delete
predictions, points, leaderboard history, or Hall of Fame history.

The lobby permission matrix is intentionally small:

- the owner is derived only from `lobbies.owner_id`,
- the owner can approve/reject requests, remove admins or members, restore
  removed users, and change the join policy,
- an active lobby admin can approve/reject requests and remove only ordinary
  active members,
- admins cannot remove the owner, themselves, or another admin,
- members can leave only their own membership.

These mutation functions are `SECURITY DEFINER` because direct table mutation is revoked.
They have an empty fixed `search_path`, schema-qualified relations, explicit
authentication checks, and `EXECUTE` granted only to `authenticated`.

After the enforcement migration, authenticated clients cannot directly:

- insert a lobby,
- insert, update, or delete `lobby_members`,
- set a membership role or user ID,
- change `lobbies.owner_id` or `lobbies.join_code`,
- discover a lobby from `lobby_id` without membership.

Historical Data API defaults for `TRUNCATE`, `TRIGGER`, and `REFERENCES` are
revoked from `anon` and `authenticated` on the membership and prediction
tables. These privileges are not used by the frontend, and RLS does not protect
`TRUNCATE`.

Owners can still edit the existing non-security lobby metadata fields. Whole
lobby deletion remains unchanged and relies on the existing foreign-key
cascades.

## Join codes

New join codes use 64 bits of PostgreSQL `pgcrypto` randomness and are rendered
as 16 uppercase hexadecimal characters. Existing codes continue to work.

The code remains stored in plaintext in Phase 010 because adding a hash would
require backfilling existing rows, which is outside this no-rewrite migration.
All lookup is centralized in `join_lobby_secure`, so a later dual-column hash
rollout or QR/invite-link format can be added without changing the membership
contract.

## Prediction membership

Match prediction INSERT and UPDATE policies retain the existing lock-time rule
and additionally require:

- the caller owns the prediction row,
- the caller is a lobby member,
- the match tournament is linked to that lobby.

Long-term prediction INSERT and UPDATE policies use the same membership and
lobby/tournament relationship. `is_lobby_member()` requires
`membership_status = 'active'`, so pending, removed, and left users cannot read
lobby internals or create/update predictions.

Before-write trigger guards make scoring fields server-managed without changing
the scoring formulas:

- authenticated match-prediction inserts store `points_earned = 0`,
- authenticated updates preserve the existing `points_earned`,
- long-term predictions use the same boundary,
- direct client deletion cannot erase scored prediction history,
- the trusted result-sync and tournament-winner service-role paths retain their
  existing ability to write deterministic points.

Scoring, `calculatePoints()`, leaderboard formulas, and lock times are
unchanged.

## Community read models

The frontend does not build membership state from unrestricted table reads:

- `get_lobby_community(lobby_id_param)` returns the current join policy,
  viewer role, active member count, permitted member rows, and pending requests
  in one call,
- `get_user_membership_dashboard()` returns only the caller's pending/recent
  request states, recent removed/left state, and manager request counts,
- `get_lobby_hall_of_fame(lobby_id_param)` aggregates authoritative stored
  points across completed lobby tournaments without requiring the scored
  player to remain an active member.

Rejected applicants can submit another approval request only after 42 hours.
Pending requests are unique per lobby and applicant. Resolved approval or
rejection notices remain on Home for at most seven days; `applicant_seen_at`
is reserved for a future explicit acknowledgement flow.

An active ordinary member receives only their own membership row from the
community read model. Owner/admin member lists and pending requests are never
exposed to pending, removed, left, or unrelated users.

## Controlled rollout

Phase 010 uses a zero-downtime three-step cutover:

1. record read-only counts and integrity checks,
2. apply only additive `010_membership_security_foundation.sql` (010A),
3. verify the secure RPCs, prediction guards, grants, and policies while the old
   frontend remains compatible,
4. deploy the frontend cutover to `create_lobby_secure()` and
   `join_lobby_secure()`,
5. test create and join with approved test identities and confirm the RPC path,
6. apply only `010b_membership_security_enforcement.sql` (010B),
7. verify direct Data API membership/lobby security-field writes are blocked,
8. compare predictions, points, memberships, leaderboard, and Hall of Fame with
   the baseline.

Do not run a general migration push while later migrations are pending.

Before 010B, a failed frontend deploy can be rolled back without a database
rollback because 010A deliberately keeps the legacy path. After 010B, prefer a
frontend forward fix. A time-limited recovery may restore only the previous
create/join grants and policies while leaving the secure RPCs and points guards
in place. Never restore client-controlled `admin` assignment.

The rollback-only integration tests are:

- `supabase/tests/010a_membership_security_foundation.sql` after 010A,
- `supabase/tests/010_membership_security_foundation.sql` after 010A and 010B.

## Phase 011 rollout

Phase 011 is a backwards-compatible database-first rollout:

1. record a read-only production integrity snapshot,
2. apply only `011_membership_lifecycle.sql`,
3. verify columns, constraints, policies, functions, grants, and migration
   ledger,
4. deploy the frontend lifecycle controls,
5. run controlled leave/remove/restore/rejoin acceptance tests,
6. compare predictions, points, memberships, leaderboard, and Hall of Fame with
   the baseline.

The database migration defaults existing memberships to `active` and does not
rewrite prediction or scoring data. The previous frontend remains compatible
while the new frontend is deployed. If the frontend must be rolled back, the
new schema and RPCs can remain in place. Database recovery should prefer a
forward fix; reverting the migration would discard lifecycle state and is not a
normal rollback.

## Phase 012/013 rollout

The two migrations are intentionally separate:

1. apply `012_lobby_approval_and_member_management.sql`,
2. verify constraints, RLS, RPC grants, fixed `search_path`, and open-lobby
   backwards compatibility,
3. apply `013_membership_dashboard_integration.sql`,
4. verify the Home and Hall of Fame read-model grants and empty states,
5. deploy the frontend community management cutover,
6. run controlled open join, approval, rejection, leave, remove, and restore
   acceptance tests and verify Home request states,
7. compare predictions, points, memberships, leaderboard, and Hall of Fame
   against the pre-deploy snapshot.

Both migrations are additive or security-tightening and do not rewrite
predictions or scoring data. If the frontend must be rolled back after Phase
012, existing open lobbies remain compatible with the secure join RPC. Prefer
a forward fix for request/lifecycle state instead of dropping the request
table.

Rollback-only and concurrency tests:

- `supabase/tests/012_lobby_approval_and_member_management.sql`,
- `supabase/tests/013_membership_dashboard_integration.sql`,
- `supabase/tests/012_013_membership_concurrency.sh`.

## Deferred scope

Ownership transfer, public lobby discovery, Premium, role-assignment UX, and
advanced moderation remain deferred. Phase 012 preserves existing lobby admins
but does not add an RPC for promoting new admins.
