# Stripe plugin/MCP handoff — 10 November 2026

> Later implementation, 12 November: planner ran successfully in the refreshed
> chat. The owner then requested turnkey preparation; the payment branch now has
> local runtime and a verified real sandbox card/refund flow, with gates off.
> [Current implementation and activation evidence](stripe-sandbox-readiness-2026-11-12.md)
> supersedes the historical unwired inventory below. Hosted Live apply remains
> blocked by automatic approval review; no normal VIP or Live sale is active.

## Owner's latest instruction

Use the Stripe plugin, connect `https://mcp.stripe.com` with OAuth, then call
`stripe_implementation_planner` with the business context below. Review the
existing work against that plan before wiring or activating payment runtime.
The user allows a fresh session if the installed plugin's tools do not load.
Do not substitute `npx skills add https://docs.stripe.com` while the successful
plugin installation is only waiting for authentication/session refresh.

The owner explicitly chose Stripe for the first TEST integration. Use **FanTip
sandbox**, the environment selected with the owner from the OAuth screen, for
both MCP work and any later application test key. Do not mix its objects/keys
with the legacy `Test mode` environment or the Live account.

## Verified setup

- `codex plugin add stripe@openai-curated --json` succeeded. Installed path:
  `/Users/viktor/.codex/plugins/cache/openai-curated/stripe/d6169bef`.
- Plugin ID `stripe@openai-curated`; installed manifest version `1.0.2`.
- `codex mcp add stripe --url https://mcp.stripe.com` added the global server
  and started its OAuth flow. The first callback expired. On **12 November**
  root renewed the flow; after the owner's confirmation the CLI returned
  `Successfully logged in to MCP server 'stripe'.` OAuth login is verified.
  Verify the actual account/environment through the newly loaded tools before
  doing any account-specific work; do not infer its identity from a key prefix.
- The original chat's tool registry did not expose Stripe tools. In the fresh
  local chat requested by the user, MCP confirmed **FanTip sandbox with
  `livemode=false`**, and `stripe_implementation_planner` was successfully
  completed on **12 November**. Its recommendation is hosted Checkout, fixed
  subscriptions and Customer Portal. The new chat is preparing the durable
  integration plan and code-review findings; do not substitute this summary
  for its actual source-backed plan.
- Do not copy OAuth codes, tokens, API keys or expiring authorization URLs
  into repository files or a new-chat prompt.

## Planner context

Business: Fan Tipovačka / FANTIP, a multilingual sports prediction web app for
friends and communities. Landing:
`https://fan-tipovacka-landing-v1.l4nci.chatgpt.site/#sports` (currently private
hosting; this URL is not proof of a public commercial launch).

Approved product direction: **one personal Fan VIP at CZK49/month or CZK499/year**,
same functionality, customer chooses interval. First own lobby and invited
players are free, no five-member paywall. VIP includes cosmetic distinction,
prepared profile/lobby skins, custom/default shared scoring and more owned
lobbies (exact VIP quota remains open). No sporting advantage, gambling stakes,
paid contest entry, prizes, creator payouts or Connect marketplace in this scope.
Separate permanent cosmetic purchases are not yet an approved SKU.

React/TypeScript/Vite frontend, Express local backend, Netlify Functions for
deployment, Clerk sessions mapped to internal profile UUIDs, one existing
Supabase project. Requested Stripe products: Payments and Billing; proposed
surfaces: hosted subscription Checkout plus Customer Portal, supported Apple
Pay/Google Pay/card payment methods. Current cash operating cost reported as
CZK0; fee/cost examples are scenarios, not real sales or invoices.

Need a minimal safe sandbox plan for server-owned offers/prices, verified buyer
mapping, durable checkout idempotence, raw-byte signed webhooks, event dedup,
canonical paid-invoice proof, recovery/reconciliation, paid-through cancellation,
refund/dispute scope and expiry. Event timestamps are not a total order. Bind
provider account and mode explicitly. Existing `public.subscriptions` readers
do not distinguish test/live, so sandbox outcomes must remain private and must
not grant ordinary game VIP. Do not mutate game predictions, points, rules,
locks, roles or memberships as a payment test.

## Existing local work to review, not operational billing

- `server/lib/billingPolicy.ts` and `.test.ts`: server offer allowlist and pure
  finite-period access policy, no provider verification or persistence.
- `server/lib/stripeTestGateway.ts` and `.test.ts`: unwired official SDK adapter;
  signature verification and canonical proof tests use fake provider responses.
- `server/lib/billingTestStore.ts`: service-only sandbox RPC adapter.
- `supabase/migrations/20261110195526_billing_test_sandbox.sql`: private TEST
  ledger candidate, local harness only; **not applied to the hosted project**.
- `src/lib/billingTest.ts` and `.test.ts`, `src/components/BillingTestScreen.tsx`
  when finished: unwired internal client/screen, no checkout on render.
- Official `stripe` SDK pinned to `23.1.0`; API `2026-10-28.endive`, checked
  against current official docs/package metadata. No actual API request,
  customer, Price, Checkout Session, webhook endpoint or subscription created.

Workers were asked to finish current offline source/tests coherently and hold
external API calls/runtime activation during plugin setup. Root has not wired
Express/Netlify endpoints, App navigation, real capability grants or deployment.
Check workers' final test results and current files rather than treating this
inventory as completed end-to-end verification.

The policy worker reported 10 policy tests and 14 mocked gateway tests passing,
including actual official-SDK signature verification, and a passing typecheck.
The UI worker reported 11 client tests passing; its rendered browser check was
blocked by unavailable browser surfaces, and the final worker turn hit a usage
limit. The sandbox-schema worker wrote the migration, store and rollback suite,
and applied the candidate to the existing local harness, but its final turn also
hit a usage limit: **do not assume the full DB suite passed**. Hosted apply
remains unperformed. Do not restart expired workers without a concrete need.

Root re-ran the combined policy/gateway/client suite on **12 November**:
**35 passed, 0 failed**, and `git diff --check` was clean. This is offline
verification with mocked provider responses, not a real Stripe purchase.
The refreshed planning chat is `01a1cf10-bcee-72c0-a380-8880520e3c17` in this
same local project. Root observed its confirmed account/planner result and its
reported passing typecheck/build. Its review found that reconciling only the
latest invoice can hide an earlier funded access period after renewal failure;
paid-period evidence and reliable recovery must be repaired before endpoints
are wired. Root made no concurrent payment-runtime changes.

Seller, production domain/Clerk, exact VIP quota, full renewal/refund/appearance
fallback terms and commercial data/photo rights remain launch decisions. Current
permission is sandbox preparation/testing, not purchases, live activation,
publication, commit/push/merge/deploy or a completed P0/P1 claim.
