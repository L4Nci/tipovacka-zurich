# Public-pool capacity: current boundaries

10 November 2026. Source review, not a load test, capacity promise or deployed
optimization. Public publication remains disabled. A small known-group pilot
does not establish readiness for a large public community.

## Verified MMA bottleneck

`src/lib/mmaLobbyData.ts` pages each query in blocks of1,000, for at most20
pages. It returns only when a page contains fewer than1,000 rows; therefore
**exactly20,000 rows also fail**, rather than proving that the full result fit.

All season fights are split into chunks of at most100 fight IDs. The client
then downloads every lobby prediction for each chunk. The ceiling is **per
query/chunk**, not20,000 for the entire season. Its own predictions are only
filtered out after the complete community dataset has downloaded.

For a full100-fight chunk,200 stored picks per fight means20,000 rows and a
`MMA_LOBBY_LOAD_FAILED` error. This is a row-grain illustration, not a user
forecast. Fewer completed picks change the threshold; stored picks from former
members can still consume rows before active-member filtering. A50-fight chunk
with200 picks/fight is10,000 rows and does not hit that ceiling by itself.

`MmaEventView` catches a failed initial load and cannot render the game data.
`MmaFightCard`'s Show others button only toggles already downloaded data; it does
not fetch a page. The hidden block still maps all those pick elements into the
DOM. Raising the pagination cap would hide a predictable failure while making
downloads/rendering grow with fights×players.

## Football/hockey are a separate path

`src/lib/db.ts` already uses `get_lobby_tournament_prediction_counts`; do not
propose that aggregate as a new missing feature. However,
`fetchFormattedLobbyPredictions` still downloads the selected lobby/competition's
community rows, with the same20-page safety ceiling, for percentages, member
details and `fetchLobbyLeaderboard`. The latter also regrades finished picks in
JS. A large deferred load can fail while the separately loaded personal match
cards remain visible. Do not report partial community data as a genuine0%.

The season leaderboard RPC and its own member pagination are different query
grains from fight predictions. They need their own measurement; the prediction
ceiling is not evidence that20,000 active participants are supported.

## Smallest proposed next implementation

1. A membership-gated MMA aggregate returns one row per fight: actual saved
   winner counts, optional-method counts, total/current-lineup counts and the
   minimum facts needed to label own participation. Derive these using the
   existing active-membership/lineup validity rules, not a new scoring policy.
2. Load the signed player's own season picks separately. Do not transfer all
   peers' rows merely to obtain the player's handful of picks or missing count.
3. Fetch other players' details only when Show others opens, with bounded
   pagination and deterministic cursors. Retain the real total while showing
   loading/error/next-page states; an unloaded list is not an empty list.
4. Preserve annual and event standings through server aggregates. Do not use a
   visible page of peers as the full ranking or change result scoring/locks.
5. Apply a corresponding aggregate/details split to score-based percentage and
   leaderboard reads, reusing existing counts. Coordinate removal of JS
   regrading with [custom-scoring work](vip-custom-scoring-contract-2026-11-10.md).

New RPCs must resolve Clerk membership before reading community information;
no anonymous names/picks, caller-selected buyer/user authority, cross-pool data
or broadened profile/email visibility. Public registry metadata remains the
small separate entry contract. No provider request, new cron, paid member cap
or admin dashboard is needed for this optimization.

## Acceptance before broad acquisition

- Reproduce the current boundary with synthetic data locally, including an
  exactly20,000-row result; test greater-than-page and partial-page cases.
- Compare aggregate percentages/totals against the existing valid-pick logic:
  skipped methods, duplicate/current lineup, removed players and0 saved picks.
- Verify A/B lobby isolation and no-member/removed-member denial in rollback
  SQL tests; protect unknown/empty/error distinctions in the frontend.
- Verify cursor boundaries, stable ordering, retry and context/account changes;
  opening one details list must not download an entire season.
- Measure actual payload, queries, DOM nodes and first usable game time under
  stated device/network/data conditions. Do not infer production latency from
  an empty schema or a passing unit test.
- A small known group of5–10 can validate usability, but not public-pool
  capacity. Leave the broad campaign gated until the representative result is
  recorded. This review deliberately does not invent a supported-user number.

No capacity fix was implemented by this audit. The source bottleneck and the
proposed aggregate migration remain an explicit P0 follow-up.
