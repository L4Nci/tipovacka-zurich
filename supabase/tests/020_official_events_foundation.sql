-- Rollback-only integration checks. Run after migrations 001-020 on an
-- isolated PostgreSQL/Supabase-compatible database.

BEGIN;

INSERT INTO public.sports (id, slug, name)
VALUES ('official-test-sport', 'official-test-sport', 'Official Test Sport');

INSERT INTO public.participants (id, sport_id, name, short_name)
VALUES
  ('official-test-home', 'official-test-sport', 'Official Home', 'OFH'),
  ('official-test-away', 'official-test-sport', 'Official Away', 'OFA');

INSERT INTO public.tournaments (id, sport_id, slug, name, status)
VALUES
  (
    'official-test-tournament',
    'official-test-sport',
    'official-test-tournament',
    'Official Test Tournament',
    'active'
  ),
  (
    'official-test-foreign-tournament',
    'official-test-sport',
    'official-test-foreign-tournament',
    'Foreign Test Tournament',
    'active'
  );

INSERT INTO public.matches (
  id, tournament_id, home_participant_id, away_participant_id,
  start_time_utc, lock_time_utc, status
)
VALUES
  (
    'official-test-match',
    'official-test-tournament',
    'official-test-home',
    'official-test-away',
    now() + interval '2 days',
    now() + interval '2 days' - interval '5 minutes',
    'scheduled'
  ),
  (
    'official-test-other-match',
    'official-test-tournament',
    'official-test-home',
    'official-test-away',
    now() + interval '3 days',
    now() + interval '3 days' - interval '5 minutes',
    'scheduled'
  ),
  (
    'official-test-locked-match',
    'official-test-tournament',
    'official-test-home',
    'official-test-away',
    now() - interval '1 hour',
    now() - interval '1 hour' - interval '5 minutes',
    'scheduled'
  ),
  (
    'official-test-foreign-match',
    'official-test-foreign-tournament',
    'official-test-home',
    'official-test-away',
    now() + interval '4 days',
    now() + interval '4 days' - interval '5 minutes',
    'scheduled'
  );

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000901',
    'authenticated',
    'authenticated',
    'official-admin@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Official Admin"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000902',
    'authenticated',
    'authenticated',
    'official-player@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Official Player"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000903',
    'authenticated',
    'authenticated',
    'official-other@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Official Other"}'::jsonb,
    now(),
    now()
  );

UPDATE public.profiles
SET role = 'admin'
WHERE id = '00000000-0000-4000-8000-000000000901';

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000902","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000902', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.manage_official_event_secure(
      NULL,
      'forged-event',
      'Forged Event',
      NULL,
      NULL,
      'official-test-tournament',
      'active',
      now() - interval '1 day',
      now() + interval '1 day',
      now(),
      now() + interval '5 days',
      true,
      true,
      '{}'::jsonb
    );
    RAISE EXCEPTION 'Player created an official event.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000901', true);

CREATE TEMP TABLE created_official_event(id uuid);
INSERT INTO created_official_event
SELECT public.manage_official_event_secure(
  NULL,
  'official-test-event',
  'Official Test Event',
  'Safe event description',
  'football',
  'official-test-tournament',
  'active',
  now() - interval '1 day',
  now() + interval '1 day',
  now(),
  now() + interval '5 days',
  true,
  true,
  '{"partner":"QA"}'::jsonb
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000902","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000902', true);

DO $$
DECLARE
  event_id_value uuid := (SELECT id FROM created_official_event);
  first_join jsonb;
  duplicate_join jsonb;
  card jsonb;
  detail jsonb;
BEGIN
  SELECT public.join_official_event(event_id_value) INTO first_join;
  SELECT public.join_official_event(event_id_value) INTO duplicate_join;
  IF first_join->>'state' <> 'joined'
    OR duplicate_join->>'state' <> 'already_participating' THEN
    RAISE EXCEPTION 'Official event join is not idempotent.';
  END IF;

  PERFORM public.update_my_onboarding_state(1, 'started', 'control', NULL);
  IF public.get_my_onboarding_state()->>'status' <> 'started' THEN
    RAISE EXCEPTION 'Onboarding state was not persisted.';
  END IF;

  PERFORM public.save_official_event_prediction(
    event_id_value,
    'official-test-match',
    2,
    1
  );

  BEGIN
    PERFORM public.save_official_event_prediction(
      event_id_value,
      'official-test-locked-match',
      1,
      0
    );
    RAISE EXCEPTION 'A prediction was saved after lock.';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  BEGIN
    PERFORM public.save_official_event_prediction(
      event_id_value,
      'official-test-foreign-match',
      1,
      0
    );
    RAISE EXCEPTION 'A prediction was saved for another tournament.';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  SELECT public.get_official_event_home_card() INTO card;
  SELECT public.get_official_event_detail(event_id_value) INTO detail;
  IF card->>'event_id' <> event_id_value::text
    OR card->>'is_participating' <> 'true'
    OR jsonb_array_length(detail->'matches') <> 3 THEN
    RAISE EXCEPTION 'Official event read models are inconsistent.';
  END IF;

  BEGIN
    INSERT INTO public.official_event_participations (event_id, user_id)
    VALUES (event_id_value, '00000000-0000-4000-8000-000000000903');
    RAISE EXCEPTION 'Direct participation insert was allowed.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE public.official_event_predictions
    SET points_earned = 5
    WHERE event_id = event_id_value
      AND user_id = '00000000-0000-4000-8000-000000000902';
    RAISE EXCEPTION 'Direct points update was allowed.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.official_event_badge_awards (
      event_id, user_id, rule_id
    )
    VALUES (
      event_id_value,
      '00000000-0000-4000-8000-000000000902',
      gen_random_uuid()
    );
    RAISE EXCEPTION 'Self-award insert was allowed.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  ('00000000-0000-4000-8000-0000000009' || suffix)::uuid,
  'authenticated',
  'authenticated',
  'official-rank-' || suffix || '@example.invalid',
  'not-a-real-password-hash',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('username', 'Rank ' || suffix),
  now(),
  now()
FROM unnest(ARRAY['10', '11', '12', '13', '14', '15']) AS suffix;

INSERT INTO public.official_event_participations (event_id, user_id)
SELECT
  (SELECT id FROM created_official_event),
  ('00000000-0000-4000-8000-0000000009' || suffix)::uuid
FROM unnest(ARRAY['10', '11', '12', '13', '14', '15']) AS suffix;

INSERT INTO public.official_event_scores (
  event_id, user_id, total_points, exact_hits, first_prediction_at
)
SELECT
  (SELECT id FROM created_official_event),
  ('00000000-0000-4000-8000-0000000009' || suffix)::uuid,
  total_points,
  0,
  now()
FROM (
  VALUES
    ('10', 60),
    ('11', 50),
    ('12', 40),
    ('13', 40),
    ('14', 20),
    ('15', 10)
) AS ranking(suffix, total_points);

UPDATE public.official_event_scores
SET total_points = 35
WHERE event_id = (SELECT id FROM created_official_event)
  AND user_id = '00000000-0000-4000-8000-000000000902';

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000902","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000902', true);
DO $$
DECLARE
  leaderboard jsonb;
BEGIN
  SELECT public.get_official_event_leaderboard(
    (SELECT id FROM created_official_event)
  ) INTO leaderboard;

  IF (leaderboard->>'participant_count')::integer <> 7
    OR (leaderboard->>'current_position')::integer <> 5
    OR (leaderboard->>'points_to_next')::integer <> 5
    OR jsonb_array_length(leaderboard->'rows') <> 7
    OR leaderboard->'rows'->2->>'username' <> 'Rank 12'
    OR leaderboard->'rows'->3->>'username' <> 'Rank 13'
    OR leaderboard::text LIKE '%user_id%'
    OR leaderboard::text LIKE '%@example.invalid%' THEN
    RAISE EXCEPTION 'Compact leaderboard contract is incorrect or leaks identity.';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000903","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000903', true);
DO $$
DECLARE
  event_id_value uuid := (SELECT id FROM created_official_event);
BEGIN
  IF public.get_official_event_detail(event_id_value) IS NOT NULL THEN
    RAISE EXCEPTION 'Non-participant received private event detail.';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000901', true);
DO $$
DECLARE
  event_id_value uuid := (SELECT id FROM created_official_event);
BEGIN
  BEGIN
    PERFORM public.manage_official_event_secure(
      NULL,
      'second-onboarding-event',
      'Second Onboarding Event',
      NULL,
      NULL,
      'official-test-tournament',
      'active',
      now() - interval '1 day',
      now() + interval '1 day',
      now(),
      now() + interval '5 days',
      true,
      true,
      '{}'::jsonb
    );
    RAISE EXCEPTION 'A second active onboarding event was allowed.';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  PERFORM public.manage_official_event_secure(
    event_id_value,
    'official-test-event',
    'Official Test Event',
    'Safe event description',
    'football',
    'official-test-tournament',
    'completed',
    now() - interval '1 day',
    now() + interval '1 day',
    now(),
    now() + interval '5 days',
    true,
    true,
    '{"partner":"QA"}'::jsonb
  );

  BEGIN
    PERFORM public.manage_official_event_secure(
      event_id_value,
      'official-test-event',
      'Official Test Event',
      'Safe event description',
      'football',
      'official-test-tournament',
      'active',
      now() - interval '1 day',
      now() + interval '1 day',
      now(),
      now() + interval '5 days',
      true,
      true,
      '{"partner":"QA"}'::jsonb
    );
    RAISE EXCEPTION 'A completed event was reopened.';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000902","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000902', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.update_my_onboarding_state(1, 'started', 'client-forged', NULL);
    RAISE EXCEPTION 'A client-selected onboarding variant was accepted.';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

DO $$
DECLARE
  event_id_value uuid := (SELECT id FROM created_official_event);
BEGIN
  IF (
    SELECT COUNT(*)
    FROM public.official_event_participations
    WHERE event_id = event_id_value
      AND user_id = '00000000-0000-4000-8000-000000000902'
  ) <> 1 THEN
    RAISE EXCEPTION 'Duplicate participation row was created.';
  END IF;
  IF (
    SELECT points_earned
    FROM public.official_event_predictions
    WHERE event_id = event_id_value
      AND user_id = '00000000-0000-4000-8000-000000000902'
      AND match_id = 'official-test-match'
  ) <> 0 THEN
    RAISE EXCEPTION 'Client prediction did not start with protected zero points.';
  END IF;
END;
$$;

ROLLBACK;

SELECT 'Official Events foundation integration scenarios passed.' AS result;
