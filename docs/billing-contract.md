# Fan VIP — approved pilot direction

10 November 2026. The owner accepted **first private lobby free + one personal
VIP at CZK49 per month or CZK499 per year**. Invited players remain free. There
is no five-player paywall. This supersedes the earlier CZK29/49 monthly A/B
proposal and approves preparation and validation, not a public price launch,
a real charge or a completed billing system. Current cash operating costs were
reported by the owner as CZK0; future cost examples are scenarios, not invoices.

**TEST provider selected, 10 November:** after comparing wallets, full fees and
integration effort for the new annual offer, the owner chose Stripe for the
first test. Live activation and sale remain separate. The latest instruction is
plugin/MCP first: authenticate **FanTip sandbox**, run
`stripe_implementation_planner`, then review the unwired local adapter against
that plan before connecting runtime. Do not mix the OAuth sandbox with the
legacy Test mode environment. See [the comparison](payment-gateway-selection-2026-11-10.md)
and [the current MCP handoff](stripe-mcp-handoff-2026-11-10.md).

## Product and price contract

- One personal `fan_vip` product, the same functionality with a customer-chosen
  CZK49 monthly or CZK499 annual interval. This is not a randomised price A/B
  test. No paid-entry pool, prize fund, trial or additional Creator/Business
  tier is implied. Exact renewal, cancellation and interval-switch terms must
  be explicit in the final offer; do not infer consent to a hidden renewal.
- The buyer gets new profile cosmetics/verified VIP appearance and owner
  options in lobbies they actually own: prepared lobby styles, custom/default
  scoring and additional owned lobbies. A VIP member cannot edit another
  owner's rules or gain a platform-admin role.
- Existing Free emoji/colours, saved picks, memberships and existing lobbies
  remain. The new free-creation policy must explicitly handle existing users;
  do not silently turn historical accounts into over-limit failures.
- The exact VIP lobby quota remains an offer parameter to confirm before it
  is advertised/enforced; the previous proposal of five is not an approved
  unlimited promise. A capacity protection is not a disguised member paywall.
- Custom scoring is a shared per-lobby/competition rules version, not a
  personal point bonus. Standard public pools retain fixed rules. See
  [the implementation contract](vip-custom-scoring-contract-2026-11-10.md).
- Only implemented, accepted features may be offered for payment. The current
  identity foundation does not unlock any of these capabilities by itself.

The buyer chooses a published interval; the server maps the allowlisted offer
to its canonical price and paid duration. Client amounts, arbitrary provider
price IDs, role claims or refreshes cannot redefine that offer. Preserve the
choice on cancellation/retry without creating a second subscription. Do not
count an organiser's second lobby as a second independent buyer. The earlier
randomised CZK29/49 assignment is superseded.
[Research and measurement](pricing-experiment-and-upgrade-flow-2026-11-10.md).

## Minimal purchase flow

1. A player can join, save a first Free pick and use a standard lobby without
   encountering checkout. Offer VIP at a relevant appearance/rules/additional
   lobby action, with the exact total price, chosen interval and cancellation
   terms. The annual offer must visibly state CZK499 charged for 12 months,
   rather than presenting its monthly equivalent as the amount charged.
2. Resolve the signed Clerk session to the internal player UUID on the server.
   Read that buyer's existing customer/subscription/open checkout intent. Never
   accept a buyer UUID, admin role, amount or arbitrary return URL from a client.
3. Create a server-allowlisted hosted checkout with the selected provider,
   using the server-mapped selected offer and existing verified customer where
   appropriate. Duplicate tabs/retries must not create duplicate subscriptions.
4. Return to the same allowed application context. A success URL is only a
   progress view; it cannot grant VIP. A delayed webhook shows pending/retry
   rather than making up success.
5. A verified webhook plus canonical provider facts updates the existing
   private subscription/capability model. Replays, reordered events, unpaid
   completion, cancellation and refund need explicit tests and reconciliation.
6. The same verified account can manage payment method and cancellation. Use
   the provider's supported portal where available; any application-owned
   management must enforce the same server-side identity checks. Do not create
   another application login or handle raw card fields in this app.

If Stripe is selected, use Billing + Checkout and Customer Portal rather than
a custom renewal loop. Comgate recurring charges require provider activation;
its renewal scheduling, cancellation and recovery work must be scoped before
calling it a complete subscription integration. Provider customer,
event and subscription IDs belong in restricted billing storage, not marketing
events. Offer/interval mapping, customer identity, webhook authority and the
capability update must be independently checked.

## Lifecycle and release gates

Already published game rules, points, picks and membership must survive
subscription cancellation, failed payment, expiry and owner transfer. New
premium configuration requires a current capability and the correct lobby role.
Profile/lobby appearance fallback, the quota and the detailed renewal/refund
offer still need a concrete acceptance before sale. Do not promise a trial,
perpetual style ownership, grace period or automatic post-test price increase.

The deployed reader currently grants only started `active`/`trialing` records
whose expiry has not passed. Future webhook mapping must preserve paid access
until the legitimate paid-through boundary without representing a missing
expiry as lifetime VIP. The presence of `trialing` in a DB enum does not approve
selling a trial. [Identity groundwork](billing-foundation-readiness-2026-11-10.md).

Payment preparation starts in the **selected provider's test environment**.
The original `.env` has
server-only `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` placeholders. These
placeholders; their existence does not enable an endpoint or sale. Application
credentials must belong to the same selected FanTip sandbox. MCP OAuth is
separate from the backend's secret key and does not put that key in the app.
No `VITE_` payment secret is
permitted. Do not upload keys to Sites or commit them.

After provider selection, the owner creates/accesses its official account and
supplies test credentials locally. Production onboarding, identity documents, bank account and
acceptance of provider terms are performed by the actual seller. The seller is
still undecided (OSVČ versus s.r.o. remains explicitly open as of 13 November;
the owner will supply IČ after deciding). Domain/production Clerk,
consumer/privacy texts, data/photo commercial rights and legal/accounting
acceptance remain public-sale gates.

**Implementation update, 12 November (historical):** the shared SDK engine, separate TEST/Live
ports, server routes, durable private ledger/recovery and standalone billing
screens were implemented locally, with every runtime/UI gate then off. Planner was
used. The TEST ledger is applied in the existing hosted project; one real
FanTip sandbox Checkout was completed with a synthetic test card, canonically
verified, refunded and cancelled. It created no ordinary subscription/VIP grant.
Live schema/projection and explicit offer admission are locally rollback-tested,
but the first hosted Live apply was rejected by automatic approval review. The
owner later approved and applied it. No Live account objects or real charges
were used. The current deployment status follows below.
See [current evidence, restrictions and activation steps](stripe-sandbox-readiness-2026-11-12.md).
Seller, accepted implemented capabilities/quota/terms, supported tax model,
production identity/domain and release approval remain explicit activation gates.

**Owner decisions, 13 November:** the prepared disabled Live migration was
explicitly approved. The owner also agreed to sandbox HTTP
verification and a billing-only deployment with sales disabled. The discussion
was initially a division of work; subsequent direct instructions authorized its
scoped execution, but no final sales activation. Five owned VIP lobbies is a tentative proposal, not an accepted
quota. Seller/IČ/tax and domain remain owner TODOs. See the dated responsibility
table in the readiness document; do not ask again for the recorded approvals.

**Execution, 13 November:** after the owner's direct instruction, the approved
disabled Live schema was applied as hosted migration `20261113085132` and
verified with zero policies, grants or subscriptions. After an initial
approval-review usage limit was reset, the isolated billing package was deployed
to Netlify as `6af6f29b6ff8ff48500fde06`. The FanTip sandbox webhook uses the
pinned Endive API; a new signed Stripe event reached the published route and
completed. TEST is internal-only; Live processing and sales remain off. The
authorized TEST recovery HTTP endpoint returned 200 with an empty queue. The
owner subsequently completed a signed Clerk sandbox HTTP Checkout; screenshot
and hosted ledger confirmed a paid TEST period and no ordinary subscription.
A scheduled invocation still needs verification. See the execution evidence in
the readiness document.
