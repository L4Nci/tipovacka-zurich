# Prediction Counts RPC

Current production dashboards need per-match prediction counts, but they do not need to download prediction contents for this count.

## Function

`public.get_lobby_tournament_prediction_counts(lobby_id_param text, tournament_id_param text default null)`

Returns:

```json
[
  {
    "match_id": "manual-fifa-2026-fwc2026-g001",
    "prediction_count": 11
  }
]
```

## Security

- The function is `SECURITY INVOKER`.
- Existing `predictions` RLS still applies.
- Only the `authenticated` role is granted `EXECUTE`.
- The function returns grouped counts only, not prediction contents.
- Counts are scoped by `lobby_id` and, when supplied, by `tournament_id`.

## Rollout

The frontend calls the RPC from `fetchLobbyDashboard`.

If the RPC is missing during deployment rollout, the app falls back to the previous client-side grouped count query and logs one warning. Other RPC errors are not swallowed.

Deploy migration `supabase/migrations/006_prediction_count_rpc.sql` before removing the fallback.
