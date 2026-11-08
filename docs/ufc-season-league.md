# UFC annual leagues

Owner approved on 8 November 2026; implementation tracked in [#30](https://github.com/L4Nci/tipovacka-zurich/issues/30).
This replaces the pilot's two separate competition entries. The release must pair
the migration with its frontend/functions build; until release, the working web
continues to show the existing individual cards.

## Product contract

`Lobby → UFC 2026 → UFC 334 / UFC Qatar / UFC 335 / …`

The organizer enables one annual UFC league in a lobby. Its cards appear without
adding another competition each time. As in the current private-lobby flow, active
lobby members can predict within enabled competitions; this change does not add
a separate player-enrollment system. Each lobby keeps independent picks.

The year has an aggregate leaderboard; selecting an event shows that event's
leaderboard, with a button back to the full year. Upcoming, missing and results
filters combine with the event selector. Each bout retains a visible event label.
The home dashboard shows one annual row and the combined missing count per lobby.
Cancelled, draw and no-contest bouts remain zero points. The approved
[optional method extension](mma-finish-methods.md) uses 5/3/1/0 under
`mma-winner-method-v2` for eligible open/new cards. Historical/locked v1 cards
retain one point for the winner. First-bell and lineup locks are unchanged.

The next year is a distinct competition, enabled separately. No points transfer
to that leaderboard. Event assignment uses the UTC year first registered from the
provider; its season stays stable if the event is later postponed across New Year.
Dates displayed to players remain Europe/Prague.

## Identity and migration

`mma_seasons` links an annual tournament to its year. Each existing `mma_events`
row gains `season_tournament_id`; its existing ID and all duel IDs stay intact.
Predictions retain their `(lobby_id, fight_id, user_id)` primary key. They are
neither copied nor rescored by the grouping migration.

Active pilot attachments become one active annual attachment; individual event
attachments are archived, preserved for history, and individual event tournaments
are hidden from the competition picker. Legacy event routes and leaderboard
contexts still work through the active parent season. No profiles, roles, football
or hockey results are changed. A populated legacy lobby whose primary tournament
is an MMA card is pointed at the same card's annual parent.

## Automatic calendar and API budget

UFCalendar remains the only source. Verify its [current contract](https://api.ufcalendar.com/openapi.json)
when extending the adapter. Main UFC cards include numbered events, Fight Night
and UFC destination cards. DWCS, The Ultimate Fighter, Road to UFC, Power Slap and
other organizations are excluded. New organizations need a separate contract.

The existing protected 15-minute cron performs a calendar discovery at most once
daily, looking 42 UTC days ahead plus yesterday for overnight live cards using
`/v1/events?org=ufc`. The entire bounded
page must validate; unexpected pagination fails closed. Missing or cancelled list
entries never delete existing events. Each registered ID is reconciled against
its own full-card endpoint. A discovered card with no published bouts waits;
no fictitious fighters or fights are inserted.

At most two due cards are fetched per tick; imminent active cards have priority,
then unimported cards, then remaining due cards. A third new card waits for the
next tick. One optional cached portrait may also be refreshed. This bounds one
ordinary cron invocation to four UFCalendar requests (calendar + two cards + photo).

To make continuous UFC practical on Free, the former pilot-only polling window
is replaced by:

| Card timing | Refresh |
| --- | --- |
| 6 hours before first bell to 12 hours after, not completed | 15 minutes |
| Within 7 days before / 72 hours after | 6 hours |
| More distant, or within 30 days after | 1 day |
| More than 30 days after | 30 days |

Pending/failed full-card requests also defer according to proximity (15 minutes,
6 hours or one day), so an empty distant card does not consume 96 calls daily.
Failed calendar discovery retries after six hours; a 15-minute lease prevents
late or competing completions. All reserved calls,
including failed requests, count toward the existing 900/month local cap.
Portraits retain the independent 100/month cap and stop at total 800. A hard cap
can still delay updates if a very busy month or repeated failures exhausts it;
this is a bounded Free pilot, not a live-results SLA. Other apps/manual diagnostic
requests using the key are outside this project's counters.

Calendar leases, ID registry and sync timings are private, RLS enabled and
inaccessible to players. Only the service role can discover/register cards or
reserve API calls. The server uses fixed HTTPS URLs, no redirects and header-only
credentials. Calendar failures do not stop known cards or football/hockey.

## Verification and release

- `npm run test:mma`, `npm run test:i18n`, `npm run lint`, both builds, `git diff --check`.
- Run the candidate migration plus `supabase/tests/ufc_season_league.sql` within
  `BEGIN/ROLLBACK`, using unique fixture IDs. Verify original predictions, matches
  and profiles are byte-equivalent before rolling back. Cover season/event/year
  isolation, foreign/removed lobby access, immutable picks, server-only points,
  locks, registered IDs, stale observations, discovery leases and shared quotas.
- Run `supabase/tests/mma_fighter_portraits.sql` after the candidate migration,
  in its rollback transaction, to check the existing portrait budget contract.
- Real UFC 335 provider snapshot: validated and dry-run/write reconciled within
  a rollback transaction, producing six published duels under `ufc-2026`.
- Browser fixture QA uses no real DB writes: season/event filters, missing count,
  save, results, event/season ranking, rules dialog and CZ/EN at desktop/mobile.
- Before release, make a private data/schema backup. Apply the migration and
  matching build together, run one protected write sync, verify actual UFC 335
  attachment through the parent, compare original picks/results, and inspect
  scheduled follow-up. Re-check advisors; private queues intentionally have no
  client policies. Keep #30 open until owner acceptance.

Rollback after migration must preserve newly made predictions: restore the
previous UI/catalog layout deliberately using the backup; never drop populated
MMA tables or cascade-delete an annual league. The prior static pilot worker can
only update its two known cards and is not a replacement for the new scheduler.
