-- Official Events are public, time-bounded competitions. They deliberately do
-- not create lobby memberships or participate in lobby Hall of Fame reads.

CREATE TABLE public.official_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  cover_key text,
  tournament_id text NOT NULL REFERENCES public.tournaments(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'active', 'completed', 'archived')),
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  featured boolean NOT NULL DEFAULT false,
  onboarding_eligible boolean NOT NULL DEFAULT false,
  prize_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(prize_metadata) = 'object'),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    registration_opens_at IS NULL
    OR registration_closes_at IS NULL
    OR registration_opens_at < registration_closes_at
  ),
  CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at)
);

CREATE TABLE public.official_event_participations (
  event_id uuid NOT NULL REFERENCES public.official_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  hidden_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id),
  CHECK (
    (status = 'active' AND ended_at IS NULL)
    OR (status = 'left' AND ended_at IS NOT NULL)
  )
);

CREATE TABLE public.official_event_predictions (
  event_id uuid NOT NULL,
  user_id uuid NOT NULL,
  match_id text NOT NULL REFERENCES public.matches(id) ON DELETE RESTRICT,
  predicted_home_score integer NOT NULL CHECK (predicted_home_score BETWEEN 0 AND 99),
  predicted_away_score integer NOT NULL CHECK (predicted_away_score BETWEEN 0 AND 99),
  points_earned integer NOT NULL DEFAULT 0 CHECK (points_earned BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id, match_id),
  FOREIGN KEY (event_id, user_id)
    REFERENCES public.official_event_participations(event_id, user_id)
    ON DELETE CASCADE
);

CREATE TABLE public.official_event_scores (
  event_id uuid NOT NULL REFERENCES public.official_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_points integer NOT NULL DEFAULT 0 CHECK (total_points >= 0),
  exact_hits integer NOT NULL DEFAULT 0 CHECK (exact_hits >= 0),
  first_prediction_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id),
  FOREIGN KEY (event_id, user_id)
    REFERENCES public.official_event_participations(event_id, user_id)
    ON DELETE CASCADE
);

CREATE TABLE public.official_event_badge_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.official_events(id) ON DELETE CASCADE,
  key text NOT NULL,
  name_cs text NOT NULL,
  description_cs text NOT NULL,
  icon text NOT NULL,
  rule_type text NOT NULL
    CHECK (rule_type IN ('winner', 'top_10', 'participant', 'exact_prediction')),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, key)
);

CREATE TABLE public.official_event_badge_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.official_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.official_event_badge_rules(id) ON DELETE RESTRICT,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id, rule_id)
);

CREATE TABLE public.user_onboarding_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  onboarding_version integer NOT NULL DEFAULT 1 CHECK (onboarding_version > 0),
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'started', 'skipped', 'completed')),
  variant_key text NOT NULL DEFAULT 'control',
  completion_path text
    CHECK (completion_path IN ('invite', 'own_lobby', 'start_event')),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'completed' AND completion_path IS NOT NULL AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completion_path IS NULL)
  )
);

CREATE INDEX official_events_lifecycle_idx
  ON public.official_events(status, featured, onboarding_eligible, starts_at, ends_at);
CREATE UNIQUE INDEX official_events_single_onboarding_event_idx
  ON public.official_events ((1))
  WHERE status = 'active' AND featured AND onboarding_eligible;
CREATE INDEX official_event_participations_user_idx
  ON public.official_event_participations(user_id, status, event_id);
CREATE INDEX official_event_predictions_match_idx
  ON public.official_event_predictions(match_id, event_id);
CREATE INDEX official_event_predictions_user_idx
  ON public.official_event_predictions(event_id, user_id);
CREATE INDEX official_event_scores_ranking_idx
  ON public.official_event_scores(
    event_id,
    total_points DESC,
    exact_hits DESC,
    first_prediction_at ASC,
    user_id ASC
  );

ALTER TABLE public.official_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.official_event_participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.official_event_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.official_event_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.official_event_badge_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.official_event_badge_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_onboarding_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.official_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.official_event_participations FROM anon, authenticated;
REVOKE ALL ON TABLE public.official_event_predictions FROM anon, authenticated;
REVOKE ALL ON TABLE public.official_event_scores FROM anon, authenticated;
REVOKE ALL ON TABLE public.official_event_badge_rules FROM anon, authenticated;
REVOKE ALL ON TABLE public.official_event_badge_awards FROM anon, authenticated;
REVOKE ALL ON TABLE public.user_onboarding_state FROM anon, authenticated;
GRANT SELECT ON TABLE public.official_event_predictions TO service_role;

CREATE OR REPLACE FUNCTION public.protect_official_event_prediction_points()
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

REVOKE ALL ON FUNCTION public.protect_official_event_prediction_points()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.protect_official_event_prediction_points()
  TO postgres;

CREATE TRIGGER protect_official_event_prediction_points
  BEFORE INSERT OR UPDATE ON public.official_event_predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_official_event_prediction_points();

CREATE OR REPLACE FUNCTION public.get_my_onboarding_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  state_row public.user_onboarding_state%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO state_row
  FROM public.user_onboarding_state
  WHERE user_id = caller_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'onboarding_version', 1,
      'status', 'not_started',
      'variant_key', 'control',
      'completion_path', NULL,
      'started_at', NULL,
      'completed_at', NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'onboarding_version', state_row.onboarding_version,
    'status', state_row.status,
    'variant_key', state_row.variant_key,
    'completion_path', state_row.completion_path,
    'started_at', state_row.started_at,
    'completed_at', state_row.completed_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_onboarding_state(
  onboarding_version_param integer,
  status_param text,
  variant_key_param text DEFAULT 'control',
  completion_path_param text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  IF onboarding_version_param < 1
    OR status_param NOT IN ('not_started', 'started', 'skipped', 'completed')
    OR trim(COALESCE(variant_key_param, '')) <> 'control'
    OR (
      status_param = 'completed'
      AND completion_path_param NOT IN ('invite', 'own_lobby', 'start_event')
    )
    OR (status_param <> 'completed' AND completion_path_param IS NOT NULL) THEN
    RAISE EXCEPTION 'Invalid onboarding state.' USING ERRCODE = '22023';
  END IF;

  IF status_param = 'completed' THEN
    IF completion_path_param = 'start_event' AND NOT EXISTS (
      SELECT 1
      FROM public.official_event_predictions
      WHERE user_id = caller_id
    ) THEN
      RAISE EXCEPTION 'A real official-event prediction is required.'
        USING ERRCODE = '22023';
    ELSIF completion_path_param = 'own_lobby' AND NOT EXISTS (
      SELECT 1 FROM public.lobbies WHERE owner_id = caller_id
    ) THEN
      RAISE EXCEPTION 'An owned lobby is required.'
        USING ERRCODE = '22023';
    ELSIF completion_path_param = 'invite' AND NOT EXISTS (
      SELECT 1
      FROM public.lobby_members
      WHERE user_id = caller_id AND membership_status = 'active'
      UNION ALL
      SELECT 1
      FROM public.lobby_join_requests
      WHERE user_id = caller_id AND status = 'pending'
    ) THEN
      RAISE EXCEPTION 'A lobby membership or pending request is required.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.user_onboarding_state (
    user_id,
    onboarding_version,
    status,
    variant_key,
    completion_path,
    started_at,
    completed_at,
    updated_at
  )
  VALUES (
    caller_id,
    onboarding_version_param,
    status_param,
    trim(variant_key_param),
    completion_path_param,
    CASE WHEN status_param IN ('started', 'completed') THEN now() ELSE NULL END,
    CASE WHEN status_param = 'completed' THEN now() ELSE NULL END,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    onboarding_version = EXCLUDED.onboarding_version,
    status = EXCLUDED.status,
    variant_key = EXCLUDED.variant_key,
    completion_path = EXCLUDED.completion_path,
    started_at = CASE
      WHEN public.user_onboarding_state.started_at IS NOT NULL
        THEN public.user_onboarding_state.started_at
      WHEN EXCLUDED.status IN ('started', 'completed') THEN now()
      ELSE NULL
    END,
    completed_at = CASE
      WHEN EXCLUDED.status = 'completed' THEN COALESCE(
        public.user_onboarding_state.completed_at,
        now()
      )
      ELSE NULL
    END,
    updated_at = now();

  RETURN public.get_my_onboarding_state();
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_official_event_secure(
  event_id_param uuid,
  slug_param text,
  name_param text,
  description_param text,
  cover_key_param text,
  tournament_id_param text,
  status_param text,
  registration_opens_at_param timestamptz,
  registration_closes_at_param timestamptz,
  starts_at_param timestamptz,
  ends_at_param timestamptz,
  featured_param boolean,
  onboarding_eligible_param boolean,
  prize_metadata_param jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  resolved_event_id uuid := COALESCE(event_id_param, gen_random_uuid());
  existing_event public.official_events%ROWTYPE;
BEGIN
  IF caller_id IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Platform admin access required.' USING ERRCODE = '42501';
  END IF;
  IF length(trim(COALESCE(slug_param, ''))) NOT BETWEEN 3 AND 80
    OR trim(COALESCE(name_param, '')) = ''
    OR status_param NOT IN ('draft', 'scheduled', 'active', 'completed', 'archived')
    OR jsonb_typeof(COALESCE(prize_metadata_param, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Invalid official event.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO existing_event
  FROM public.official_events
  WHERE id = resolved_event_id
  FOR UPDATE;

  IF FOUND THEN
    IF existing_event.tournament_id <> tournament_id_param
      AND EXISTS (
        SELECT 1
        FROM public.official_event_predictions
        WHERE event_id = resolved_event_id
      ) THEN
      RAISE EXCEPTION 'An event with predictions cannot change tournament.'
        USING ERRCODE = '22023';
    END IF;

    IF existing_event.status <> status_param
      AND NOT (
        (existing_event.status = 'draft' AND status_param IN ('scheduled', 'archived'))
        OR (
          existing_event.status = 'scheduled'
          AND status_param IN ('draft', 'active', 'archived')
        )
        OR (
          existing_event.status = 'active'
          AND status_param IN ('completed', 'archived')
        )
        OR (
          existing_event.status = 'completed'
          AND status_param = 'archived'
        )
      ) THEN
      RAISE EXCEPTION 'Invalid official event lifecycle transition.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.official_events (
    id, slug, name, description, cover_key, tournament_id, status,
    registration_opens_at, registration_closes_at, starts_at, ends_at,
    featured, onboarding_eligible, prize_metadata, created_by, updated_at
  )
  VALUES (
    resolved_event_id,
    lower(trim(slug_param)),
    trim(name_param),
    NULLIF(trim(COALESCE(description_param, '')), ''),
    NULLIF(trim(COALESCE(cover_key_param, '')), ''),
    tournament_id_param,
    status_param,
    registration_opens_at_param,
    registration_closes_at_param,
    starts_at_param,
    ends_at_param,
    COALESCE(featured_param, false),
    COALESCE(onboarding_eligible_param, false),
    COALESCE(prize_metadata_param, '{}'::jsonb),
    caller_id,
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    slug = EXCLUDED.slug,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    cover_key = EXCLUDED.cover_key,
    tournament_id = EXCLUDED.tournament_id,
    status = EXCLUDED.status,
    registration_opens_at = EXCLUDED.registration_opens_at,
    registration_closes_at = EXCLUDED.registration_closes_at,
    starts_at = EXCLUDED.starts_at,
    ends_at = EXCLUDED.ends_at,
    featured = EXCLUDED.featured,
    onboarding_eligible = EXCLUDED.onboarding_eligible,
    prize_metadata = EXCLUDED.prize_metadata,
    updated_at = now();

  RETURN resolved_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_official_event(event_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  event_row public.official_events%ROWTYPE;
  existing_status text;
  result_state text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO event_row
  FROM public.official_events
  WHERE id = event_id_param
    AND status = 'active'
    AND (registration_opens_at IS NULL OR registration_opens_at <= now())
    AND (registration_closes_at IS NULL OR registration_closes_at > now())
    AND (ends_at IS NULL OR ends_at > now())
  FOR UPDATE;

  IF NOT FOUND OR NOT EXISTS (
    SELECT 1
    FROM public.matches AS match
    WHERE match.tournament_id = event_row.tournament_id
      AND match.status <> 'finished'
      AND match.home_score IS NULL
      AND match.away_score IS NULL
      AND match.lock_time_utc > now()
      AND lower(match.home_participant_id) NOT LIKE '%tba%'
      AND lower(match.away_participant_id) NOT LIKE '%tba%'
  ) THEN
    RAISE EXCEPTION 'Official event is unavailable.' USING ERRCODE = '22023';
  END IF;

  SELECT status INTO existing_status
  FROM public.official_event_participations
  WHERE event_id = event_id_param AND user_id = caller_id
  FOR UPDATE;

  IF existing_status = 'active' THEN
    UPDATE public.official_event_participations
    SET hidden_at = NULL, updated_at = now()
    WHERE event_id = event_id_param AND user_id = caller_id;
    result_state := 'already_participating';
  ELSIF existing_status = 'left' THEN
    UPDATE public.official_event_participations
    SET status = 'active', ended_at = NULL, hidden_at = NULL, updated_at = now()
    WHERE event_id = event_id_param AND user_id = caller_id;
    result_state := 'rejoined';
  ELSE
    INSERT INTO public.official_event_participations (event_id, user_id)
    VALUES (event_id_param, caller_id);
    result_state := 'joined';
  END IF;

  INSERT INTO public.official_event_scores (event_id, user_id)
  VALUES (event_id_param, caller_id)
  ON CONFLICT (event_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('event_id', event_id_param, 'state', result_state);
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_official_event(event_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.official_event_participations
  SET status = 'left', ended_at = now(), hidden_at = now(), updated_at = now()
  WHERE event_id = event_id_param
    AND user_id = caller_id
    AND status = 'active';
END;
$$;

CREATE OR REPLACE FUNCTION public.hide_official_event(event_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.official_event_participations
  SET hidden_at = now(), updated_at = now()
  WHERE event_id = event_id_param AND user_id = caller_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_official_event_prediction(
  event_id_param uuid,
  match_id_param text,
  home_score_param integer,
  away_score_param integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  event_tournament_id text;
  event_status text;
  event_ends_at timestamptz;
  match_row public.matches%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  IF home_score_param NOT BETWEEN 0 AND 99
    OR away_score_param NOT BETWEEN 0 AND 99 THEN
    RAISE EXCEPTION 'Invalid prediction score.' USING ERRCODE = '22023';
  END IF;

  SELECT event.tournament_id, event.status, event.ends_at
  INTO event_tournament_id, event_status, event_ends_at
  FROM public.official_events AS event
  WHERE event.id = event_id_param;

  IF event_status <> 'active' OR (event_ends_at IS NOT NULL AND event_ends_at <= now())
    OR NOT EXISTS (
      SELECT 1
      FROM public.official_event_participations AS participation
      WHERE participation.event_id = event_id_param
        AND participation.user_id = caller_id
        AND participation.status = 'active'
    ) THEN
    RAISE EXCEPTION 'Official event is unavailable.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO match_row
  FROM public.matches
  WHERE id = match_id_param
  FOR SHARE;

  IF NOT FOUND
    OR match_row.tournament_id <> event_tournament_id
    OR match_row.status = 'finished'
    OR match_row.home_score IS NOT NULL
    OR match_row.away_score IS NOT NULL
    OR match_row.lock_time_utc <= now()
    OR lower(match_row.home_participant_id) LIKE '%tba%'
    OR lower(match_row.away_participant_id) LIKE '%tba%' THEN
    RAISE EXCEPTION 'Prediction is unavailable.' USING ERRCODE = '22023';
  END IF;

  IF event_tournament_id = 'ms-hockey-2026'
    AND home_score_param = away_score_param THEN
    RAISE EXCEPTION 'A hockey prediction must select a winner.'
      USING ERRCODE = '22023';
  END IF;

  IF event_tournament_id <> 'ms-hockey-2026'
    AND home_score_param = away_score_param
    AND COALESCE(match_row.stage, '') NOT LIKE 'Group%' THEN
    RAISE EXCEPTION 'A knockout prediction cannot be a draw.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.official_event_predictions (
    event_id,
    user_id,
    match_id,
    predicted_home_score,
    predicted_away_score,
    points_earned,
    updated_at
  )
  VALUES (
    event_id_param,
    caller_id,
    match_id_param,
    home_score_param,
    away_score_param,
    0,
    now()
  )
  ON CONFLICT (event_id, user_id, match_id) DO UPDATE
  SET
    predicted_home_score = EXCLUDED.predicted_home_score,
    predicted_away_score = EXCLUDED.predicted_away_score,
    updated_at = now();

  UPDATE public.official_event_scores
  SET
    first_prediction_at = COALESCE(first_prediction_at, now()),
    updated_at = now()
  WHERE event_id = event_id_param AND user_id = caller_id;

  RETURN jsonb_build_object(
    'event_id', event_id_param,
    'match_id', match_id_param,
    'saved', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_official_event_home_card()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  event_row public.official_events%ROWTYPE;
  participation_row public.official_event_participations%ROWTYPE;
  actionable_count bigint;
  open_count bigint;
  next_match jsonb;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT event.* INTO event_row
  FROM public.official_events AS event
  LEFT JOIN public.official_event_participations AS participation
    ON participation.event_id = event.id AND participation.user_id = caller_id
  WHERE event.status IN ('scheduled', 'active', 'completed')
    AND (participation.hidden_at IS NULL)
    AND (
      (
        event.status = 'active'
        AND event.featured
        AND (event.ends_at IS NULL OR event.ends_at > now())
      )
      OR (
        event.status = 'scheduled'
        AND participation.user_id IS NOT NULL
      )
      OR (
        event.status = 'completed'
        AND participation.user_id IS NOT NULL
      )
    )
  ORDER BY
    CASE event.status WHEN 'active' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END,
    event.featured DESC,
    event.starts_at NULLS LAST,
    event.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO participation_row
  FROM public.official_event_participations
  WHERE event_id = event_row.id AND user_id = caller_id;

  SELECT
    COUNT(*) FILTER (
      WHERE prediction.match_id IS NULL
        AND match.status <> 'finished'
        AND match.home_score IS NULL
        AND match.away_score IS NULL
        AND match.lock_time_utc > now()
        AND lower(match.home_participant_id) NOT LIKE '%tba%'
        AND lower(match.away_participant_id) NOT LIKE '%tba%'
    ),
    COUNT(*) FILTER (
      WHERE match.status <> 'finished'
        AND match.home_score IS NULL
        AND match.away_score IS NULL
        AND match.lock_time_utc > now()
        AND lower(match.home_participant_id) NOT LIKE '%tba%'
        AND lower(match.away_participant_id) NOT LIKE '%tba%'
    )
  INTO actionable_count, open_count
  FROM public.matches AS match
  LEFT JOIN public.official_event_predictions AS prediction
    ON prediction.event_id = event_row.id
    AND prediction.user_id = caller_id
    AND prediction.match_id = match.id
  WHERE match.tournament_id = event_row.tournament_id;

  SELECT jsonb_build_object(
    'id', match.id,
    'lock_time_utc', match.lock_time_utc,
    'home_name', home.name,
    'away_name', away.name
  )
  INTO next_match
  FROM public.matches AS match
  JOIN public.participants AS home ON home.id = match.home_participant_id
  JOIN public.participants AS away ON away.id = match.away_participant_id
  WHERE match.tournament_id = event_row.tournament_id
    AND match.status <> 'finished'
    AND match.home_score IS NULL
    AND match.away_score IS NULL
    AND match.lock_time_utc > now()
    AND lower(match.home_participant_id) NOT LIKE '%tba%'
    AND lower(match.away_participant_id) NOT LIKE '%tba%'
  ORDER BY match.lock_time_utc
  LIMIT 1;

  RETURN jsonb_build_object(
    'event_id', event_row.id,
    'slug', event_row.slug,
    'name', event_row.name,
    'description', event_row.description,
    'cover_key', event_row.cover_key,
    'status', event_row.status,
    'featured', event_row.featured,
    'onboarding_eligible', event_row.onboarding_eligible,
    'is_participating', participation_row.status = 'active',
    'participation_status', participation_row.status,
    'actionable_match_count', COALESCE(actionable_count, 0),
    'open_match_count', COALESCE(open_count, 0),
    'next_match', next_match
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_official_event_detail(event_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  event_row public.official_events%ROWTYPE;
  participation_status text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO event_row
  FROM public.official_events
  WHERE id = event_id_param AND status <> 'draft';

  SELECT status INTO participation_status
  FROM public.official_event_participations
  WHERE event_id = event_id_param AND user_id = caller_id;

  IF NOT FOUND OR participation_status IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'event_id', event_row.id,
    'slug', event_row.slug,
    'name', event_row.name,
    'description', event_row.description,
    'cover_key', event_row.cover_key,
    'status', event_row.status,
    'participation_status', participation_status,
    'matches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', match.id,
        'start_time_utc', match.start_time_utc,
        'lock_time_utc', match.lock_time_utc,
        'status', match.status,
        'home_score', match.home_score,
        'away_score', match.away_score,
        'home_name', home.name,
        'home_short_name', home.short_name,
        'home_flag', home.flag_code,
        'away_name', away.name,
        'away_short_name', away.short_name,
        'away_flag', away.flag_code,
        'predicted_home_score', prediction.predicted_home_score,
        'predicted_away_score', prediction.predicted_away_score,
        'points_earned', prediction.points_earned,
        'can_predict', (
          event_row.status = 'active'
          AND participation_status = 'active'
          AND match.status <> 'finished'
          AND match.home_score IS NULL
          AND match.away_score IS NULL
          AND match.lock_time_utc > now()
          AND lower(match.home_participant_id) NOT LIKE '%tba%'
          AND lower(match.away_participant_id) NOT LIKE '%tba%'
        )
      ) ORDER BY match.start_time_utc)
      FROM public.matches AS match
      JOIN public.participants AS home ON home.id = match.home_participant_id
      JOIN public.participants AS away ON away.id = match.away_participant_id
      LEFT JOIN public.official_event_predictions AS prediction
        ON prediction.event_id = event_row.id
        AND prediction.user_id = caller_id
        AND prediction.match_id = match.id
      WHERE match.tournament_id = event_row.tournament_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_official_event_leaderboard(
  event_id_param uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  caller_position bigint;
  participant_count bigint;
  points_to_next integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.official_events
    WHERE id = event_id_param AND status IN ('active', 'completed', 'archived')
  ) THEN
    RETURN NULL;
  END IF;

  WITH ranked AS (
    SELECT
      score.user_id,
      score.total_points,
      score.exact_hits,
      row_number() OVER (
        ORDER BY
          score.total_points DESC,
          score.exact_hits DESC,
          score.first_prediction_at ASC NULLS LAST,
          participation.joined_at ASC,
          score.user_id ASC
      ) AS position
    FROM public.official_event_scores AS score
    JOIN public.official_event_participations AS participation
      ON participation.event_id = score.event_id
      AND participation.user_id = score.user_id
    WHERE score.event_id = event_id_param
  )
  SELECT
    (SELECT position FROM ranked WHERE user_id = caller_id),
    (SELECT COUNT(*) FROM ranked),
    GREATEST(
      COALESCE((
        SELECT higher.total_points - current_row.total_points
        FROM ranked AS current_row
        JOIN ranked AS higher ON higher.position = current_row.position - 1
        WHERE current_row.user_id = caller_id
      ), 0),
      0
    )
  INTO caller_position, participant_count, points_to_next;

  RETURN jsonb_build_object(
    'participant_count', participant_count,
    'current_position', caller_position,
    'points_to_next', points_to_next,
    'rows', COALESCE((
      WITH ranked AS (
        SELECT
          score.user_id,
          score.total_points,
          score.exact_hits,
          row_number() OVER (
            ORDER BY
              score.total_points DESC,
              score.exact_hits DESC,
              score.first_prediction_at ASC NULLS LAST,
              participation.joined_at ASC,
              score.user_id ASC
          ) AS position
        FROM public.official_event_scores AS score
        JOIN public.official_event_participations AS participation
          ON participation.event_id = score.event_id
          AND participation.user_id = score.user_id
        WHERE score.event_id = event_id_param
      ),
      visible_rows AS (
        SELECT *
        FROM ranked
        WHERE position <= 3
          OR (
            caller_position IS NOT NULL
            AND position BETWEEN caller_position - 2 AND caller_position + 2
          )
      )
      SELECT jsonb_agg(jsonb_build_object(
        'position', visible.position,
        'username', profile.username,
        'avatar_emoji', profile.avatar_emoji,
        'avatar_bg', profile.avatar_bg,
        'total_points', visible.total_points,
        'exact_hits', visible.exact_hits,
        'is_current_user', visible.user_id = caller_id,
        'featured_badges', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'name', rule.name_cs,
            'icon', rule.icon
          ) ORDER BY award.awarded_at DESC)
          FROM public.official_event_badge_awards AS award
          JOIN public.official_event_badge_rules AS rule ON rule.id = award.rule_id
          WHERE award.event_id = event_id_param
            AND award.user_id = visible.user_id
        ), '[]'::jsonb)
      ) ORDER BY visible.position)
      FROM visible_rows AS visible
      JOIN public.profiles AS profile ON profile.id = visible.user_id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_onboarding_state() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.update_my_onboarding_state(integer, text, text, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.manage_official_event_secure(
  uuid, text, text, text, text, text, text, timestamptz, timestamptz,
  timestamptz, timestamptz, boolean, boolean, jsonb
) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.join_official_event(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.leave_official_event(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.hide_official_event(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.save_official_event_prediction(uuid, text, integer, integer)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_official_event_home_card() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_official_event_detail(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_official_event_leaderboard(uuid)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.get_my_onboarding_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_onboarding_state(integer, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_official_event_secure(
  uuid, text, text, text, text, text, text, timestamptz, timestamptz,
  timestamptz, timestamptz, boolean, boolean, jsonb
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_official_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_official_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hide_official_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_official_event_prediction(uuid, text, integer, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_official_event_home_card() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_official_event_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_official_event_leaderboard(uuid) TO authenticated;

INSERT INTO public.app_feature_flags (key, enabled, is_public)
VALUES
  ('official_events_enabled', false, true),
  ('onboarding_first_tip_enabled', false, true)
ON CONFLICT (key) DO NOTHING;
