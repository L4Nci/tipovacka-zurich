# Product Strategy and Roadmap v2

Tipovacka is not an app for one World Cup. It is a platform for repeated private sports prediction competitions.

This document is the long-term product source of truth for Tipovacka after the first successfully completed live production tournament.

It is not a feature backlog, TODO list, sprint plan, GitHub Issue list, technical audit, or marketing plan. Concrete work belongs in GitHub Issues. This document describes the product direction, product boundaries, completed foundations, and durable product areas.

## Planning update — 2026-11-03

**VIP pricing decision — 10 November 2026:** one personal Fan VIP at **CZK49
per month or CZK499 per year**, with the same functionality and a customer-chosen
interval. First own lobby and invited players are free; no five-player paywall
or sporting advantage. This supersedes the earlier CZK29/49 monthly A/B idea
and the price/model questions in older dated notes below. Exact VIP lobby quota,
renewal/expiry terms, gateway and seller remain open. The owner reports current
cash operating costs of CZK0; future budget examples are scenarios. This is
preparation and validation, not enabled billing or release approval. See
[the billing contract](billing-contract.md).

**Public-entry implementation decision — 10 November 2026:** the owner requested
`/goal dokončit P0 a P1` on 9 November, authorizing implementation in small verified
blocks. The public CL/PL/annual-UFC path now uses a thin private registry pointing
to newly provisioned system-organizer lobbies, one competition/season per pool.
One entry flow and direct campaign links lead to explicit Clerk participation;
each pool has separate standings. Private groups, independent picks, history,
existing result adapters, scoring and locks remain unchanged. New annual UFC
cards belong to that year's joined competition; a new year requires a separate
join. This implements the accepted organizer model without a parallel game
engine or migration of private lobbies.

The registry/RPC source and the existing football/MMA sync integration passed
transactional tests on a local copy of current hosted schema definitions.
The registry and five-language profile migrations are now applied in the same
hosted project, and the permission/profile/scoring suites passed there with
ROLLBACK. The frontend identity-return lifecycle passed a local StrictMode
simulation. Pool provisioning, actual Clerk-to-public-game session acceptance
and frontend release remain pending. New pools start unpublished and the independent public-entry
gate defaults off. See [the backend decision and runbook](public-competition-backend-2026-11-10.md)
and [the launch blocks](public-launch-p0-p1-blocks-2026-11-09.md).

The undeployed Official 020–023 participation/scoring/prize backend is not the
implementation target for this public entry and stays disabled. Sponsored prizes,
paid entry and partner operations retain their own future product/legal scope.
Authorization to implement P0/P1 does not approve a price, purchase, launch date
or public release; paid P0 functions still need the concrete sales contract.

**Priority correction —9 November2026:** the owner deferred all admin-dashboard
and admin-navigation work until a new explicit request. Manual result entry is
not the planned operating workflow; existing automatic provider sync remains
the basis. A compact future per-provider sync indicator is a deferred idea.
Necessary auth/RLS/key controls, basic failure alerts and backup checks remain
launch requirements without building an administration product.
The next product focus is public entry and first-pick activation. The owner
asked about all three launch competitions: Champions League, Premier League and
annual UFC. Target one public entry with direct campaign links, separate rules
and standings; validate the two formats (football/MMA) in bounded steps.

**Bounded follow-up —9 November2026:** owner-approved retirement of native
Supabase login is completed with preserved history and a designated Clerk admin;
the resolver is Clerk-only. Dependency issue26 has a locally verified compatible
patch, not a released build. The owner proposed VIP cosmetics, lobby appearance,
additional owned lobbies and configurable scoring with no competitive advantage.
The [concrete proposal](vip-and-public-entry-proposal-2026-11-09.md) recommends
one personal VIP product; exact limits, price and scoring scope remain decisions,
not enabled paywalls. The newer priority correction above defers operations
panel changes as well; keep necessary monitoring outside that UI.

**Public-launch scope — 2026-11-09:** the owner initially requested a read-only
readiness audit and an approval-based P0/P1 plan, then authorized implementation
through the goal recorded above. P0 means a verified public product,
including paid cosmetics/VIP and owner features (reconfirmed), CS/EN/DE/PL,
mobile/PWA/desktop access and one free public challenge without prizes.
Slovak localization and expanded acquisition/retention are P1. Existing private
lobby and annual UFC models remain the foundation. The later public-pool decision
above replaces the former Official-reuse candidate: current provider sync rejects
the undeployed Official prediction system, so the approved public path reuses
normal lobby predictions and does not activate that older backend. See the
[current-state audit](public-launch-p0-p1-audit-2026-11-09.md) and
[bounded implementation blocks](public-launch-p0-p1-blocks-2026-11-09.md).
The audit itself remains evidence, not a release authorization. Subsequent
implementation follows the owner's goal and coordinated validation; publication
is a separate step.

**Owner decision — 2026-11-09:** the first public release is intended to include
paid cosmetics/VIP without sporting advantage and expanded lobby-owner/creator
features. The seller identity, concrete bundles, prices and one-time versus
recurring payment model are still undecided. This supersedes the earlier
assumption that all monetization would wait until after launch; it does not
activate billing, prize entry or creator payouts. Security, privacy, consumer
terms and provider/image rights must be resolved before selling. See the
[public-launch review](public-launch-security-privacy-legal-2026-11-09.md).
The owner also requested the first landing implementation and visual alignment
of the game entry with the brandkit; the isolated private landing is published,
while auth-entry styling is prepared locally. See [the landing brief](landing-page-brief.md).

**Localization foundation — 2026-11-06:** the owner approved consolidating Czech
and English, including embedded Clerk UI, into shared typed catalogs and one
canonical locale preference. The implementation accepts the historical `cz`
preference as `cs`, uses Intl plurals and preserves Prague match times. Further
languages require reviewed translations and an explicit profile-locale contract
extension; see [the localization contract](localization.md). The targeted legacy
tournament-winner context-transfer fix is applied in the existing DB; broader
security readiness remains tracked in [the control matrix](security-readiness-matrix.md).

**Owner decision — 2026-11-08:** UFC uses one annual competition per lobby
(`UFC 2026`, then a separately enabled `UFC 2027`). Individual cards are rounds
inside that competition, with event filters/results and an annual leaderboard.
New cards are discovered automatically; existing picks retain their duel/lobby
identity. This supersedes separate per-card participation/standings as the only
UFC competition model; event standings remain available as a view of the year.
Implementation/release contract: [UFC annual leagues](ufc-season-league.md).

**Follow-up approval — 2026-11-08:** add optional KO/TKO, Submission and Decision
predictions and a separate lobby method distribution. Version v2 awards 5 for
winner+method, 3 for winner only, 1 for method only and 0 otherwise. Eligible open
and future cards adopt it; locked/historical winner-only cards keep their rules.
Finishing-round predictions remain later work. See [the method contract](mma-finish-methods.md).

**Owner direction — 2026-11-06:** add MMA as the next prediction format, with
UFC as the first organization. UFC 334 on 14 November and the announced
Procházka event on 21 November are candidate small-group tests, conditional on
verified automated data and an agreed rules contract; they are not release
commitments. The same persistent lobby should carry the group into the next
event. Initially each card had separate participation/standings; the annual UFC
decision above replaces that pilot structure. The winner-only pilot is now
implemented and both cards are imported; see the [MMA runbook](mma-pilot-runbook.md)
for release verification and remaining limits.

The owner accepted winner prediction with optional method-of-victory and round
bonuses as the MMA direction; predict the finishing round, not the exact clock
time. The original pilot used versioned winner-only scoring (1 point for a correct
winner). The method extension above supersedes it for eligible new/open cards;
finishing-round bonuses remain to be specified and implemented.
Creator/YouTube communities are an accepted use case for the same persistent
lobby; paid community access is an idea, not an implemented entitlement or an
approved payment/pricing model. Missing predictions should be immediately
visible and directly actionable across competitions.

The owner selected the men's Ice Hockey World Championship, 13–30 May 2027,
as the main CZ/SK acquisition milestone. The owner clarified that the product
must already be fully operational before the campaign; campaign work is mainly
marketing, demonstrations and polish. Readiness requires clear onboarding,
multilingual play, verified automated fixtures
and results, trustworthy points, security review and tested operations. This is
a product-readiness target, not a claim that the current app is ready for scale.
The [readiness and work split](product-readiness-2026-11-06.md) proposes a
February operational target, leaving March/April for marketing and refinement.
The proposed preparation dates, MMA structure and launch criteria are in the
[MMA and Worlds plan](mma-and-worlds-launch-plan.md). Landing implementation was
requested on 9 November; the newer decision above supersedes its planning-only state.

**Multi-sport expansion — 2026-11-05:** the owner chose Premier League, then NHL
and Czech Extraliga. PL/NHL are active in the same DB and Testovací rodeo. Imported
ELH data are preserved but temporarily hidden/archived because Hokej.cz refuses
hosted requests (403) and the existing API-Sports Free plan excludes season 2026.
The shared 15-minute endpoint supports isolated per-competition reconciliation;
new lobbies read the actual catalog. NHL playoffs are supported as published;
ELH sync is skipped by default pending an accessible source; its parser covers
only the regular season, with playoff structure awaiting verification.
See [the current runbook](multi-sport-sync.md). Each competition
has one source; cross-source voting is still future work.

**Result authority — 2026-11-05:** the owner accepted self-healing from the same
verified provider revision and rejection of older data. Finished CL points are
reconciled even when scores are unchanged. A future layer should decide results
from normalized fresh independent observations (for example 2 matching sources
out of 3); newer timestamps alone do not establish cross-provider consensus.
Each competition has one authoritative source today. See the [result-source policy](result-source-policy.md).

**Cron and full-season sync — 2026-11-05:** the owner confirmed saved predictions
on Netlify. Cron-job.org task 8799825 is enabled every 15 minutes; dry-run, write
test and first scheduled execution succeeded. The full-season adapter/RPC accept
known knockout fixtures as they are published, up to the 45 main knockout matches.
Unknown participants/time remain deferred. Final goals or shootout-only scores
use the existing point values; per-lobby configurable/versioned rules remain future
work. See the [runbook](football-data-cron.md) for current verification and scope.

**Release verified — 2026-11-05:** PR #16 published the new Clerk frontend and
football-data sync to the existing working Netlify site. The sign-in screen and
API guards work; authenticated sync dry-run returned 144 unchanged matches,
no conflicts and no DB writes. External cron scheduling and owner verification
of the signed-in game flow remain pending. The following dated notes preserve
the earlier planning history; see the [current runbook](football-data-cron.md).

**Owner clarification — 2026-11-05:** this is currently a development/rebuild space,
not active live production. The old production warning is superseded in AGENTS.md;
do not repeatedly request approval for the agreed implementation. The Champions
League catalog is imported and activated in the existing database, linked to the owner’s Testovací rodeo lobby. The owner subsequently chose to test the whole season, removing the three-matchday limit. Normal evaluation and newer provider corrections must be automatic across lobbies; manual operation is not a prerequisite.
See the [sync runbook](football-data-cron.md) for its current implementation and
deployment status. The pilot has not started.

**Owner update — 2026-11-04:** build the product in the single existing Supabase project `hkhkbtzdyjbdeeoiurvw`, using ordinary local `.env` configuration and Netlify environment variables for deployment. No separate beta environment or second database. The owner confirmed there is no current live operation and approved database restructuring/cleanup and transactional RLS tests. The Clerk identity migration has been applied, preserving history so far; real registration, profile creation and two Clerk players joining one lobby are verified. The working Netlify site still uses historical Supabase Auth until a reviewed deployment of the new client. See the [current implementation scope](beta-implementation-scope.md).

The owner confirmed private groups and communities as the primary audience;
company use is secondary. The historical hockey and football competitions are
complete. The owner restored Supabase for the review and the historical app is
accessible again; a new live pilot has not started. Historical data remains
protected by the existing production rules.

The intended next version keeps Supabase as the data foundation and uses Clerk
as the planned identity/account layer. A complete multilingual core flow,
profile revision, UI refresh and gradual expansion to more competitions are
the direction. Netlify is suitable for initial testing and later deployment of the same application.
Implementation is underway; the working release was deployed on 5 November as described above.

Cosmetic customization and visible supporter identity are the intended
monetization area to validate. Pricing, payment implementation and exact
Free/Premium boundaries remain undecided; payment must not affect sporting
scores or the ability to win. Expansion order is football, hockey, then MMA;
the owner selected UFC as the first MMA organization on 6 November. UFCalendar
and the winner-only pilot are verified at bootstrap; broader provider reliability
and live play still need observation. F1 remains an optional later direction.

The owner chose to archive the old version and start the pilot with new
accounts and a fresh scoring period. The owner identified “Fotbaloví experti”
as the only real historical lobby and allowed its data to inform the review
and validation. Historical points do not carry into the new pilot ranking.
The owner explicitly chose to archive and hide the two test lobbies in the
historical application while preserving data. The current application only
archives tournaments within a lobby; full lobby archival needs a separate
implementation. See [the audited archival plan](archive-test-lobbies-plan.md).
Archival has not yet been implemented. The later Clerk identity migration is recorded in the implementation scope.

The owner selected UEFA Champions League 2026/27 first, followed by Premier League.
The owner accepted the persistent organizer-lobby model (B) after the
[theoretical comparison](lobby-model-research-2026-11-03.md). The model choice is
closed. The owner’s 5 November update replaces the three-matchday pilot with ongoing
testing through the whole 2026/27 season, using new predictions and no scored
season-winner pick. The league phase is available now; knockout import and
extra-time/shootout rules still need implementation. Predictions
remain independent in each lobby. The owner requested the complete final score
and prefers scoring the shootout score, such as 5:4, when a match is decided on
penalties. Official goal scores and shootouts remain distinct sports facts;
that game preference needs its complete contract before implementation. The
owner wants configurable competition rules. The later 5 November update allows
rule changes during development with a visible version, impact preview and explicit
rescore scope. The small regulation/final-score example is implemented; persistent
configuration and rescore controls are still pending.
Exact fixtures, dates and operational edge cases will be verified
before launch. Building prototypes is not authorized at this stage; the current
task is to record the accepted logic and continue planning. No monetization
package has been approved.
See [the active plan and checklist](product-restart-plan.md).
That pilot precedes the longer-term commercial milestones below. Implementation
tasks will move into Issues once their scope is settled.

## Accepted organizer model — 2026-11-03

**One persistent organizer lobby contains one or more prediction competitions.
Each competition has its own participation, scoring period and leaderboard.
Invitations lead directly to a specific competition in that lobby.**

The same model covers a group of friends, a recurring pub community such as
Kobra, and a one-off sponsored competition. A one-off organizer simply runs
one competition; further competitions are optional. There is no parallel
event-only product model to build.

Player identity and profile persist across competitions. Lobby membership and
history persist when the organizer starts the next competition; participation
in that competition is a distinct concept. A new competition does not silently enroll
all lobby members or carry historical points into its new leaderboard. Exact
entry permissions and account contracts must be specified before implementation.
Recurring UFC cards are rounds of an already enabled annual competition, so
they inherit that league's lobby access; a new annual competition stays separate.

Sports schedules and results are shared facts. Lobby participation, predictions
and standings retain their competition context. The owner explicitly chose
independent player predictions in each lobby, including the same match played
in multiple groups.

Game evaluation is derived from sports facts using a competition-specific
rules version. Changes during development must have an identifiable version and a visible
rescore scope; new variants must not rewrite official scores or silently rescore
ongoing or historical competitions.

Personal cosmetics belong to the player; organizer identity belongs to the
lobby; a partner and declared prizes belong to a specific competition. Sponsor
branding does not grant administrative access. The subsequent P0/P1 goal brings
the CL/PL/annual-UFC public entry into implementation scope. Prize operations,
company branding, a partner portal and an enterprise product remain separate
future work. The public-pool implementation does not approve their pricing,
payments or activation. Paid customization cannot change sporting scores or
locking rules.

The existing local Official Events implementation still has separate tables
and flows. Those describe older disabled code, not the accepted public-entry
implementation. The bounded decision is to defer that backend and provision
fresh system-organizer pools using existing lobby predictions and scoring;
see [the reviewed architecture](public-competition-backend-2026-11-10.md).
No old Official migration is applied and no historical private data is converted.
Existing result safeguards, rules versions and prediction identities are
preserved. Publication controls discovery/new entry and does not revoke the
ordinary access of previously joined members.

## Product Stage

Tipovacka is no longer an MVP.

The first live tournament, FIFA World Cup 2026, was completed successfully in production. During that tournament, the product validated:

- lobby creation and participation,
- login,
- match predictions,
- playoff prediction rules,
- long-term tournament winner picks,
- automatic result sync,
- automatic fixture/TBA sync,
- leaderboard behavior,
- points recalculation,
- tournament closing,
- live production operation.

The roadmap now describes platform development, not MVP completion.

## Vision

Create the simplest, most beautiful, and most reliable platform for private sports prediction leagues.

## Mission

Allow anyone to create a private prediction competition for friends, family, a company, or a community within one minute.

## North Star

The best tournament is one where the organizer almost never needs to open administration.

Automatic results, fixture sync, points recalculation, tournament winner confirmation, and safe operations all support this idea.

## Product Principles

Tipovacka must be:

- simple,
- fast,
- beautiful,
- trustworthy,
- automated.

Points must always be correct.

Users should not need to think about technical details. The product should feel easy even when the tournament logic, scoring, fixtures, and result synchronization are complex behind the scenes.

## Core Product Pillars

These pillars are decision-making values, not a feature list.

### Trust

Points must always be correct. Users must believe that the leaderboard reflects reality.

### Simplicity

A lobby should be created within one minute. Setup should stay minimal.

### Automation

The organizer should not need to manually run the tournament.

### Social Competition

The main value is competing with friends, family, colleagues, and communities.

### Beautiful UX

The product should feel fast, modern, polished, and cared for.

## Product DNA

When deciding whether a new product direction belongs in Tipovacka, ask whether it helps the product become:

- simpler,
- faster,
- more trustworthy,
- more automated,
- more fun for a group of people.

If not, it is probably not a priority.

## Product Philosophy

Tipovacka is a social competition product, not a betting product.

The product exists to make watching sports together more fun, remove spreadsheet chaos, and make private competitions easy to run. A group should be able to create a lobby, invite players, predict matches, and let the app handle the operational work.

The product should win through:

- the simplest onboarding,
- the fastest lobby creation,
- the best UI quality,
- the highest trust in points,
- minimal administration,
- an automated tournament flow.

Tipovacka should not try to win by having the largest number of features.

## What We Never Want

Tipovacka must never become:

- pay-to-win,
- sports betting,
- a casino-like product,
- a holder of user money,
- an aggressive advertising surface,
- a product with full-screen or intrusive ads,
- a product that worsens the Free user experience.

Premium may add new possibilities later, but it must not take away capabilities that Free users already had.

## Product Growth Philosophy

Growth should come mainly from:

- recommendations between friends,
- creation of new lobbies,
- sharing between communities,
- simple onboarding.

Growth should not depend on aggressive advertising.

## Product Success

### First Milestone

The first measurable milestone is:

- 50 active lobbies,
- 100+ active players,
- 10 paying customers.

### Product-Market Fit

Product-market fit means the product works as a habit and recommendation loop, not only as a one-time tournament tool:

- people recommend the app themselves,
- players return for future tournaments,
- users create new lobbies without owner involvement,
- players trust the points and leaderboard,
- organizers do not need to manage tournament operations manually.

The product should first become something people want to use themselves, then something they recommend to others, and only after that something that earns money.

## Two-Year Product Shape

In two years, the desired product state is:

- the product runs reliably,
- the community is active,
- routine tournament operation is mostly automated,
- development is not dependent on only one person,
- the owner can focus mainly on product, marketing, and business,
- technical bugs and routine development can be handled by another developer.

This is a product direction, not a staffing or delivery plan.

## Target Customers

The first customers are:

- friends,
- families,
- small private groups.

The next natural customer groups are:

- pubs,
- sports communities,
- companies,
- schools.

The repository currently confirms the private lobby model. Broader customer segments remain product direction until they are represented by explicit decisions or Issues.

## Multi-Lobby Philosophy

One user can belong to multiple independent communities.

Each community has its own:

- lobby,
- history,
- leaderboard,
- tournaments.

Communities should not blend into each other. A player may participate in several groups, but each group should retain its own context and competitive identity.

## Completed Foundations

These are no longer roadmap ambitions. They are current product foundations.

### Private Lobby Flow

The product supports private lobby creation, lobby joining, lobby membership, and lobby-based tournament play.

This is the central product shape.

### Authentication

Users can log in and participate under their player identity. Authentication is part of the validated production flow.

### Match Prediction Flow

Players can predict match scores, update predictions before lock, and compare predictions with others according to match state.

Football group-stage draw predictions are supported. Football playoff draw predictions are blocked because playoff matches must produce a winner.

### Long-Term Tournament Picks

Players can make long-term tournament winner predictions. Tournament champion confirmation awards the long-term bonus deterministically.

Tournament completion is derived from the global confirmed champion and all tournament matches being finished and scored. There is no separate mandatory manual "end tournament" action.

### Locking Rules

Predictions lock before kickoff. Locking is a trust boundary. Frontend behavior may help the user, but authoritative protection must stay in the save path.

### Centralized Scoring

Normal match scoring is centralized. Confirmed match results are the source input for recalculating prediction points.

Football scoring supports:

- exact score,
- correct winner plus goal difference,
- correct winner,
- correct draw for group-stage football.

Tournament winner bonus scoring exists separately from normal match scoring.

### Leaderboard

The leaderboard is a core product surface. It combines match prediction points and long-term tournament points, and it explains totals through visible scoring breakdowns.

The first production tournament proved that leaderboard trust depends on complete data loading, correct recalculation, and clear explanation.

### Profile and Player Stats

The profile area includes player identity, avatar/profile presentation, recent prediction history, points, rank, distance to leader, streaks, and scoring-category breakdowns.

Profile and basic player statistics are therefore current product foundations, not future roadmap items.

### Automatic Result Sync

Automatic result sync is implemented through guarded server-side endpoints. The current provider path is TheSportsDB. Result sync supports dry-run and guarded write modes.

The product has moved beyond the original MVP assumption that external APIs should only propose results. Guarded automatic result writes are now part of the production architecture.

### Automatic Fixture/TBA Sync

Playoff fixture discovery is a product operation. Fixture sync fills known playoff TBA slots when TheSportsDB publishes fixtures, without changing match IDs, predictions, scores, or finished matches.

Fixture sync is separate from result sync and must remain separately guarded.

### Tournament Closing

The product supports tournament closing through champion confirmation and deterministic long-term point assignment.

Completed tournaments move out of active lobby competition display into tournament history, and Hall of Fame starts from completed tournament leaderboard totals.

This completes the basic tournament lifecycle from setup to final leaderboard, history, and first post-tournament recognition.

### Production Safety Model

Tipovacka has explicit production safety rules for real predictions, match results, points, scoring, sync, auth, and AI-agent work.

See [AGENTS.md](../AGENTS.md) and [PROJECT_RULES.md](../PROJECT_RULES.md).

## Product Pillars After the First Tournament

The first live tournament established product areas that now deserve stable ownership in the roadmap.

### 1. Tournament Lifecycle

Tipovacka is not only a match prediction screen. It is a full tournament product.

The lifecycle includes:

- lobby setup,
- player participation,
- group-stage predictions,
- playoff predictions,
- TBA fixture filling,
- result synchronization,
- points recalculation,
- leaderboard reconciliation,
- champion confirmation,
- post-tournament history.

Future product changes should fit this lifecycle instead of adding isolated one-off flows.

### 2. Trust and Data Integrity

Data integrity is a product requirement.

The product must maintain confidence that:

- every finished match has a coherent score and status,
- every prediction for a finished match has correct points,
- leaderboard totals equal match points plus long-term points,
- sync writes go through the same result-application path as manual result entry,
- production data repairs are previewed and approved before execution.

The first tournament showed that trust can be damaged not only by wrong formulas, but also by incomplete data loading, provider edge cases, stale points, and unclear explanations.

### 3. Operations and Automation

Automation is part of the product experience.

Users should not need to know about fixtures, provider endpoints, penalty normalization, cron jobs, or result sync. The app should make tournament operation feel automatic while keeping owner-facing controls safe and auditable.

Operational reliability depends on:

- Netlify Functions,
- Supabase service-role access on the server side only,
- TheSportsDB response quality,
- cron configuration,
- environment flags,
- dry-run visibility,
- clear summaries of updated, skipped, unmapped, and conflicted items.

Silent technical success is not enough. The owner must be able to understand whether the product actually progressed.

### 4. Product Simplicity and UX Quality

The product must remain simple even as the underlying tournament logic becomes more capable.

The user should see:

- clear next matches,
- clear prediction controls,
- clear lock state,
- clear leaderboard totals,
- clear scoring explanation,
- clear tournament progress.

The product should avoid exposing internal provider, sync, database, or scoring complexity to normal players.

### 5. Independent Communities

The multi-lobby model means communities stay separate.

Each lobby should feel like its own competition, with its own members, tournaments, standings, and history. This is important for friends, families, companies, schools, pubs, and sports communities.

## Current Product Boundaries

These boundaries are intentional:

- Tipovacka is not a betting platform.
- Financial settlement, if any, happens outside the app.
- Production predictions must not be edited manually.
- Player points must not be edited directly as a normal workflow.
- Result writes must be guarded, auditable, and routed through shared result application logic.
- Fixture sync must not change match IDs or delete predictions.
- Free users must not lose existing capabilities because of future Premium decisions.
- Frontend validation is UX only; authoritative checks belong in save and sync paths.
- GitHub Issues are lightweight project memory, not a heavy project-management process.

## Provider Strategy

TheSportsDB is the current provider used by the repository for result and fixture sync.

The first production tournament showed that provider data cannot be treated as perfectly regular:

- playoff round identifiers may differ from obvious values,
- final scores after penalties may require extra score fields,
- some fixtures may appear later than others,
- provider availability can differ by endpoint,
- successful HTTP responses may still produce no useful product update.

Provider integrations should remain adapter-based, auditable, and replaceable only through an explicit product/technical decision.

API-Football remains historical context, not the current production path.

## Roadmap v2 vs Roadmap v1

Roadmap v1 mixed product direction with early MVP assumptions and possible future feature ideas. Roadmap v2 reflects the product after a completed live tournament.

Changed from v1:

- The roadmap is now about platform development, not MVP completion.
- Automatic results moved from future aspiration to completed foundation.
- Fixture/TBA sync became a product pillar.
- Tournament lifecycle became a first-class product concept.
- Data integrity became a first-class product requirement.
- Tournament closing became part of the core product.
- Profile/avatar and basic player stats moved from future ideas to completed foundations.
- Generic future-feature lists were removed from the roadmap body.
- Monetization is recorded only as an undecided product decision with clear Free/Premium boundaries.

## What Should Not Need to Be Solved Again

These decisions should not be reopened casually:

- Tipovacka is not a betting or settlement product.
- Production points should not be edited directly as the normal way to fix scoring.
- Confirmed match results are the source input for scoring changes.
- Result sync and fixture sync must stay guarded and auditable.
- Fixture sync must preserve local match IDs and existing predictions.
- TheSportsDB is the current provider path unless a deliberate provider decision replaces it.
- Free users should not lose existing capabilities because Premium exists later.
- GitHub Issues are lightweight project memory, not a full project-management process.

## Incorrect Assumptions Found

The first production tournament invalidated several earlier assumptions:

- External sports APIs cannot be assumed to expose fixtures and rounds in obvious or stable ways.
- A successful sync HTTP response is not the same as a useful product update.
- Provider final scores may need playoff-specific normalization for extra time or penalties.
- Supabase client reads without pagination are not safe once prediction counts exceed default row limits.
- A leaderboard that looks correct for small data can become wrong when data loading is incomplete.
- Fixture updates are not a minor admin detail; they are part of the playoff product lifecycle.
- Profile/avatar and basic player statistics are no longer future ideas.

## Roadmap vs Issues

- `ROADMAP.md` describes product strategy, product state, and durable product direction.
- GitHub Issues describe concrete work.
- Implementation details, bug lists, and TODOs should stay out of this document.
- When external visual roadmap decisions become stable, reflect only the product-level decisions here.

# Open Product Decisions

The following questions are not decided in the repository and should not be guessed by agents:

- What exact shape should post-tournament history and Hall of Fame take?
- What level of operational monitoring is appropriate for a solo-owner live product?
- Which admin powers should remain owner-only, and which can belong to lobby owners?
- Which anonymous leaderboard/profile sharing should follow the approved public competition entry and existing lobby invitations?
- What exact cosmetics, VIP lobby quota, renewal/expiry/transfer terms and seller details complete the approved personal VIP at CZK49/month or CZK499/year for P0?
- Which capabilities may Premium add without weakening the Free experience?
- When is the product ready to intentionally target pubs, sports communities, companies, or schools beyond the first private-group customers?
- What does long-term non-owner development responsibility look like in practice?
