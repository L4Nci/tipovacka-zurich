-- Rollback-only integration checks for Phase 012.
-- Run only against local or isolated staging after migrations 001-012.

BEGIN;

INSERT INTO public.sports (id, slug, name)
VALUES ('phase-012-sport', 'phase-012-sport', 'Phase 012 Test Sport');

INSERT INTO public.tournaments (
  id,
  sport_id,
  slug,
  name,
  status,
  actual_tournament_winner_id
)
VALUES (
  'phase-012-tournament',
  'phase-012-sport',
  'phase-012-tournament',
  'Phase 012 Test Tournament',
  'active',
  NULL
);

INSERT INTO public.participants (id, sport_id, name, short_name)
VALUES
  ('phase-012-home', 'phase-012-sport', 'Phase 012 Home', 'P12H'),
  ('phase-012-away', 'phase-012-sport', 'Phase 012 Away', 'P12A');

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
  'phase-012-match',
  'phase-012-tournament',
  'phase-012-home',
  'phase-012-away',
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
    '00000000-0000-4000-8000-000000000401',
    'authenticated',
    'authenticated',
    'phase-012-owner@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Phase 012 Owner"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000402',
    'authenticated',
    'authenticated',
    'phase-012-admin@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Phase 012 Admin"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000403',
    'authenticated',
    'authenticated',
    'phase-012-member@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Phase 012 Member"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000404',
    'authenticated',
    'authenticated',
    'phase-012-applicant@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Phase 012 Applicant"}'::jsonb,
    now(),
    now()
  );

CREATE TEMP TABLE phase012_context (
  lobby_id text PRIMARY KEY,
  join_code text NOT NULL
) ON COMMIT DROP;
GRANT ALL ON phase012_context TO authenticated;

-- Owner creates an approval-required lobby. Owner identity and membership role
-- are derived by the RPC.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000401","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000401', true);

INSERT INTO phase012_context (lobby_id, join_code)
SELECT created.id, created.join_code
FROM public.create_lobby_secure(
  'Phase 012 Community Lobby',
  'phase-012-tournament',
  'private',
  NULL,
  NULL,
  'approval_required'
) AS created;

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.lobbies
    WHERE id = (SELECT lobby_id FROM phase012_context)
      AND owner_id = '00000000-0000-4000-8000-000000000401'
      AND join_policy = 'approval_required'
  ) THEN
    RAISE EXCEPTION 'Approval lobby was not created with the authenticated owner.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.lobby_members
    WHERE lobby_id = (SELECT lobby_id FROM phase012_context)
      AND user_id = '00000000-0000-4000-8000-000000000401'
      AND role = 'member'
      AND membership_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Owner membership invariant failed.';
  END IF;
END;
$$;

-- Applicant creates one pending request. Repeated joins are idempotent and do
-- not create a pending membership row.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000402","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000402', true);

DO $$
DECLARE
  first_state text;
  second_state text;
BEGIN
  SELECT membership_state INTO STRICT first_state
  FROM public.join_lobby_secure((SELECT join_code FROM phase012_context));

  SELECT membership_state INTO STRICT second_state
  FROM public.join_lobby_secure((SELECT join_code FROM phase012_context));

  IF first_state <> 'pending' OR second_state <> 'pending' THEN
    RAISE EXCEPTION 'Approval join is not idempotently pending: %, %', first_state, second_state;
  END IF;
END;
$$;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.lobby_join_requests
    WHERE lobby_id = (SELECT lobby_id FROM phase012_context)
      AND user_id = '00000000-0000-4000-8000-000000000402'
      AND status = 'pending'
  ) <> 1 THEN
    RAISE EXCEPTION 'Duplicate pending request exists.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.lobby_members
    WHERE lobby_id = (SELECT lobby_id FROM phase012_context)
      AND user_id = '00000000-0000-4000-8000-000000000402'
  ) THEN
    RAISE EXCEPTION 'Pending request incorrectly created a membership.';
  END IF;
END;
$$;

-- Direct PostgREST-equivalent membership writes remain unavailable.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.lobby_members (lobby_id, user_id, role, membership_status)
    VALUES (
      (SELECT lobby_id FROM phase012_context),
      '00000000-0000-4000-8000-000000000402',
      'admin',
      'active'
    );
    RAISE EXCEPTION 'Direct membership INSERT unexpectedly succeeded.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;

-- Owner approves the request. Repeating the resolution is harmless.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000401","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000401', true);

DO $$
DECLARE
  request_id uuid;
  first_result text;
  second_result text;
BEGIN
  SELECT id INTO STRICT request_id
  FROM public.lobby_join_requests
  WHERE lobby_id = (SELECT lobby_id FROM phase012_context)
    AND user_id = '00000000-0000-4000-8000-000000000402'
    AND status = 'pending';

  SELECT public.resolve_lobby_join_request(request_id, 'approved') INTO first_result;
  SELECT public.resolve_lobby_join_request(request_id, 'approved') INTO second_result;

  IF first_result <> 'approved' OR second_result <> 'approved' THEN
    RAISE EXCEPTION 'Approval resolution is not idempotent.';
  END IF;
END;
$$;

RESET ROLE;

-- Promote the fixture to an existing lobby admin using the trusted role. Phase
-- 012 intentionally does not add role-assignment UI or RPCs.
UPDATE public.lobby_members
SET role = 'admin'
WHERE lobby_id = (SELECT lobby_id FROM phase012_context)
  AND user_id = '00000000-0000-4000-8000-000000000402';

-- A second user requests access and the lobby admin can approve the ordinary
-- applicant.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000403","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000403', true);
SELECT membership_state
FROM public.join_lobby_secure((SELECT join_code FROM phase012_context));
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000402","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000402', true);
SELECT public.resolve_lobby_join_request(
  (
    SELECT id
    FROM public.lobby_join_requests
    WHERE lobby_id = (SELECT lobby_id FROM phase012_context)
      AND user_id = '00000000-0000-4000-8000-000000000403'
      AND status = 'pending'
  ),
  'approved'
);

-- An admin cannot remove the owner or another admin.
DO $$
BEGIN
  BEGIN
    PERFORM public.remove_lobby_member_secure(
      (SELECT lobby_id FROM phase012_context),
      '00000000-0000-4000-8000-000000000401'
    );
    RAISE EXCEPTION 'Lobby admin removed the owner.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.remove_lobby_member_secure(
      (SELECT lobby_id FROM phase012_context),
      '00000000-0000-4000-8000-000000000402'
    );
    RAISE EXCEPTION 'Lobby admin removed an admin.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

-- Admin removes an ordinary member.
SELECT public.remove_lobby_member_secure(
  (SELECT lobby_id FROM phase012_context),
  '00000000-0000-4000-8000-000000000403'
);
RESET ROLE;

-- Removed users cannot return through the join code.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000403","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000403', true);
DO $$
DECLARE
  result_state text;
BEGIN
  SELECT membership_state INTO STRICT result_state
  FROM public.join_lobby_secure((SELECT join_code FROM phase012_context));
  IF result_state <> 'removed' THEN
    RAISE EXCEPTION 'Removed member bypassed explicit restore: %', result_state;
  END IF;
END;
$$;
RESET ROLE;

-- Owner restores the existing row, then member leaves and must be approved
-- again. No duplicate membership is created.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000401","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000401', true);
SELECT public.restore_lobby_member_secure(
  (SELECT lobby_id FROM phase012_context),
  '00000000-0000-4000-8000-000000000403'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000403","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000403', true);
SELECT public.leave_lobby_secure((SELECT lobby_id FROM phase012_context));
SELECT membership_state
FROM public.join_lobby_secure((SELECT join_code FROM phase012_context));
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000401","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000401', true);
SELECT public.resolve_lobby_join_request(
  (
    SELECT id
    FROM public.lobby_join_requests
    WHERE lobby_id = (SELECT lobby_id FROM phase012_context)
      AND user_id = '00000000-0000-4000-8000-000000000403'
      AND status = 'pending'
  ),
  'approved'
);
RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.lobby_members
    WHERE lobby_id = (SELECT lobby_id FROM phase012_context)
      AND user_id = '00000000-0000-4000-8000-000000000403'
  ) <> 1 THEN
    RAISE EXCEPTION 'Lifecycle created a duplicate membership row.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.lobby_members
    WHERE membership_status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Pending membership row exists after Phase 012.';
  END IF;
END;
$$;

-- Invalid codes do not disclose whether a similarly shaped lobby exists.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000404","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000404', true);
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.join_lobby_secure('NOT-A-REAL-CODE');
    RAISE EXCEPTION 'Invalid join code unexpectedly succeeded.';
  EXCEPTION
    WHEN no_data_found THEN NULL;
  END;
END;
$$;

-- Applicants can cancel only their own pending request and can submit a new
-- request afterwards.
SELECT membership_state
FROM public.join_lobby_secure((SELECT join_code FROM phase012_context));

SELECT public.cancel_lobby_join_request(
  (
    SELECT id
    FROM public.lobby_join_requests
    WHERE lobby_id = (SELECT lobby_id FROM phase012_context)
      AND user_id = '00000000-0000-4000-8000-000000000404'
      AND status = 'pending'
  )
);

SELECT membership_state
FROM public.join_lobby_secure((SELECT join_code FROM phase012_context));
RESET ROLE;

-- A lobby admin can reject a pending request without creating membership.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000402","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000402', true);
SELECT public.resolve_lobby_join_request(
  (
    SELECT id
    FROM public.lobby_join_requests
    WHERE lobby_id = (SELECT lobby_id FROM phase012_context)
      AND user_id = '00000000-0000-4000-8000-000000000404'
      AND status = 'pending'
  ),
  'rejected'
);
RESET ROLE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.lobby_members
    WHERE lobby_id = (SELECT lobby_id FROM phase012_context)
      AND user_id = '00000000-0000-4000-8000-000000000404'
  ) THEN
    RAISE EXCEPTION 'Rejected applicant received a membership.';
  END IF;

  IF (
    SELECT count(*)
    FROM public.lobby_join_requests
    WHERE lobby_id = (SELECT lobby_id FROM phase012_context)
      AND user_id = '00000000-0000-4000-8000-000000000404'
      AND status IN ('cancelled', 'rejected')
  ) <> 2 THEN
    RAISE EXCEPTION 'Cancel/reject lifecycle did not preserve both resolved requests.';
  END IF;
END;
$$;

-- A rejected applicant cannot submit another request for 42 hours.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000404","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000404', true);
DO $$
BEGIN
  BEGIN
    PERFORM *
    FROM public.join_lobby_secure((SELECT join_code FROM phase012_context));
    RAISE EXCEPTION 'Rejected request cooldown unexpectedly allowed a new request.';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'Po zamítnutí můžeš novou žádost poslat nejdříve za 42 hodin.' THEN
        RAISE;
      END IF;
  END;
END;
$$;
RESET ROLE;

-- The same applicant can submit a new request after the cooldown expires.
UPDATE public.lobby_join_requests
SET resolved_at = now() - interval '43 hours'
WHERE lobby_id = (SELECT lobby_id FROM phase012_context)
  AND user_id = '00000000-0000-4000-8000-000000000404'
  AND status = 'rejected';

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000404","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000404', true);
SELECT membership_state
FROM public.join_lobby_secure((SELECT join_code FROM phase012_context));
RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.lobby_join_requests
    WHERE lobby_id = (SELECT lobby_id FROM phase012_context)
      AND user_id = '00000000-0000-4000-8000-000000000404'
      AND status = 'pending'
  ) <> 1 THEN
    RAISE EXCEPTION 'Rejected applicant was not allowed to reapply after 42 hours.';
  END IF;
END;
$$;

ROLLBACK;
