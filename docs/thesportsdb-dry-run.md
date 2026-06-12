# TheSportsDB dry-run result sync

This endpoint mode is intentionally read-only. It checks whether TheSportsDB final scores can be mapped to local World Cup 2026 matches without changing production data.

## Safety rules

- It does not update `matches`.
- It does not update `predictions`.
- It does not update `points_earned`.
- It does not update `profiles`.
- It does not create a write-mode result sync endpoint.
- It calls only public TheSportsDB read endpoints.

## Endpoint

```http
POST /api/admin/sync-results-dry-run?provider=thesportsdb
Authorization: Bearer <RESULT_SYNC_SECRET>
Content-Type: application/json
```

## Example request

```bash
curl -X POST "http://localhost:3000/api/admin/sync-results-dry-run?provider=thesportsdb" \
  -H "Authorization: Bearer $RESULT_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"from":"2026-06-11","to":"2026-06-13"}'
```

## Provider query strategy

The dry-run first reads local matches where:

```txt
tournament_id = fifa-world-cup-2026
```

It filters those matches by the requested `from` / `to` date window, skips placeholder `TBA` matches, and then queries TheSportsDB by the known local match:

1. `searchfilename.php?e=FIFA_World_Cup_{YYYY-MM-DD}_{Home}_vs_{Away}`
2. Fallback: `searchevents.php?e={Home}_vs_{Away}&s=2026`

TheSportsDB World Cup identifiers:

```txt
idLeague = 4429
season = 2026
```

## Normalized provider fields

Each found event is normalized into:

```txt
provider = thesportsdb
provider_match_id = idEvent
home_name = strHomeTeam
away_name = strAwayTeam
kickoff_utc = strTimestamp or dateEvent + strTime
status = strStatus
home_score = intHomeScore
away_score = intAwayScore
raw_status = strStatus
```

For now, only this provider state is treated as finished:

```txt
strStatus = FT
intHomeScore != null
intAwayScore != null
```

Extra-time and penalty handling is intentionally not added yet. It needs a separate read-only audit and owner approval before any write-mode design.

## Response shape

The response matches the existing API-Football dry-run shape:

- `summary`
- `safety`
- `items`
- item `action` values:
  - `would_update`
  - `skip_not_finished`
  - `skip_already_finished`
  - `conflict`
  - `unmapped`
  - `mapping_candidate`

`would_update` still writes nothing. It only means a future, separately approved write-mode flow could pass that result into the existing backend result/scoring path.

## Free-tier caution

TheSportsDB public endpoints have a free-tier rate limit. Use narrow date windows for manual validation. A full-tournament dry-run may require throttling or batching before it is safe to run regularly.

## Required manual checks before any next step

1. Review at least 10 provider mappings manually.
2. Confirm `idEvent` stability across repeated dry-runs.
3. Confirm time handling stays UTC-aligned with local `matches.start_time_utc`.
4. Confirm team-name aliases for countries where provider naming differs.
5. Keep write-mode work out of scope until owner approval.
