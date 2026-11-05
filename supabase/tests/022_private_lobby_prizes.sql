-- Rollback-only integration checks. Run after migrations 001-022 on an
-- isolated PostgreSQL/Supabase-compatible database.

BEGIN;

INSERT INTO public.sports (id, slug, name)
VALUES ('prize-test-sport', 'prize-test-sport', 'Prize Test Sport');

INSERT INTO public.tournaments (id, sport_id, slug, name, status)
VALUES (
  'prize-test-tournament',
  'prize-test-sport',
  'prize-test-tournament',
  'Prize Test Tournament',
  'active'
);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000a01',
    'authenticated',
    'authenticated',
    'prize-owner@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Prize Owner"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000a02',
    'authenticated',
    'authenticated',
    'prize-member@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Prize Member"}'::jsonb,
    now(),
    now()
  );

INSERT INTO public.lobbies (
  id, name, owner_id, tournament_id, join_code, visibility
)
VALUES (
  'prize-test-lobby',
  'Prize Test Lobby',
  '00000000-0000-4000-8000-000000000a01',
  'prize-test-tournament',
  'PRIZETESTCODE',
  'private'
);

INSERT INTO public.lobby_members (
  lobby_id, user_id, role, membership_status
)
VALUES
  (
    'prize-test-lobby',
    '00000000-0000-4000-8000-000000000a01',
    'member',
    'active'
  ),
  (
    'prize-test-lobby',
    '00000000-0000-4000-8000-000000000a02',
    'member',
    'active'
  );

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000a01","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000a01',
  true
);

SELECT *
FROM public.create_lobby_secure(
  'Prize-free Create',
  'prize-test-tournament',
  'private',
  '',
  '',
  'open'
);

SELECT *
FROM public.create_lobby_with_prizes_secure(
  'Prize-aware Create',
  'prize-test-tournament',
  'private',
  '',
  '',
  'approval_required',
  true,
  '[
    {"position":1,"label":"Víkendový výlet"},
    {"position":2,"label":"Poukaz"}
  ]'::jsonb
);

DO $$
DECLARE
  prize_free_lobby_id text;
  prize_aware_lobby_id text;
BEGIN
  SELECT id INTO STRICT prize_free_lobby_id
  FROM public.lobbies
  WHERE name = 'Prize-free Create';

  SELECT id INTO STRICT prize_aware_lobby_id
  FROM public.lobbies
  WHERE name = 'Prize-aware Create';

  IF (
    SELECT prizes_enabled OR prize_entries <> '[]'::jsonb
    FROM public.lobbies
    WHERE id = prize_free_lobby_id
  ) THEN
    RAISE EXCEPTION 'Prize-free create did not preserve default prize state.';
  END IF;

  IF NOT (
    SELECT prizes_enabled
      AND join_policy = 'approval_required'
      AND jsonb_array_length(prize_entries) = 2
    FROM public.lobbies
    WHERE id = prize_aware_lobby_id
  ) THEN
    RAISE EXCEPTION 'Prize-aware create did not persist its atomic payload.';
  END IF;

  IF (
    SELECT count(*) <> 1
    FROM public.lobby_members
    WHERE lobby_id = prize_aware_lobby_id
      AND user_id = '00000000-0000-4000-8000-000000000a01'
      AND role = 'member'
      AND membership_status = 'active'
  ) OR (
    SELECT count(*) <> 1
    FROM public.lobby_tournaments
    WHERE lobby_id = prize_aware_lobby_id
      AND tournament_id = 'prize-test-tournament'
  ) THEN
    RAISE EXCEPTION 'Prize-aware create lost membership or tournament atomicity.';
  END IF;

  BEGIN
    PERFORM public.create_lobby_with_prizes_secure(
      'Prize Create Must Roll Back',
      'prize-test-tournament',
      'private',
      '',
      '',
      'open',
      true,
      jsonb_build_array(jsonb_build_object(
        'position', 1,
        'label', repeat('x', 121)
      ))
    );
    RAISE EXCEPTION 'Invalid prize-aware create was accepted.';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  IF EXISTS (
    SELECT 1
    FROM public.lobbies
    WHERE name = 'Prize Create Must Roll Back'
  ) THEN
    RAISE EXCEPTION 'Invalid prize-aware create left a lobby behind.';
  END IF;
END;
$$;

SELECT public.set_lobby_prizes_secure(
  'prize-test-lobby',
  true,
  '[
    {"position":1,"label":"500 Kč"},
    {"position":2,"label":"Poukaz do restaurace"},
    {"position":3,"label":"Basa limonády"}
  ]'::jsonb
);

DO $$
BEGIN
  IF NOT (
    SELECT prizes_enabled
      AND jsonb_array_length(prize_entries) = 3
      AND prize_entries->0->>'label' = '500 Kč'
      AND prize_entries->2->>'position' = '3'
    FROM public.lobbies
    WHERE id = 'prize-test-lobby'
  ) THEN
    RAISE EXCEPTION 'Owner prize update did not preserve order.';
  END IF;

  BEGIN
    PERFORM public.set_lobby_prizes_secure(
      'prize-test-lobby',
      true,
      '[{"position":2,"label":"Non-contiguous"}]'::jsonb
    );
    RAISE EXCEPTION 'Non-contiguous positions were accepted.';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  BEGIN
    PERFORM public.set_lobby_prizes_secure(
      'prize-test-lobby',
      true,
      '[{"position":1.5,"label":"Decimal position"}]'::jsonb
    );
    RAISE EXCEPTION 'Decimal position was accepted.';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  BEGIN
    PERFORM public.set_lobby_prizes_secure(
      'prize-test-lobby',
      true,
      jsonb_build_array(jsonb_build_object(
        'position', 1,
        'label', repeat('x', 121)
      ))
    );
    RAISE EXCEPTION 'Overlong prize label was accepted.';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  BEGIN
    PERFORM public.set_lobby_prizes_secure(
      'prize-test-lobby',
      true,
      '[{"position":1,"label":"<b>Unsafe</b>"}]'::jsonb
    );
    RAISE EXCEPTION 'HTML-like prize label was accepted.';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  BEGIN
    UPDATE public.lobbies
    SET prizes_enabled = false, prize_entries = '[]'::jsonb
    WHERE id = 'prize-test-lobby';
    RAISE EXCEPTION 'Direct lobby prize update was accepted.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000a02","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000a02',
  true
);
DO $$
BEGIN
  BEGIN
    PERFORM public.set_lobby_prizes_secure(
      'prize-test-lobby',
      true,
      '[{"position":1,"label":"Forged member prize"}]'::jsonb
    );
    RAISE EXCEPTION 'Member changed lobby prizes.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000a01","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000a01',
  true
);
SELECT public.set_lobby_prizes_secure(
  'prize-test-lobby',
  false,
  '[{"position":1,"label":"Must be discarded"}]'::jsonb
);
RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT prizes_enabled OR prize_entries <> '[]'::jsonb
    FROM public.lobbies
    WHERE id = 'prize-test-lobby'
  ) THEN
    RAISE EXCEPTION 'Disabling prizes did not clear declared values.';
  END IF;
END;
$$;

ROLLBACK;

SELECT 'Private lobby prize integration scenarios passed.' AS result;
