# API-Football dry-run result sync

> Historical document. API-Football is not the current production result-sync
> provider. The current provider is TheSportsDB; see
> [thesportsdb-dry-run.md](thesportsdb-dry-run.md). This file is kept only as
> provider research and historical mapping context.

This endpoint is intentionally read-only. It is for fixture mapping and result-sync readiness checks only.

## Safety rules

- It does not update `matches`.
- It does not update `predictions`.
- It does not update `points_earned`.
- It does not update `profiles`.
- It does not create a write-mode result sync endpoint.
- It never stores the API-Football key in the repository.

## Endpoint

```http
POST /api/admin/sync-results-dry-run
Authorization: Bearer <RESULT_SYNC_SECRET>
Content-Type: application/json
```

## Required server environment variables

```txt
RESULT_SYNC_SECRET=<long random scheduler/admin secret>
API_FOOTBALL_KEY=<API-Football key>
API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io # optional override
```

## Default API-Football query

The endpoint defaults to the World Cup 2026 setup:

```http
GET https://v3.football.api-sports.io/fixtures?league=1&season=2026
```

Optional request body fields can narrow the provider request:

```json
{
  "from": "2026-06-11",
  "to": "2026-06-13",
  "fixtureIds": [123456, 789012]
}
```

If `fixtureIds` is present, the endpoint sends API-Football `ids` as a dash-separated list.

## Mapping behavior

The dry-run compares API fixtures with local `matches` where:

```txt
tournament_id = fifa-world-cup-2026
```

It checks, in order:

1. `matches.provider_match_id` equals API-Football `fixture.id`, if the local column exists.
2. Kickoff time closeness against `matches.start_time_utc`.
3. API home/away team names against local participant `name`, `short_name`, and `id`.

The response classifies mapping as:

- `exact match`
- `likely match`
- `no match`
- `conflict`

## Finished statuses

The dry-run treats these API-Football statuses as finished:

```txt
FT, AET, PEN
```

For `PEN`, the response includes both the regular API score details and a derived `api_score` with `source = goals_plus_penalty` when penalty data is available.

## Actions returned

Each fixture gets exactly one action:

- `mapping_candidate`
- `would_update`
- `skip_not_finished`
- `skip_already_finished`
- `conflict`
- `unmapped`

`would_update` still writes nothing. It only means a future write-mode endpoint could pass this fixture into the existing backend result/scoring flow after separate approval.

## Example request

```bash
curl -X POST "$APP_URL/api/admin/sync-results-dry-run" \
  -H "Authorization: Bearer $RESULT_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"from":"2026-06-11","to":"2026-06-13"}'
```

## Example response shape

```json
{
  "success": true,
  "mode": "dry_run",
  "dry_run": true,
  "wrote_to_db": false,
  "provider": "api-football",
  "summary": {
    "api_fixtures_received": 8,
    "local_matches_checked": 104,
    "exact_matches": 1,
    "likely_matches": 3,
    "conflicts": 0,
    "unmapped": 4,
    "would_update": 1,
    "skip_not_finished": 6,
    "skip_already_finished": 1
  },
  "safety": {
    "db_writes_performed": false,
    "matches_updated": 0,
    "predictions_updated": 0,
    "points_updated": 0,
    "profiles_updated": 0,
    "write_mode_endpoint_created": false
  },
  "items": [
    {
      "api_fixture_id": 123456,
      "api_home": "Team A",
      "api_away": "Team B",
      "api_kickoff_utc": "2026-06-12T19:00:00+00:00",
      "api_status": {
        "short": "FT",
        "long": "Match Finished",
        "is_finished": true
      },
      "api_score": {
        "home": 2,
        "away": 1,
        "source": "goals"
      },
      "mapping_quality": "likely match",
      "matched_local_match_id": "match-abc",
      "local_provider_match_id": null,
      "local_home": "Team A",
      "local_away": "Team B",
      "local_start_time_utc": "2026-06-12T19:00:00+00:00",
      "action": "would_update",
      "reason": "Dry-run only: finished API fixture maps to an unfinished local match and would be eligible for the existing result flow later."
    }
  ]
}
```

## Next required manual checks

Before any write-mode work:

1. Viktor must review 5-10 dry-run mappings manually.
2. Confirm whether `matches.provider_match_id` exists in production Supabase.
3. Confirm how penalty shootout results should be represented in this app's scoring UX.
4. Approve any DB schema or mapping changes separately.
