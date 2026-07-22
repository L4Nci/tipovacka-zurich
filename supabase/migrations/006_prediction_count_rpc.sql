-- =========================================================================
-- Supabase Migration: 006_prediction_count_rpc.sql
-- Description: Adds a read-only grouped prediction count RPC for lobby/tournament
--              dashboards. The function returns counts only; prediction contents
--              remain protected by existing RLS.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_lobby_tournament_prediction_counts(
  lobby_id_param TEXT,
  tournament_id_param TEXT DEFAULT NULL
)
RETURNS TABLE (
  match_id TEXT,
  prediction_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p.match_id,
    count(*)::BIGINT AS prediction_count
  FROM public.predictions p
  JOIN public.matches m ON m.id = p.match_id
  WHERE p.lobby_id = lobby_id_param
    AND (tournament_id_param IS NULL OR m.tournament_id = tournament_id_param)
  GROUP BY p.match_id
  ORDER BY p.match_id;
$$;

REVOKE ALL ON FUNCTION public.get_lobby_tournament_prediction_counts(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_lobby_tournament_prediction_counts(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.get_lobby_tournament_prediction_counts(TEXT, TEXT) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_lobby_tournament_prediction_counts(TEXT, TEXT) TO authenticated;
