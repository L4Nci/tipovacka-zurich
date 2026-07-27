-- Idempotent achievement and badge foundation. Awards are derived from
-- authoritative stored predictions, results, ownership and completion state.

CREATE TABLE IF NOT EXISTS public.achievement_definitions (
  key text PRIMARY KEY,
  name_cs text NOT NULL,
  description_cs text NOT NULL,
  target_value integer NOT NULL CHECK (target_value > 0),
  rule_version integer NOT NULL DEFAULT 1 CHECK (rule_version > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.badge_definitions (
  key text PRIMARY KEY,
  achievement_key text REFERENCES public.achievement_definitions(key) ON DELETE RESTRICT,
  name_cs text NOT NULL,
  description_cs text NOT NULL,
  icon text NOT NULL,
  tier text NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold', 'special')),
  rule_version integer NOT NULL DEFAULT 1 CHECK (rule_version > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_achievement_progress (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_key text NOT NULL REFERENCES public.achievement_definitions(key) ON DELETE CASCADE,
  current_value integer NOT NULL DEFAULT 0 CHECK (current_value >= 0),
  target_value integer NOT NULL CHECK (target_value > 0),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_key)
);

CREATE TABLE IF NOT EXISTS public.user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_key text NOT NULL REFERENCES public.badge_definitions(key) ON DELETE RESTRICT,
  context_type text NOT NULL DEFAULT 'global'
    CHECK (context_type IN ('global', 'lobby', 'tournament', 'lobby_tournament')),
  context_id text NOT NULL DEFAULT '',
  source_rule_version integer NOT NULL DEFAULT 1,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  featured_position smallint CHECK (featured_position BETWEEN 1 AND 3),
  UNIQUE (user_id, badge_key, context_type, context_id),
  UNIQUE (user_id, featured_position)
);

ALTER TABLE public.achievement_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievement_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.achievement_definitions FROM anon, authenticated;
REVOKE ALL ON TABLE public.badge_definitions FROM anon, authenticated;
REVOKE ALL ON TABLE public.user_achievement_progress FROM anon, authenticated;
REVOKE ALL ON TABLE public.user_badges FROM anon, authenticated;

INSERT INTO public.achievement_definitions (key, name_cs, description_cs, target_value)
VALUES
  ('first_prediction', 'První tip', 'Ulož první zápasový tip.', 1),
  ('predictions_10', '10 tipů', 'Ulož 10 zápasových tipů.', 10),
  ('predictions_100', '100 tipů', 'Ulož 100 zápasových tipů.', 100),
  ('first_exact', 'První přesný výsledek', 'Tref první přesné skóre.', 1),
  ('lobby_founder', 'Zakladatel lobby', 'Založ vlastní lobby.', 1),
  ('veteran_3', 'Veterán', 'Zúčastni se tří dokončených soutěží.', 3)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.badge_definitions (
  key, achievement_key, name_cs, description_cs, icon, tier
)
VALUES
  ('first_prediction', 'first_prediction', 'První tip', 'První uložený zápasový tip.', '🎯', 'bronze'),
  ('predictions_10', 'predictions_10', 'Rozkoukaný tipér', 'Deset uložených zápasových tipů.', '🔟', 'bronze'),
  ('predictions_100', 'predictions_100', 'Stovkař', 'Sto uložených zápasových tipů.', '💯', 'gold'),
  ('first_exact', 'first_exact', 'Přesná muška', 'První přesně trefené skóre.', '🎯', 'silver'),
  ('lobby_founder', 'lobby_founder', 'Zakladatel lobby', 'Založení vlastní tipovací komunity.', '🏠', 'special'),
  ('veteran_3', 'veteran_3', 'Veterán', 'Účast ve třech dokončených soutěžích.', '🎖️', 'gold'),
  ('tournament_winner', NULL, 'Vítěz soutěže', 'První místo v dokončené soutěži.', '🏆', 'gold'),
  ('football_winner', NULL, 'Fotbalový šampion', 'První místo ve fotbalové soutěži.', '⚽', 'special'),
  ('hockey_winner', NULL, 'Hokejový šampion', 'První místo v hokejové soutěži.', '🏒', 'special')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.reconcile_my_achievements()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  prediction_count integer;
  exact_count integer;
  founder_count integer;
  completed_count integer;
  awarded_count integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO prediction_count
  FROM public.predictions
  WHERE user_id = caller_id;

  SELECT COUNT(*) INTO exact_count
  FROM public.predictions AS prediction
  JOIN public.matches AS match ON match.id = prediction.match_id
  WHERE prediction.user_id = caller_id
    AND match.status = 'finished'
    AND prediction.predicted_home_score = match.home_score
    AND prediction.predicted_away_score = match.away_score;

  SELECT COUNT(*) INTO founder_count
  FROM public.lobbies
  WHERE owner_id = caller_id;

  SELECT COUNT(*) INTO completed_count
  FROM (
    SELECT DISTINCT prediction.lobby_id, match.tournament_id
    FROM public.predictions AS prediction
    JOIN public.matches AS match ON match.id = prediction.match_id
    JOIN public.tournaments AS tournament ON tournament.id = match.tournament_id
    WHERE prediction.user_id = caller_id
      AND tournament.status <> 'hidden'
      AND tournament.actual_tournament_winner_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.matches AS tm
        WHERE tm.tournament_id = tournament.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.matches AS tm
        WHERE tm.tournament_id = tournament.id
          AND (
            tm.status <> 'finished'
            OR tm.home_score IS NULL
            OR tm.away_score IS NULL
          )
      )
  ) AS contexts;

  INSERT INTO public.user_achievement_progress (
    user_id, achievement_key, current_value, target_value, completed_at, updated_at
  )
  SELECT
    caller_id,
    definition.key,
    CASE definition.key
      WHEN 'first_prediction' THEN LEAST(prediction_count, 1)
      WHEN 'predictions_10' THEN LEAST(prediction_count, 10)
      WHEN 'predictions_100' THEN LEAST(prediction_count, 100)
      WHEN 'first_exact' THEN LEAST(exact_count, 1)
      WHEN 'lobby_founder' THEN LEAST(founder_count, 1)
      WHEN 'veteran_3' THEN LEAST(completed_count, 3)
      ELSE 0
    END,
    definition.target_value,
    CASE
      WHEN (
        CASE definition.key
          WHEN 'first_prediction' THEN prediction_count
          WHEN 'predictions_10' THEN prediction_count
          WHEN 'predictions_100' THEN prediction_count
          WHEN 'first_exact' THEN exact_count
          WHEN 'lobby_founder' THEN founder_count
          WHEN 'veteran_3' THEN completed_count
          ELSE 0
        END
      ) >= definition.target_value THEN now()
      ELSE NULL
    END,
    now()
  FROM public.achievement_definitions AS definition
  WHERE definition.is_active
  ON CONFLICT (user_id, achievement_key) DO UPDATE
  SET
    current_value = EXCLUDED.current_value,
    target_value = EXCLUDED.target_value,
    completed_at = COALESCE(
      public.user_achievement_progress.completed_at,
      EXCLUDED.completed_at
    ),
    updated_at = now();

  INSERT INTO public.user_badges (
    user_id, badge_key, context_type, context_id, source_rule_version
  )
  SELECT
    progress.user_id,
    badge.key,
    'global',
    '',
    badge.rule_version
  FROM public.user_achievement_progress AS progress
  JOIN public.badge_definitions AS badge
    ON badge.achievement_key = progress.achievement_key
  WHERE progress.user_id = caller_id
    AND progress.completed_at IS NOT NULL
    AND badge.is_active
  ON CONFLICT (user_id, badge_key, context_type, context_id) DO NOTHING;

  WITH completed_contexts AS (
    SELECT DISTINCT prediction.lobby_id, match.tournament_id, tournament.sport_id
    FROM public.predictions AS prediction
    JOIN public.matches AS match ON match.id = prediction.match_id
    JOIN public.tournaments AS tournament ON tournament.id = match.tournament_id
    WHERE prediction.user_id = caller_id
      AND tournament.status <> 'hidden'
      AND tournament.actual_tournament_winner_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.matches AS tm
        WHERE tm.tournament_id = tournament.id
          AND (
            tm.status <> 'finished'
            OR tm.home_score IS NULL
            OR tm.away_score IS NULL
          )
      )
  ),
  context_scores AS (
    SELECT
      context.lobby_id,
      context.tournament_id,
      context.sport_id,
      membership.user_id,
      COALESCE((
        SELECT SUM(prediction.points_earned)
        FROM public.predictions AS prediction
        JOIN public.matches AS match ON match.id = prediction.match_id
        WHERE prediction.lobby_id = context.lobby_id
          AND prediction.user_id = membership.user_id
          AND match.tournament_id = context.tournament_id
      ), 0) + COALESCE((
        SELECT SUM(longterm.points_earned)
        FROM public.longterm_predictions AS longterm
        WHERE longterm.lobby_id = context.lobby_id
          AND longterm.user_id = membership.user_id
          AND longterm.tournament_id = context.tournament_id
      ), 0) AS total_points
    FROM completed_contexts AS context
    JOIN public.lobby_members AS membership
      ON membership.lobby_id = context.lobby_id
  ),
  winning_contexts AS (
    SELECT score.*
    FROM context_scores AS score
    WHERE score.user_id = caller_id
      AND score.total_points = (
        SELECT MAX(other.total_points)
        FROM context_scores AS other
        WHERE other.lobby_id = score.lobby_id
          AND other.tournament_id = score.tournament_id
      )
  ),
  badges_to_award AS (
    SELECT
      'tournament_winner'::text AS badge_key,
      winner.lobby_id,
      winner.tournament_id
    FROM winning_contexts AS winner
    UNION ALL
    SELECT
      CASE
        WHEN lower(winner.sport_id) LIKE '%hockey%' THEN 'hockey_winner'
        ELSE 'football_winner'
      END,
      winner.lobby_id,
      winner.tournament_id
    FROM winning_contexts AS winner
  )
  INSERT INTO public.user_badges (
    user_id, badge_key, context_type, context_id, source_rule_version
  )
  SELECT
    caller_id,
    award.badge_key,
    'lobby_tournament',
    award.lobby_id || ':' || award.tournament_id,
    definition.rule_version
  FROM badges_to_award AS award
  JOIN public.badge_definitions AS definition ON definition.key = award.badge_key
  ON CONFLICT (user_id, badge_key, context_type, context_id) DO NOTHING;

  GET DIAGNOSTICS awarded_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'prediction_count', prediction_count,
    'exact_count', exact_count,
    'completed_tournaments', completed_count,
    'new_context_badges', awarded_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_badges(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  target_public boolean;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  SELECT profile_visibility = 'public'
  INTO target_public
  FROM public.profiles
  WHERE id = target_user_id;

  IF caller_id <> target_user_id AND NOT COALESCE(target_public, false) THEN
    RETURN jsonb_build_object('badges', '[]'::jsonb, 'progress', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'badges', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', award.id,
        'key', badge.key,
        'name', badge.name_cs,
        'description', badge.description_cs,
        'icon', badge.icon,
        'tier', badge.tier,
        'context_type', award.context_type,
        'context_id', award.context_id,
        'awarded_at', award.awarded_at,
        'featured_position', award.featured_position
      ) ORDER BY award.featured_position NULLS LAST, award.awarded_at DESC)
      FROM public.user_badges AS award
      JOIN public.badge_definitions AS badge ON badge.key = award.badge_key
      WHERE award.user_id = target_user_id
    ), '[]'::jsonb),
    'progress', CASE WHEN caller_id = target_user_id THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', definition.key,
        'name', definition.name_cs,
        'description', definition.description_cs,
        'current_value', progress.current_value,
        'target_value', progress.target_value,
        'completed_at', progress.completed_at
      ) ORDER BY definition.target_value, definition.name_cs)
      FROM public.user_achievement_progress AS progress
      JOIN public.achievement_definitions AS definition
        ON definition.key = progress.achievement_key
      WHERE progress.user_id = target_user_id
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_featured_badges(badge_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  badge_id uuid;
  position_index integer := 0;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(array_length(badge_ids, 1), 0) > 3 THEN
    RAISE EXCEPTION 'At most three badges can be featured.'
      USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT COUNT(DISTINCT value)
    FROM unnest(COALESCE(badge_ids, ARRAY[]::uuid[])) AS value
  ) <> COALESCE(array_length(badge_ids, 1), 0) THEN
    RAISE EXCEPTION 'Featured badges must be unique.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(badge_ids, ARRAY[]::uuid[])) AS requested(id)
    LEFT JOIN public.user_badges AS badge
      ON badge.id = requested.id
      AND badge.user_id = caller_id
    WHERE badge.id IS NULL
  ) THEN
    RAISE EXCEPTION 'A featured badge does not belong to the caller.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.user_badges
  SET featured_position = NULL
  WHERE user_id = caller_id;

  FOREACH badge_id IN ARRAY COALESCE(badge_ids, ARRAY[]::uuid[])
  LOOP
    position_index := position_index + 1;
    UPDATE public.user_badges
    SET featured_position = position_index
    WHERE id = badge_id
      AND user_id = caller_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_my_achievements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_my_achievements() TO authenticated;
REVOKE ALL ON FUNCTION public.get_user_badges(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_badges(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.set_featured_badges(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_featured_badges(uuid[]) TO authenticated;
