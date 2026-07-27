# Product, Community and Growth Foundations

This is the current architecture note for the product sprint following
membership Phase 014. It does not replace `AGENTS.md`, `PROJECT_RULES.md`,
`docs/ROADMAP.md`, or the deployed database migrations.

## Status vocabulary

- **Implemented**: source exists in the repository.
- **Tested**: local scenario and/or isolated PostgreSQL checks passed.
- **Deployed**: the exact migration or frontend version is in production.
- **Enabled**: the server-managed feature flag is on.
- **Acceptance-tested**: the enabled production user flow passed.

Implemented does not imply deployed or enabled.

## Domain boundaries

### Community profiles

Migration `015_community_profiles_foundation.sql` adds an opt-in bio and
`profile_visibility`. Existing and new profiles default to `private`.

`get_profile_summary()` is the only community-profile read contract:

- the caller's own or an opt-in public profile receives global aggregate stats;
- active members of the same supplied lobby may receive basic lobby identity;
- a private lobby-scoped response does not contain bio or global stats;
- e-mail, UUID lists, memberships, join codes, requests and platform roles are
  never included in the response;
- unknown and inaccessible targets both return `visible: false`.

Global statistics are computed in PostgreSQL. The client does not fetch all
predictions to aggregate a profile.

### Achievements and badges

Migration `016_achievements_badges_foundation.sql` separates definitions,
progress and permanent awards. `reconcile_my_achievements()` derives only the
authenticated caller and is idempotent. Direct client writes to definitions,
progress and awards are revoked.

The initial reliable badge set is:

| Badge | Authoritative condition |
| --- | --- |
| První tip | At least one stored match prediction |
| Rozkoukaný tipér | At least 10 stored match predictions |
| Stovkař | At least 100 stored match predictions |
| Přesná muška | At least one exact prediction for a finished match |
| Zakladatel lobby | Caller is `lobbies.owner_id` for at least one lobby |
| Veterán | Predictions in at least three completed lobby/tournament contexts |
| Vítěz soutěže | Highest stored total in a completed lobby/tournament context |
| Fotbalový šampion | Winner context whose sport is not hockey |
| Hokejový šampion | Winner context whose sport is hockey |

Hidden tournaments are excluded from global completion and award
reconciliation. Streak flames and GOAT remain separate live recognition and are
not redefined as permanent badges.

### Invite links, QR and share cards

The invite URL is `/join/<existing-secure-code>`. It is an adapter over
`join_lobby_secure()` and does not create a second join mechanism. The existing
open/approval/removed/left behavior remains authoritative.

The QR encodes only that invite URL. QR generation and the deterministic canvas
share-card renderer load only after an explicit share action. Web Share is used
when available; copying the URL is the fallback.

Referral attribution and share analytics are **prepared only**. They are not
implemented because a trustworthy conversion requires server-created,
idempotent attribution across auth and membership, not a client-supplied
referrer ID.

### Tournament management

Migration `017_tournament_management.sql` manages only the relation between an
existing supported global tournament and a lobby:

- lobby owner or platform admin may add/reactivate a relation;
- lobby owner or platform admin may archive/reactivate a relation;
- derived completion from actual champion plus finished scored matches remains
  the sporting source of truth;
- relation `active/archived` remains organizational state;
- regular owners cannot create global sports data.

Custom/private and resettable QA tournaments are **prepared only**. They need a
provider/scoring-safe model and trusted reset path before implementation.

### Entitlements

Migration `018_entitlements_foundation.sql` treats paid capabilities as
entitlements, never identity or membership roles. It creates no active
subscription and gates no current feature.

`has_entitlement(feature_key)` derives the caller from `auth.uid()`. Direct
client writes to plans, subscriptions and mappings are revoked. Payments,
billing events, Stripe and premium UI are not implemented.

### Admin operations and feature flags

Migration `019_admin_operations_foundation.sql` provides:

- public read-only feature flags with safe JSON payloads;
- one admin-only aggregate operations summary;
- no user, e-mail, prediction value, join-code or request-detail listing.

Runtime flags default to disabled:

- `public_profiles_enabled`
- `badges_enabled`
- `share_cards_enabled`
- `tournament_management_enabled`
- `admin_operations_enabled`
- `referral_enabled`
- `maintenance_banner_enabled`

Flags hide incomplete UX but do not replace RLS or RPC authorization.

## Rollout order

Apply exact files only; do not use a broad `supabase db push`.

1. Snapshot production counts and invariants.
2. Apply `015`; verify profile defaults, column grants and profile RPC privacy.
3. Apply `016`; reconcile only approved test identities and verify idempotency.
4. Apply `017`; verify owner/member authorization without changing relations.
5. Apply `018`; verify zero active subscriptions and zero entitlements.
6. Apply `019`; verify all product flags remain disabled and player admin access
   is denied.
7. Deploy the frontend with every optional feature still disabled.
8. Enable and acceptance-test community profiles and badges.
9. Enable and acceptance-test invite/QR/share.
10. Enable tournament management and admin operations separately.

Each step is a gate. Stop on privacy leakage, changed leaderboard/Hall totals,
unexpected business-row changes, self-award, entitlement spoofing or material
bundle/runtime regression.

## Recovery

The migrations are additive. Preferred recovery is to disable the affected
feature flag and forward-fix its isolated function. Do not drop profile columns
or award history after users begin using them. Before production enablement,
tables and functions can be removed in reverse dependency order only after a
verified snapshot and owner approval.

## Deferred work

- Presence, chat, online indicators and push notifications.
- Referral conversion/reward schema and analytics events.
- Public lobby catalogue or public membership lists.
- Custom/private and resettable QA tournaments.
- Payment provider integration and paid entitlements.
- A richer season-history profile read model.
- Automatic badge reconciliation from result-sync events. The v1 contract uses
  explicit idempotent reconciliation.
