# Home dashboard read model

The global Home screen is an action-first overview. It keeps lobby and tournament
boundaries intact: every summary represents one `{ lobby_id, tournament_id }`
context, and predictions are never combined across lobbies.

## Actionable matches

A match is actionable when it belongs to an active, derived-incomplete tournament,
has two known participants, is scheduled, has a future `lock_time_utc`, has no
prediction by the current user in that lobby, and locks within 48 hours.

Tournament completion uses the same product rule as the lobby lifecycle UI:

- an actual tournament winner exists,
- the tournament has matches,
- every match is finished,
- every match has both scores.

A completed tournament is omitted from active Home contexts even when its
`lobby_tournaments.status` is still `active`.

## Production read path

Migration `supabase/migrations/007_home_dashboard_rpc.sql` defines
`public.get_user_home_dashboard()`.

- The function accepts no user ID and derives identity from `auth.uid()`.
- It is `SECURITY INVOKER`, so table RLS remains authoritative.
- Only `authenticated` receives execute permission.
- It returns aggregate lobby/tournament state, not prediction values or leaderboard
  data.
- It is read-only and does not modify tables or rows.

Migration 007 is deployed in production. If the RPC is unavailable in another
environment, the frontend uses a bounded batched fallback. The fallback fetches
tournaments and matches in parallel, then fetches only the current user's
prediction keys across the relevant lobbies. It does not issue one request per
lobby or expose other users' prediction values.

## Rollout

For a new environment:

1. Review and apply only `007_home_dashboard_rpc.sql` using the repository's
   controlled migration process.
2. Verify the no-argument RPC as an authenticated lobby member.
3. Compare RPC summaries with the batched fallback for the same account.
4. Verify Home, direct `Tipovat`, the `Bez tipu` filter, and lobby-scoped contexts.
