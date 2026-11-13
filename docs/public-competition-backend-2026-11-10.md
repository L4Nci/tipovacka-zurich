# Public competition backend: one entry, existing game engine

Status as of 10 November: registry migration `20261110084040_public_competition_pools`
is applied in the existing hosted development project. Both public-pool SQL suites
and the five-language profile suite passed there and ended in ROLLBACK. No real
pool is provisioned; the public gate is false. No frontend release, publication,
paid feature or prize feature has been activated. See [coordinator verification](public-entry-verification-2026-11-10.md).

This is the implementation decision for B10/B11/B11M of
[the launch blocks](public-launch-p0-p1-blocks-2026-11-09.md), following the
[accepted organizer model](ROADMAP.md#accepted-organizer-model--2026-11-03) and the owner's
request to offer Champions League, Premier League and annual UFC publicly.

## Architecture decision

The older [Official Events backend](official-public-tournaments.md) uses separate
participation, predictions, scoring, terms and prize records. Migrations 020–023
are not deployed. The active football importer explicitly rejects Official
prediction scoring, and there is no equivalent Official MMA prediction path.
Enabling it would create a second game engine and require new sync integration.

The smaller implementation is a private registry that associates each public
competition/season with a newly provisioned, dedicated organizer lobby and one
active tournament. CL, PL and annual UFC each have their own pool, membership and
standings. The platform operates these organizer lobbies; private groups retain
their existing model. A later year/season receives a separate pool and requires
another explicit join. UFC cards remain rounds of the joined annual competition.

This reuses `predictions`, `mma_predictions`, current RLS, versioned rules,
first-bell/match locks, result adapters, scoring RPCs and existing member
leaderboards. It does not copy a single private prediction or sports fixture.
The existing cron already processes ordinary predictions across lobbies, so
these new lobby IDs need no provider adapter or additional cron.

**The underlying lobby has `visibility='private'`.** Existing ordinary-lobby
RLS makes a `visibility='public'` lobby row readable by authenticated users,
including its join code and owner ID. Public discovery is instead served by
the constrained registry RPCs. This storage visibility does not make the
competition invitation-only: anyone with an enabled Clerk account can explicitly
join a published, available competition through the public entry.

The older Official code remains disabled. It is neither activated nor deleted;
future sponsored/prize work needs its own reviewed product and legal scope.

## Database and API contract

Migration:
[`20261110084040_public_competition_pools.sql`](../supabase/migrations/20261110084040_public_competition_pools.sql).

`tipovacka_private.public_competition_pools` has one unique slug, lobby and
tournament per pool. RLS is enabled; anonymous/authenticated roles have no direct
table or private-helper access. The registry is not a listing of every ordinary
lobby marked public.

Public read RPCs:

```ts
get_public_competitions(): PublicCompetition[]
get_public_competition({ p_slug: string }): PublicCompetition

type PublicCompetition = {
  slug: string;
  name: string;
  short_description: string | null;
  tournament_id: string;
  tournament_name: string;
  sport_id: string;
  format: 'score' | 'mma';
  status: 'open' | 'upcoming' | 'closed';
  next_lock_at: string | null;
  is_member: boolean;
  participant_count: number;
};
```

Both reads are available to anonymous and authenticated callers and expose only
these fields. They do not expose lobby IDs, join codes, owners, member lists,
emails or prediction rows. Unknown/unpublished/unavailable details fail with
`P0002`; the list returns `[]` when the launch gate is closed. Reading a detail
never creates membership. `is_member` is a hint about the caller's own active
membership, resolved through `current_player_id()`; anonymous and nonmember
callers receive `false`. It lets an existing participant open a closed season's
results while keeping new closed-season joins disabled. It is not an access
grant: the authenticated join/open RPC still verifies current membership.
Authenticated catalogue responses must not be shared across users by a public
response cache.

`open` means the database currently has at least one scheduled, unlocked and
otherwise available scoring opportunity. Football-data matches must be `TIMED`;
MMA cards need an announced/scheduled event and a known scheduled duel. An active
season without such an opportunity is `upcoming`, not guessed complete. A
tournament explicitly marked `finished` is `closed`. These are catalogue hints;
the existing prediction guards remain the authority at save time.

The seeded operator's required membership is excluded from `participant_count`,
so an empty competition does not advertise one artificial player. The operator
still appears in the existing member leaderboard, can play with that account,
and is not granted extra points. Separating an operator from a playing identity
or changing this display policy is a future product refinement.

Explicit authenticated action:

```ts
join_public_competition({ p_slug: string }):
  | { slug: string; lobby_id: string; tournament_id: string;
      membership_state: 'joined' | 'rejoined' | 'already_member' }
  | { slug: string; membership_state: 'removed' };
```

The player is resolved only through Clerk-only `current_player_id()`; no caller
identity or role parameter is accepted. The RPC reuses `join_lobby_secure` and
confirms active membership before returning game context. A removed player stays
removed and receives no usable lobby/tournament context. A voluntary leaver may
explicitly rejoin. A closed season admits no new/rejoined participants; existing
active members can reopen results.

Service-only operational RPCs:

```ts
provision_public_competition({
  p_slug: string, p_tournament_id: string, p_name: string,
  p_owner_player_id?: string | null
}): { slug: string; lobby_id: string; tournament_id: string; published: boolean }

set_public_competition_publication({ p_slug: string, p_published: boolean }):
  { slug: string; published: boolean }
```

Provisioning creates a fresh lobby, one active tournament and the operator
membership. It never converts an existing private lobby. Repeating the same
slug/tournament/owner is idempotent; reassigning a slug or creating another
public pool for that tournament is rejected. New pools are always unpublished.
The owner must already be a platform admin with an enabled Clerk identity and
issuer. Omitting the owner is allowed only when exactly one eligible admin
exists. The migration contains no account UUID, promotion or issuer configuration.
An ordinary admin session cannot call either service RPC.

Triggers prevent registered system lobbies from changing owner, base tournament,
storage visibility or join policy, or adding/removing their active tournament.
Normal membership APIs cannot use a known legacy lobby code to bypass a closed
launch gate, unpublished pool or closed season. They retain existing member
management authorization. Generic private lobbies are not affected.

## Launch, rollback and privacy boundaries

The migration inserts `public_competitions_enabled=false`; it does not enable
any pre-existing flag. A pool is discoverable/joinable only when this independent
global gate and its own publication flag are both enabled, and its context is
valid. Provisioning and publication do not turn the global gate on.

Before activation, the release operator must:

1. Apply the migration through the coordinated release path and run the
   [transactional suite](../supabase/tests/public_competition_pools.sql), ending
   in `ROLLBACK`.
2. Provision the approved CL/PL/annual-UFC pools using the actual existing
   tournament IDs and enabled Clerk admin, while leaving the global gate off.
3. Verify signed Clerk sessions and the browser flow, including an actual score
   and MMA prediction, separate standings, removed membership and auth return.
4. Verify the existing result cron can process and reconcile predictions in the
   new lobbies; no hand-entered result workflow is introduced.
5. Publish the approved pool records and explicitly open the global entry gate
   only with the frontend release and remaining launch checks satisfied.

Unpublishing a pool or closing the global gate is an entry/discovery rollback.
It does **not** revoke existing memberships or delete predictions/history.
Existing members keep their ordinary lobby access. Emergency access revocation
must be a separate, explicit membership/permission operation; never treat a
feature flag as an authorization revocation mechanism.

Public participation currently uses the same community view as a normal lobby:
joined players can see fellow participants' display names, avatars and saved
picks. The entry copy must say that this is a public community competition.
No anonymous player leaderboard is introduced by these RPCs, and private
profile/bio/email settings are not broadened.

## Verification and limits

Schema-only inspection used an explicit read-only query of `pg_catalog` and
`information_schema` from the existing project: 34 table definitions, 66
functions, 160 constraints, 30 policies and 11 triggers. No application rows or
credentials were exported. Those definitions were restored to a temporary local
Postgres using a private Unix socket with TCP disabled; Supabase's `auth.jwt()`
and `auth.role()` were emulated from request claims there. The candidate
migration applied cleanly.

The rollback suite verifies anonymous/member/service access, launch-gate and
legacy-code bypass prevention, safe metadata, read-without-join, explicit and
idempotent joins, leaving/rejoining/removal, native-UUID rejection, separate
competition membership, private-pick preservation, cross-account/cross-pool
denial, server-managed points, system-context guards, closed seasons, annual UFC
method predictions, first-bell locks and the current MMA leaderboard. It ends in
`ROLLBACK`. Caller-scoped membership hints are checked for anonymous, current
member and other-player requests, including reopening a closed season.

[`public_competition_scoring.sql`](../supabase/tests/public_competition_scoring.sql)
also passed locally. It imports a synthetic 144-game CL fixture catalog and a
synthetic UFC card through the actual existing provider RPCs, saves different
public/private picks, then processes each final snapshot twice. Football awards
5 public / 3 private points; MMA v2 awards 5 public / 1 private point. The existing
MMA leaderboard includes only its own pool's points, repeated sync does not
duplicate points, and finished predictions stay locked. No new scorer, adapter
or provider key is involved. This suite should be run before real public CL/UFC
pools are provisioned because those competitions each permit only one registry
pool; all fixture/state writes end in `ROLLBACK`.

Both SQL suites remain evidence about database behavior, not verification of
cryptographic Clerk tokens, hosted API wiring or the real scheduled cron. The
profile-locale migration and its rollback suite also passed in the same local
harness; the public-pool suite passed again after that migration.

The local schema harness recreated actual table grants and policies but did not
clone all existing function ACLs or Supabase-managed infrastructure. New RPC
ACLs are explicitly defined and can be checked directly. The coordinator also re-ran all three suites on the hosted target with ROLLBACK
on 10 November; no fixtures remained and the public gate stayed false. Real
signed-session acceptance and release activation remain separate requirements.

Remaining launch risks outside this narrow backend change include abuse/rate
limits, a real browser auth-return test and final public-participation/privacy
copy. The existing all-member leaderboard/pick-loading approach also needs a
representative load check before a broad campaign: paginated MMA loads currently
have a 20,000-row safety ceiling. This implementation does not claim unlimited
public-community scale or complete the wider security/legal/payment work.
