# Authentication and Platform Authorization

Updated 9 November 2026 to match the Clerk rebuild. This describes source
boundaries in the current development/tuning project, not certification of
deployed settings. The earlier Supabase-only description was obsolete.
See the [public-launch review](public-launch-security-privacy-legal-2026-11-09.md)
for checks, remaining proof gaps and paid-launch prerequisites.

## Identity and roles

- Browser authentication uses Clerk through AppClerkProvider and
  ClerkSessionBridge. Clerk signed-in state and a fresh access-token getter
  drive account bootstrap and authenticated requests.
- The shared Supabase client uses native third-party auth via accessToken.
  persistSession, autoRefreshToken and detectSessionInUrl are false.
  A cached Supabase browser session is not a fallback identity.
- The database resolves the verified Clerk issuer/subject through the private
  identity bridge to an internal player UUID. Supabase Third-Party Auth must
  verify the JWT cryptographically before SQL claims are trusted.
- current_player_id() is Clerk-only after migration20261109204030.
  Both historical Supabase issuer/UUID forms now resolve to NULL. On9 November,
  the owner-selected enabled Clerk profile became the platform admin and13 old
  native Auth users plus55 sessions were removed; historical profiles and all
  game relationships remain. See the [retirement runbook](clerk-only-retirement-runbook-2026-11-09.md).
  Native provider/sign-up configuration remains a separate pre-launch check.
- Request fields, browser storage, profile display names and OAuth metadata
  never establish caller identity, platform role or paid capabilities.
- SUPABASE_SERVICE_ROLE_KEY is server-only. Public Supabase/Clerk client
  configuration does not replace RLS or server authorization.
- Protected profiles.role is the platform-admin authority. Lobby owner/admin
  roles remain scoped to their lobby and do not grant platform-admin access.
- Membership create/join/management uses authenticated guarded RPCs and the
  cumulative grants/policies in the migration chain. Do not infer effective
  policy from one early permissive migration alone.

Source anchors: src/lib/clerkSession.tsx, src/lib/clerkSupabase.ts,
server/lib/clerkIdentity.ts, server/lib/clerkAuthorization.ts and
supabase/migrations/20261104095025_clerk_identity_bridge.sql.

## Privileged endpoints and synchronization

Named /api/admin/* endpoints require a verified Clerk Bearer token and an
authoritative platform-admin role unless they are explicitly scheduler-secret
routes. The verifier pins the configured issuer/JWKS, RS256 and required session
claims, checks authorized parties and resolves an enabled internal identity.
Missing/invalid tokens return 401; a valid non-admin identity returns 403.

The shared football/hockey/MMA sync uses its independent protected scheduler
secret and write/feature gates. Historical TheSportsDB sync routes have their
own scheduler-secret contract. A player's session cannot substitute for cron
authority, and a cron secret does not create player/admin sessions.

Local Express and Netlify Functions use shared authorization helpers but remain
separate deployment entrypoints. A local route's existence does not prove the
same route is wired on Netlify. Test both the deployed API and direct Supabase
Data API/RPC boundary; guarding only browser buttons is insufficient.

## Account lifecycle and paid capabilities

Clerk account management currently hides its danger section. Coordinated
export/deletion/revocation across Clerk, private mappings, profiles, lobby
ownership and game data is not implemented. Enabling only Clerk account deletion
would not establish complete product erasure.

Paid entitlements are separate server-managed capabilities, not profiles.role
or lobby membership roles. Current entitlement tables revoke client writes and
offer caller-scoped readers. The subscriber foreign key was repaired on10November to `profiles(id) ON DELETE
RESTRICT`, preserving internal Clerk player UUIDs. The hosted transactional
identity/capability suite passed with ROLLBACK. This does not implement the
absent payment/webhook lifecycle; see [billing readiness](billing-foundation-readiness-2026-11-10.md). A payment redirect is not payment proof.

## Verification and migrations

Migration history is cumulative. Do not deploy only migration 008 or copy its
old standalone rollback instructions into a new environment. Use the current
migration chain, inspect deployed grants/policies/issuers, and validate the
chosen change with the smallest relevant transactional suite.

Existing verification includes local Clerk tests, membership/identity SQL
scenarios, prediction context and result/time guards, the seasonal-winner fix,
and MMA lock/scoring suites from their respective releases. SQL claim emulation
does not verify a real OAuth flow or cryptographic token signature.

The9 November retirement suite and updated identity-bridge suite passed with
ROLLBACK after deployment. They cover legacy-token denial, Clerk caller
resolution, disabled/foreign identities, metadata role spoofing, cross-lobby
read/write denial and preservation of historical player/game rows. The17 Clerk
unit tests and tournament-winner endpoint scenarios also passed. Production
Clerk and real signed browser/admin sessions still need their release checks.

The working Netlify operations summary was subsequently opened successfully in
the owner's real signed-in Safari admin session. The existing Admin tab appears
inside score-based competitions, not Home or UFC. Other signed-role/action
checks and production Clerk remain pending; see the retirement runbook.

The 9 November source audit found no newly confirmed exploit in its reviewed
portion; coverage is partial. Real signed role/cross-lobby/revocation tests,
production Clerk settings, admin MFA, anti-abuse, dependency reachability and
restore/incident exercises remain launch requirements. See the
[security matrix](security-readiness-matrix.md) and
[current launch plan](public-launch-security-privacy-legal-2026-11-09.md).
