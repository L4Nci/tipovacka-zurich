# Official Public Tournaments and Prizes

> **Architecture status — 2026-11-03:** Future development follows the owner's
> [accepted organizer-lobby model](ROADMAP.md#accepted-organizer-model--2026-11-03):
> one persistent lobby with competitions, explicit competition participation,
> separate standings and event-specific invitations. It serves private groups,
> Kobra and one-off sponsors. The two competition surfaces below describe the
> existing local implementation, not two products to build for the next version.
> Reuse or conversion will have a separate scope in the [active plan](product-restart-plan.md).
> Existing `020`/`021` dependencies, rollout gates and data safeguards remain valid
> while that backend is retained. No code, migrations or historical data are removed
> by accepting the model.

Status: implemented locally behind disabled feature flags. Migrations `020` to
`023` are not deployed. No production event, prize, participation or award data
has been created.

This document extends
[onboarding-start-event-architecture.md](onboarding-start-event-architecture.md).
The product name is **Oficiální turnaje**. `official_events` remains the
technical domain name.

## Product boundaries

Tipovačka has two independent competition surfaces:

1. Private lobbies are small competitions organized by their owner.
2. Official tournaments are time-bounded public competitions operated by
   Tipovačka and optionally presented with a partner.

An official tournament may be offered during onboarding, but it is not a
permanent tutorial lobby. It never creates lobby membership and never enters a
lobby Hall of Fame.

## Private lobby prizes

The owner may optionally publish an ordered `O co hrajeme` list. The first
version supports 1 to 10 placements and a 120-character plain-text label.

The UI must always explain:

> Ceny deklaruje a předává pořadatel lobby. Tipovačka je nedrží, neověřuje ani
> negarantuje.

There is no money movement, fulfilment, dispute workflow or verification. Lobby
admins are deliberately not allowed to edit prizes in v1; that boundary can be
expanded later without changing the stored list.

`set_lobby_prizes_secure()` derives the caller from `auth.uid()`, verifies
`lobbies.owner_id`, normalizes disabled prizes to an empty list and validates
ordering and text server-side. A trigger blocks direct column mutation.

## Official tournament publication

An event references one existing supported tournament and adds only product
metadata:

- `visibility`: `hidden | unlisted | public`;
- partner identity, HTTPS links and one accent color;
- organizer and contact metadata;
- versioned terms summary and HTTPS full-rules link;
- declared age and region requirements;
- ordered prize rank ranges.

The platform owns the event configuration. Partners receive no admin access, no
participant directory and no personal data. The configuration RPC is restricted
to the trusted server role; ordinary clients and client-side platform admin UI
cannot mutate commercial metadata.

The full configuration is intentionally smaller than a CMS. Asset upload,
partner reporting and white-label layouts are deferred.

## Participation and terms

Participation remains explicit. Opening an event detail does not join it.

When current terms are required, one transaction:

1. records the accepted terms version and eligibility declarations;
2. creates or reactivates one participation;
3. creates one score row;
4. returns an idempotent state.

Identity comes only from `auth.uid()`. An event is joinable only when it is
visible, active, inside its registration window and has at least one genuinely
open match. Feature flags control rollout visibility, not authorization.

## Sporting score versus prize eligibility

Sporting predictions and scores remain immutable audit evidence. Prize
eligibility is an independent participation field:

- `not_applicable`;
- `pending_review`;
- `eligible`;
- `ineligible`;
- `disqualified`.

Only a trusted server function can review eligibility. Review never edits
predictions, match results or points. A later finalist workflow can add evidence
and reviewer identity without changing the scoring model.

V1 relies on declared age and region eligibility followed by manual review for
valuable prizes. KYC, automated age checks, Sybil resistance and prize
fulfilment are deferred.

## Badge taxonomy

Official tournament awards use two dimensions:

- one highest performance tier: winner, top 10, top 1%, or top 10%;
- a participant badge when at least one valid prediction exists.

The highest-tier rule avoids four visually duplicated performance badges while
the participant badge preserves season memory. Awards are permanent and
idempotent, retain an event reference, may be featured on a public profile and
never enter lobby Hall of Fame.

Reconciliation is server-only and explicit after completion. Automatic award
reconciliation inside result sync is deferred.

## Season result

The reward-first result shows:

- deterministic absolute position and participant count;
- `TOP X %`, calculated as `ceil(position * 100 / participant_count)`;
- `better than X %`, calculated as
  `floor((participant_count - position) * 100 / participant_count)`;
- points, exact predictions and saved predictions;
- active event awards;
- preliminary matching prizes and current eligibility state.

Small cohorts use the same formulas without invented precision. Ties use the
same deterministic ordering as the compact leaderboard: points, exact hits,
first prediction timestamp, join timestamp and stable user ID. The user-facing
result contains no email or internal user ID.

## Share and conversion funnel

The deterministic client share-card renderer supports an official season result
with event name, display identity, rank, cohort, tier, points, exact predictions,
Tipovačka branding and optional partner name. It never includes email, internal
ID, private memberships or provider tokens.

The public-event-to-lobby funnel is deliberately quiet:

- after a first saved event prediction: `Založit vlastní tipovačku`;
- after viewing the event leaderboard: the same single action;
- after a completed season result: the same action plus existing sharing.

The CTA is suppressed when the user already owns a lobby. An invite deep link
always has priority over generic onboarding.

## Flags and rollout

All flags default to `false`:

- `official_events_enabled`;
- `onboarding_first_tip_enabled`;
- `private_lobby_prizes_enabled`;
- `official_event_commercial_enabled`;
- `official_event_results_enabled`.

Recommended controlled rollout:

1. apply `020` and verify the Official Events foundation;
2. apply `021` and verify atomic scoring parity and correction;
3. apply `022` and verify private prize RPC/trigger boundaries;
4. apply `023` and verify terms, prizes, eligibility, awards and result reads;
5. deploy the frontend with every new flag disabled;
6. run existing-product regression and integrity snapshots;
7. enable one workstream at a time with QA data;
8. leave award backfill, real prizes and public publication disabled until
   legal rules and operations ownership are accepted.

## Deferred scope

- partner dashboard or CMS;
- payments, escrow, fulfilment and claims;
- KYC and automated eligibility verification;
- referral attribution or rewards;
- public participant directory;
- automatic badge reconciliation in result sync;
- mass production badge backfill;
- capacity and regional admission controls;
- custom tournaments;
- analytics platform and random A/B assignment.
