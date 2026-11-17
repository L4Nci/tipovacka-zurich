# Billing identity foundation — 10 November 2026

Status: deployed-schema audit and an applied, locally and hosted-verified FK repair.
This is **B04 identity groundwork, not an operational payment system**. No
checkout, Stripe account, SDK, webhook, price, subscription, real capability or
paywall has been activated by this work. Root applied the FK repair as migration
`20261110133832`; its hosted transactional suite passed and ended in `ROLLBACK`.

Scope follows B03–B06 in [the launch blocks](public-launch-p0-p1-blocks-2026-11-09.md)
and [the VIP proposal](vip-and-public-entry-proposal-2026-11-09.md).

## What actually exists

Read-only inspection of the existing project confirmed:

| Area | Deployed state | Implication |
| --- | --- | --- |
| Foundation | Hosted migration `20260727113505`, `entitlements_foundation`, already applied | Source migration `018_entitlements_foundation.sql` must not be blindly reapplied. |
| Catalogue | `plans`, `entitlements`, `plan_entitlements` exist | Reuse these local product/capability concepts after the actual offer is approved. |
| Access records | `subscriptions` exists; root applied the validated `user_id` FK to `profiles(id) ON DELETE RESTRICT` | The audited native-Auth identity mismatch is repaired; there is still no payment lifecycle. |
| RLS/grants | All four tables have RLS enabled, no policies, no `anon`/`authenticated` table grants; `service_role` has table access | Players cannot directly read billing records, mint access or change catalogue mappings. |
| Readers | `has_entitlement(text)` and `get_my_entitlements()` deployed | The Clerk bridge already changed their lookup to `current_player_id()`. They are not still using `auth.uid()` as the old source file suggests. |
| Reader grants | Authenticated and service execution permitted, anonymous execution denied; security-definer with empty search path | A caller cannot supply another buyer UUID. Service requests have no current Clerk player and should not expect these caller-scoped RPCs to identify a buyer automatically. |
| Runtime | No calls to those billing readers, Stripe SDK, payment endpoint, webhook or provider-customer mapping found in active frontend/server/Netlify source | Database groundwork does not mean VIP is available or enforced in the app. |

The fresh aggregate preflight returned **0 subscriptions and 0 subscribers
without a matching profile**. No subscription, customer, email or profile row
was exported. This is an observation at audit time, not a permanent invariant;
the migration independently refuses incompatible references if rows appear
before application.

The audited pre-apply FK had `ON DELETE CASCADE`, `ON UPDATE NO ACTION` and
`MATCH SIMPLE`. It was validated and neither deferrable nor initially deferred.
The migration checks
these exact baseline semantics instead of silently overwriting unexpected drift.

## Applied minimal identity repair

Applied migration:
[`20261110133832_clerk_subscription_profile_identity.sql`](../supabase/migrations/20261110133832_clerk_subscription_profile_identity.sql).

It rebinds only `subscriptions.user_id` to `public.profiles(id) ON DELETE
RESTRICT`. A subscription therefore uses the same stable internal player UUID
as the Clerk bridge and game data. The migration:

- validates the existing FK's target, columns, deletion/update/match and
  deferrability semantics;
- refuses an existing subscriber UUID without the same UUID in `profiles`;
- replaces the FK and validates it inside the migration transaction;
- changes no UUID, subscription row, status, time, catalogue, entitlement,
  function, RLS policy, grant or account role.

There is no email-based account matching, no new identity, and no conversion of
VIP into a platform-admin or lobby-owner role. Existing reader behavior is
preserved. The migration has bounded lock/statement timeouts and must be
applied transactionally; stop and inspect incompatible data/schema instead of
mapping or deleting it automatically.

`RESTRICT` deliberately means a direct player deletion fails while any
subscription refers to it, including expired records. It prevents accidental
cascade deletion of billing history; it does not define indefinite retention or
complete a GDPR erasure process. B07/B08 must determine necessary retention and
the coordinated billing cancellation/export/deletion or pseudonymization
workflow. Hiding Clerk's delete button or deleting an Auth row is not that
workflow. No unreviewed cascade should be added merely to make deletion succeed.

Production Clerk migration must preserve or explicitly migrate this same
internal player mapping. An unrelated production Clerk subject must not receive
another player's billing record based only on a matching email.

## What this foundation does not decide

The owner has confirmed that paid P0 functionality is intended and has accepted
custom scoring with the option to use the standard rules. The actual sale still
needs a completed contract for exact capabilities, quotas, seller,
countries/taxes, renewal, cancellation/refund and transfer/expiry behavior.
The owner subsequently accepted the preparation of one personal VIP at
CZK49 monthly or CZK499 annually, first lobby and invited players free,
and no five-member paywall. This supersedes the earlier CZK29/49 monthly
experiment. Detailed quotas and sale terms remain open;
[the accepted direction](billing-contract.md) is not a payment activation.

For scoring customization, a separate block must define an explicit rules
version, a before/after point example and preview, and immutable rules after
the first saved tip. All members of that competition share the same rule
version; results must not be silently rescored. This identity repair changes
neither `calculatePoints`, scorer RPCs, sports results nor locks, and grants no
custom-rules capability.

The foundation's existing reader contract is narrower than a complete future
billing lifecycle:

- Access currently requires local status `trialing` or `active`, a started
  validity interval, and either no end or an end in the future.
- A future adapter must not accidentally turn a missing expiry into perpetual
  paid access. No trial or perpetual product is approved by the existing enum.
- `past_due`, `cancelled` and `expired` currently grant no access. A grace period
  or cancellation at period end needs an explicit mapping; do not invent it in
  the webhook.
- Local statuses are not a direct copy of Stripe's status vocabulary. The
  catalogue's `plans` table is an internal app concept, not Stripe's deprecated
  Plan API.
- The current `plans.is_active` flag is not part of the reader predicate.
  Retiring a purchasable offer and revoking a paid period must be distinguished
  in the eventual product/provider contract.

## Smallest safe next implementation after the offer is decided

If Stripe is selected, hosted Checkout is suitable for both a one-time purchase
and a subscription. Recurring access should use Billing with Checkout and a
customer-management path, rather than a hand-built renewal loop. This remains
a candidate architecture, not selection or account creation.
[Stripe Checkout](https://docs.stripe.com/payments/checkout),
[subscription lifecycle](https://docs.stripe.com/billing/subscriptions/overview).

The next source block should:

1. Resolve the buyer through existing server-side
   [`resolveClerkPlayerId`](../server/lib/clerkAuthorization.ts); never accept
   `user_id`, admin status, entitlement keys, provider-customer IDs or arbitrary
   amounts from the browser as authority.
2. Define server-owned offer/price allowlists and separate test/live
   provider-account/customer mappings keyed to the internal player. Keep local
   personal capabilities and verified lobby ownership independent.
3. Implement the smallest test-mode hosted checkout and a raw-body,
   signature-verified webhook with durable idempotence and reconciliation.
   Deduplicate provider events, handle out-of-order observations, and atomically
   record the relevant provider state and access period. An unsigned redirect
   or client success screen never grants access.
4. Map the chosen provider lifecycle explicitly into app access, including
   delayed payment, renewal failure, cancellation, refund, expiry and recovery.
   Stripe's lifecycle is asynchronous and needs verified event handling.
   [Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks).
5. Enforce the selected capabilities in their write RPCs as well as UI. A VIP
   badge/style is server-derived; it never changes points, winning chances,
   account roles or another lobby's permissions.

Durable single-item cosmetic ownership, if sold, needs its own inventory/grant
semantics rather than disguising a permanent item as an indefinitely active
subscription. A lobby-owned product may need a separate entitlement scope;
the current `subscriptions.user_id` record is personal. Those choices depend
on B03 and are not preseeded in this patch. Existing Free styling, lobby
creation and participation remain unchanged.

## Verification and release handoff

[`clerk_subscription_profile_identity.sql`](../supabase/tests/clerk_subscription_profile_identity.sql)
passed on the isolated local Postgres harness, using the actual deployed table
definitions, policies and grants. Its two billing-reader ACLs were recreated
from the fresh hosted metadata because the general schema harness had not
cloned all existing function ACLs. The candidate does not modify those ACLs.

The suite covers Clerk players without native Auth rows, their own active access,
A/B isolation, raw-record and client-write denial, metadata/admin spoofing,
retired native-UUID claims, anonymous reader denial, future/expired intervals,
and profile-deletion rejection attributed specifically to the subscription FK.
It finishes in `ROLLBACK`, leaving no fixture grant, subscription or role change.
Signed Clerk sessions and a real payment flow are separate checks.

Root also ran this suite against the hosted target: exit0, `ROLLBACK` confirmed.
Post-test aggregates were 0 subscriptions and 0 fixture plans/capabilities/issuers;
the existing 15 profiles, 1,039 score predictions and 5 MMA predictions were
unchanged, and the public-entry gate remained false. These counts are baseline
verification, not customer, payment or retention statistics.

Post-apply read-only schema inspection reconfirmed all four billing tables have
RLS enabled and no anonymous/authenticated table grants. The two entitlement
readers still permit authenticated/service execution and deny anonymous execution,
with their existing empty search paths and Clerk-only caller lookup. The new FK
is validated against `profiles(id)` with `ON DELETE RESTRICT`. No access matrix
of real people or billing records was exported.

Local migration checks also proved:

- an orphan subscriber stops the migration and preserves the old FK;
- unexpected deletion/update actions, match mode or deferrability stop it
  without silently rewriting the constraint;
- an existing matching historical player/subscription retains its entire row
  unchanged when the FK is rebound and validated.

Root coordinated the hosted apply after the aggregate compatibility/schema
preflight, with the existing FK definition retained as recovery metadata. The
applied FK is validated and the hosted subscription count remains zero; the
hosted transactional suite passed with rollback and preserved the baseline. Do not reapply
this migration or the entire old 018 foundation as a repair. Restoring the old
FK is not generally safe after a genuine Clerk-only subscription is written,
because that player need not exist in `auth.users`; do not promise a blind
reverse migration. Stop on validation/lock failure, leave the existing schema
intact and inspect. Keep checkout/payment activation separate from this apply.

Audit metadata and local test artifacts are outside the repo:

- `/private/tmp/fan-billing-schema-metadata-20261110.{sql,json}` — schema,
  function definitions/grants and applied-migration metadata only;
- `/private/tmp/fan-billing-schema-metadata-postapply-20261110.json` — the
  repeated post-apply schema/ACL inspection, without application rows;
- `/private/tmp/fan-billing-fk-preflight-20261110.{sql,json}` — FK semantics and
  aggregate subscription/orphan counts only;
- `/private/tmp/fan-public-pools-local-pg-20261109/billing-fk-test.log` — the
  successful rollback suite. The temporary local database used for that suite
  is `fan_public_pool_final` on the private Unix socket in that directory;
- `fan_billing_guard_cases` in the same local Postgres instance contains only
  synthetic historical/mismatch fixtures used to test migration refusal and
  row preservation. No hosted billing data was copied into either database.
