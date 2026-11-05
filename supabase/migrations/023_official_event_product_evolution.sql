-- Commercial metadata, eligibility, season results and awards for Official
-- Events. Sporting scores remain authoritative and untouched by this layer.

ALTER TABLE public.official_events
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'hidden'
    CHECK (visibility IN ('public', 'unlisted', 'hidden')),
  ADD COLUMN IF NOT EXISTS accent_color text NOT NULL DEFAULT '#DC2626'
    CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD COLUMN IF NOT EXISTS partner_name text,
  ADD COLUMN IF NOT EXISTS partner_logo_url text,
  ADD COLUMN IF NOT EXISTS partner_url text,
  ADD COLUMN IF NOT EXISTS partner_text text,
  ADD COLUMN IF NOT EXISTS organizer_name text,
  ADD COLUMN IF NOT EXISTS organizer_contact_url text,
  ADD COLUMN IF NOT EXISTS terms_version integer NOT NULL DEFAULT 0
    CHECK (terms_version >= 0),
  ADD COLUMN IF NOT EXISTS terms_summary text,
  ADD COLUMN IF NOT EXISTS terms_url text,
  ADD COLUMN IF NOT EXISTS minimum_age smallint
    CHECK (minimum_age IS NULL OR minimum_age BETWEEN 1 AND 120),
  ADD COLUMN IF NOT EXISTS eligible_regions text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS employees_excluded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS claim_instructions text;

ALTER TABLE public.official_event_participations
  ADD COLUMN IF NOT EXISTS prize_eligibility text NOT NULL DEFAULT 'not_applicable'
    CHECK (
      prize_eligibility IN (
        'not_applicable',
        'pending_review',
        'eligible',
        'ineligible',
        'disqualified'
      )
    ),
  ADD COLUMN IF NOT EXISTS eligibility_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id)
    ON DELETE SET NULL;

CREATE TABLE public.official_event_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.official_events(id) ON DELETE CASCADE,
  rank_from integer NOT NULL CHECK (rank_from > 0),
  rank_to integer NOT NULL CHECK (rank_to >= rank_from),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 300),
  image_url text,
  partner_name text,
  display_order smallint NOT NULL CHECK (display_order BETWEEN 1 AND 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, display_order),
  UNIQUE (event_id, rank_from, rank_to)
);

CREATE INDEX official_event_prizes_rank_idx
  ON public.official_event_prizes(event_id, rank_from, rank_to);

CREATE TABLE public.official_event_terms_acceptances (
  event_id uuid NOT NULL REFERENCES public.official_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  terms_version integer NOT NULL CHECK (terms_version > 0),
  declared_age_eligible boolean NOT NULL,
  declared_region_eligible boolean NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id, terms_version)
);

CREATE INDEX official_event_terms_acceptances_user_idx
  ON public.official_event_terms_acceptances(user_id, event_id);

ALTER TABLE public.official_event_badge_awards
  ADD COLUMN IF NOT EXISTS featured_position smallint
    CHECK (featured_position BETWEEN 1 AND 3),
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_reason text,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX official_event_awards_featured_position_idx
  ON public.official_event_badge_awards(user_id, featured_position)
  WHERE featured_position IS NOT NULL AND revoked_at IS NULL;

ALTER TABLE public.official_event_badge_rules
  DROP CONSTRAINT IF EXISTS official_event_badge_rules_rule_type_check;
ALTER TABLE public.official_event_badge_rules
  ADD CONSTRAINT official_event_badge_rules_rule_type_check
  CHECK (
    rule_type IN (
      'winner',
      'top_10',
      'top_1_percent',
      'top_10_percent',
      'participant',
      'exact_prediction'
    )
  );

CREATE OR REPLACE FUNCTION public.guard_official_event_product_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF NEW.visibility IS DISTINCT FROM OLD.visibility
    OR NEW.accent_color IS DISTINCT FROM OLD.accent_color
    OR NEW.partner_name IS DISTINCT FROM OLD.partner_name
    OR NEW.partner_logo_url IS DISTINCT FROM OLD.partner_logo_url
    OR NEW.partner_url IS DISTINCT FROM OLD.partner_url
    OR NEW.partner_text IS DISTINCT FROM OLD.partner_text
    OR NEW.organizer_name IS DISTINCT FROM OLD.organizer_name
    OR NEW.organizer_contact_url IS DISTINCT FROM OLD.organizer_contact_url
    OR NEW.terms_version IS DISTINCT FROM OLD.terms_version
    OR NEW.terms_summary IS DISTINCT FROM OLD.terms_summary
    OR NEW.terms_url IS DISTINCT FROM OLD.terms_url
    OR NEW.minimum_age IS DISTINCT FROM OLD.minimum_age
    OR NEW.eligible_regions IS DISTINCT FROM OLD.eligible_regions
    OR NEW.employees_excluded IS DISTINCT FROM OLD.employees_excluded
    OR NEW.claim_instructions IS DISTINCT FROM OLD.claim_instructions THEN
    RAISE EXCEPTION 'Official event product metadata is server-managed.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_official_event_product_columns_trigger
  ON public.official_events;
CREATE TRIGGER guard_official_event_product_columns_trigger
BEFORE UPDATE ON public.official_events
FOR EACH ROW EXECUTE FUNCTION public.guard_official_event_product_columns();

REVOKE ALL ON FUNCTION public.guard_official_event_product_columns()
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.official_event_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.official_event_terms_acceptances ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.official_event_prizes FROM anon, authenticated;
REVOKE ALL ON TABLE public.official_event_terms_acceptances FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.configure_official_event_product_secure(
  event_id_param uuid,
  visibility_param text,
  accent_color_param text,
  partner_param jsonb,
  terms_param jsonb,
  prizes_param jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_partner jsonb := COALESCE(partner_param, '{}'::jsonb);
  normalized_terms jsonb := COALESCE(terms_param, '{}'::jsonb);
  normalized_prizes jsonb := COALESCE(prizes_param, '[]'::jsonb);
  prize_count integer;
BEGIN
  IF current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'Trusted server access required.' USING ERRCODE = '42501';
  END IF;

  IF visibility_param NOT IN ('public', 'unlisted', 'hidden')
    OR COALESCE(accent_color_param, '') !~ '^#[0-9A-Fa-f]{6}$'
    OR jsonb_typeof(normalized_partner) <> 'object'
    OR jsonb_typeof(normalized_terms) <> 'object'
    OR jsonb_typeof(normalized_prizes) <> 'array' THEN
    RAISE EXCEPTION 'Invalid official event product metadata.'
      USING ERRCODE = '22023';
  END IF;

  IF (normalized_partner - 'name' - 'logo_url' - 'url' - 'text') <> '{}'::jsonb
    OR (normalized_terms
      - 'version'
      - 'summary'
      - 'url'
      - 'minimum_age'
      - 'eligible_regions'
      - 'employees_excluded'
      - 'claim_instructions'
      - 'organizer_name'
      - 'organizer_contact_url'
    ) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Unsupported official event metadata key.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_each(normalized_partner) AS partner(key, value)
    WHERE jsonb_typeof(partner.value) NOT IN ('string', 'null')
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_each(normalized_terms) AS terms(key, value)
    WHERE (
      terms.key IN (
        'summary',
        'url',
        'claim_instructions',
        'organizer_name',
        'organizer_contact_url'
      )
      AND jsonb_typeof(terms.value) NOT IN ('string', 'null')
    ) OR (
      terms.key IN ('version', 'minimum_age')
      AND jsonb_typeof(terms.value) NOT IN ('number', 'null')
    ) OR (
      terms.key = 'employees_excluded'
      AND jsonb_typeof(terms.value) NOT IN ('boolean', 'null')
    )
  ) THEN
    RAISE EXCEPTION 'Invalid official event metadata value type.'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(btrim(COALESCE(normalized_partner ->> 'name', ''))) > 100
    OR char_length(btrim(COALESCE(normalized_partner ->> 'text', ''))) > 240
    OR char_length(btrim(COALESCE(normalized_terms ->> 'summary', ''))) > 600
    OR char_length(btrim(COALESCE(normalized_terms ->> 'claim_instructions', ''))) > 600
    OR char_length(btrim(COALESCE(normalized_terms ->> 'organizer_name', ''))) > 120 THEN
    RAISE EXCEPTION 'Official event metadata is too long.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        (NULLIF(normalized_partner ->> 'logo_url', '')),
        (NULLIF(normalized_partner ->> 'url', '')),
        (NULLIF(normalized_terms ->> 'url', '')),
        (NULLIF(normalized_terms ->> 'organizer_contact_url', ''))
    ) AS url(value)
    WHERE url.value IS NOT NULL AND url.value !~ '^https://'
  ) THEN
    RAISE EXCEPTION 'External links must use HTTPS.' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(normalized_terms ->> 'version', '0') !~ '^[0-9]+$'
    OR (
      normalized_terms ? 'minimum_age'
      AND COALESCE(normalized_terms ->> 'minimum_age', '') !~ '^[1-9][0-9]*$'
    )
    OR (
      CASE
      WHEN COALESCE(normalized_terms ->> 'minimum_age', '') ~ '^[1-9][0-9]*$'
        THEN (normalized_terms ->> 'minimum_age')::integer NOT BETWEEN 1 AND 120
      ELSE false
      END
    )
    OR (
      normalized_terms ? 'eligible_regions'
      AND jsonb_typeof(normalized_terms -> 'eligible_regions') <> 'array'
    ) THEN
    RAISE EXCEPTION 'Invalid official event terms.' USING ERRCODE = '22023';
  END IF;

  prize_count := jsonb_array_length(normalized_prizes);
  IF prize_count > 20 THEN
    RAISE EXCEPTION 'An official event can contain at most 20 prizes.'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_terms ? 'eligible_regions' AND (
    jsonb_array_length(normalized_terms -> 'eligible_regions') > 32
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(
        normalized_terms -> 'eligible_regions'
      ) AS region(value)
      WHERE upper(btrim(region.value)) !~ '^[A-Z0-9-]{2,8}$'
    )
  ) THEN
    RAISE EXCEPTION 'Invalid eligible region code.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(normalized_prizes) WITH ORDINALITY AS prize(value, ordinal)
    WHERE jsonb_typeof(prize.value) <> 'object'
      OR (prize.value - 'rank_from' - 'rank_to' - 'title' - 'description'
        - 'image_url' - 'partner_name') <> '{}'::jsonb
      OR jsonb_typeof(prize.value -> 'rank_from') <> 'number'
      OR jsonb_typeof(prize.value -> 'rank_to') <> 'number'
      OR jsonb_typeof(prize.value -> 'title') <> 'string'
      OR (
        prize.value ? 'description'
        AND jsonb_typeof(prize.value -> 'description') NOT IN ('string', 'null')
      )
      OR (
        prize.value ? 'image_url'
        AND jsonb_typeof(prize.value -> 'image_url') NOT IN ('string', 'null')
      )
      OR (
        prize.value ? 'partner_name'
        AND jsonb_typeof(prize.value -> 'partner_name') NOT IN ('string', 'null')
      )
      OR COALESCE(prize.value ->> 'rank_from', '') !~ '^[1-9][0-9]*$'
      OR COALESCE(prize.value ->> 'rank_to', '') !~ '^[1-9][0-9]*$'
      OR CASE
        WHEN COALESCE(prize.value ->> 'rank_from', '') ~ '^[1-9][0-9]*$'
          AND COALESCE(prize.value ->> 'rank_to', '') ~ '^[1-9][0-9]*$'
        THEN (prize.value ->> 'rank_to')::integer
          < (prize.value ->> 'rank_from')::integer
        ELSE true
      END
      OR char_length(btrim(COALESCE(prize.value ->> 'title', ''))) NOT BETWEEN 1 AND 120
      OR char_length(btrim(COALESCE(prize.value ->> 'description', ''))) > 300
      OR char_length(btrim(COALESCE(prize.value ->> 'partner_name', ''))) > 100
      OR (
        NULLIF(prize.value ->> 'image_url', '') IS NOT NULL
        AND (prize.value ->> 'image_url') !~ '^https://'
      )
      OR (prize.value ->> 'title') ~ '[<>]'
  ) THEN
    RAISE EXCEPTION 'Invalid official event prize.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(normalized_prizes)
      WITH ORDINALITY AS first_prize(value, ordinal)
    JOIN jsonb_array_elements(normalized_prizes)
      WITH ORDINALITY AS second_prize(value, ordinal)
      ON first_prize.ordinal < second_prize.ordinal
      AND (first_prize.value ->> 'rank_from')::integer
        <= (second_prize.value ->> 'rank_to')::integer
      AND (second_prize.value ->> 'rank_from')::integer
        <= (first_prize.value ->> 'rank_to')::integer
  ) THEN
    RAISE EXCEPTION 'Official event prize ranges cannot overlap.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.official_events
  SET
    visibility = visibility_param,
    accent_color = upper(accent_color_param),
    partner_name = NULLIF(btrim(normalized_partner ->> 'name'), ''),
    partner_logo_url = NULLIF(btrim(normalized_partner ->> 'logo_url'), ''),
    partner_url = NULLIF(btrim(normalized_partner ->> 'url'), ''),
    partner_text = NULLIF(btrim(normalized_partner ->> 'text'), ''),
    organizer_name = NULLIF(btrim(normalized_terms ->> 'organizer_name'), ''),
    organizer_contact_url = NULLIF(
      btrim(normalized_terms ->> 'organizer_contact_url'),
      ''
    ),
    terms_version = COALESCE((normalized_terms ->> 'version')::integer, 0),
    terms_summary = NULLIF(btrim(normalized_terms ->> 'summary'), ''),
    terms_url = NULLIF(btrim(normalized_terms ->> 'url'), ''),
    minimum_age = NULLIF(normalized_terms ->> 'minimum_age', '')::smallint,
    eligible_regions = COALESCE(ARRAY(
      SELECT upper(btrim(region.value))
      FROM jsonb_array_elements_text(
        COALESCE(normalized_terms -> 'eligible_regions', '[]'::jsonb)
      ) AS region(value)
      WHERE btrim(region.value) <> ''
    ), ARRAY[]::text[]),
    employees_excluded = COALESCE(
      (normalized_terms ->> 'employees_excluded')::boolean,
      false
    ),
    claim_instructions = NULLIF(
      btrim(normalized_terms ->> 'claim_instructions'),
      ''
    ),
    updated_at = now()
  WHERE id = event_id_param;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Official event not found.' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.official_event_prizes WHERE event_id = event_id_param;

  INSERT INTO public.official_event_prizes (
    event_id,
    rank_from,
    rank_to,
    title,
    description,
    image_url,
    partner_name,
    display_order
  )
  SELECT
    event_id_param,
    (prize.value ->> 'rank_from')::integer,
    (prize.value ->> 'rank_to')::integer,
    btrim(prize.value ->> 'title'),
    NULLIF(btrim(prize.value ->> 'description'), ''),
    NULLIF(btrim(prize.value ->> 'image_url'), ''),
    NULLIF(btrim(prize.value ->> 'partner_name'), ''),
    prize.ordinal::smallint
  FROM jsonb_array_elements(normalized_prizes)
    WITH ORDINALITY AS prize(value, ordinal);

  RETURN jsonb_build_object(
    'event_id', event_id_param,
    'visibility', visibility_param,
    'prize_count', prize_count,
    'terms_version', COALESCE((normalized_terms ->> 'version')::integer, 0)
  );
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
  has_prizes boolean;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO event_row
  FROM public.official_events
  WHERE id = event_id_param
    AND visibility IN ('public', 'unlisted')
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

  IF event_row.terms_version > 0 AND NOT EXISTS (
    SELECT 1
    FROM public.official_event_terms_acceptances AS acceptance
    WHERE acceptance.event_id = event_id_param
      AND acceptance.user_id = caller_id
      AND acceptance.terms_version = event_row.terms_version
      AND acceptance.declared_age_eligible
      AND acceptance.declared_region_eligible
  ) THEN
    RAISE EXCEPTION 'Current event terms must be accepted.'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.official_event_prizes WHERE event_id = event_id_param
  ) INTO has_prizes;

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
    SET
      status = 'active',
      ended_at = NULL,
      hidden_at = NULL,
      updated_at = now(),
      prize_eligibility = CASE
        WHEN has_prizes AND prize_eligibility = 'not_applicable' THEN 'pending_review'
        ELSE prize_eligibility
      END
    WHERE event_id = event_id_param AND user_id = caller_id;
    result_state := 'rejoined';
  ELSE
    INSERT INTO public.official_event_participations (
      event_id,
      user_id,
      prize_eligibility
    )
    VALUES (
      event_id_param,
      caller_id,
      CASE WHEN has_prizes THEN 'pending_review' ELSE 'not_applicable' END
    );
    result_state := 'joined';
  END IF;

  INSERT INTO public.official_event_scores (event_id, user_id)
  VALUES (event_id_param, caller_id)
  ON CONFLICT (event_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('event_id', event_id_param, 'state', result_state);
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_official_event_terms_and_join(
  event_id_param uuid,
  accepted_param boolean,
  declared_age_eligible_param boolean,
  declared_region_eligible_param boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  event_row public.official_events%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO event_row
  FROM public.official_events
  WHERE id = event_id_param
    AND visibility IN ('public', 'unlisted')
    AND status = 'active';

  IF NOT FOUND OR NOT COALESCE(accepted_param, false) THEN
    RAISE EXCEPTION 'Current event terms must be accepted.'
      USING ERRCODE = '42501';
  END IF;

  IF event_row.minimum_age IS NOT NULL
    AND NOT COALESCE(declared_age_eligible_param, false) THEN
    RAISE EXCEPTION 'Age eligibility must be declared.'
      USING ERRCODE = '42501';
  END IF;

  IF cardinality(event_row.eligible_regions) > 0
    AND NOT COALESCE(declared_region_eligible_param, false) THEN
    RAISE EXCEPTION 'Region eligibility must be declared.'
      USING ERRCODE = '42501';
  END IF;

  IF event_row.terms_version > 0 THEN
    INSERT INTO public.official_event_terms_acceptances (
      event_id,
      user_id,
      terms_version,
      declared_age_eligible,
      declared_region_eligible,
      accepted_at
    )
    VALUES (
      event_id_param,
      caller_id,
      event_row.terms_version,
      COALESCE(declared_age_eligible_param, event_row.minimum_age IS NULL),
      COALESCE(
        declared_region_eligible_param,
        cardinality(event_row.eligible_regions) = 0
      ),
      now()
    )
    ON CONFLICT (event_id, user_id, terms_version) DO UPDATE
    SET
      declared_age_eligible = EXCLUDED.declared_age_eligible,
      declared_region_eligible = EXCLUDED.declared_region_eligible,
      accepted_at = now();
  END IF;

  RETURN public.join_official_event(event_id_param);
END;
$$;

CREATE OR REPLACE FUNCTION public.review_official_event_participation_secure(
  event_id_param uuid,
  user_id_param uuid,
  eligibility_param text,
  reason_param text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'Trusted server access required.' USING ERRCODE = '42501';
  END IF;

  IF eligibility_param NOT IN ('pending_review', 'eligible', 'ineligible', 'disqualified')
    OR char_length(COALESCE(reason_param, '')) > 500 THEN
    RAISE EXCEPTION 'Invalid eligibility review.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.official_event_participations
  SET
    prize_eligibility = eligibility_param,
    eligibility_reason = NULLIF(btrim(COALESCE(reason_param, '')), ''),
    reviewed_at = now(),
    reviewed_by = NULL,
    updated_at = now()
  WHERE event_id = event_id_param AND user_id = user_id_param;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participation not found.' USING ERRCODE = 'P0002';
  END IF;
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
  WHERE event.visibility IN ('public', 'unlisted')
    AND event.status IN ('scheduled', 'active', 'completed')
    AND participation.hidden_at IS NULL
    AND (
      (
        event.status = 'active'
        AND event.featured
        AND (event.ends_at IS NULL OR event.ends_at > now())
      )
      OR (event.status IN ('scheduled', 'completed') AND participation.user_id IS NOT NULL)
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
    'next_match', next_match,
    'partner_name', event_row.partner_name,
    'partner_logo_url', event_row.partner_logo_url,
    'accent_color', event_row.accent_color,
    'has_prizes', EXISTS (
      SELECT 1 FROM public.official_event_prizes WHERE event_id = event_row.id
    ),
    'terms_required', event_row.terms_version > 0
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
  accepted_current_terms boolean := false;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO event_row
  FROM public.official_events
  WHERE id = event_id_param
    AND visibility IN ('public', 'unlisted')
    AND status <> 'draft';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT status INTO participation_status
  FROM public.official_event_participations
  WHERE event_id = event_id_param AND user_id = caller_id;

  IF event_row.terms_version = 0 THEN
    accepted_current_terms := true;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.official_event_terms_acceptances
      WHERE event_id = event_id_param
        AND user_id = caller_id
        AND terms_version = event_row.terms_version
    ) INTO accepted_current_terms;
  END IF;

  RETURN jsonb_build_object(
    'event_id', event_row.id,
    'slug', event_row.slug,
    'name', event_row.name,
    'description', event_row.description,
    'cover_key', event_row.cover_key,
    'status', event_row.status,
    'participation_status', participation_status,
    'partner', jsonb_strip_nulls(jsonb_build_object(
      'name', event_row.partner_name,
      'logo_url', event_row.partner_logo_url,
      'url', event_row.partner_url,
      'text', event_row.partner_text
    )),
    'accent_color', event_row.accent_color,
    'terms', jsonb_strip_nulls(jsonb_build_object(
      'version', event_row.terms_version,
      'summary', event_row.terms_summary,
      'url', event_row.terms_url,
      'minimum_age', event_row.minimum_age,
      'eligible_regions', to_jsonb(event_row.eligible_regions),
      'employees_excluded', event_row.employees_excluded,
      'claim_instructions', event_row.claim_instructions,
      'organizer_name', event_row.organizer_name,
      'organizer_contact_url', event_row.organizer_contact_url,
      'accepted', accepted_current_terms
    )),
    'prizes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'rank_from', prize.rank_from,
        'rank_to', prize.rank_to,
        'title', prize.title,
        'description', prize.description,
        'image_url', prize.image_url,
        'partner_name', prize.partner_name
      ) ORDER BY prize.display_order)
      FROM public.official_event_prizes AS prize
      WHERE prize.event_id = event_row.id
    ), '[]'::jsonb),
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
        'points_earned', COALESCE(prediction.points_earned, 0),
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

CREATE OR REPLACE FUNCTION public.resolve_official_event_slug(slug_param text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  resolved_event_id uuid;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO resolved_event_id
  FROM public.official_events
  WHERE slug = lower(btrim(slug_param))
    AND visibility IN ('public', 'unlisted')
    AND status IN ('scheduled', 'active', 'completed', 'archived');

  RETURN resolved_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_official_event_badges(
  event_id_param uuid,
  dry_run_param boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  event_status text;
  desired_count integer;
  changed_count integer := 0;
BEGIN
  IF current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'Trusted server access required.' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO event_status
  FROM public.official_events
  WHERE id = event_id_param
  FOR UPDATE;

  IF event_status NOT IN ('completed', 'archived') THEN
    RAISE EXCEPTION 'Official event must be completed before award reconciliation.'
      USING ERRCODE = '22023';
  END IF;

  WITH ranked AS (
    SELECT
      score.user_id,
      row_number() OVER (
        ORDER BY
          score.total_points DESC,
          score.exact_hits DESC,
          score.first_prediction_at ASC NULLS LAST,
          participation.joined_at ASC,
          score.user_id ASC
      ) AS position,
      count(*) OVER () AS participant_count
    FROM public.official_event_scores AS score
    JOIN public.official_event_participations AS participation
      ON participation.event_id = score.event_id
      AND participation.user_id = score.user_id
    WHERE score.event_id = event_id_param
      AND participation.prize_eligibility <> 'disqualified'
      AND EXISTS (
        SELECT 1
        FROM public.official_event_predictions AS prediction
        WHERE prediction.event_id = event_id_param
          AND prediction.user_id = score.user_id
      )
  ),
  desired AS (
    SELECT
      ranked.user_id,
      rule.id AS rule_id
    FROM ranked
    JOIN public.official_event_badge_rules AS rule
      ON rule.event_id = event_id_param
      AND rule.is_active
      AND rule.rule_type = CASE
        WHEN ranked.position = 1 THEN 'winner'
        WHEN ranked.position <= 10 THEN 'top_10'
        WHEN ceil(ranked.position * 100.0 / ranked.participant_count) <= 1
          THEN 'top_1_percent'
        WHEN ceil(ranked.position * 100.0 / ranked.participant_count) <= 10
          THEN 'top_10_percent'
        ELSE 'participant'
      END
    UNION
    SELECT
      ranked.user_id,
      rule.id
    FROM ranked
    JOIN public.official_event_badge_rules AS rule
      ON rule.event_id = event_id_param
      AND rule.is_active
      AND rule.rule_type = 'participant'
  )
  SELECT COUNT(*) INTO desired_count FROM desired;

  IF COALESCE(dry_run_param, true) THEN
    RETURN jsonb_build_object(
      'event_id', event_id_param,
      'dry_run', true,
      'desired_awards', desired_count
    );
  END IF;

  UPDATE public.official_event_badge_awards AS award
  SET
    revoked_at = now(),
    revoked_reason = 'superseded_by_reconciliation',
    featured_position = NULL,
    reconciled_at = now()
  WHERE award.event_id = event_id_param
    AND award.revoked_at IS NULL;

  WITH ranked AS (
    SELECT
      score.user_id,
      row_number() OVER (
        ORDER BY
          score.total_points DESC,
          score.exact_hits DESC,
          score.first_prediction_at ASC NULLS LAST,
          participation.joined_at ASC,
          score.user_id ASC
      ) AS position,
      count(*) OVER () AS participant_count
    FROM public.official_event_scores AS score
    JOIN public.official_event_participations AS participation
      ON participation.event_id = score.event_id
      AND participation.user_id = score.user_id
    WHERE score.event_id = event_id_param
      AND participation.prize_eligibility <> 'disqualified'
      AND EXISTS (
        SELECT 1
        FROM public.official_event_predictions AS prediction
        WHERE prediction.event_id = event_id_param
          AND prediction.user_id = score.user_id
      )
  ),
  desired AS (
    SELECT ranked.user_id, rule.id AS rule_id
    FROM ranked
    JOIN public.official_event_badge_rules AS rule
      ON rule.event_id = event_id_param
      AND rule.is_active
      AND rule.rule_type = CASE
        WHEN ranked.position = 1 THEN 'winner'
        WHEN ranked.position <= 10 THEN 'top_10'
        WHEN ceil(ranked.position * 100.0 / ranked.participant_count) <= 1
          THEN 'top_1_percent'
        WHEN ceil(ranked.position * 100.0 / ranked.participant_count) <= 10
          THEN 'top_10_percent'
        ELSE 'participant'
      END
    UNION
    SELECT ranked.user_id, rule.id
    FROM ranked
    JOIN public.official_event_badge_rules AS rule
      ON rule.event_id = event_id_param
      AND rule.is_active
      AND rule.rule_type = 'participant'
  )
  INSERT INTO public.official_event_badge_awards (
    event_id,
    user_id,
    rule_id,
    awarded_at,
    revoked_at,
    revoked_reason,
    reconciled_at
  )
  SELECT
    event_id_param,
    desired.user_id,
    desired.rule_id,
    now(),
    NULL,
    NULL,
    now()
  FROM desired
  ON CONFLICT (event_id, user_id, rule_id) DO UPDATE
  SET
    revoked_at = NULL,
    revoked_reason = NULL,
    reconciled_at = now();

  GET DIAGNOSTICS changed_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'event_id', event_id_param,
    'dry_run', false,
    'desired_awards', desired_count,
    'reconciled_awards', changed_count
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
    SELECT 1
    FROM public.official_events
    WHERE id = event_id_param
      AND visibility IN ('public', 'unlisted')
      AND status IN ('active', 'completed', 'archived')
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
            'name', featured_rule.name_cs,
            'icon', featured_rule.icon
          ) ORDER BY featured_award.featured_position)
          FROM public.official_event_badge_awards AS featured_award
          JOIN public.official_event_badge_rules AS featured_rule
            ON featured_rule.id = featured_award.rule_id
          WHERE featured_award.event_id = event_id_param
            AND featured_award.user_id = visible.user_id
            AND featured_award.revoked_at IS NULL
            AND featured_award.featured_position IS NOT NULL
        ), '[]'::jsonb)
      ) ORDER BY visible.position)
      FROM visible_rows AS visible
      JOIN public.profiles AS profile ON profile.id = visible.user_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_official_event_season_result(
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
  event_row public.official_events%ROWTYPE;
  participation_row public.official_event_participations%ROWTYPE;
  caller_position bigint;
  participant_count bigint;
  caller_points integer;
  caller_exact_hits integer;
  saved_predictions integer;
  evaluated_predictions integer;
  top_percent integer;
  better_than_percent integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO event_row
  FROM public.official_events
  WHERE id = event_id_param
    AND visibility IN ('public', 'unlisted')
    AND status IN ('completed', 'archived');

  SELECT * INTO participation_row
  FROM public.official_event_participations
  WHERE event_id = event_id_param AND user_id = caller_id;

  IF event_row.id IS NULL OR participation_row.user_id IS NULL THEN
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
    ranked.position,
    (SELECT COUNT(*) FROM ranked),
    ranked.total_points,
    ranked.exact_hits
  INTO caller_position, participant_count, caller_points, caller_exact_hits
  FROM ranked
  WHERE ranked.user_id = caller_id;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE match.status = 'finished')
  INTO saved_predictions, evaluated_predictions
  FROM public.official_event_predictions AS prediction
  JOIN public.matches AS match ON match.id = prediction.match_id
  WHERE prediction.event_id = event_id_param
    AND prediction.user_id = caller_id;

  IF caller_position IS NOT NULL AND participant_count > 0 THEN
    top_percent := LEAST(
      100,
      GREATEST(1, ceil(caller_position * 100.0 / participant_count)::integer)
    );
    better_than_percent := GREATEST(
      0,
      floor((participant_count - caller_position) * 100.0 / participant_count)::integer
    );
  END IF;

  RETURN jsonb_build_object(
    'event_id', event_row.id,
    'slug', event_row.slug,
    'event_name', event_row.name,
    'partner_name', event_row.partner_name,
    'accent_color', event_row.accent_color,
    'position', caller_position,
    'participant_count', participant_count,
    'top_percent', top_percent,
    'better_than_percent', better_than_percent,
    'total_points', COALESCE(caller_points, 0),
    'exact_hits', COALESCE(caller_exact_hits, 0),
    'saved_predictions', COALESCE(saved_predictions, 0),
    'evaluated_predictions', COALESCE(evaluated_predictions, 0),
    'result_is_final',
      COALESCE(saved_predictions, 0) > 0
      AND evaluated_predictions = saved_predictions,
    'prize_eligibility', participation_row.prize_eligibility,
    'badges', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', award.id,
        'name', rule.name_cs,
        'description', rule.description_cs,
        'icon', rule.icon,
        'rule_type', rule.rule_type,
        'featured_position', award.featured_position
      ) ORDER BY award.awarded_at)
      FROM public.official_event_badge_awards AS award
      JOIN public.official_event_badge_rules AS rule ON rule.id = award.rule_id
      WHERE award.event_id = event_id_param
        AND award.user_id = caller_id
        AND award.revoked_at IS NULL
    ), '[]'::jsonb),
    'qualifying_prizes', CASE
      WHEN participation_row.prize_eligibility IN ('ineligible', 'disqualified')
        OR caller_position IS NULL THEN '[]'::jsonb
      ELSE COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'title', prize.title,
          'description', prize.description,
          'partner_name', prize.partner_name,
          'rank_from', prize.rank_from,
          'rank_to', prize.rank_to
        ) ORDER BY prize.display_order)
        FROM public.official_event_prizes AS prize
        WHERE prize.event_id = event_id_param
          AND caller_position BETWEEN prize.rank_from AND prize.rank_to
      ), '[]'::jsonb)
    END
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
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
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
        'key', award.key,
        'name', award.name,
        'description', award.description,
        'icon', award.icon,
        'tier', award.tier,
        'context_type', award.context_type,
        'context_id', award.context_id,
        'awarded_at', award.awarded_at,
        'featured_position', award.featured_position
      ) ORDER BY award.featured_position NULLS LAST, award.awarded_at DESC)
      FROM (
        SELECT
          user_badge.id,
          badge.key,
          badge.name_cs AS name,
          badge.description_cs AS description,
          badge.icon,
          badge.tier,
          user_badge.context_type,
          user_badge.context_id,
          user_badge.awarded_at,
          user_badge.featured_position
        FROM public.user_badges AS user_badge
        JOIN public.badge_definitions AS badge ON badge.key = user_badge.badge_key
        WHERE user_badge.user_id = target_user_id
        UNION ALL
        SELECT
          event_award.id,
          event_rule.key,
          event_rule.name_cs,
          event_rule.description_cs,
          event_rule.icon,
          CASE event_rule.rule_type
            WHEN 'winner' THEN 'gold'
            WHEN 'top_10' THEN 'gold'
            WHEN 'top_1_percent' THEN 'silver'
            WHEN 'top_10_percent' THEN 'bronze'
            ELSE 'special'
          END,
          'official_event',
          event_award.event_id::text,
          event_award.awarded_at,
          event_award.featured_position
        FROM public.official_event_badge_awards AS event_award
        JOIN public.official_event_badge_rules AS event_rule
          ON event_rule.id = event_award.rule_id
        WHERE event_award.user_id = target_user_id
          AND event_award.revoked_at IS NULL
      ) AS award
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
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(caller_id::text, 0));

  IF COALESCE(array_length(badge_ids, 1), 0) > 3 THEN
    RAISE EXCEPTION 'At most three badges can be featured.'
      USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT COUNT(DISTINCT value)
    FROM unnest(COALESCE(badge_ids, ARRAY[]::uuid[])) AS value
  ) <> COALESCE(array_length(badge_ids, 1), 0) THEN
    RAISE EXCEPTION 'Featured badges must be unique.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(badge_ids, ARRAY[]::uuid[])) AS requested(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_badges
      WHERE id = requested.id AND user_id = caller_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.official_event_badge_awards
      WHERE id = requested.id
        AND user_id = caller_id
        AND revoked_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'A featured badge does not belong to the caller.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.user_badges
  SET featured_position = NULL
  WHERE user_id = caller_id;

  UPDATE public.official_event_badge_awards
  SET featured_position = NULL
  WHERE user_id = caller_id;

  FOREACH badge_id IN ARRAY COALESCE(badge_ids, ARRAY[]::uuid[])
  LOOP
    position_index := position_index + 1;
    UPDATE public.user_badges
    SET featured_position = position_index
    WHERE id = badge_id AND user_id = caller_id;

    IF NOT FOUND THEN
      UPDATE public.official_event_badge_awards
      SET featured_position = position_index
      WHERE id = badge_id
        AND user_id = caller_id
        AND revoked_at IS NULL;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.configure_official_event_product_secure(
  uuid, text, text, jsonb, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_official_event_product_secure(
  uuid, text, text, jsonb, jsonb, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.join_official_event(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.join_official_event(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_official_event_terms_and_join(
  uuid, boolean, boolean, boolean
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.accept_official_event_terms_and_join(
  uuid, boolean, boolean, boolean
) TO authenticated;

REVOKE ALL ON FUNCTION public.review_official_event_participation_secure(
  uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_official_event_participation_secure(
  uuid, uuid, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_official_event_badges(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_official_event_badges(uuid, boolean)
  TO service_role;

REVOKE ALL ON FUNCTION public.get_official_event_home_card()
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_official_event_home_card() TO authenticated;

REVOKE ALL ON FUNCTION public.get_official_event_detail(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_official_event_detail(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.resolve_official_event_slug(text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_official_event_slug(text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_official_event_season_result(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_official_event_season_result(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.get_official_event_leaderboard(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_official_event_leaderboard(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_badges(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_badges(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.set_featured_badges(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_featured_badges(uuid[]) TO authenticated;

INSERT INTO public.app_feature_flags (key, enabled, is_public)
VALUES
  ('official_event_commercial_enabled', false, true),
  ('official_event_results_enabled', false, true)
ON CONFLICT (key) DO UPDATE
SET
  enabled = false,
  is_public = EXCLUDED.is_public,
  updated_at = now();
