# Membership Security

This document describes the Phase 010 membership security foundation. The two
database migrations are deployed separately around the frontend cutover; the
production migration ledger is the authoritative deployment record.

## Authoritative model

- `auth.uid()` is the only caller identity accepted by membership RPCs.
- `lobbies.owner_id` is the only source of truth for lobby ownership.
- New `lobby_members.role` values are only `admin` or `member`.
- Existing legacy `owner` membership rows are preserved without rewriting data.
  A `NOT VALID` check constraint rejects new owner-role rows while allowing the
  existing production row to remain until a later controlled normalization.
- Platform administration remains separate in `profiles.role` under the Phase 0
  protection. Phase 010 does not change platform authorization.

## Write boundary

`create_lobby_secure(...)` performs one atomic database operation:

1. derives the owner from `auth.uid()`,
2. generates a cryptographically random lobby ID and join code,
3. inserts the lobby,
4. inserts the `lobby_tournaments` relation,
5. inserts the owner as a plain membership `member`.

`join_lobby_secure(join_code_param)` accepts only the join code. It derives the
user from `auth.uid()`, always assigns `member`, and is idempotent for an
existing member.

Both functions are `SECURITY DEFINER` because direct table mutation is revoked.
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
lobby/tournament relationship. Phase 011 can make membership lifecycle-aware by
updating `is_lobby_member()` to require an active status; prediction policies
already call that helper.

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

## Deferred scope

Phase 010 deliberately does not implement approval requests, leave, remove,
restore, ownership transfer, public lobby discovery, Premium, or member
management. Those flows must use new narrow RPCs rather than restoring direct
membership table writes.

Phase 011 may add membership lifecycle states, but must preserve these RPC,
ownership, prediction-context, and server-managed scoring boundaries.
