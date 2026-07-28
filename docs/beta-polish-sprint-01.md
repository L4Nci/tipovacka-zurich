# Beta Polish Sprint 01

This sprint polishes the existing product without changing the Phase 009-019
architecture, scoring, authentication, membership, RLS, or RPC contracts.

## Implemented product behavior

- The Home dashboard keeps active lobby/tournament contexts above the lobby
  directory. Completed tournaments remain in lobby history and do not compete
  with active prediction work.
- Lobby members remain available with their existing permissions, but the full
  list and management controls open in a focused dialog. The active member count
  stays visible in the lobby detail.
- Tournament catalog refresh performs a real read and clears stale mutation
  feedback. Success feedback is now tied to add, archive, or activate actions.
- Rules are read-only in the UI. The lobby detail distinguishes stable game
  rules from the stored tournament-specific rules text.
- Public player profiles show only badges explicitly selected for positions
  one through three.
- Badge reconciliation counts a completed lobby/tournament context only when
  the user has a prediction in that context. Merely linking an already
  completed tournament to a new lobby is covered by a rollback-only regression
  test and does not count as participation.

## Username architecture

`profiles.username` currently has a unique constraint, but PostgreSQL text
uniqueness is case-sensitive. The application trigger avoids case-insensitive
duplicates for newly provisioned profiles, while later profile updates still
use the original column directly.

The durable model should be:

- `username`: immutable or rarely changed, normalized, case-insensitively
  unique handle used for unambiguous references;
- `display_name`: non-unique presentation name shown prominently in the UI;
- one server-side profile RPC for validation and updates;
- a compatibility rollout that backfills `display_name = username`, audits
  case collisions, then adds a unique index on `lower(username)`.

This sprint does not implement that migration because it changes the public
identity contract and needs its own data audit and rollout.

## Onboarding proposal

Use a skippable, versioned three-step overlay shown only after the first
authenticated session with no lobby. Store completion as an onboarding version,
not a permanent boolean, so copy variants can be tested later.

1. **Hraj s lidmi, které znáš**  
   `Založ lobby nebo se připoj kódem.`
2. **Tipuj před uzávěrkou**  
   `Otevři zápasy, ulož skóre a vrať se, kdykoli potřebuješ.`
3. **Sbírej body. Porážej kamarády.**  
   Primary action: `Začít`  
   Secondary action available throughout: `Přeskočit`

The overlay must never block an invite deep link. Invite users should continue
to the join flow first and see onboarding only after that context is resolved.

## Rules versioning direction

The current `lobbies.long_description` remains the read-only tournament rules
source. A later versioned model should separate:

- immutable game-rule versions owned by the product;
- tournament-rule versions owned by a supported tournament definition;
- the version references accepted by each lobby/tournament relation.

Lobby owners should select an available version rather than edit free-form
scoring text. No second scoring source should be introduced.

## Lobby branding direction

Branding should be a presentation view model, independent from membership and
entitlements:

- `avatar_image_url`;
- `cover_image_url`;
- `background_treatment` (`solid`, `blurred_cover`, or `tournament`);
- `theme_key`;
- safe generated fallbacks from the current tournament and lobby initials.

The free UI should always have a deterministic fallback. Future entitlements
may control customization capability, but branding data must not become an
authorization boundary.

## Starting another supported tournament

Keep the existing global tournament catalog and lobby/tournament relationship.
The owner flow should be:

1. Open `Správa soutěží`.
2. See supported tournaments grouped as available, active, or archived.
3. Add an available tournament with a confirmation that names the lobby.
4. Return to the lobby with the new active context visible first.

Custom tournaments and a second completion model remain out of scope.

## OAuth readiness

Google and Apple use the existing Supabase Auth lifecycle and remain disabled.
Before enabling either provider:

1. Configure the provider and exact callback in Supabase.
2. Verify production and localhost redirect allowlists.
3. Keep provider secrets outside Vite and the frontend bundle.
4. Acceptance-test first login, repeat login, profile provisioning, role
   preservation, logout, and account identity.
5. Enable the matching frontend flag only after the provider test passes.

Apple additionally needs relay-email coverage and a documented client-secret
rotation owner.

## Streak recommendation

`Netipováno` should not break a prediction-quality streak. A streak measures
consecutive evaluated predictions with a positive result; it should end only
when an evaluated submitted prediction earns zero points. Missing a prediction
is better represented by a separate participation or reliability metric.

The current calculation already iterates submitted predictions only, so a
missing row does not break the streak. This sprint leaves that behavior intact.
Before displaying GOAT as a durable achievement, the streak calculation should
be moved from the current client-side derived presentation into one documented,
authoritative read model without changing scoring.
