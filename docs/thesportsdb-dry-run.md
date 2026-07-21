# TheSportsDB Result Sync

This is the current operational documentation for TheSportsDB result sync.
The implementation source of truth is the shared server code in
`server/lib/resultSync.ts` and `server/lib/resultProviders/theSportsDb.ts`.

TheSportsDB is the active production sports-data provider for FIFA World Cup
2026 result sync. API-Football material remains historical context only.

## Production Endpoints

Production runs on Netlify Functions, with API redirects configured in
`netlify.toml`.

```http
POST /api/admin/sync-results-dry-run?provider=thesportsdb
POST /.netlify/functions/sync-results-dry-run?provider=thesportsdb

POST /api/admin/sync-results?provider=thesportsdb
POST /.netlify/functions/sync-results?provider=thesportsdb
```

Local development uses the same paths through `server.ts`. The local Express
routes delegate to the same shared modules as production.

## Required Environment

```txt
RESULT_SYNC_SECRET=<scheduler/admin secret>
RESULT_SYNC_WRITE_ENABLED=false
VITE_SUPABASE_URL=<supabase project url>
SUPABASE_SERVICE_ROLE_KEY=<server-only service role key>
```

Set `RESULT_SYNC_WRITE_ENABLED=true` only when guarded writes are explicitly
approved. The service-role key must never be exposed to frontend code.

## Request Body

Explicit date window:

```json
{
  "from": "2026-06-11",
  "to": "2026-06-13"
}
```

Default dynamic date window:

```json
{}
```

When `from`/`to` are missing, the endpoint resolves:

```txt
from = today UTC - 1 day
to = today UTC + 1 day
date_window_source = default_dynamic
```

## Safety Contract

Dry-run never writes to the database.

Write mode is guarded and may write only through the shared result application
flow. It must not directly patch prediction points.

Safety counters must make this explicit:

```txt
wrote_to_db
matches_updated
predictions_updated
points_updated
profiles_updated
direct_prediction_writes = false
direct_points_writes = false
```

## Provider Query Strategy

The result provider reads local World Cup 2026 matches and filters them by the
resolved date window.

It skips local placeholder teams such as `football-tba`.

For local matches in the window, it prefers low-request daily lookup:

```txt
eventsday.php?d=YYYY-MM-DD&l=4429
```

It calls `eventsday` once per unique local match date, with a small delay
between provider requests.

Only if a local match is not found from the daily response does it use targeted
fallback queries:

```txt
searchfilename.php?e=FIFA_World_Cup_{YYYY-MM-DD}_{Home}_vs_{Away}
searchevents.php?e={Home}_vs_{Away}&s=2026
```

If a daily request fails for a date, targeted fallback for that date is skipped
to avoid amplifying provider rate-limit pressure.

The response includes provider request diagnostics:

```txt
provider_requests_count
provider_requests_failed
rate_limited_count
provider_error
provider_requests
```

## Normalization

Provider events are normalized to:

```txt
provider = thesportsdb
provider_match_id = idEvent
home_name = strHomeTeam
away_name = strAwayTeam
kickoff_utc = strTimestamp or dateEvent + strTime
status = strStatus
home_score
away_score
raw_status = strStatus
```

Group-stage football uses:

```txt
intHomeScore / intAwayScore
```

Knockout/playoff football uses final non-draw extra score when TheSportsDB
provides it:

```txt
intHomeScoreExtra / intAwayScoreExtra
```

This is required for extra-time or penalty matches where the base score is a
draw but the product stores the final winner score.

If a playoff event would normalize to a draw final score, write mode refuses it
as a conflict.

## Finished Statuses

The current finished provider statuses are:

```txt
FT
AP
AET
PEN
```

Unknown statuses are not treated as finished.

## Mapping and Write Guards

Write mode may update a match only when all relevant guards pass:

- `RESULT_SYNC_SECRET` matches.
- `RESULT_SYNC_WRITE_ENABLED=true`.
- `provider=thesportsdb`.
- `tournamentId` is omitted or equals `fifa-world-cup-2026`.
- provider mapping quality is `exact match`.
- local stage is group stage or a known knockout stage:
  - `Round of 32`
  - `Round of 16`
  - `Quarterfinal`
  - `Semifinal`
  - `Third place`
  - `Final`
- playoff rows with `football-tba` are blocked.
- provider status is `FT`, `AP`, `AET`, or `PEN`.
- provider score is valid and non-null.
- playoff final score is not a draw.
- local match is not already `finished`.
- local match does not already have a stored score.

All writes go through:

```ts
applyMatchResult({
  supabaseAdmin,
  matchId,
  homeScore,
  awayScore,
  source,
  actor
})
```

That shared function recalculates predictions, verifies stale rows, rolls back
on failure, and updates the match result only through the existing server-side
result path.

## Fixture Sync Is Separate

Result sync does not fill future TBA fixtures. Fixture/TBA sync has separate
endpoints, guards, and write flag:

```txt
/api/admin/sync-fixtures-dry-run?provider=thesportsdb
/api/admin/sync-fixtures?provider=thesportsdb
FIXTURE_SYNC_WRITE_ENABLED
```

See [fixture-sync-cron.md](fixture-sync-cron.md).
