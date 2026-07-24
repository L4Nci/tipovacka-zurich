-- Rollback-only integration checks for Phase 011.
-- Run only against local or isolated staging after migrations 001-011.

BEGIN;

INSERT INTO public.sports (id, slug, name)
VALUES ('phase-011-sport', 'phase-011-sport', 'Phase 011 Test Sport');

INSERT INTO public.tournaments (id, sport_id, slug, name, status)
VALUES (
  'phase-011-tournament',
  'phase-011-sport',
  'phase-011-tournament',
  'Phase 011 Test Tournament',
  'active'
);

INSERT INTO public.participants (id, sport_id, name, short_name)
VALUES
  ('phase-011-home', 'phase-011-sport', 'Phase 011 Home', 'P11H'),
  ('phase-011-away', 'phase-011-sport', 'Phase 011 Away', 'P11A');

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
  'phase-011-match',
  'phase-011-tournament',
  'phase-011-home',
  'phase-011-away',
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
    '00000000-0000-4000-8000-000000000301',
    'authenticated',
    'authenticated',
    'phase-011-owner@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Phase 011 Owner"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000302',
    'authenticated',
    'authenticated',
    'phase-011-member@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Phase 011 Member"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000303',
    'authenticated',
    'authenticated',
    'phase-011-pending@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Phase 011 Pending"}'::jsonb,
    now(),
    now()
  );

CREATE TEMP TABLE phase011_context (
  lobby_id text PRIMARY KEY,
  join_code text NOT NULL,
  member_membership_id uuid
) ON COMMIT DROP;

GRANT ALL ON phase011_context TO authenticated;

-- Atomic create produces an active owner membership whose role is plain member.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000301","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000301',
  true
);

INSERT INTO phase011_context (lobby_id, join_code)
SELECT created.id, created.join_code
FROM public.create_lobby_secure(
  'Phase 011 Lifecycle Lobby',
  'phase-011-tournament',
  'private',
  NULL,
  NULL
) AS created;

RESET ROLE;

DO $$
DECLARE
  created_lobby_id text;
BEGIN
  SELECT lobby_id INTO STRICT created_lobby_id FROM phase011_context;

  IF NOT EXISTS (
    SELECT 1
    FROM public.lobbies
    WHERE id = created_lobby_id
      AND owner_id = '00000000-0000-4000-8000-000000000301'
  ) THEN
    RAISE EXCEPTION 'Create did not derive owner from auth.uid().';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.lobby_members
    WHERE lobby_id = created_lobby_id
      AND user_id = '00000000-0000-4000-8000-000000000301'
      AND role = 'member'
      AND membership_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Owner membership is not active/member.';
  END IF;
END;
$$;

-- Join and duplicate join keep exactly one active membership row.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000302","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000302',
  true
);

DO $$
DECLARE
  first_state text;
  second_state text;
BEGIN
  SELECT membership_state INTO STRICT first_state
  FROM public.join_lobby_secure((SELECT join_code FROM phase011_context));

  SELECT membership_state INTO STRICT second_state
  FROM public.join_lobby_secure((SELECT join_code FROM phase011_context));

  IF first_state <> 'joined' OR second_state <> 'already_member' THEN
    RAISE EXCEPTION 'Join RPC is not idempotent: %, %', first_state, second_state;
  END IF;
END;
$$;

RESET ROLE;

UPDATE phase011_context
SET member_membership_id = (
  SELECT id
  FROM public.lobby_members
  WHERE lobby_id = phase011_context.lobby_id
    AND user_id = '00000000-0000-4000-8000-000000000302'
);

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.lobby_members
    WHERE lobby_id = (SELECT lobby_id FROM phase011_context)
      AND user_id = '00000000-0000-4000-8000-000000000302'
      AND membership_status = 'active'
  ) <> 1 THEN
    RAISE EXCEPTION 'Duplicate active membership exists.';
  END IF;
END;
$$;

-- An active member can predict. Scoring data is then made historical by the
-- trusted role so leave/remove preservation can be verified.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000302","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000302',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO public.predictions (
  user_id,
  lobby_id,
  match_id,
  predicted_home_score,
  predicted_away_score
)
VALUES (
  '00000000-0000-4000-8000-000000000302',
  (SELECT lobby_id FROM phase011_context),
  'phase-011-match',
  2,
  1
);

INSERT INTO public.longterm_predictions (
  lobby_id,
  tournament_id,
  user_id,
  prediction_type,
  predicted_participant_id
)
VALUES (
  (SELECT lobby_id FROM phase011_context),
  'phase-011-tournament',
  '00000000-0000-4000-8000-000000000302',
  'tournament_winner',
  'phase-011-home'
);

RESET ROLE;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT set_config('request.jwt.claim.sub', '', true);

UPDATE public.predictions
SET points_earned = 5
WHERE user_id = '00000000-0000-4000-8000-000000000302'
  AND match_id = 'phase-011-match';

UPDATE public.longterm_predictions
SET points_earned = 10
WHERE user_id = '00000000-0000-4000-8000-000000000302'
  AND tournament_id = 'phase-011-tournament';

RESET ROLE;

-- Leave is soft, owner leave is blocked, and inactive users lose all access.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000302","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000302',
  true
);

DO $$
DECLARE
  state text;
BEGIN
  SELECT public.leave_lobby_secure((SELECT lobby_id FROM phase011_context))
  INTO STRICT state;
  IF state <> 'left' THEN
    RAISE EXCEPTION 'Leave returned unexpected state: %', state;
  END IF;
END;
$$;

DO $$
DECLARE
  visible_rows bigint;
  changed_rows bigint;
BEGIN
  IF public.is_lobby_member((SELECT lobby_id FROM phase011_context)) THEN
    RAISE EXCEPTION 'Left membership is still authorized.';
  END IF;

  SELECT count(*) INTO visible_rows
  FROM public.get_user_home_dashboard()
  WHERE lobby_id = (SELECT lobby_id FROM phase011_context);
  IF visible_rows <> 0 THEN
    RAISE EXCEPTION 'Left membership remains on Home.';
  END IF;

  SELECT count(*) INTO visible_rows
  FROM public.predictions
  WHERE lobby_id = (SELECT lobby_id FROM phase011_context);
  IF visible_rows <> 0 THEN
    RAISE EXCEPTION 'Left membership can read lobby predictions.';
  END IF;

  UPDATE public.predictions
  SET predicted_home_score = 3
  WHERE user_id = '00000000-0000-4000-8000-000000000302'
    AND lobby_id = (SELECT lobby_id FROM phase011_context)
    AND match_id = 'phase-011-match';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Left membership changed a prediction.';
  END IF;
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.lobby_members
    WHERE id = (SELECT member_membership_id FROM phase011_context)
      AND membership_status = 'left'
      AND ended_at IS NOT NULL
      AND ended_by = '00000000-0000-4000-8000-000000000302'
  ) THEN
    RAISE EXCEPTION 'Leave did not preserve the membership row.';
  END IF;

  IF (
    SELECT points_earned
    FROM public.predictions
    WHERE user_id = '00000000-0000-4000-8000-000000000302'
      AND match_id = 'phase-011-match'
  ) <> 5 OR (
    SELECT points_earned
    FROM public.longterm_predictions
    WHERE user_id = '00000000-0000-4000-8000-000000000302'
      AND tournament_id = 'phase-011-tournament'
  ) <> 10 THEN
    RAISE EXCEPTION 'Leave changed historical points.';
  END IF;
END;
$$;

-- A left member can rejoin with the code; the same row is reactivated.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000302","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000302',
  true
);

DO $$
DECLARE
  state text;
BEGIN
  SELECT membership_state INTO STRICT state
  FROM public.join_lobby_secure((SELECT join_code FROM phase011_context));
  IF state <> 'rejoined' THEN
    RAISE EXCEPTION 'Left membership did not rejoin: %', state;
  END IF;
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.lobby_members
    WHERE id = (SELECT member_membership_id FROM phase011_context)
      AND membership_status = 'active'
      AND ended_at IS NULL
      AND ended_by IS NULL
      AND role = 'member'
  ) OR (
    SELECT count(*)
    FROM public.lobby_members
    WHERE lobby_id = (SELECT lobby_id FROM phase011_context)
      AND user_id = '00000000-0000-4000-8000-000000000302'
  ) <> 1 THEN
    RAISE EXCEPTION 'Rejoin duplicated or failed to reactivate membership.';
  END IF;
END;
$$;

-- Only the owner can remove/restore. Removed users cannot self-rejoin.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000302","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000302',
  true
);

DO $$
BEGIN
  BEGIN
    PERFORM public.remove_lobby_member_secure(
      (SELECT lobby_id FROM phase011_context),
      '00000000-0000-4000-8000-000000000301'
    );
    RAISE EXCEPTION 'A member removed the owner.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000301","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000301',
  true
);

DO $$
DECLARE
  state text;
BEGIN
  SELECT public.remove_lobby_member_secure(
    (SELECT lobby_id FROM phase011_context),
    '00000000-0000-4000-8000-000000000302'
  ) INTO STRICT state;
  IF state <> 'removed' THEN
    RAISE EXCEPTION 'Remove returned unexpected state: %', state;
  END IF;

  IF (
    SELECT count(*)
    FROM public.lobby_members
    WHERE lobby_id = (SELECT lobby_id FROM phase011_context)
      AND membership_status = 'active'
  ) <> 1 THEN
    RAISE EXCEPTION 'Active member count did not exclude removed member.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.predictions
    WHERE lobby_id = (SELECT lobby_id FROM phase011_context)
      AND user_id = '00000000-0000-4000-8000-000000000302'
      AND points_earned = 5
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.longterm_predictions
    WHERE lobby_id = (SELECT lobby_id FROM phase011_context)
      AND user_id = '00000000-0000-4000-8000-000000000302'
      AND points_earned = 10
  ) THEN
    RAISE EXCEPTION 'Owner lost removed member leaderboard/Hall of Fame history.';
  END IF;
END;
$$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000302","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000302',
  true
);

DO $$
BEGIN
  BEGIN
    PERFORM *
    FROM public.join_lobby_secure((SELECT join_code FROM phase011_context));
    RAISE EXCEPTION 'Removed member rejoined without owner restore.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  IF public.is_lobby_member((SELECT lobby_id FROM phase011_context)) THEN
    RAISE EXCEPTION 'Removed membership is still authorized.';
  END IF;
END;
$$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000301","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000301',
  true
);

DO $$
DECLARE
  state text;
BEGIN
  SELECT public.restore_lobby_member_secure(
    (SELECT lobby_id FROM phase011_context),
    '00000000-0000-4000-8000-000000000302'
  ) INTO STRICT state;
  IF state <> 'restored' THEN
    RAISE EXCEPTION 'Restore returned unexpected state: %', state;
  END IF;

  BEGIN
    PERFORM public.leave_lobby_secure((SELECT lobby_id FROM phase011_context));
    RAISE EXCEPTION 'Owner left the lobby.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.remove_lobby_member_secure(
      (SELECT lobby_id FROM phase011_context),
      '00000000-0000-4000-8000-000000000301'
    );
    RAISE EXCEPTION 'Owner removed itself.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;

-- Pending is schema-compatible for Phase 012 but grants no lobby access.
INSERT INTO public.lobby_members (
  lobby_id,
  user_id,
  role,
  membership_status
)
VALUES (
  (SELECT lobby_id FROM phase011_context),
  '00000000-0000-4000-8000-000000000303',
  'member',
  'pending'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000303","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000303',
  true
);

DO $$
DECLARE
  visible_rows bigint;
BEGIN
  IF public.is_lobby_member((SELECT lobby_id FROM phase011_context)) THEN
    RAISE EXCEPTION 'Pending membership is authorized.';
  END IF;

  SELECT count(*) INTO visible_rows
  FROM public.lobbies
  WHERE id = (SELECT lobby_id FROM phase011_context);
  IF visible_rows <> 0 THEN
    RAISE EXCEPTION 'Pending member can read lobby metadata.';
  END IF;

  BEGIN
    PERFORM *
    FROM public.join_lobby_secure((SELECT join_code FROM phase011_context));
    RAISE EXCEPTION 'Pending membership was activated by open join.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.predictions (
      user_id,
      lobby_id,
      match_id,
      predicted_home_score,
      predicted_away_score
    )
    VALUES (
      '00000000-0000-4000-8000-000000000303',
      (SELECT lobby_id FROM phase011_context),
      'phase-011-match',
      1,
      0
    );
    RAISE EXCEPTION 'Pending membership wrote a prediction.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;

-- Direct PostgREST-style lifecycle and role mutations remain blocked.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000302","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000302',
  true
);

DO $$
BEGIN
  BEGIN
    UPDATE public.lobby_members
    SET membership_status = 'active', role = 'admin'
    WHERE lobby_id = (SELECT lobby_id FROM phase011_context)
      AND user_id = '00000000-0000-4000-8000-000000000302';
    RAISE EXCEPTION 'Direct lifecycle/role UPDATE succeeded.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.lobby_members (
      lobby_id,
      user_id,
      role,
      membership_status
    )
    VALUES (
      (SELECT lobby_id FROM phase011_context),
      '00000000-0000-4000-8000-000000000303',
      'admin',
      'active'
    );
    RAISE EXCEPTION 'Direct active admin INSERT succeeded.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM public.lobby_members
    WHERE lobby_id = (SELECT lobby_id FROM phase011_context);
    RAISE EXCEPTION 'Direct membership DELETE succeeded.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;

-- Security surface and historical-data invariants.
DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.lobby_members
    WHERE lobby_id = (SELECT lobby_id FROM phase011_context)
      AND user_id = '00000000-0000-4000-8000-000000000302'
  ) <> 1 THEN
    RAISE EXCEPTION 'Lifecycle created duplicate membership rows.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.lobby_members
    WHERE role NOT IN ('admin', 'member')
  ) THEN
    RAISE EXCEPTION 'A non-canonical membership role exists.';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.leave_lobby_secure(text)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated',
    'public.remove_lobby_member_secure(text,uuid)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated',
    'public.restore_lobby_member_secure(text,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Required lifecycle RPC grant is missing.';
  END IF;

  IF has_function_privilege('anon', 'public.leave_lobby_secure(text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.remove_lobby_member_secure(text,uuid)', 'EXECUTE')
    OR has_function_privilege('service_role', 'public.restore_lobby_member_secure(text,uuid)', 'EXECUTE')
    OR has_table_privilege('authenticated', 'public.lobby_members', 'INSERT')
    OR has_table_privilege('authenticated', 'public.lobby_members', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.lobby_members', 'DELETE') THEN
    RAISE EXCEPTION 'Lifecycle security surface is too broad.';
  END IF;

  IF (
    SELECT points_earned
    FROM public.predictions
    WHERE user_id = '00000000-0000-4000-8000-000000000302'
      AND match_id = 'phase-011-match'
  ) <> 5 OR (
    SELECT points_earned
    FROM public.longterm_predictions
    WHERE user_id = '00000000-0000-4000-8000-000000000302'
      AND tournament_id = 'phase-011-tournament'
  ) <> 10 THEN
    RAISE EXCEPTION 'Lifecycle changed scoring history.';
  END IF;
END;
$$;

ROLLBACK;
