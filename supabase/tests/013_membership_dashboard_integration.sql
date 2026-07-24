-- Rollback-only integration checks for Phase 013.
-- Run only against local or isolated staging after migrations 001-013.

BEGIN;

INSERT INTO public.sports (id, slug, name)
VALUES ('phase-013-sport', 'phase-013-sport', 'Phase 013 Test Sport');

INSERT INTO public.tournaments (
  id,
  sport_id,
  slug,
  name,
  status,
  actual_tournament_winner_id
)
VALUES (
  'phase-013-tournament',
  'phase-013-sport',
  'phase-013-tournament',
  'Phase 013 Test Tournament',
  'finished',
  NULL
);

INSERT INTO public.participants (id, sport_id, name, short_name)
VALUES
  ('phase-013-home', 'phase-013-sport', 'Phase 013 Home', 'P13H'),
  ('phase-013-away', 'phase-013-sport', 'Phase 013 Away', 'P13A');

UPDATE public.tournaments
SET actual_tournament_winner_id = 'phase-013-home'
WHERE id = 'phase-013-tournament';

INSERT INTO public.matches (
  id,
  tournament_id,
  home_participant_id,
  away_participant_id,
  start_time_utc,
  lock_time_utc,
  status,
  home_score,
  away_score
)
VALUES (
  'phase-013-match',
  'phase-013-tournament',
  'phase-013-home',
  'phase-013-away',
  now() - interval '1 day',
  now() - interval '1 day 5 minutes',
  'finished',
  2,
  1
);

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000501',
    'authenticated',
    'authenticated',
    'phase-013-owner@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Phase 013 Owner"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000502',
    'authenticated',
    'authenticated',
    'phase-013-member@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Phase 013 Member"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000503',
    'authenticated',
    'authenticated',
    'phase-013-rejected@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Phase 013 Rejected"}'::jsonb,
    now(),
    now()
  );

CREATE TEMP TABLE phase013_context (
  lobby_id text PRIMARY KEY,
  join_code text NOT NULL
) ON COMMIT DROP;
GRANT ALL ON phase013_context TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000501","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000501', true);
INSERT INTO phase013_context (lobby_id, join_code)
SELECT created.id, created.join_code
FROM public.create_lobby_secure(
  'Phase 013 Dashboard Lobby',
  'phase-013-tournament',
  'private',
  NULL,
  NULL,
  'approval_required'
) AS created;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000502","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000502', true);
SELECT membership_state
FROM public.join_lobby_secure((SELECT join_code FROM phase013_context));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.get_user_membership_dashboard()
    WHERE item_type = 'join_request'
      AND request_status = 'pending'
      AND lobby_id = (SELECT lobby_id FROM phase013_context)
  ) THEN
    RAISE EXCEPTION 'Applicant Home read model is missing the pending request.';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000501","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000501', true);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.get_user_membership_dashboard()
    WHERE item_type = 'management'
      AND pending_request_count = 1
      AND lobby_id = (SELECT lobby_id FROM phase013_context)
  ) THEN
    RAISE EXCEPTION 'Owner Home read model is missing management attention.';
  END IF;
END;
$$;

SELECT public.resolve_lobby_join_request(
  (
    SELECT id
    FROM public.lobby_join_requests
    WHERE lobby_id = (SELECT lobby_id FROM phase013_context)
      AND user_id = '00000000-0000-4000-8000-000000000502'
      AND status = 'pending'
  ),
  'approved'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000502","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000502', true);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.get_user_membership_dashboard()
    WHERE item_type = 'join_request'
      AND request_status = 'approved'
      AND lobby_id = (SELECT lobby_id FROM phase013_context)
  ) THEN
    RAISE EXCEPTION 'Applicant Home read model is missing approved state.';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000503","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000503', true);
SELECT membership_state
FROM public.join_lobby_secure((SELECT join_code FROM phase013_context));
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000501","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000501', true);
SELECT public.resolve_lobby_join_request(
  (
    SELECT id
    FROM public.lobby_join_requests
    WHERE lobby_id = (SELECT lobby_id FROM phase013_context)
      AND user_id = '00000000-0000-4000-8000-000000000503'
      AND status = 'pending'
  ),
  'rejected'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000503","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000503', true);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.get_user_membership_dashboard()
    WHERE item_type = 'join_request'
      AND request_status = 'rejected'
      AND lobby_id = (SELECT lobby_id FROM phase013_context)
  ) THEN
    RAISE EXCEPTION 'Applicant Home read model is missing rejected state.';
  END IF;
END;
$$;
RESET ROLE;

-- Seed immutable historical scoring using the trusted test role. The Hall of
-- Fame must continue to include the player after membership removal.
INSERT INTO public.predictions (
  user_id,
  lobby_id,
  match_id,
  predicted_home_score,
  predicted_away_score,
  points_earned
)
VALUES (
  '00000000-0000-4000-8000-000000000502',
  (SELECT lobby_id FROM phase013_context),
  'phase-013-match',
  2,
  1,
  5
);

INSERT INTO public.longterm_predictions (
  lobby_id,
  tournament_id,
  user_id,
  prediction_type,
  predicted_participant_id,
  points_earned
)
VALUES (
  (SELECT lobby_id FROM phase013_context),
  'phase-013-tournament',
  '00000000-0000-4000-8000-000000000502',
  'tournament_winner',
  'phase-013-home',
  10
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000501","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000501', true);

DO $$
DECLARE
  before_points bigint;
  after_points bigint;
BEGIN
  SELECT total_points INTO STRICT before_points
  FROM public.get_lobby_hall_of_fame((SELECT lobby_id FROM phase013_context))
  WHERE player_id = '00000000-0000-4000-8000-000000000502';

  IF before_points <> 15 THEN
    RAISE EXCEPTION 'Unexpected Hall of Fame baseline: %', before_points;
  END IF;

  PERFORM public.remove_lobby_member_secure(
    (SELECT lobby_id FROM phase013_context),
    '00000000-0000-4000-8000-000000000502'
  );

  SELECT total_points INTO STRICT after_points
  FROM public.get_lobby_hall_of_fame((SELECT lobby_id FROM phase013_context))
  WHERE player_id = '00000000-0000-4000-8000-000000000502';

  IF after_points <> before_points THEN
    RAISE EXCEPTION 'Former-member Hall of Fame history changed: % -> %', before_points, after_points;
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000502","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000502', true);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.get_user_membership_dashboard()
    WHERE item_type = 'membership'
      AND membership_status = 'removed'
      AND lobby_id = (SELECT lobby_id FROM phase013_context)
  ) THEN
    RAISE EXCEPTION 'Removed membership event is missing from Home.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.get_lobby_hall_of_fame((SELECT lobby_id FROM phase013_context))
  ) THEN
    RAISE EXCEPTION 'Removed member retained internal lobby read access.';
  END IF;
END;
$$;
RESET ROLE;

ROLLBACK;
