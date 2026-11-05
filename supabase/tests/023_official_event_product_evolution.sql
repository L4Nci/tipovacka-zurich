-- Rollback-only integration checks. Run after migrations 001-023 on an
-- isolated PostgreSQL/Supabase-compatible database.

BEGIN;

INSERT INTO public.sports (id, slug, name)
VALUES ('evolution-test-sport', 'evolution-test-sport', 'Evolution Test Sport');

INSERT INTO public.participants (id, sport_id, name, short_name)
VALUES
  ('evolution-test-home', 'evolution-test-sport', 'Evolution Home', 'EVH'),
  ('evolution-test-away', 'evolution-test-sport', 'Evolution Away', 'EVA');

INSERT INTO public.tournaments (id, sport_id, slug, name, status)
VALUES (
  'evolution-test-tournament',
  'evolution-test-sport',
  'evolution-test-tournament',
  'Evolution Test Tournament',
  'active'
);

INSERT INTO public.matches (
  id, tournament_id, home_participant_id, away_participant_id,
  start_time_utc, lock_time_utc, status
)
VALUES (
  'evolution-test-match',
  'evolution-test-tournament',
  'evolution-test-home',
  'evolution-test-away',
  now() + interval '2 days',
  now() + interval '2 days' - interval '5 minutes',
  'scheduled'
);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000b01',
    'authenticated',
    'authenticated',
    'evolution-admin@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Evolution Admin"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000b02',
    'authenticated',
    'authenticated',
    'evolution-player@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Evolution Player"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000b03',
    'authenticated',
    'authenticated',
    'evolution-rival@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Evolution Rival"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000b04',
    'authenticated',
    'authenticated',
    'evolution-third@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Evolution Third"}'::jsonb,
    now(),
    now()
  );

UPDATE public.profiles
SET role = 'admin'
WHERE id = '00000000-0000-4000-8000-000000000b01';

INSERT INTO public.official_events (
  id, slug, name, description, tournament_id, status,
  registration_opens_at, registration_closes_at, starts_at, ends_at,
  featured, onboarding_eligible, created_by
)
VALUES (
  '00000000-0000-4000-8000-000000000b10',
  'evolution-test-event',
  'Evolution Test Event',
  'Public event integration fixture',
  'evolution-test-tournament',
  'active',
  now() - interval '1 day',
  now() + interval '1 day',
  now() - interval '1 day',
  now() + interval '5 days',
  true,
  true,
  '00000000-0000-4000-8000-000000000b01'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000b01","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000b01',
  true
);
DO $$
BEGIN
  BEGIN
    PERFORM public.configure_official_event_product_secure(
      '00000000-0000-4000-8000-000000000b10',
      'public',
      '#123456',
      '{}'::jsonb,
      '{}'::jsonb,
      '[]'::jsonb
    );
    RAISE EXCEPTION 'Client platform admin configured commercial metadata.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT public.configure_official_event_product_secure(
  '00000000-0000-4000-8000-000000000b10',
  'public',
  '#123456',
  '{
    "name":"Partner QA",
    "logo_url":"https://example.invalid/logo.png",
    "url":"https://example.invalid",
    "text":"Partner dodal ceny, nikoliv soutěžní data."
  }'::jsonb,
  '{
    "version":1,
    "summary":"Krátká pravidla QA eventu.",
    "url":"https://example.invalid/rules",
    "minimum_age":18,
    "eligible_regions":["CZ","SK"],
    "employees_excluded":true,
    "organizer_name":"Tipovačka",
    "organizer_contact_url":"https://example.invalid/contact",
    "claim_instructions":"Výherce projde ruční kontrolou."
  }'::jsonb,
  '[
    {"rank_from":1,"rank_to":1,"title":"Hlavní cena","partner_name":"Partner QA"},
    {"rank_from":2,"rank_to":3,"title":"Vedlejší cena","partner_name":"Partner QA"}
  ]'::jsonb
);
RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT visibility <> 'public'
      OR terms_version <> 1
      OR eligible_regions <> ARRAY['CZ', 'SK']
    FROM public.official_events
    WHERE id = '00000000-0000-4000-8000-000000000b10'
  ) OR (
    SELECT COUNT(*) FROM public.official_event_prizes
    WHERE event_id = '00000000-0000-4000-8000-000000000b10'
  ) <> 2 THEN
    RAISE EXCEPTION 'Trusted event configuration was not stored.';
  END IF;

  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM public.configure_official_event_product_secure(
      '00000000-0000-4000-8000-000000000b10',
      'public',
      '#123456',
      '{}'::jsonb,
      '{"version":1,"eligible_regions":["TOO-LONG-CODE"]}'::jsonb,
      '[]'::jsonb
    );
    RESET ROLE;
    RAISE EXCEPTION 'Invalid region code was accepted.';
  EXCEPTION WHEN invalid_parameter_value THEN
    RESET ROLE;
  END;

  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM public.configure_official_event_product_secure(
      '00000000-0000-4000-8000-000000000b10',
      'public',
      '#123456',
      '{}'::jsonb,
      '{"version":1}'::jsonb,
      '[
        {"rank_from":1,"rank_to":2,"title":"First"},
        {"rank_from":2,"rank_to":3,"title":"Overlap"}
      ]'::jsonb
    );
    RESET ROLE;
    RAISE EXCEPTION 'Overlapping prize ranges were accepted.';
  EXCEPTION WHEN invalid_parameter_value THEN
    RESET ROLE;
  END;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000b02","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000b02',
  true
);
DO $$
DECLARE
  first_join jsonb;
  duplicate_join jsonb;
  detail jsonb;
  changed_rows integer;
BEGIN
  BEGIN
    PERFORM public.join_official_event(
      '00000000-0000-4000-8000-000000000b10'
    );
    RAISE EXCEPTION 'Participation was created without accepting current terms.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  SELECT public.accept_official_event_terms_and_join(
    '00000000-0000-4000-8000-000000000b10',
    true,
    true,
    true
  ) INTO first_join;
  SELECT public.join_official_event(
    '00000000-0000-4000-8000-000000000b10'
  ) INTO duplicate_join;

  IF first_join->>'state' <> 'joined'
    OR duplicate_join->>'state' <> 'already_participating' THEN
    RAISE EXCEPTION 'Terms acceptance and explicit join are not idempotent.';
  END IF;

  SELECT public.get_official_event_detail(
    '00000000-0000-4000-8000-000000000b10'
  ) INTO detail;
  IF detail->'terms'->>'accepted' <> 'true'
    OR jsonb_array_length(detail->'prizes') <> 2
    OR detail::text LIKE '%@example.invalid%'
    OR detail::text LIKE '%created_by%' THEN
    RAISE EXCEPTION 'Event detail is incomplete or leaks private identity.';
  END IF;

  PERFORM public.save_official_event_prediction(
    '00000000-0000-4000-8000-000000000b10',
    'evolution-test-match',
    2,
    1
  );

  BEGIN
    INSERT INTO public.official_event_prizes (
      event_id, rank_from, rank_to, title, display_order
    )
    VALUES (
      '00000000-0000-4000-8000-000000000b10',
      4,
      4,
      'Forged prize',
      3
    );
    RAISE EXCEPTION 'Client inserted an event prize.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE public.official_events
    SET partner_name = 'Forged partner'
    WHERE id = '00000000-0000-4000-8000-000000000b10';
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
    IF changed_rows <> 0 THEN
      RAISE EXCEPTION 'Client changed server-managed event metadata.';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

INSERT INTO public.official_event_participations (
  event_id, user_id, prize_eligibility
)
VALUES
  (
    '00000000-0000-4000-8000-000000000b10',
    '00000000-0000-4000-8000-000000000b03',
    'pending_review'
  ),
  (
    '00000000-0000-4000-8000-000000000b10',
    '00000000-0000-4000-8000-000000000b04',
    'pending_review'
  );

INSERT INTO public.official_event_scores (event_id, user_id)
VALUES
  (
    '00000000-0000-4000-8000-000000000b10',
    '00000000-0000-4000-8000-000000000b03'
  ),
  (
    '00000000-0000-4000-8000-000000000b10',
    '00000000-0000-4000-8000-000000000b04'
  );

INSERT INTO public.official_event_predictions (
  event_id, user_id, match_id, predicted_home_score, predicted_away_score,
  points_earned
)
VALUES
  (
    '00000000-0000-4000-8000-000000000b10',
    '00000000-0000-4000-8000-000000000b03',
    'evolution-test-match',
    2,
    1,
    5
  ),
  (
    '00000000-0000-4000-8000-000000000b10',
    '00000000-0000-4000-8000-000000000b04',
    'evolution-test-match',
    0,
    0,
    0
  );

UPDATE public.official_event_predictions
SET points_earned = 5
WHERE event_id = '00000000-0000-4000-8000-000000000b10'
  AND user_id = '00000000-0000-4000-8000-000000000b02';

UPDATE public.matches
SET status = 'finished', home_score = 2, away_score = 1
WHERE id = 'evolution-test-match';

UPDATE public.official_event_scores
SET total_points = 5, exact_hits = 1, first_prediction_at = now() - interval '2 hours'
WHERE event_id = '00000000-0000-4000-8000-000000000b10'
  AND user_id IN (
    '00000000-0000-4000-8000-000000000b02',
    '00000000-0000-4000-8000-000000000b03'
  );

UPDATE public.official_event_scores
SET total_points = 0, exact_hits = 0, first_prediction_at = now() - interval '1 hour'
WHERE event_id = '00000000-0000-4000-8000-000000000b10'
  AND user_id = '00000000-0000-4000-8000-000000000b04';

INSERT INTO public.official_event_badge_rules (
  event_id, key, name_cs, description_cs, icon, rule_type, is_active
)
VALUES
  (
    '00000000-0000-4000-8000-000000000b10',
    'winner',
    'Vítěz eventu',
    'Nejlepší výsledek sezóny.',
    'Trophy',
    'winner',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000b10',
    'top-10',
    'TOP 10',
    'Umístění mezi nejlepšími deseti.',
    'Medal',
    'top_10',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000b10',
    'participant',
    'Účastník eventu',
    'Alespoň jeden platný tip.',
    'TicketCheck',
    'participant',
    true
  );

UPDATE public.official_events
SET status = 'completed', ends_at = now() - interval '1 minute'
WHERE id = '00000000-0000-4000-8000-000000000b10';

SET LOCAL ROLE service_role;
SELECT public.reconcile_official_event_badges(
  '00000000-0000-4000-8000-000000000b10',
  true
);
SELECT public.reconcile_official_event_badges(
  '00000000-0000-4000-8000-000000000b10',
  false
);
SELECT public.reconcile_official_event_badges(
  '00000000-0000-4000-8000-000000000b10',
  false
);
SELECT public.review_official_event_participation_secure(
  '00000000-0000-4000-8000-000000000b10',
  '00000000-0000-4000-8000-000000000b04',
  'disqualified',
  'QA manual review'
);
SELECT public.reconcile_official_event_badges(
  '00000000-0000-4000-8000-000000000b10',
  false
);
RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM public.official_event_badge_awards AS award
    JOIN public.official_event_badge_rules AS rule ON rule.id = award.rule_id
    WHERE award.event_id = '00000000-0000-4000-8000-000000000b10'
      AND award.user_id = '00000000-0000-4000-8000-000000000b02'
      AND award.revoked_at IS NULL
      AND rule.rule_type IN ('winner', 'participant')
  ) <> 2 OR (
    SELECT COUNT(*)
    FROM public.official_event_badge_awards AS award
    JOIN public.official_event_badge_rules AS rule ON rule.id = award.rule_id
    WHERE award.event_id = '00000000-0000-4000-8000-000000000b10'
      AND award.user_id = '00000000-0000-4000-8000-000000000b03'
      AND award.revoked_at IS NULL
      AND rule.rule_type IN ('top_10', 'participant')
  ) <> 2 THEN
    RAISE EXCEPTION 'Highest-tier plus participant award contract is incorrect.';
  END IF;

  IF (
    SELECT COUNT(*) FROM public.official_event_badge_awards
    WHERE event_id = '00000000-0000-4000-8000-000000000b10'
      AND user_id = '00000000-0000-4000-8000-000000000b04'
      AND revoked_at IS NULL
  ) <> 0 THEN
    RAISE EXCEPTION 'Disqualified participation retained active event awards.';
  END IF;

  IF (
    SELECT prize_eligibility
    FROM public.official_event_participations
    WHERE event_id = '00000000-0000-4000-8000-000000000b10'
      AND user_id = '00000000-0000-4000-8000-000000000b04'
  ) <> 'disqualified' OR (
    SELECT total_points
    FROM public.official_event_scores
    WHERE event_id = '00000000-0000-4000-8000-000000000b10'
      AND user_id = '00000000-0000-4000-8000-000000000b04'
  ) <> 0 THEN
    RAISE EXCEPTION 'Eligibility review modified or lost the sporting score.';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000b03","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000b03',
  true
);
DO $$
DECLARE
  result jsonb;
  leaderboard jsonb;
BEGIN
  SELECT public.get_official_event_season_result(
    '00000000-0000-4000-8000-000000000b10'
  ) INTO result;
  SELECT public.get_official_event_leaderboard(
    '00000000-0000-4000-8000-000000000b10'
  ) INTO leaderboard;

  IF (result->>'position')::integer <> 2
    OR (result->>'participant_count')::integer <> 3
    OR (result->>'top_percent')::integer <> 67
    OR (result->>'better_than_percent')::integer <> 33
    OR result->>'result_is_final' <> 'true'
    OR leaderboard::text LIKE '%@example.invalid%'
    OR leaderboard::text LIKE '%user_id%' THEN
    RAISE EXCEPTION 'Season result or compact leaderboard contract is incorrect.';
  END IF;
END;
$$;
RESET ROLE;

ROLLBACK;

SELECT 'Official event product evolution integration scenarios passed.' AS result;
