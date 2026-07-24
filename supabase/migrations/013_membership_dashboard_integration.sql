-- =========================================================================
-- Supabase Migration: 013_membership_dashboard_integration.sql
-- Description: Add one membership-aware Home read model and an authoritative
--              Hall of Fame aggregate that preserves former-member history.
--
-- This migration is read-only with respect to product data. It adds functions
-- only and does not recalculate or rewrite predictions, points, or memberships.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_user_membership_dashboard()
RETURNS TABLE (
  item_type text,
  lobby_id text,
  lobby_name text,
  lobby_role text,
  join_policy text,
  request_id uuid,
  request_status text,
  membership_status text,
  pending_request_count bigint,
  event_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH caller AS (
    SELECT auth.uid() AS user_id
  ),
  own_requests AS (
    SELECT
      'join_request'::text AS item_type,
      request.lobby_id,
      lobby.name AS lobby_name,
      NULL::text AS lobby_role,
      lobby.join_policy,
      request.id AS request_id,
      request.status AS request_status,
      NULL::text AS membership_status,
      0::bigint AS pending_request_count,
      COALESCE(request.resolved_at, request.created_at) AS event_at
    FROM caller
    JOIN public.lobby_join_requests AS request
      ON request.user_id = caller.user_id
    JOIN public.lobbies AS lobby
      ON lobby.id = request.lobby_id
    WHERE caller.user_id IS NOT NULL
      AND (
        request.status = 'pending'
        OR (
          request.status IN ('approved', 'rejected')
          AND request.resolved_at >= now() - interval '7 days'
        )
      )
  ),
  membership_events AS (
    SELECT
      'membership'::text AS item_type,
      membership.lobby_id,
      lobby.name AS lobby_name,
      CASE
        WHEN lobby.owner_id = membership.user_id THEN 'owner'
        WHEN membership.role = 'admin' THEN 'admin'
        ELSE 'member'
      END AS lobby_role,
      lobby.join_policy,
      NULL::uuid AS request_id,
      NULL::text AS request_status,
      membership.membership_status,
      0::bigint AS pending_request_count,
      membership.ended_at AS event_at
    FROM caller
    JOIN public.lobby_members AS membership
      ON membership.user_id = caller.user_id
    JOIN public.lobbies AS lobby
      ON lobby.id = membership.lobby_id
    WHERE caller.user_id IS NOT NULL
      AND membership.membership_status IN ('removed', 'left')
      AND membership.ended_at >= now() - interval '7 days'
  ),
  management_items AS (
    SELECT
      'management'::text AS item_type,
      lobby.id AS lobby_id,
      lobby.name AS lobby_name,
      CASE
        WHEN lobby.owner_id = caller.user_id THEN 'owner'
        ELSE 'admin'
      END AS lobby_role,
      lobby.join_policy,
      NULL::uuid AS request_id,
      NULL::text AS request_status,
      NULL::text AS membership_status,
      count(request.id)::bigint AS pending_request_count,
      max(request.created_at) AS event_at
    FROM caller
    JOIN public.lobbies AS lobby
      ON (
        lobby.owner_id = caller.user_id
        OR EXISTS (
          SELECT 1
          FROM public.lobby_members AS manager_membership
          WHERE manager_membership.lobby_id = lobby.id
            AND manager_membership.user_id = caller.user_id
            AND manager_membership.role = 'admin'
            AND manager_membership.membership_status = 'active'
        )
      )
    JOIN public.lobby_join_requests AS request
      ON request.lobby_id = lobby.id
      AND request.status = 'pending'
    WHERE caller.user_id IS NOT NULL
    GROUP BY
      caller.user_id,
      lobby.id,
      lobby.name,
      lobby.owner_id,
      lobby.join_policy
  )
  SELECT * FROM own_requests
  UNION ALL
  SELECT * FROM membership_events
  UNION ALL
  SELECT * FROM management_items
  ORDER BY event_at DESC, item_type, lobby_id, request_id;
$$;

REVOKE ALL ON FUNCTION public.get_user_membership_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_membership_dashboard() FROM anon;
REVOKE ALL ON FUNCTION public.get_user_membership_dashboard() FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_user_membership_dashboard() TO authenticated;

-- Historical rankings are derived from authoritative stored points across
-- completed lobby tournaments. No current lobby_members row is required for a
-- player to remain in the result.
CREATE OR REPLACE FUNCTION public.get_lobby_hall_of_fame(lobby_id_param text)
RETURNS TABLE (
  player_id uuid,
  username text,
  avatar_emoji text,
  avatar_bg text,
  total_points bigint,
  completed_tournaments_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH authorized AS (
    SELECT (
      public.is_lobby_member(lobby_id_param)
      OR public.is_admin()
    ) AS allowed
  ),
  completed_tournaments AS (
    SELECT relation.tournament_id
    FROM public.lobby_tournaments AS relation
    JOIN public.tournaments AS tournament
      ON tournament.id = relation.tournament_id
    CROSS JOIN authorized
    WHERE authorized.allowed
      AND relation.lobby_id = lobby_id_param
      AND tournament.actual_tournament_winner_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.matches AS match
        WHERE match.tournament_id = relation.tournament_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.matches AS match
        WHERE match.tournament_id = relation.tournament_id
          AND (
            match.status <> 'finished'
            OR match.home_score IS NULL
            OR match.away_score IS NULL
          )
      )
  ),
  scored_activity AS (
    SELECT
      prediction.user_id,
      match.tournament_id,
      prediction.points_earned::bigint AS points
    FROM public.predictions AS prediction
    JOIN public.matches AS match
      ON match.id = prediction.match_id
    JOIN completed_tournaments AS completed
      ON completed.tournament_id = match.tournament_id
    WHERE prediction.lobby_id = lobby_id_param

    UNION ALL

    SELECT
      prediction.user_id,
      prediction.tournament_id,
      prediction.points_earned::bigint AS points
    FROM public.longterm_predictions AS prediction
    JOIN completed_tournaments AS completed
      ON completed.tournament_id = prediction.tournament_id
    WHERE prediction.lobby_id = lobby_id_param
  ),
  totals AS (
    SELECT
      activity.user_id,
      sum(activity.points)::bigint AS total_points,
      count(DISTINCT activity.tournament_id)::bigint
        AS completed_tournaments_count
    FROM scored_activity AS activity
    GROUP BY activity.user_id
  )
  SELECT
    totals.user_id,
    profile.username,
    profile.avatar_emoji,
    profile.avatar_bg,
    totals.total_points,
    totals.completed_tournaments_count
  FROM totals
  JOIN public.profiles AS profile
    ON profile.id = totals.user_id
  ORDER BY
    totals.total_points DESC,
    profile.username,
    totals.user_id;
$$;

REVOKE ALL ON FUNCTION public.get_lobby_hall_of_fame(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_lobby_hall_of_fame(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_lobby_hall_of_fame(text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_lobby_hall_of_fame(text) TO authenticated;
