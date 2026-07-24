-- Rollback-only final contract checks for Phase 010.
-- Run only in local or staging after both 010A and 010B.

BEGIN;

INSERT INTO public.sports (id, slug, name)
VALUES ('phase-010-sport', 'phase-010-sport', 'Phase 010 Test Sport');

INSERT INTO public.tournaments (id, sport_id, slug, name, status)
VALUES (
  'phase-010-tournament',
  'phase-010-sport',
  'phase-010-tournament',
  'Phase 010 Test Tournament',
  'active'
);

INSERT INTO public.participants (id, sport_id, name, short_name)
VALUES
  ('phase-010-home', 'phase-010-sport', 'Phase 010 Home', 'P10H'),
  ('phase-010-away', 'phase-010-sport', 'Phase 010 Away', 'P10A');

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
  'phase-010-match',
  'phase-010-tournament',
  'phase-010-home',
  'phase-010-away',
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
    '00000000-0000-4000-8000-000000000101',
    'authenticated',
    'authenticated',
    'phase-010-owner@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Phase 010 Owner"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000102',
    'authenticated',
    'authenticated',
    'phase-010-member@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Phase 010 Member"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000103',
    'authenticated',
    'authenticated',
    'phase-010-intruder@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Phase 010 Intruder"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000104',
    'authenticated',
    'authenticated',
    'phase-010-rollback@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Phase 010 Rollback"}'::jsonb,
    now(),
    now()
  );

CREATE TEMP TABLE phase010_created_lobbies (
  purpose text PRIMARY KEY,
  lobby_id text NOT NULL,
  join_code text NOT NULL,
  owner_id uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE phase010_join_results (
  sequence_no integer PRIMARY KEY,
  membership_state text NOT NULL,
  lobby_id text NOT NULL
) ON COMMIT DROP;

GRANT ALL ON phase010_created_lobbies TO authenticated;
GRANT ALL ON phase010_join_results TO authenticated;

-- Owner creation: caller identity is auth.uid(), role is a plain membership
-- member, and the three related inserts happen in one function call.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000101',
  true
);

INSERT INTO phase010_created_lobbies (purpose, lobby_id, join_code, owner_id)
SELECT 'main', created.id, created.join_code, created.owner_id
FROM public.create_lobby_secure(
  'Phase 010 Main Lobby',
  'phase-010-tournament',
  'private',
  'Short description',
  'Long description'
) AS created;

RESET ROLE;

DO $$
DECLARE
  created_lobby_id text;
  created_join_code text;
BEGIN
  SELECT lobby_id, join_code INTO STRICT created_lobby_id, created_join_code
  FROM phase010_created_lobbies
  WHERE purpose = 'main';

  IF NOT EXISTS (
    SELECT 1
    FROM public.lobbies
    WHERE id = created_lobby_id
      AND owner_id = '00000000-0000-4000-8000-000000000101'
  ) THEN
    RAISE EXCEPTION 'Atomic create did not derive the owner from auth.uid().';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.lobby_members
    WHERE lobby_id = created_lobby_id
      AND user_id = '00000000-0000-4000-8000-000000000101'
      AND role = 'member'
  ) THEN
    RAISE EXCEPTION 'Atomic create did not create a non-owner membership row.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.lobby_tournaments
    WHERE lobby_id = created_lobby_id
      AND tournament_id = 'phase-010-tournament'
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Atomic create did not create the lobby tournament relation.';
  END IF;

  IF length(created_join_code) <> 16
    OR created_join_code !~ '^[0-9A-F]{16}$' THEN
    RAISE EXCEPTION 'Secure create returned an invalid join-code format.';
  END IF;
END;
$$;

-- If any subordinate insert fails, the create RPC leaves no partial lobby.
CREATE OR REPLACE FUNCTION public.phase010_force_membership_failure()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.user_id = '00000000-0000-4000-8000-000000000104'::uuid THEN
    RAISE EXCEPTION 'Phase 010 forced membership failure.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER phase010_force_membership_failure
  BEFORE INSERT ON public.lobby_members
  FOR EACH ROW
  EXECUTE FUNCTION public.phase010_force_membership_failure();

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000104","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000104',
  true
);

DO $$
BEGIN
  BEGIN
    PERFORM *
    FROM public.create_lobby_secure(
      'Phase 010 Must Roll Back',
      'phase-010-tournament',
      'private',
      NULL,
      NULL
    );
    RAISE EXCEPTION 'Expected forced atomic create failure.';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'Phase 010 forced membership failure.' THEN
        RAISE;
      END IF;
  END;
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.lobbies
    WHERE name = 'Phase 010 Must Roll Back'
  ) THEN
    RAISE EXCEPTION 'Failed atomic create left a partial lobby row.';
  END IF;
END;
$$;

DROP TRIGGER phase010_force_membership_failure ON public.lobby_members;
DROP FUNCTION public.phase010_force_membership_failure();

-- Owner remains a product role derived by the existing Home RPC.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000101',
  true
);

DO $$
DECLARE
  created_lobby_id text;
BEGIN
  SELECT lobby_id INTO STRICT created_lobby_id
  FROM phase010_created_lobbies
  WHERE purpose = 'main';

  IF NOT EXISTS (
    SELECT 1
    FROM public.get_user_home_dashboard()
    WHERE lobby_id = created_lobby_id
      AND lobby_role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Home RPC did not derive owner from lobbies.owner_id.';
  END IF;
END;
$$;

RESET ROLE;

-- A non-member cannot discover a lobby from only its lobby_id.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000103","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000103',
  true
);

DO $$
DECLARE
  created_lobby_id text;
  visible_rows integer;
BEGIN
  SELECT lobby_id INTO STRICT created_lobby_id
  FROM phase010_created_lobbies
  WHERE purpose = 'main';

  SELECT count(*) INTO visible_rows
  FROM public.lobbies
  WHERE id = created_lobby_id;

  IF visible_rows <> 0 THEN
    RAISE EXCEPTION 'A non-member discovered a lobby by lobby_id.';
  END IF;
END;
$$;

RESET ROLE;

-- Member join and duplicate join are both atomic and idempotent.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000102","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000102',
  true
);

INSERT INTO phase010_join_results (sequence_no, membership_state, lobby_id)
SELECT 1, joined.membership_state, joined.id
FROM public.join_lobby_secure(
  (SELECT join_code FROM phase010_created_lobbies WHERE purpose = 'main')
) AS joined;

INSERT INTO phase010_join_results (sequence_no, membership_state, lobby_id)
SELECT 2, joined.membership_state, joined.id
FROM public.join_lobby_secure(
  (SELECT join_code FROM phase010_created_lobbies WHERE purpose = 'main')
) AS joined;

RESET ROLE;

DO $$
DECLARE
  created_lobby_id text;
BEGIN
  SELECT lobby_id INTO STRICT created_lobby_id
  FROM phase010_created_lobbies
  WHERE purpose = 'main';

  IF NOT EXISTS (
    SELECT 1 FROM phase010_join_results
    WHERE sequence_no = 1 AND membership_state = 'joined'
  ) OR NOT EXISTS (
    SELECT 1 FROM phase010_join_results
    WHERE sequence_no = 2 AND membership_state = 'already_member'
  ) THEN
    RAISE EXCEPTION 'Join RPC was not idempotent.';
  END IF;

  IF (
    SELECT count(*)
    FROM public.lobby_members
    WHERE lobby_id = created_lobby_id
      AND user_id = '00000000-0000-4000-8000-000000000102'
      AND role = 'member'
  ) <> 1 THEN
    RAISE EXCEPTION 'Duplicate join created an invalid membership state.';
  END IF;
END;
$$;

-- A joined member can read the lobby data needed by the current UI.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000102","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000102',
  true
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.lobbies
    WHERE id = (
      SELECT lobby_id FROM phase010_created_lobbies WHERE purpose = 'main'
    )
      AND join_code = (
        SELECT join_code FROM phase010_created_lobbies WHERE purpose = 'main'
      )
  ) THEN
    RAISE EXCEPTION 'Joined member cannot read required lobby data.';
  END IF;
END;
$$;

RESET ROLE;

-- The joined member may predict; an authenticated non-member may not.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000102","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000102',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO public.predictions (
  user_id,
  lobby_id,
  match_id,
  predicted_home_score,
  predicted_away_score,
  points_earned
)
VALUES (
  '00000000-0000-4000-8000-000000000102',
  (SELECT lobby_id FROM phase010_created_lobbies WHERE purpose = 'main'),
  'phase-010-match',
  2,
  1,
  999
);

RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT points_earned
    FROM public.predictions
    WHERE user_id = '00000000-0000-4000-8000-000000000102'
      AND match_id = 'phase-010-match'
  ) <> 0 THEN
    RAISE EXCEPTION 'Forged prediction points INSERT was not normalized.';
  END IF;
END;
$$;

-- A regular pre-lock update succeeds, but forged points remain unchanged.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000102","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000102',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

UPDATE public.predictions
SET
  predicted_home_score = 3,
  predicted_away_score = 2,
  points_earned = 777
WHERE user_id = '00000000-0000-4000-8000-000000000102'
  AND lobby_id = (
    SELECT lobby_id FROM phase010_created_lobbies WHERE purpose = 'main'
  )
  AND match_id = 'phase-010-match';

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.predictions
    WHERE user_id = '00000000-0000-4000-8000-000000000102'
      AND match_id = 'phase-010-match'
      AND predicted_home_score = 3
      AND predicted_away_score = 2
      AND points_earned = 0
  ) THEN
    RAISE EXCEPTION 'Normal prediction update failed or changed points.';
  END IF;
END;
$$;

-- The trusted service role remains able to write authoritative scoring.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
RESET request.jwt.claim.sub;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

UPDATE public.predictions
SET points_earned = 5
WHERE user_id = '00000000-0000-4000-8000-000000000102'
  AND match_id = 'phase-010-match';

RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT points_earned
    FROM public.predictions
    WHERE user_id = '00000000-0000-4000-8000-000000000102'
      AND match_id = 'phase-010-match'
  ) <> 5 THEN
    RAISE EXCEPTION 'Authoritative service-role scoring was blocked.';
  END IF;
END;
$$;

-- Long-term prediction points use the same client/server boundary.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000102","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000102',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO public.longterm_predictions (
  lobby_id,
  tournament_id,
  user_id,
  prediction_type,
  predicted_participant_id,
  points_earned
)
VALUES (
  (SELECT lobby_id FROM phase010_created_lobbies WHERE purpose = 'main'),
  'phase-010-tournament',
  '00000000-0000-4000-8000-000000000102',
  'tournament_winner',
  'phase-010-home',
  999
);

RESET ROLE;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
RESET request.jwt.claim.sub;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

UPDATE public.longterm_predictions
SET points_earned = 10
WHERE user_id = '00000000-0000-4000-8000-000000000102'
  AND tournament_id = 'phase-010-tournament';

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000102","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000102',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

UPDATE public.longterm_predictions
SET points_earned = 999
WHERE user_id = '00000000-0000-4000-8000-000000000102'
  AND tournament_id = 'phase-010-tournament';

RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT points_earned
    FROM public.longterm_predictions
    WHERE user_id = '00000000-0000-4000-8000-000000000102'
      AND tournament_id = 'phase-010-tournament'
  ) <> 10 THEN
    RAISE EXCEPTION 'Long-term prediction points guard is ineffective.';
  END IF;
END;
$$;

-- Client-side deletion cannot erase scored match or long-term history.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000102","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000102',
  true
);

DO $$
BEGIN
  BEGIN
    DELETE FROM public.predictions
    WHERE user_id = '00000000-0000-4000-8000-000000000102'
      AND match_id = 'phase-010-match';
    RAISE EXCEPTION 'Expected client match-prediction deletion to be blocked.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM public.longterm_predictions
    WHERE user_id = '00000000-0000-4000-8000-000000000102'
      AND tournament_id = 'phase-010-tournament';
    RAISE EXCEPTION 'Expected client long-term prediction deletion to be blocked.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000103","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000103',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.predictions (
      user_id,
      lobby_id,
      match_id,
      predicted_home_score,
      predicted_away_score
    )
    VALUES (
      '00000000-0000-4000-8000-000000000103',
      (SELECT lobby_id FROM phase010_created_lobbies WHERE purpose = 'main'),
      'phase-010-match',
      1,
      0
    );
    RAISE EXCEPTION 'Expected a non-member prediction to be blocked.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.longterm_predictions (
      lobby_id,
      tournament_id,
      user_id,
      prediction_type,
      predicted_participant_id
    )
    VALUES (
      (SELECT lobby_id FROM phase010_created_lobbies WHERE purpose = 'main'),
      'phase-010-tournament',
      '00000000-0000-4000-8000-000000000103',
      'tournament_winner',
      'phase-010-home'
    );
    RAISE EXCEPTION 'Expected a non-member long-term prediction to be blocked.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;

-- A second lobby provides a distinct context for cross-lobby write checks.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000101',
  true
);

INSERT INTO phase010_created_lobbies (purpose, lobby_id, join_code, owner_id)
SELECT 'cross-context', created.id, created.join_code, created.owner_id
FROM public.create_lobby_secure(
  'Phase 010 Cross Context',
  'phase-010-tournament',
  'private',
  NULL,
  NULL
) AS created;

RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT count(DISTINCT lobby_id)
    FROM phase010_created_lobbies
    WHERE purpose IN ('main', 'cross-context')
  ) <> 2 OR (
    SELECT count(DISTINCT join_code)
    FROM phase010_created_lobbies
    WHERE purpose IN ('main', 'cross-context')
  ) <> 2 THEN
    RAISE EXCEPTION 'Repeated explicit create calls collided on lobby ID or join code.';
  END IF;
END;
$$;

-- A member cannot write another user's row or reuse a match through a lobby
-- context in which that member has no membership.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000102","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000102',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.predictions (
      user_id,
      lobby_id,
      match_id,
      predicted_home_score,
      predicted_away_score
    )
    VALUES (
      '00000000-0000-4000-8000-000000000103',
      (SELECT lobby_id FROM phase010_created_lobbies WHERE purpose = 'main'),
      'phase-010-match',
      0,
      0
    );
    RAISE EXCEPTION 'Expected a forged prediction user_id to be blocked.';
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
      '00000000-0000-4000-8000-000000000102',
      (
        SELECT lobby_id
        FROM phase010_created_lobbies
        WHERE purpose = 'cross-context'
      ),
      'phase-010-match',
      0,
      0
    );
    RAISE EXCEPTION 'Expected a cross-lobby prediction to be blocked.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;

-- Once the match is locked, a normal member score update is rejected.
UPDATE public.matches
SET
  start_time_utc = now() - interval '1 minute',
  lock_time_utc = now() - interval '6 minutes'
WHERE id = 'phase-010-match';

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000102","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000102',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  changed_rows bigint;
BEGIN
  UPDATE public.predictions
  SET predicted_home_score = 4
  WHERE user_id = '00000000-0000-4000-8000-000000000102'
    AND match_id = 'phase-010-match';

  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Post-lock prediction update changed a row.';
  END IF;
END;
$$;

RESET ROLE;

-- Direct REST-style inserts, forged roles, and forged ownership are blocked.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000102","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000102',
  true
);

DO $$
DECLARE
  created_lobby_id text;
BEGIN
  SELECT lobby_id INTO STRICT created_lobby_id
  FROM phase010_created_lobbies
  WHERE purpose = 'main';

  BEGIN
    INSERT INTO public.lobby_members (lobby_id, user_id, role)
    VALUES (
      created_lobby_id,
      '00000000-0000-4000-8000-000000000103',
      'member'
    );
    RAISE EXCEPTION 'Expected direct membership INSERT to be blocked.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.lobby_members (lobby_id, user_id, role)
    VALUES (
      created_lobby_id,
      '00000000-0000-4000-8000-000000000103',
      'admin'
    );
    RAISE EXCEPTION 'Expected forged admin role to be blocked.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.lobby_members (lobby_id, user_id, role)
    VALUES (
      created_lobby_id,
      '00000000-0000-4000-8000-000000000103',
      'owner'
    );
    RAISE EXCEPTION 'Expected forged owner role to be blocked.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.lobby_members
    SET role = 'admin'
    WHERE lobby_id = created_lobby_id
      AND user_id = '00000000-0000-4000-8000-000000000102';
    RAISE EXCEPTION 'Expected direct role UPDATE to be blocked.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM public.lobby_members
    WHERE lobby_id = created_lobby_id
      AND user_id = '00000000-0000-4000-8000-000000000101';
    RAISE EXCEPTION 'Expected direct deletion of another member to be blocked.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.lobbies
    SET owner_id = '00000000-0000-4000-8000-000000000102'
    WHERE id = created_lobby_id;
    RAISE EXCEPTION 'Expected forged owner_id UPDATE to be blocked.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.lobbies (
      id, name, owner_id, tournament_id, join_code, visibility
    )
    VALUES (
      'phase-010-forged-lobby',
      'Forged Lobby',
      '00000000-0000-4000-8000-000000000102',
      'phase-010-tournament',
      'FORGED010',
      'private'
    );
    RAISE EXCEPTION 'Expected direct lobby INSERT to be blocked.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;

-- The grandfathered legacy owner row remains, but new owner-role rows fail the
-- database constraint even for a privileged maintenance caller.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.lobby_members (lobby_id, user_id, role)
    VALUES (
      (SELECT lobby_id FROM phase010_created_lobbies WHERE purpose = 'main'),
      '00000000-0000-4000-8000-000000000103',
      'owner'
    );
    RAISE EXCEPTION 'Expected the owner membership constraint to reject a new row.';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END;
$$;

-- Unknown code, lobby_id-as-code, unauthenticated RPC, and forged RPC
-- signatures fail without creating memberships.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000103","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000103',
  true
);

DO $$
DECLARE
  created_lobby_id text;
  valid_join_code text;
BEGIN
  SELECT lobby_id, join_code
  INTO STRICT created_lobby_id, valid_join_code
  FROM phase010_created_lobbies
  WHERE purpose = 'main';

  BEGIN
    PERFORM * FROM public.join_lobby_secure('');
    RAISE EXCEPTION 'Expected an empty join code to fail uniformly.';
  EXCEPTION
    WHEN no_data_found THEN NULL;
  END;

  BEGIN
    PERFORM * FROM public.join_lobby_secure('UNKNOWN-PHASE-010-CODE');
    RAISE EXCEPTION 'Expected unknown join code to fail.';
  EXCEPTION
    WHEN no_data_found THEN NULL;
  END;

  BEGIN
    PERFORM * FROM public.join_lobby_secure(created_lobby_id);
    RAISE EXCEPTION 'Expected lobby_id knowledge to be insufficient.';
  EXCEPTION
    WHEN no_data_found THEN NULL;
  END;

  BEGIN
    EXECUTE 'SELECT * FROM public.join_lobby_secure($1, $2)'
      USING valid_join_code, '00000000-0000-4000-8000-000000000103'::uuid;
    RAISE EXCEPTION 'Expected forged join RPC identity parameter to fail.';
  EXCEPTION
    WHEN undefined_function THEN NULL;
  END;

  BEGIN
    EXECUTE 'SELECT * FROM public.create_lobby_secure($1, $2, $3, $4, $5, $6)'
      USING
        'Forged RPC Lobby',
        'phase-010-tournament',
        'private',
        NULL::text,
        NULL::text,
        '00000000-0000-4000-8000-000000000103'::uuid;
    RAISE EXCEPTION 'Expected forged create RPC owner parameter to fail.';
  EXCEPTION
    WHEN undefined_function THEN NULL;
  END;
END;
$$;

RESET ROLE;

SELECT set_config('request.jwt.claims', '{}', true);
RESET request.jwt.claim.sub;
SET LOCAL ROLE authenticated;

DO $$
BEGIN
  BEGIN
    PERFORM *
    FROM public.create_lobby_secure(
      'Unauthenticated Lobby',
      'phase-010-tournament',
      'private',
      NULL,
      NULL
    );
    RAISE EXCEPTION 'Expected unauthenticated create RPC to fail.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;

-- A deleted lobby behaves like an unknown lobby and cannot be rejoined.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000101',
  true
);

INSERT INTO phase010_created_lobbies (purpose, lobby_id, join_code, owner_id)
SELECT 'deleted', created.id, created.join_code, created.owner_id
FROM public.create_lobby_secure(
  'Phase 010 Deleted Lobby',
  'phase-010-tournament',
  'private',
  NULL,
  NULL
) AS created;

DELETE FROM public.lobbies
WHERE id = (
  SELECT lobby_id FROM phase010_created_lobbies WHERE purpose = 'deleted'
);

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000103","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000103',
  true
);

DO $$
BEGIN
  BEGIN
    PERFORM *
    FROM public.join_lobby_secure(
      (SELECT join_code FROM phase010_created_lobbies WHERE purpose = 'deleted')
    );
    RAISE EXCEPTION 'Expected deleted lobby join to fail.';
  EXCEPTION
    WHEN no_data_found THEN NULL;
  END;
END;
$$;

RESET ROLE;

-- Privilege and function-surface contract.
DO $$
DECLARE
  create_owner name;
  join_owner name;
  create_config text[];
  join_config text[];
  create_is_definer boolean;
  join_is_definer boolean;
  prediction_guard_config text[];
  longterm_guard_config text[];
  prediction_guard_is_definer boolean;
  longterm_guard_is_definer boolean;
BEGIN
  SELECT owner_role.rolname, functions.proconfig, functions.prosecdef
  INTO STRICT create_owner, create_config, create_is_definer
  FROM pg_proc AS functions
  JOIN pg_roles AS owner_role ON owner_role.oid = functions.proowner
  WHERE functions.oid =
    'public.create_lobby_secure(text,text,text,text,text)'::regprocedure;

  SELECT owner_role.rolname, functions.proconfig, functions.prosecdef
  INTO STRICT join_owner, join_config, join_is_definer
  FROM pg_proc AS functions
  JOIN pg_roles AS owner_role ON owner_role.oid = functions.proowner
  WHERE functions.oid = 'public.join_lobby_secure(text)'::regprocedure;

  SELECT functions.proconfig, functions.prosecdef
  INTO STRICT prediction_guard_config, prediction_guard_is_definer
  FROM pg_proc AS functions
  WHERE functions.oid =
    'public.protect_prediction_points_earned()'::regprocedure;

  SELECT functions.proconfig, functions.prosecdef
  INTO STRICT longterm_guard_config, longterm_guard_is_definer
  FROM pg_proc AS functions
  WHERE functions.oid =
    'public.protect_longterm_prediction_points_earned()'::regprocedure;

  IF create_owner <> 'postgres'
    OR join_owner <> 'postgres'
    OR NOT create_is_definer
    OR NOT join_is_definer
    OR NOT ('search_path=""' = ANY(create_config))
    OR NOT ('search_path=""' = ANY(join_config)) THEN
    RAISE EXCEPTION 'Membership RPC owner or fixed search_path is unsafe.';
  END IF;

  IF prediction_guard_is_definer
    OR longterm_guard_is_definer
    OR NOT ('search_path=""' = ANY(prediction_guard_config))
    OR NOT ('search_path=""' = ANY(longterm_guard_config)) THEN
    RAISE EXCEPTION 'Points guard must be SECURITY INVOKER with fixed search_path.';
  END IF;

  IF has_table_privilege('authenticated', 'public.lobbies', 'INSERT')
    OR has_column_privilege('authenticated', 'public.lobbies', 'owner_id', 'UPDATE')
    OR has_column_privilege('authenticated', 'public.lobbies', 'join_code', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.lobby_members', 'INSERT')
    OR has_table_privilege('authenticated', 'public.lobby_members', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.lobby_members', 'DELETE')
    OR has_table_privilege('authenticated', 'public.lobbies', 'TRUNCATE')
    OR has_table_privilege('authenticated', 'public.lobby_members', 'TRIGGER')
    OR has_table_privilege('authenticated', 'public.predictions', 'REFERENCES')
    OR has_table_privilege('anon', 'public.longterm_predictions', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Direct membership or lobby security-field write privilege remains.';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.lobbies', 'name', 'UPDATE')
    OR NOT has_column_privilege('authenticated', 'public.lobbies', 'short_description', 'UPDATE')
    OR NOT has_function_privilege(
      'authenticated',
      'public.create_lobby_secure(text,text,text,text,text)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'authenticated',
      'public.join_lobby_secure(text)',
      'EXECUTE'
    ) THEN
    RAISE EXCEPTION 'Required legitimate client privileges are missing.';
  END IF;

  IF has_function_privilege(
      'anon',
      'public.create_lobby_secure(text,text,text,text,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'service_role',
      'public.create_lobby_secure(text,text,text,text,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.join_lobby_secure(text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'service_role',
      'public.join_lobby_secure(text)',
      'EXECUTE'
    ) THEN
    RAISE EXCEPTION 'Membership RPC has an overly broad EXECUTE grant.';
  END IF;

  IF has_function_privilege(
      'authenticated',
      'public.protect_prediction_points_earned()',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.protect_longterm_prediction_points_earned()',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.protect_prediction_points_earned()',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.protect_longterm_prediction_points_earned()',
      'EXECUTE'
    ) THEN
    RAISE EXCEPTION 'Points guard function has an unnecessary Data API grant.';
  END IF;
END;
$$;

ROLLBACK;
