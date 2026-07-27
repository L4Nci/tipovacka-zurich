-- Lobby tournament management remains an organizational layer over the
-- existing global tournaments and derived completion state.

CREATE OR REPLACE FUNCTION public.get_lobby_tournament_catalog(lobby_id_param text)
RETURNS TABLE (
  tournament_id text,
  tournament_name text,
  sport_id text,
  relation_status text,
  is_linked boolean,
  is_completed boolean,
  match_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_lobby_member(lobby_id_param)
    OR public.is_admin()
  ) THEN
    RAISE EXCEPTION 'Lobby membership required.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    tournament.id,
    tournament.name,
    tournament.sport_id,
    relation.status,
    relation.id IS NOT NULL,
    (
      tournament.actual_tournament_winner_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.matches AS match
        WHERE match.tournament_id = tournament.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.matches AS match
        WHERE match.tournament_id = tournament.id
          AND (
            match.status <> 'finished'
            OR match.home_score IS NULL
            OR match.away_score IS NULL
          )
      )
    ),
    (
      SELECT COUNT(*) FROM public.matches AS match
      WHERE match.tournament_id = tournament.id
    )
  FROM public.tournaments AS tournament
  LEFT JOIN public.lobby_tournaments AS relation
    ON relation.lobby_id = lobby_id_param
    AND relation.tournament_id = tournament.id
  WHERE tournament.status <> 'hidden'
  ORDER BY relation.id IS NULL, tournament.created_at DESC, tournament.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_tournament_to_lobby_secure(
  lobby_id_param text,
  tournament_id_param text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_lobby_owner(lobby_id_param)
    OR public.is_admin()
  ) THEN
    RAISE EXCEPTION 'Only the lobby owner can add a tournament.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tournaments
    WHERE id = tournament_id_param
      AND status <> 'hidden'
  ) THEN
    RAISE EXCEPTION 'Tournament not found.'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.lobby_tournaments (lobby_id, tournament_id, status)
  VALUES (lobby_id_param, tournament_id_param, 'active')
  ON CONFLICT (lobby_id, tournament_id) DO UPDATE
  SET status = 'active', updated_at = now();

  RETURN 'active';
END;
$$;

CREATE OR REPLACE FUNCTION public.set_lobby_tournament_status_secure(
  lobby_id_param text,
  tournament_id_param text,
  status_param text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  IF status_param NOT IN ('active', 'archived') THEN
    RAISE EXCEPTION 'Invalid lobby tournament status.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_lobby_owner(lobby_id_param)
    OR public.is_admin()
  ) THEN
    RAISE EXCEPTION 'Only the lobby owner can manage tournaments.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.lobby_tournaments
  SET status = status_param, updated_at = now()
  WHERE lobby_id = lobby_id_param
    AND tournament_id = tournament_id_param;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lobby tournament relation not found.'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN status_param;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_lobby_field_secure(
  lobby_id_param text,
  field_param text,
  value_param text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_value text := btrim(COALESCE(value_param, ''));
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_lobby_owner(lobby_id_param)
    OR public.is_admin()
  ) THEN
    RAISE EXCEPTION 'Only the lobby owner can update lobby details.'
      USING ERRCODE = '42501';
  END IF;

  IF field_param NOT IN ('name', 'short_description', 'long_description') THEN
    RAISE EXCEPTION 'Unsupported lobby field.'
      USING ERRCODE = '22023';
  END IF;

  IF field_param = 'name' AND (
    char_length(normalized_value) < 2
    OR char_length(normalized_value) > 80
  ) THEN
    RAISE EXCEPTION 'Lobby name must contain 2 to 80 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF field_param = 'short_description' AND char_length(normalized_value) > 120 THEN
    RAISE EXCEPTION 'Short description must contain at most 120 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF field_param = 'long_description' AND char_length(normalized_value) > 4000 THEN
    RAISE EXCEPTION 'Lobby description must contain at most 4000 characters.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.lobbies
  SET
    name = CASE WHEN field_param = 'name' THEN normalized_value ELSE name END,
    short_description = CASE
      WHEN field_param = 'short_description' THEN NULLIF(normalized_value, '')
      ELSE short_description
    END,
    long_description = CASE
      WHEN field_param = 'long_description' THEN NULLIF(normalized_value, '')
      ELSE long_description
    END
  WHERE id = lobby_id_param;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lobby not found.'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'field', field_param,
    'value', CASE WHEN normalized_value = '' THEN NULL ELSE normalized_value END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_lobby_tournament_catalog(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lobby_tournament_catalog(text) TO authenticated;
REVOKE ALL ON FUNCTION public.add_tournament_to_lobby_secure(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_tournament_to_lobby_secure(text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_lobby_tournament_status_secure(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_lobby_tournament_status_secure(text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.update_lobby_field_secure(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_lobby_field_secure(text, text, text) TO authenticated;
