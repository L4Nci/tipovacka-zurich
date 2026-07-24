# Authentication and Platform Authorization

This document describes the current production security boundary for
authentication and platform-level authorization.

## Identity and roles

- Browser authentication is provided by Supabase Auth.
- A Supabase session is the only source of truth for signed-in state. The app
  restores it with `getSession()` and follows subsequent changes through
  `onAuthStateChange()`.
- `auth.users.id` / `session.user.id` is the application identity. A cached
  profile or OAuth metadata is never caller authorization.
- Server endpoints derive the caller from a verified Supabase Bearer token or
  `auth.uid()`.
- Request fields such as `userId`, `role`, or `isAdmin` are never authoritative
  caller identity.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be exposed to
  frontend code.
- `profiles.role` is the current platform-admin source. Migration
  `008_authorization_hardening.sql` prevents authenticated clients from changing
  this column while preserving existing admin accounts.
- Profile identity fields such as username, avatar, and profile color remain
  user-editable under RLS.
- Lobby roles are lobby-scoped and never grant platform-admin access.

The Phase 009 frontend supports e-mail/password, confirmation-pending,
password-recovery, and feature-flagged Google/Apple OAuth flows. Provider setup
and redirect requirements are documented in [oauth-setup.md](oauth-setup.md).
OAuth metadata may suggest a display name only; it cannot set platform or lobby
roles.

Migration 008 prevents self-join inserts from assigning an `owner` or `admin`
lobby role, pins the privileged helper functions' `search_path`, and removes
public/anonymous execution grants. The prepared Phase 010 foundation moves
create/join to authenticated atomic RPCs and closes direct membership writes in
a separate enforcement cutover; see
[membership-security.md](membership-security.md).

## Admin endpoints

`POST /api/admin/set-tournament-winner` and
`POST /api/admin/match-result` require
`Authorization: Bearer <Supabase access token>`.

The server validates the token with Supabase Auth and then reads the protected
platform role. Missing or invalid tokens return `401`; authenticated non-admin
users return `403`. Tournament-winner preview, explicit confirmation,
deterministic `10`/`0` long-term scoring, and tournament-completion checks are
unchanged.

The local Express route and production Netlify Functions use the same
authorization boundary.

## Deployment

Migration 008 is deployed in production. For a new environment:

1. Apply only `008_authorization_hardening.sql` through the controlled migration
   process.
2. Verify trigger, policy, helper `search_path`, and grants from the database
   catalog.
3. Deploy the server and Netlify endpoint changes.
4. Verify `401`/`403` behavior without executing a result or winner write.

Rollback is limited to restoring the previous helper definitions and grants,
restoring the previous lobby-members INSERT policy, dropping
`public.is_lobby_owner(text)`, and dropping the profile-role protection trigger
and function. No row migration is involved.

The rollback-only regression scenario in
`supabase/tests/008_authorization_hardening.sql` is intended for local or staging
Supabase after the migration is installed. It does not update production profile
rows.

Migration 009 was deployed separately on 2026-07-23. It hardens
`handle_new_user()`, assigns new profiles the fixed role `player`, preserves
existing profile rows, and repaired the one Auth identity that had no profile.
See [oauth-setup.md](oauth-setup.md) for the verified rollout state and external
provider checklist.

Future paid-plan entitlements must use a separate server-managed entitlement or
subscription model. They must not be encoded in `profiles.role` or a lobby role.
