-- Rollback-only zero-downtime checks for 010_membership_security_foundation.sql.
-- Run after migrations 001-010A and before 010b enforcement.

BEGIN;

INSERT INTO public.sports (id, slug, name)
VALUES ('phase-010a-sport', 'phase-010a-sport', 'Phase 010A Test Sport');

INSERT INTO public.tournaments (id, sport_id, slug, name, status)
VALUES (
  'phase-010a-tournament',
  'phase-010a-sport',
  'phase-010a-tournament',
  'Phase 010A Test Tournament',
  'active'
);

INSERT INTO public.participants (id, sport_id, name, short_name)
VALUES
  ('phase-010a-home', 'phase-010a-sport', 'Phase 010A Home', 'P10H'),
  ('phase-010a-away', 'phase-010a-sport', 'Phase 010A Away', 'P10A');

INSERT INTO public.matches (
  id,
  tournament_id,
  home_participant_id,
  away_participant_id,
  start_time_utc,
  lock_time_utc,
  status
)
VALUES (
  'phase-010a-match',
  'phase-010a-tournament',
  'phase-010a-home',
  'phase-010a-away',
  now() + interval '2 days 5 minutes',
  now() + interval '2 days',
  'scheduled'
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
    '00000000-0000-4000-8000-0000000000a1',
    'authenticated',
    'authenticated',
    'phase-010a-owner@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Phase 010A Owner"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-0000000000a2',
    'authenticated',
    'authenticated',
    'phase-010a-member@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Phase 010A Member"}'::jsonb,
    now(),
    now()
  );

-- Old production frontend create flow must remain usable between 010A and the
-- frontend RPC cutover.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-0000000000a1',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO public.lobbies (
  id,
  name,
  owner_id,
  tournament_id,
  join_code,
  visibility
)
VALUES (
  'phase-010a-legacy-lobby',
  'Phase 010A Legacy Lobby',
  '00000000-0000-4000-8000-0000000000a1',
  'phase-010a-tournament',
  'LEGACY010A',
  'public'
);

INSERT INTO public.lobby_tournaments (lobby_id, tournament_id, status)
VALUES ('phase-010a-legacy-lobby', 'phase-010a-tournament', 'active');

INSERT INTO public.lobby_members (lobby_id, user_id, role)
VALUES (
  'phase-010a-legacy-lobby',
  '00000000-0000-4000-8000-0000000000a1',
  'owner'
);

RESET ROLE;

-- Old production frontend join flow also remains available during the cutover.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-0000000000a2',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO public.lobby_members (lobby_id, user_id, role)
VALUES (
  'phase-010a-legacy-lobby',
  '00000000-0000-4000-8000-0000000000a2',
  'member'
);

-- A forged client points value is normalized even before enforcement cutover.
INSERT INTO public.predictions (
  user_id,
  lobby_id,
  match_id,
  predicted_home_score,
  predicted_away_score,
  points_earned
)
VALUES (
  '00000000-0000-4000-8000-0000000000a2',
  'phase-010a-legacy-lobby',
  'phase-010a-match',
  2,
  1,
  999
);

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.lobby_members
    WHERE lobby_id = 'phase-010a-legacy-lobby'
      AND user_id = '00000000-0000-4000-8000-0000000000a1'
      AND role = 'owner'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.lobby_members
    WHERE lobby_id = 'phase-010a-legacy-lobby'
      AND user_id = '00000000-0000-4000-8000-0000000000a2'
      AND role = 'member'
  ) THEN
    RAISE EXCEPTION '010A broke the legacy create/join transition path.';
  END IF;

  IF (
    SELECT points_earned
    FROM public.predictions
    WHERE user_id = '00000000-0000-4000-8000-0000000000a2'
      AND lobby_id = 'phase-010a-legacy-lobby'
      AND match_id = 'phase-010a-match'
  ) <> 0 THEN
    RAISE EXCEPTION '010A did not normalize forged prediction points.';
  END IF;
END;
$$;

-- The new RPC path is available at the same time as the legacy transition path.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-0000000000a1',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  created record;
BEGIN
  SELECT * INTO STRICT created
  FROM public.create_lobby_secure(
    'Phase 010A RPC Lobby',
    'phase-010a-tournament',
    'private',
    NULL,
    NULL
  );

  IF created.owner_id <> '00000000-0000-4000-8000-0000000000a1'
    OR NOT EXISTS (
      SELECT 1
      FROM public.lobby_members
      WHERE lobby_id = created.id
        AND user_id = created.owner_id
        AND role = 'member'
    ) THEN
    RAISE EXCEPTION '010A secure create RPC returned an invalid owner/membership.';
  END IF;
END;
$$;

RESET ROLE;

ROLLBACK;
