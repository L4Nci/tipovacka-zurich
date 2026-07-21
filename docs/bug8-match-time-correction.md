# BUG 8 Match Time Correction

> Historical correction note. This documents a specific past match-time repair.
> Current match times and sync behavior must be verified against Supabase and
> current provider/sync code.

## Root Cause

The FIFA World Cup 2026 group-stage seed data had shuffled and partially stale match schedule rows. Some entries had correct teams but wrong UTC kickoff times, while later rows also had incorrect stage/team ordering relative to the verified fixture order.

## Source of Truth

The approved audit report `BUG 8 Match Time Audit` supplied the replacement group-stage rows. Those rows were checked against the public FIFA 2026 schedule feed from `wc.dcs.pm`, using UTC values equivalent to the Czech local schedule converted from CEST.

## Time Conversion Rule

The source schedule is in Czech local summer time, CEST, which is UTC+2.

- `21:00 CEST` -> `19:00Z`
- `04:00 CEST` -> `02:00Z`
- `00:00 CEST` -> previous day `22:00Z`
- `01:00 CEST` -> previous day `23:00Z`

All database `start_time_utc` values remain stored as UTC timestamps with `Z`.

## Correction Scope

- Corrected exactly 72 group-stage rows: `fwc2026-g001` through `fwc2026-g072`.
- Preserved all playoff placeholder rows unchanged: `fwc2026-r32-*`, `fwc2026-r16-*`, `fwc2026-qf-*`, `fwc2026-sf-*`, `fwc2026-third-place`, and `fwc2026-final`.
- Kept `provider_name` and `provider_match_id` stable so existing match identity remains stable.
- Did not delete predictions.
- Did not change database schema.

## Files Updated

- `supabase/seed/world_cup_2026_matches.csv`
- `supabase/seed/import_matches.sql`

The import SQL continues to derive `lock_time_utc` from `start_time_utc - interval '5 minutes'` during the upsert.
