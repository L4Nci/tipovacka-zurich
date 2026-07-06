# Fixture sync cron setup

The fixture sync endpoint fills future playoff `football-tba` placeholders from
TheSportsDB after fixtures are published. It is separate from result sync and
does not update scores, statuses, predictions, points, or match IDs.

## Production env

Set in Netlify:

```txt
FIXTURE_SYNC_WRITE_ENABLED=true
```

The endpoint also requires the existing secret:

```txt
RESULT_SYNC_SECRET=<production secret>
```

Keep `FIXTURE_SYNC_WRITE_ENABLED` unset or `false` until the dry-run response is
clean and the owner approves automatic fixture fills.

## Cron

Run every 1 hour.

```txt
POST https://tipovacka-fotbal.netlify.app/api/admin/sync-fixtures?provider=thesportsdb
```

Headers:

```txt
Authorization: Bearer <RESULT_SYNC_SECRET>
Content-Type: application/json
```

Body:

```json
{}
```

## Safety contract

The write endpoint may update only these `matches` fields:

- `home_participant_id`
- `away_participant_id`
- `start_time_utc`
- `lock_time_utc`
- `provider_name`
- `provider_match_id`
- `updated_at`

It must never update:

- `matches.id`
- `matches.status`
- `matches.home_score`
- `matches.away_score`
- `predictions`
- `points_earned`
- scoring logic
- result sync behavior

Required guards:

- `RESULT_SYNC_SECRET` must match.
- `FIXTURE_SYNC_WRITE_ENABLED` must be exactly `true`.
- `provider` must be `thesportsdb`.
- local match must be a supported playoff stage.
- local match must be `scheduled`.
- local match must have no stored score.
- local match must still contain `football-tba`.
- provider fixture must not be finished.
- provider fixture must have `idEvent`.
- provider kickoff must parse to UTC.
- provider teams must map exactly to `participants`.
- dry-run item action must be `would_update`.
- mapping confidence must be `100`.

## Dry-run check

Before enabling cron, run:

```txt
POST https://tipovacka-fotbal.netlify.app/api/admin/sync-fixtures-dry-run?provider=thesportsdb
```

Use the same headers and `{}` body. Confirm:

- `wrote_to_db = false`
- `conflicts = 0`
- every `would_update` item is expected
- `skip_missing_provider` only covers fixtures not yet published

## Separation from result sync

Fixture sync endpoint:

```txt
/api/admin/sync-fixtures?provider=thesportsdb
```

Result sync endpoint:

```txt
/api/admin/sync-results?provider=thesportsdb
```

These endpoints are separate Netlify Functions and use separate write flags:

- fixture sync: `FIXTURE_SYNC_WRITE_ENABLED`
- result sync: `RESULT_SYNC_WRITE_ENABLED`
