-- One trusted transaction applies a match result to both lobby and official
-- event predictions. Points are calculated once by the server's existing
-- calculatePoints() implementation and submitted as a complete locked snapshot.

CREATE OR REPLACE FUNCTION public.lock_authenticated_prediction_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  match_status text;
  match_lock_time timestamptz;
  match_home_score integer;
  match_away_score integer;
BEGIN
  IF current_user = 'authenticated'
    AND (
      TG_OP = 'INSERT'
      OR NEW.predicted_home_score IS DISTINCT FROM OLD.predicted_home_score
      OR NEW.predicted_away_score IS DISTINCT FROM OLD.predicted_away_score
    ) THEN
    SELECT status, lock_time_utc, home_score, away_score
    INTO match_status, match_lock_time, match_home_score, match_away_score
    FROM public.matches
    WHERE id = NEW.match_id
    FOR SHARE;

    IF NOT FOUND
      OR match_status = 'finished'
      OR match_home_score IS NOT NULL
      OR match_away_score IS NOT NULL
      OR match_lock_time <= now() THEN
      RAISE EXCEPTION 'Prediction is locked.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_authenticated_prediction_match()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lock_authenticated_prediction_match() TO postgres;

DROP TRIGGER IF EXISTS lock_authenticated_prediction_match ON public.predictions;
CREATE TRIGGER lock_authenticated_prediction_match
  BEFORE INSERT OR UPDATE ON public.predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_authenticated_prediction_match();

CREATE OR REPLACE FUNCTION public.apply_match_result_atomic(
  match_id_param text,
  home_score_param integer,
  away_score_param integer,
  lobby_scores_param jsonb,
  event_scores_param jsonb,
  source_param text DEFAULT NULL,
  actor_param text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  match_row public.matches%ROWTYPE;
  lobby_expected_count bigint;
  event_expected_count bigint;
  lobby_payload_count bigint;
  event_payload_count bigint;
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF match_id_param IS NULL
    OR home_score_param < 0
    OR away_score_param < 0
    OR jsonb_typeof(COALESCE(lobby_scores_param, '[]'::jsonb)) <> 'array'
    OR jsonb_typeof(COALESCE(event_scores_param, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Invalid match result payload.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO match_row
  FROM public.matches
  WHERE id = match_id_param
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.predictions
  WHERE match_id = match_id_param
  FOR UPDATE;
  PERFORM 1 FROM public.official_event_predictions
  WHERE match_id = match_id_param
  FOR UPDATE;

  SELECT COUNT(*) INTO lobby_expected_count
  FROM public.predictions
  WHERE match_id = match_id_param;
  SELECT COUNT(*) INTO event_expected_count
  FROM public.official_event_predictions
  WHERE match_id = match_id_param;
  lobby_payload_count := jsonb_array_length(COALESCE(lobby_scores_param, '[]'::jsonb));
  event_payload_count := jsonb_array_length(COALESCE(event_scores_param, '[]'::jsonb));

  IF lobby_payload_count <> lobby_expected_count
    OR event_payload_count <> event_expected_count THEN
    RAISE EXCEPTION 'Prediction snapshot changed; retry result application.'
      USING ERRCODE = '40001';
  END IF;

  IF EXISTS (
    WITH payload AS (
      SELECT *
      FROM jsonb_to_recordset(COALESCE(lobby_scores_param, '[]'::jsonb))
        AS score(
          user_id uuid,
          lobby_id text,
          predicted_home_score integer,
          predicted_away_score integer,
          points_earned integer
        )
    )
    SELECT 1
    FROM payload
    GROUP BY user_id, lobby_id
    HAVING COUNT(*) > 1
  ) OR EXISTS (
    WITH payload AS (
      SELECT *
      FROM jsonb_to_recordset(COALESCE(event_scores_param, '[]'::jsonb))
        AS score(
          user_id uuid,
          event_id uuid,
          predicted_home_score integer,
          predicted_away_score integer,
          points_earned integer
        )
    )
    SELECT 1
    FROM payload
    GROUP BY user_id, event_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate score payload row.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    WITH payload AS (
      SELECT *
      FROM jsonb_to_recordset(COALESCE(lobby_scores_param, '[]'::jsonb))
        AS score(
          user_id uuid,
          lobby_id text,
          predicted_home_score integer,
          predicted_away_score integer,
          points_earned integer
        )
    )
    SELECT 1
    FROM payload AS score
    LEFT JOIN public.predictions AS prediction
      ON prediction.user_id = score.user_id
      AND prediction.lobby_id = score.lobby_id
      AND prediction.match_id = match_id_param
    WHERE prediction.user_id IS NULL
      OR score.predicted_home_score IS DISTINCT FROM prediction.predicted_home_score
      OR score.predicted_away_score IS DISTINCT FROM prediction.predicted_away_score
      OR score.points_earned NOT BETWEEN 0 AND 5
  ) OR EXISTS (
    WITH payload AS (
      SELECT *
      FROM jsonb_to_recordset(COALESCE(event_scores_param, '[]'::jsonb))
        AS score(
          user_id uuid,
          event_id uuid,
          predicted_home_score integer,
          predicted_away_score integer,
          points_earned integer
        )
    )
    SELECT 1
    FROM payload AS score
    LEFT JOIN public.official_event_predictions AS prediction
      ON prediction.user_id = score.user_id
      AND prediction.event_id = score.event_id
      AND prediction.match_id = match_id_param
    WHERE prediction.user_id IS NULL
      OR score.predicted_home_score IS DISTINCT FROM prediction.predicted_home_score
      OR score.predicted_away_score IS DISTINCT FROM prediction.predicted_away_score
      OR score.points_earned NOT BETWEEN 0 AND 5
  ) THEN
    RAISE EXCEPTION 'Prediction snapshot is stale or invalid.'
      USING ERRCODE = '40001';
  END IF;

  WITH payload AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(lobby_scores_param, '[]'::jsonb))
      AS score(
        user_id uuid,
        lobby_id text,
        predicted_home_score integer,
        predicted_away_score integer,
        points_earned integer
      )
  )
  UPDATE public.predictions AS prediction
  SET points_earned = score.points_earned, updated_at = now()
  FROM payload AS score
  WHERE prediction.user_id = score.user_id
    AND prediction.lobby_id = score.lobby_id
    AND prediction.match_id = match_id_param;

  WITH payload AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(event_scores_param, '[]'::jsonb))
      AS score(
        user_id uuid,
        event_id uuid,
        predicted_home_score integer,
        predicted_away_score integer,
        points_earned integer
      )
  )
  UPDATE public.official_event_predictions AS prediction
  SET points_earned = score.points_earned, updated_at = now()
  FROM payload AS score
  WHERE prediction.user_id = score.user_id
    AND prediction.event_id = score.event_id
    AND prediction.match_id = match_id_param;

  UPDATE public.matches
  SET
    home_score = home_score_param,
    away_score = away_score_param,
    status = 'finished',
    updated_at = now()
  WHERE id = match_id_param;

  WITH affected AS (
    SELECT DISTINCT score.event_id, score.user_id
    FROM jsonb_to_recordset(COALESCE(event_scores_param, '[]'::jsonb))
      AS score(
        user_id uuid,
        event_id uuid,
        predicted_home_score integer,
        predicted_away_score integer,
        points_earned integer
      )
  ),
  totals AS (
    SELECT
      prediction.event_id,
      prediction.user_id,
      COALESCE(SUM(prediction.points_earned), 0)::integer AS total_points,
      COUNT(*) FILTER (
        WHERE match.status = 'finished'
          AND prediction.predicted_home_score = match.home_score
          AND prediction.predicted_away_score = match.away_score
      )::integer AS exact_hits,
      MIN(prediction.created_at) AS first_prediction_at
    FROM public.official_event_predictions AS prediction
    JOIN affected
      ON affected.event_id = prediction.event_id
      AND affected.user_id = prediction.user_id
    JOIN public.matches AS match ON match.id = prediction.match_id
    GROUP BY prediction.event_id, prediction.user_id
  )
  INSERT INTO public.official_event_scores (
    event_id, user_id, total_points, exact_hits, first_prediction_at, updated_at
  )
  SELECT
    total.event_id,
    total.user_id,
    total.total_points,
    total.exact_hits,
    total.first_prediction_at,
    now()
  FROM totals AS total
  ON CONFLICT (event_id, user_id) DO UPDATE
  SET
    total_points = EXCLUDED.total_points,
    exact_hits = EXCLUDED.exact_hits,
    first_prediction_at = EXCLUDED.first_prediction_at,
    updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'match_id', match_id_param,
    'lobby_predictions_updated', lobby_expected_count,
    'event_predictions_updated', event_expected_count,
    'result', jsonb_build_object(
      'home_score', home_score_param,
      'away_score', away_score_param
    ),
    'source', source_param,
    'actor', actor_param
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_match_result_atomic(
  text, integer, integer, jsonb, jsonb, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_match_result_atomic(
  text, integer, integer, jsonb, jsonb, text, text
) TO service_role;
