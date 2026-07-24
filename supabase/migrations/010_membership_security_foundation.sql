-- =========================================================================
-- Supabase Migration: 010_membership_security_foundation.sql
-- Description: Additive atomic lobby RPCs, prediction guards, and owner-derived
--              read behavior. Direct legacy create/join paths remain available
--              until 010b_membership_security_enforcement.sql is deployed.
--
-- This migration does not rewrite existing lobby, membership, prediction, or
-- scoring rows. Lobby ownership is derived from lobbies.owner_id.
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Supabase's historical default grants include DDL-like table privileges that
-- the Data API clients do not need. RLS does not protect TRUNCATE.
REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON public.lobbies,
     public.lobby_members,
     public.lobby_tournaments,
     public.predictions,
     public.longterm_predictions
  FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_lobby_secure(
  lobby_name_param text,
  tournament_id_param text,
  visibility_param text DEFAULT 'public',
  short_description_param text DEFAULT NULL,
  long_description_param text DEFAULT NULL
)
RETURNS TABLE (
  id text,
  name text,
  owner_id uuid,
  tournament_id text,
  short_description text,
  long_description text,
  join_code text,
  visibility text,
  created_at timestamptz,
  tournament_name text,
  is_owner boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  generated_id text;
  generated_code text;
  attempt integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  IF length(btrim(COALESCE(lobby_name_param, ''))) < 2
    OR length(btrim(lobby_name_param)) > 80 THEN
    RAISE EXCEPTION 'Lobby name must contain 2 to 80 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF visibility_param NOT IN ('private', 'public') THEN
    RAISE EXCEPTION 'Invalid lobby visibility.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tournaments
    WHERE tournaments.id = tournament_id_param
  ) THEN
    RAISE EXCEPTION 'Tournament not found.'
      USING ERRCODE = '23503';
  END IF;

  FOR attempt IN 1..10 LOOP
    generated_id := 'lobby-' || encode(extensions.gen_random_bytes(12), 'hex');
    generated_code := upper(encode(extensions.gen_random_bytes(8), 'hex'));

    BEGIN
      INSERT INTO public.lobbies (
        id,
        name,
        owner_id,
        tournament_id,
        short_description,
        long_description,
        join_code,
        visibility
      )
      VALUES (
        generated_id,
        btrim(lobby_name_param),
        caller_id,
        tournament_id_param,
        NULLIF(btrim(short_description_param), ''),
        NULLIF(btrim(long_description_param), ''),
        generated_code,
        visibility_param
      );
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF attempt = 10 THEN
          RAISE;
        END IF;
    END;
  END LOOP;

  INSERT INTO public.lobby_tournaments (lobby_id, tournament_id, status)
  VALUES (generated_id, tournament_id_param, 'active');

  INSERT INTO public.lobby_members (lobby_id, user_id, role)
  VALUES (generated_id, caller_id, 'member');

  RETURN QUERY
  SELECT
    lobby.id,
    lobby.name,
    lobby.owner_id,
    lobby.tournament_id,
    lobby.short_description,
    lobby.long_description,
    lobby.join_code,
    lobby.visibility,
    lobby.created_at,
    tournament.name,
    true
  FROM public.lobbies AS lobby
  JOIN public.tournaments AS tournament
    ON tournament.id = lobby.tournament_id
  WHERE lobby.id = generated_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_lobby_secure(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_lobby_secure(text, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.create_lobby_secure(text, text, text, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.create_lobby_secure(text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_lobby_secure(join_code_param text)
RETURNS TABLE (
  membership_state text,
  id text,
  name text,
  owner_id uuid,
  tournament_id text,
  short_description text,
  long_description text,
  join_code text,
  visibility text,
  created_at timestamptz,
  tournament_name text,
  is_owner boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  normalized_code text := upper(btrim(COALESCE(join_code_param, '')));
  target_lobby public.lobbies%ROWTYPE;
  result_state text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  IF normalized_code = '' OR length(normalized_code) > 128 THEN
    RAISE EXCEPTION 'Lobby not found.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT lobby.*
  INTO target_lobby
  FROM public.lobbies AS lobby
  WHERE lobby.join_code = normalized_code
  LIMIT 1;

  IF target_lobby.id IS NULL THEN
    RAISE EXCEPTION 'Lobby not found.'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.lobby_members (lobby_id, user_id, role)
  VALUES (target_lobby.id, caller_id, 'member')
  ON CONFLICT (lobby_id, user_id) DO NOTHING;

  IF FOUND THEN
    result_state := 'joined';
  ELSE
    result_state := 'already_member';
  END IF;

  RETURN QUERY
  SELECT
    result_state,
    lobby.id,
    lobby.name,
    lobby.owner_id,
    lobby.tournament_id,
    lobby.short_description,
    lobby.long_description,
    lobby.join_code,
    lobby.visibility,
    lobby.created_at,
    tournament.name,
    lobby.owner_id = caller_id
  FROM public.lobbies AS lobby
  JOIN public.tournaments AS tournament
    ON tournament.id = lobby.tournament_id
  WHERE lobby.id = target_lobby.id;
END;
$$;

REVOKE ALL ON FUNCTION public.join_lobby_secure(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_lobby_secure(text) FROM anon;
REVOKE ALL ON FUNCTION public.join_lobby_secure(text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.join_lobby_secure(text) TO authenticated;

-- Client-facing writes may never authoritatively set scoring columns. The
-- trusted result-sync and tournament-winner paths use service_role and therefore
-- retain their existing deterministic points updates.
CREATE OR REPLACE FUNCTION public.protect_prediction_points_earned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.points_earned := 0;
    ELSE
      NEW.points_earned := OLD.points_earned;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_prediction_points_earned() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_prediction_points_earned() FROM anon;
REVOKE ALL ON FUNCTION public.protect_prediction_points_earned() FROM authenticated;
REVOKE ALL ON FUNCTION public.protect_prediction_points_earned() FROM service_role;
GRANT EXECUTE ON FUNCTION public.protect_prediction_points_earned() TO postgres;

DROP TRIGGER IF EXISTS protect_prediction_points_earned ON public.predictions;
CREATE TRIGGER protect_prediction_points_earned
  BEFORE INSERT OR UPDATE ON public.predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_prediction_points_earned();

CREATE OR REPLACE FUNCTION public.protect_longterm_prediction_points_earned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.points_earned := 0;
    ELSE
      NEW.points_earned := OLD.points_earned;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_longterm_prediction_points_earned() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_longterm_prediction_points_earned() FROM anon;
REVOKE ALL ON FUNCTION public.protect_longterm_prediction_points_earned() FROM authenticated;
REVOKE ALL ON FUNCTION public.protect_longterm_prediction_points_earned() FROM service_role;
GRANT EXECUTE ON FUNCTION public.protect_longterm_prediction_points_earned() TO postgres;

DROP TRIGGER IF EXISTS protect_longterm_prediction_points_earned
  ON public.longterm_predictions;
CREATE TRIGGER protect_longterm_prediction_points_earned
  BEFORE INSERT OR UPDATE ON public.longterm_predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_longterm_prediction_points_earned();

-- The application has no client-side prediction deletion flow. Prevent direct
-- Data API deletion from erasing scored history; trusted service-role paths are
-- unaffected.
DROP POLICY IF EXISTS "Longterm predictions delete policy"
  ON public.longterm_predictions;
REVOKE DELETE ON public.predictions FROM anon, authenticated;
REVOKE DELETE ON public.longterm_predictions FROM anon, authenticated;

-- Prediction writes now require membership and an actual lobby/tournament/match
-- relationship. Existing lock-time behavior is preserved.
DROP POLICY IF EXISTS "Predictions write own policy" ON public.predictions;
CREATE POLICY "Predictions write own policy" ON public.predictions
  FOR INSERT TO authenticated
  WITH CHECK (
    predictions.user_id = (SELECT auth.uid())
    AND public.is_lobby_member(predictions.lobby_id)
    AND EXISTS (
      SELECT 1
      FROM public.matches AS match
      JOIN public.lobby_tournaments AS lobby_tournament
        ON lobby_tournament.tournament_id = match.tournament_id
      WHERE match.id = predictions.match_id
        AND lobby_tournament.lobby_id = predictions.lobby_id
        AND now() < match.lock_time_utc
    )
  );

DROP POLICY IF EXISTS "Predictions update own policy" ON public.predictions;
CREATE POLICY "Predictions update own policy" ON public.predictions
  FOR UPDATE TO authenticated
  USING (
    predictions.user_id = (SELECT auth.uid())
    AND public.is_lobby_member(predictions.lobby_id)
    AND EXISTS (
      SELECT 1
      FROM public.matches AS match
      JOIN public.lobby_tournaments AS lobby_tournament
        ON lobby_tournament.tournament_id = match.tournament_id
      WHERE match.id = predictions.match_id
        AND lobby_tournament.lobby_id = predictions.lobby_id
        AND now() < match.lock_time_utc
    )
  )
  WITH CHECK (
    predictions.user_id = (SELECT auth.uid())
    AND public.is_lobby_member(predictions.lobby_id)
    AND EXISTS (
      SELECT 1
      FROM public.matches AS match
      JOIN public.lobby_tournaments AS lobby_tournament
        ON lobby_tournament.tournament_id = match.tournament_id
      WHERE match.id = predictions.match_id
        AND lobby_tournament.lobby_id = predictions.lobby_id
        AND now() < match.lock_time_utc
    )
  );

-- Long-term predictions already required membership. Add the missing new-row
-- check and enforce the lobby/tournament relationship without changing scoring.
DROP POLICY IF EXISTS "Longterm predictions insert policy" ON public.longterm_predictions;
CREATE POLICY "Longterm predictions insert policy" ON public.longterm_predictions
  FOR INSERT TO authenticated
  WITH CHECK (
    longterm_predictions.user_id = (SELECT auth.uid())
    AND public.is_lobby_member(longterm_predictions.lobby_id)
    AND EXISTS (
      SELECT 1
      FROM public.lobby_tournaments AS lobby_tournament
      WHERE lobby_tournament.lobby_id = longterm_predictions.lobby_id
        AND lobby_tournament.tournament_id = longterm_predictions.tournament_id
    )
    AND (
      NOT EXISTS (
        SELECT 1
        FROM public.matches AS tournament_match
        WHERE tournament_match.tournament_id = longterm_predictions.tournament_id
      )
      OR now() < (
        SELECT min(tournament_match.start_time_utc)
        FROM public.matches AS tournament_match
        WHERE tournament_match.tournament_id = longterm_predictions.tournament_id
      )
    )
  );

DROP POLICY IF EXISTS "Longterm predictions update policy" ON public.longterm_predictions;
CREATE POLICY "Longterm predictions update policy" ON public.longterm_predictions
  FOR UPDATE TO authenticated
  USING (
    longterm_predictions.user_id = (SELECT auth.uid())
    AND public.is_lobby_member(longterm_predictions.lobby_id)
  )
  WITH CHECK (
    longterm_predictions.user_id = (SELECT auth.uid())
    AND public.is_lobby_member(longterm_predictions.lobby_id)
    AND EXISTS (
      SELECT 1
      FROM public.lobby_tournaments AS lobby_tournament
      WHERE lobby_tournament.lobby_id = longterm_predictions.lobby_id
        AND lobby_tournament.tournament_id = longterm_predictions.tournament_id
    )
    AND (
      NOT EXISTS (
        SELECT 1
        FROM public.matches AS tournament_match
        WHERE tournament_match.tournament_id = longterm_predictions.tournament_id
      )
      OR now() < (
        SELECT min(tournament_match.start_time_utc)
        FROM public.matches AS tournament_match
        WHERE tournament_match.tournament_id = longterm_predictions.tournament_id
      )
    )
  );

-- The Home read model continues to expose the product role "owner", but derives
-- it from lobbies.owner_id rather than membership.role.
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
      CASE
        WHEN l.owner_id = lm.user_id THEN 'owner'
        WHEN lm.role = 'admin' THEN 'admin'
        ELSE 'member'
      END AS lobby_role,
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
