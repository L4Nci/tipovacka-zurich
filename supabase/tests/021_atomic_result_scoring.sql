-- Rollback-only integration checks. Run after migrations 001-021 on an
-- isolated PostgreSQL/Supabase-compatible database.

BEGIN;

INSERT INTO public.sports (id, slug, name)
VALUES ('atomic-test-sport', 'atomic-test-sport', 'Atomic Test Sport');

INSERT INTO public.participants (id, sport_id, name, short_name)
VALUES
  ('atomic-test-home', 'atomic-test-sport', 'Atomic Home', 'ATH'),
  ('atomic-test-away', 'atomic-test-sport', 'Atomic Away', 'ATA');

INSERT INTO public.tournaments (id, sport_id, slug, name, status)
VALUES (
  'atomic-test-tournament',
  'atomic-test-sport',
  'atomic-test-tournament',
  'Atomic Test Tournament',
  'active'
);

INSERT INTO public.matches (
  id, tournament_id, home_participant_id, away_participant_id,
  start_time_utc, lock_time_utc, status
)
VALUES (
  'atomic-test-match',
  'atomic-test-tournament',
  'atomic-test-home',
  'atomic-test-away',
  now() - interval '1 hour',
  now() - interval '65 minutes',
  'scheduled'
);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000911',
    'authenticated',
    'authenticated',
    'atomic-owner@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Atomic Owner"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000912',
    'authenticated',
    'authenticated',
    'atomic-player@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Atomic Player"}'::jsonb,
    now(),
    now()
  );

INSERT INTO public.lobbies (
  id, name, owner_id, tournament_id, join_code, visibility
)
VALUES (
  'atomic-test-lobby',
  'Atomic Test Lobby',
  '00000000-0000-4000-8000-000000000911',
  'atomic-test-tournament',
  'ATOMICCODE',
  'private'
);

INSERT INTO public.lobby_members (lobby_id, user_id, role, membership_status)
VALUES (
  'atomic-test-lobby',
  '00000000-0000-4000-8000-000000000911',
  'member',
  'active'
);

INSERT INTO public.predictions (
  user_id, lobby_id, match_id, predicted_home_score, predicted_away_score
)
VALUES (
  '00000000-0000-4000-8000-000000000911',
  'atomic-test-lobby',
  'atomic-test-match',
  2,
  1
);

INSERT INTO public.official_events (
  id, slug, name, tournament_id, status, featured, onboarding_eligible,
  created_by
)
VALUES (
  '00000000-0000-4000-8000-000000000920',
  'atomic-test-event',
  'Atomic Test Event',
  'atomic-test-tournament',
  'active',
  true,
  true,
  '00000000-0000-4000-8000-000000000911'
);

INSERT INTO public.official_event_participations (event_id, user_id)
VALUES (
  '00000000-0000-4000-8000-000000000920',
  '00000000-0000-4000-8000-000000000912'
);

INSERT INTO public.official_event_predictions (
  event_id, user_id, match_id, predicted_home_score, predicted_away_score
)
VALUES (
  '00000000-0000-4000-8000-000000000920',
  '00000000-0000-4000-8000-000000000912',
  'atomic-test-match',
  2,
  1
);

SET LOCAL ROLE service_role;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
SELECT set_config('request.jwt.claim.role', 'service_role', true);

SELECT public.apply_match_result_atomic(
  'atomic-test-match',
  2,
  1,
  '[{
    "user_id":"00000000-0000-4000-8000-000000000911",
    "lobby_id":"atomic-test-lobby",
    "predicted_home_score":2,
    "predicted_away_score":1,
    "points_earned":5
  }]'::jsonb,
  '[{
    "user_id":"00000000-0000-4000-8000-000000000912",
    "event_id":"00000000-0000-4000-8000-000000000920",
    "predicted_home_score":2,
    "predicted_away_score":1,
    "points_earned":5
  }]'::jsonb,
  'integration-test',
  'test-runner'
);
RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT points_earned FROM public.predictions
    WHERE user_id = '00000000-0000-4000-8000-000000000911'
      AND lobby_id = 'atomic-test-lobby'
      AND match_id = 'atomic-test-match'
  ) <> 5 OR (
    SELECT points_earned FROM public.official_event_predictions
    WHERE user_id = '00000000-0000-4000-8000-000000000912'
      AND event_id = '00000000-0000-4000-8000-000000000920'
      AND match_id = 'atomic-test-match'
  ) <> 5 THEN
    RAISE EXCEPTION 'Lobby and event predictions were not scored equally.';
  END IF;
  IF (
    SELECT total_points FROM public.official_event_scores
    WHERE event_id = '00000000-0000-4000-8000-000000000920'
      AND user_id = '00000000-0000-4000-8000-000000000912'
  ) <> 5 THEN
    RAISE EXCEPTION 'Event score aggregate was not updated.';
  END IF;
END;
$$;

-- Idempotent repeat.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT public.apply_match_result_atomic(
  'atomic-test-match', 2, 1,
  '[{"user_id":"00000000-0000-4000-8000-000000000911","lobby_id":"atomic-test-lobby","predicted_home_score":2,"predicted_away_score":1,"points_earned":5}]'::jsonb,
  '[{"user_id":"00000000-0000-4000-8000-000000000912","event_id":"00000000-0000-4000-8000-000000000920","predicted_home_score":2,"predicted_away_score":1,"points_earned":5}]'::jsonb,
  'integration-test', 'test-runner'
);
RESET ROLE;

-- Authoritative correction uses the same complete snapshot.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT public.apply_match_result_atomic(
  'atomic-test-match', 3, 1,
  '[{"user_id":"00000000-0000-4000-8000-000000000911","lobby_id":"atomic-test-lobby","predicted_home_score":2,"predicted_away_score":1,"points_earned":2}]'::jsonb,
  '[{"user_id":"00000000-0000-4000-8000-000000000912","event_id":"00000000-0000-4000-8000-000000000920","predicted_home_score":2,"predicted_away_score":1,"points_earned":2}]'::jsonb,
  'integration-test-correction', 'test-runner'
);
RESET ROLE;

DO $$
DECLARE
  before_lobby integer := (
    SELECT points_earned FROM public.predictions
    WHERE match_id = 'atomic-test-match'
  );
  before_event integer := (
    SELECT points_earned FROM public.official_event_predictions
    WHERE match_id = 'atomic-test-match'
  );
BEGIN
  IF before_lobby <> 2 OR before_event <> 2 THEN
    RAISE EXCEPTION 'Corrected result did not recalculate both layers.';
  END IF;

  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    SET LOCAL ROLE service_role;
    PERFORM public.apply_match_result_atomic(
      'atomic-test-match', 4, 1,
      '[{"user_id":"00000000-0000-4000-8000-000000000911","lobby_id":"atomic-test-lobby","predicted_home_score":9,"predicted_away_score":9,"points_earned":0}]'::jsonb,
      '[{"user_id":"00000000-0000-4000-8000-000000000912","event_id":"00000000-0000-4000-8000-000000000920","predicted_home_score":2,"predicted_away_score":1,"points_earned":2}]'::jsonb,
      'integration-test-failure', 'test-runner'
    );
    RESET ROLE;
    RAISE EXCEPTION 'Stale snapshot unexpectedly succeeded.';
  EXCEPTION WHEN serialization_failure THEN
    RESET ROLE;
  END;

  IF (
    SELECT home_score FROM public.matches WHERE id = 'atomic-test-match'
  ) <> 3 OR (
    SELECT points_earned FROM public.predictions WHERE match_id = 'atomic-test-match'
  ) <> before_lobby OR (
    SELECT points_earned FROM public.official_event_predictions
    WHERE match_id = 'atomic-test-match'
  ) <> before_event THEN
    RAISE EXCEPTION 'Failed atomic application left partial writes.';
  END IF;
END;
$$;

-- Set-based load check for a larger public event population.
INSERT INTO public.matches (
  id, tournament_id, home_participant_id, away_participant_id,
  start_time_utc, lock_time_utc, status
)
VALUES (
  'atomic-load-match',
  'atomic-test-tournament',
  'atomic-test-home',
  'atomic-test-away',
  now() - interval '2 hours',
  now() - interval '125 minutes',
  'scheduled'
);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  ('10000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
  'authenticated',
  'authenticated',
  'atomic-load-' || sequence || '@example.invalid',
  'not-a-real-password-hash',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('username', 'Atomic Load ' || sequence),
  now(),
  now()
FROM generate_series(1, 500) AS sequence;

INSERT INTO public.official_event_participations (event_id, user_id)
SELECT
  '00000000-0000-4000-8000-000000000920',
  ('10000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid
FROM generate_series(1, 500) AS sequence;

INSERT INTO public.official_event_predictions (
  event_id, user_id, match_id, predicted_home_score, predicted_away_score
)
SELECT
  '00000000-0000-4000-8000-000000000920',
  ('10000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
  'atomic-load-match',
  2,
  1
FROM generate_series(1, 500) AS sequence;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT public.apply_match_result_atomic(
  'atomic-load-match',
  2,
  1,
  '[]'::jsonb,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'user_id', prediction.user_id,
      'event_id', prediction.event_id,
      'predicted_home_score', prediction.predicted_home_score,
      'predicted_away_score', prediction.predicted_away_score,
      'points_earned', 5
    ))
    FROM public.official_event_predictions AS prediction
    WHERE prediction.match_id = 'atomic-load-match'
  ),
  'integration-load-test',
  'test-runner'
);
RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM public.official_event_predictions
    WHERE match_id = 'atomic-load-match' AND points_earned = 5
  ) <> 500 OR (
    SELECT COUNT(*)
    FROM public.official_event_scores
    WHERE event_id = '00000000-0000-4000-8000-000000000920'
      AND user_id::text LIKE '10000000-0000-4000-8000-%'
      AND total_points = 5
  ) <> 500 THEN
    RAISE EXCEPTION 'Large event score application did not update every row.';
  END IF;
END;
$$;

ROLLBACK;

SELECT 'Atomic lobby/event result scoring scenarios passed.' AS result;
