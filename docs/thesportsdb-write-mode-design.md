# TheSportsDB write-mode design, group stage only

> Historical document. This describes the earlier group-stage-only write-mode
> design. It is not the current production source of truth. Current result sync
> behavior, including playoff support and AP/AET/PEN handling, is documented in
> [thesportsdb-dry-run.md](thesportsdb-dry-run.md) and implemented in
> `server/lib/resultSync.ts`.

The write endpoint exists, but it is disabled by default. It must not write unless `RESULT_SYNC_WRITE_ENABLED=true`.

## Scope

Provider:

```txt
thesportsdb
```

Tournament:

```txt
fifa-world-cup-2026
```

Allowed match scope:

```txt
Group stage only
```

Out of scope:

- knockout placeholder/TBA matches
- extra-time or penalty-specific logic
- overwriting finished local matches
- direct prediction updates outside the existing result application flow
- direct points updates
- schema changes

## Team aliases

The dry-run mapper must treat this naming variant as the same team:

```txt
Bosnia-Herzegovina = Bosnia and Herzegovina
```

The alias belongs in provider/mapping code, not in production data. It is a read-time normalization rule only.

## Endpoint shape

Endpoint:

```http
POST /api/admin/sync-results?provider=thesportsdb
Authorization: Bearer <RESULT_SYNC_SECRET>
Content-Type: application/json
```

Example body:

```json
{
  "from": "2026-06-11",
  "to": "2026-06-13"
}
```

## Required guards

The endpoint must reject unless all of these are true:

- `RESULT_SYNC_SECRET` is configured.
- request authorization matches `RESULT_SYNC_SECRET`.
- `RESULT_SYNC_WRITE_ENABLED=true`.
- `provider=thesportsdb`.
- `tournamentId` is omitted or equals `fifa-world-cup-2026`.
- local match is group-stage only.
- provider mapping quality is `exact match`.
- provider status is exactly `FT`.
- provider `home_score` and `away_score` are integers.
- local match status is not `finished`.
- local match does not already have `home_score` and `away_score`.
- no mapping conflicts exist for the provider item.

If any item fails a guard, the endpoint must skip it and report why. It must never partially overwrite a finished result.

When `RESULT_SYNC_WRITE_ENABLED` is not exactly `true`, the endpoint returns before fetching local matches or provider data:

```txt
write_enabled = false
wrote_to_db = false
matches_updated = 0
predictions_updated = 0
points_updated = 0
profiles_updated = 0
```

## Shared result application

The current manual admin result logic is shared through one internal server-side function:

```ts
applyMatchResult({
  matchId,
  homeScore,
  awayScore,
  source,
  actor
})
```

Required behavior:

- read match by `matchId`
- validate football/hockey draw rules exactly as today
- read predictions for the match
- calculate points through the existing centralized `calculatePoints`
- update predictions through the same verified flow as the manual endpoint
- update the match result only after prediction recalculation verifies cleanly
- rollback prediction points if match update fails
- return the same safety/verification metadata used by the manual endpoint

Manual admin endpoint and future sync endpoint must both call this function. The sync endpoint must not write predictions directly and must not duplicate scoring logic.

## Proposed write flow

1. Validate secret and write-enabled flag.
2. Fetch local World Cup matches read-only.
3. Fetch TheSportsDB events read-only for the requested date window.
4. Normalize provider fields.
5. Map provider events to local matches.
6. Filter to group-stage exact matches only.
7. Filter to provider `FT` with integer scores.
8. Skip finished/scored local matches.
9. For each remaining item, call `applyMatchResult`.
10. Return per-item result:
    - `updated`
    - `skipped`
    - `conflict`
    - `failed`

## Response requirements

The write response should include:

- `success`
- `mode = "write"`
- `provider = "thesportsdb"`
- `write_enabled = true`
- `summary`
- `items`
- `safety`

Safety counters must include:

```txt
matches_updated
predictions_updated
points_recalculated
profiles_updated = 0
direct_prediction_writes = false
direct_points_writes = false
```

## n8n workflow design

Recommended schedule:

- trigger every 30 minutes during group-stage match days
- call dry-run endpoint first
- continue only if dry-run has:
  - `conflicts = 0`
  - `unmapped = 0`
  - at least one `would_update`
- call write endpoint only when `RESULT_SYNC_WRITE_ENABLED=true`
- send summary notification after each run
- alert immediately on conflict, unmapped, failed write, or unexpected provider error

Suggested n8n nodes:

1. Cron trigger.
2. Set date window from current UTC date plus small lookback.
3. HTTP request to `/api/admin/sync-results-dry-run?provider=thesportsdb`.
4. IF node: stop unless `would_update > 0` and `conflicts = 0` and `unmapped = 0`.
5. HTTP request to `/api/admin/sync-results?provider=thesportsdb`.
6. IF node: check write summary failures.
7. Notification node with dry-run/write summary.

Recommended date window:

```txt
from = yesterday UTC date
to = today UTC date
```

This avoids scanning the whole tournament and keeps TheSportsDB free-tier usage low.

## Risks

- TheSportsDB status semantics for extra time/penalties need separate audit.
- Knockout matches cannot be safely mapped while local rows are TBA placeholders.
- Provider data could correct a score after first publication, but the write endpoint must not overwrite finished local matches automatically.
- Rate limits require narrow windows and n8n throttling.
- Any write-mode deployment needs manual review, backup plan, and owner approval.
