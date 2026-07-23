-- =========================================================================
-- Supabase Migration: 007_home_dashboard_rpc.sql
-- Description: Authenticated, read-only home dashboard summaries.
-- The caller identity is always derived from auth.uid(); no user id is accepted.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_user_home_dashboard()
RETURNS TABLE (
  lobby_id TEXT,
  lobby_name TEXT,
  lobby_role TEXT,
  member_count BIGINT,
  tournament_id TEXT,
  tournament_name TEXT,
  tournament_status TEXT,
  is_completed BOOLEAN,
  actionable_match_count BIGINT,
  next_actionable_lock_time TIMESTAMPTZ,
  next_missing_lock_time TIMESTAMPTZ,
  all_known_unlocked_predicted BOOLEAN,
  schedule_state TEXT,
  requires_owner_attention BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH request_user AS (
    SELECT auth.uid() AS user_id
  ),
  contexts AS (
    SELECT
      lm.user_id,
      l.id AS lobby_id,
      l.name AS lobby_name,
      lm.role AS lobby_role,
      (
        SELECT count(*)::BIGINT
        FROM public.lobby_members members
        WHERE members.lobby_id = l.id
      ) AS member_count,
      lt.tournament_id,
      t.name AS tournament_name,
      lt.status AS tournament_status,
      t.actual_tournament_winner_id
    FROM request_user ru
    JOIN public.lobby_members lm ON lm.user_id = ru.user_id
    JOIN public.lobbies l ON l.id = lm.lobby_id
    JOIN public.lobby_tournaments lt ON lt.lobby_id = l.id
    JOIN public.tournaments t ON t.id = lt.tournament_id
    WHERE ru.user_id IS NOT NULL
      AND lt.status = 'active'
  ),
  stats AS (
    SELECT
      c.user_id,
      c.lobby_id,
      c.lobby_name,
      c.lobby_role,
      c.member_count,
      c.tournament_id,
      c.tournament_name,
      c.tournament_status,
      c.actual_tournament_winner_id,
      count(m.id)::BIGINT AS total_matches,
      count(m.id) FILTER (
        WHERE m.status <> 'finished' OR m.home_score IS NULL OR m.away_score IS NULL
      )::BIGINT AS unresolved_matches,
      count(m.id) FILTER (
        WHERE m.status = 'scheduled'
          AND m.lock_time_utc > now()
          AND lower(m.home_participant_id) !~ '(^|-)tba($|-)'
          AND lower(m.away_participant_id) !~ '(^|-)tba($|-)'
      )::BIGINT AS known_future_matches,
      count(m.id) FILTER (
        WHERE m.status = 'scheduled'
          AND m.lock_time_utc > now()
          AND lower(m.home_participant_id) !~ '(^|-)tba($|-)'
          AND lower(m.away_participant_id) !~ '(^|-)tba($|-)'
          AND p.match_id IS NULL
      )::BIGINT AS missing_future_matches,
      count(m.id) FILTER (
        WHERE m.status = 'scheduled'
          AND m.lock_time_utc > now()
          AND m.lock_time_utc <= now() + interval '48 hours'
          AND lower(m.home_participant_id) !~ '(^|-)tba($|-)'
          AND lower(m.away_participant_id) !~ '(^|-)tba($|-)'
          AND p.match_id IS NULL
      )::BIGINT AS actionable_matches,
      min(m.lock_time_utc) FILTER (
        WHERE m.status = 'scheduled'
          AND m.lock_time_utc > now()
          AND m.lock_time_utc <= now() + interval '48 hours'
          AND lower(m.home_participant_id) !~ '(^|-)tba($|-)'
          AND lower(m.away_participant_id) !~ '(^|-)tba($|-)'
          AND p.match_id IS NULL
      ) AS next_actionable_lock,
      min(m.lock_time_utc) FILTER (
        WHERE m.status = 'scheduled'
          AND m.lock_time_utc > now()
          AND lower(m.home_participant_id) !~ '(^|-)tba($|-)'
          AND lower(m.away_participant_id) !~ '(^|-)tba($|-)'
          AND p.match_id IS NULL
      ) AS next_missing_lock,
      count(m.id) FILTER (
        WHERE m.status = 'scheduled'
          AND m.lock_time_utc > now()
          AND (
            lower(m.home_participant_id) ~ '(^|-)tba($|-)'
            OR lower(m.away_participant_id) ~ '(^|-)tba($|-)'
          )
      )::BIGINT AS future_tba_matches
    FROM contexts c
    LEFT JOIN public.matches m ON m.tournament_id = c.tournament_id
    LEFT JOIN public.predictions p
      ON p.user_id = c.user_id
      AND p.lobby_id = c.lobby_id
      AND p.match_id = m.id
    GROUP BY
      c.user_id,
      c.lobby_id,
      c.lobby_name,
      c.lobby_role,
      c.member_count,
      c.tournament_id,
      c.tournament_name,
      c.tournament_status,
      c.actual_tournament_winner_id
  ),
  classified AS (
    SELECT
      stats.*,
      (
        actual_tournament_winner_id IS NOT NULL
        AND total_matches > 0
        AND unresolved_matches = 0
      ) AS completed,
      CASE
        WHEN actual_tournament_winner_id IS NOT NULL
          AND total_matches > 0
          AND unresolved_matches = 0 THEN 'completed'
        WHEN known_future_matches > 0 THEN 'ready'
        WHEN total_matches = 0 OR future_tba_matches > 0 THEN 'schedule_pending'
        WHEN unresolved_matches > 0 THEN 'waiting_results'
        ELSE 'completion_pending'
      END AS derived_schedule_state
    FROM stats
  )
  SELECT
    lobby_id,
    lobby_name,
    lobby_role,
    member_count,
    tournament_id,
    tournament_name,
    tournament_status,
    completed AS is_completed,
    actionable_matches AS actionable_match_count,
    next_actionable_lock AS next_actionable_lock_time,
    next_missing_lock AS next_missing_lock_time,
    (known_future_matches > 0 AND missing_future_matches = 0) AS all_known_unlocked_predicted,
    derived_schedule_state AS schedule_state,
    (
      lobby_role IN ('owner', 'admin')
      AND derived_schedule_state IN ('schedule_pending', 'completion_pending')
    ) AS requires_owner_attention
  FROM classified
  ORDER BY lobby_name, tournament_name, lobby_id, tournament_id;
$$;

REVOKE ALL ON FUNCTION public.get_user_home_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_home_dashboard() FROM anon;
REVOKE ALL ON FUNCTION public.get_user_home_dashboard() FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_user_home_dashboard() TO authenticated;
