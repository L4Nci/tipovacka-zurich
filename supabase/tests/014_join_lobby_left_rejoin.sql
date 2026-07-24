-- Rollback-only regression checks for migration 014.
-- Run only against local or isolated staging after migrations 001-014.

BEGIN;

INSERT INTO public.sports (id, slug, name)
VALUES ('phase-014-sport', 'phase-014-sport', 'Phase 014 Test Sport');

INSERT INTO public.tournaments (id, sport_id, slug, name, status)
VALUES (
  'phase-014-tournament',
  'phase-014-sport',
  'phase-014-tournament',
  'Phase 014 Test Tournament',
  'active'
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
    '00000000-0000-4000-8000-000000000701',
    'authenticated',
    'authenticated',
    'phase-014-owner@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Phase 014 Owner"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000702',
    'authenticated',
    'authenticated',
    'phase-014-member@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Phase 014 Member"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000703',
    'authenticated',
    'authenticated',
    'phase-014-rejected@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Phase 014 Rejected"}'::jsonb,
    now(),
    now()
  );

CREATE TEMP TABLE phase014_context (
  lobby_id text PRIMARY KEY,
  join_code text NOT NULL,
  owner_id uuid NOT NULL,
  membership_id uuid
) ON COMMIT DROP;
GRANT ALL ON phase014_context TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000701","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000701', true);

INSERT INTO phase014_context (lobby_id, join_code, owner_id)
SELECT created.id, created.join_code, created.owner_id
FROM public.create_lobby_secure(
  'Phase 014 Rejoin Lobby',
  'phase-014-tournament',
  'private',
  NULL,
  NULL,
  'open'
) AS created;

RESET ROLE;

-- A new member joins and a duplicate active join remains idempotent.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000702","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000702', true);

DO $$
DECLARE
  first_state text;
  duplicate_state text;
BEGIN
  SELECT membership_state INTO STRICT first_state
  FROM public.join_lobby_secure((SELECT join_code FROM phase014_context));

  SELECT membership_state INTO STRICT duplicate_state
  FROM public.join_lobby_secure((SELECT join_code FROM phase014_context));

  IF first_state <> 'joined' OR duplicate_state <> 'already_member' THEN
    RAISE EXCEPTION 'Open join states changed: %, %', first_state, duplicate_state;
  END IF;
END;
$$;

RESET ROLE;

UPDATE phase014_context
SET membership_id = (
  SELECT membership.id
  FROM public.lobby_members AS membership
  WHERE membership.lobby_id = phase014_context.lobby_id
    AND membership.user_id = '00000000-0000-4000-8000-000000000702'
);

-- The lifecycle operation records left metadata.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000702","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000702', true);
SELECT public.leave_lobby_secure((SELECT lobby_id FROM phase014_context));
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.lobby_members AS membership
    WHERE membership.id = (SELECT membership_id FROM phase014_context)
      AND membership.membership_status = 'left'
      AND membership.ended_at IS NOT NULL
      AND membership.ended_by = '00000000-0000-4000-8000-000000000702'
  ) THEN
    RAISE EXCEPTION 'Leave lifecycle metadata was not recorded.';
  END IF;
END;
$$;

-- The regression: open rejoin reactivates the same row without ambiguity.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000702","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000702', true);

DO $$
DECLARE
  rejoin_state text;
BEGIN
  SELECT membership_state INTO STRICT rejoin_state
  FROM public.join_lobby_secure((SELECT join_code FROM phase014_context));

  IF rejoin_state <> 'rejoined' THEN
    RAISE EXCEPTION 'Expected rejoined, received %.', rejoin_state;
  END IF;
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.lobby_members AS membership
    WHERE membership.lobby_id = (SELECT lobby_id FROM phase014_context)
      AND membership.user_id = '00000000-0000-4000-8000-000000000702'
  ) <> 1 THEN
    RAISE EXCEPTION 'Open rejoin created a duplicate membership.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.lobby_members AS membership
    WHERE membership.id = (SELECT membership_id FROM phase014_context)
      AND membership.membership_status = 'active'
      AND membership.role = 'member'
      AND membership.ended_at IS NULL
      AND membership.ended_by IS NULL
  ) THEN
    RAISE EXCEPTION 'Open rejoin did not reactivate the original membership.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.lobbies AS lobby
    WHERE lobby.id = (SELECT lobby_id FROM phase014_context)
      AND lobby.owner_id = (SELECT owner_id FROM phase014_context)
  ) THEN
    RAISE EXCEPTION 'Open rejoin changed lobby ownership.';
  END IF;
END;
$$;

-- A left member in an approval lobby receives a request and remains left.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000701","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000701', true);
SELECT public.set_lobby_join_policy(
  (SELECT lobby_id FROM phase014_context),
  'approval_required'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000702","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000702', true);
SELECT public.leave_lobby_secure((SELECT lobby_id FROM phase014_context));

DO $$
DECLARE
  request_state text;
BEGIN
  SELECT membership_state INTO STRICT request_state
  FROM public.join_lobby_secure((SELECT join_code FROM phase014_context));

  IF request_state <> 'pending' THEN
    RAISE EXCEPTION 'Left approval join did not return pending: %', request_state;
  END IF;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.lobby_members AS membership
    WHERE membership.id = (SELECT membership_id FROM phase014_context)
      AND membership.membership_status = 'left'
  ) OR (
    SELECT count(*)
    FROM public.lobby_join_requests AS request
    WHERE request.lobby_id = (SELECT lobby_id FROM phase014_context)
      AND request.user_id = '00000000-0000-4000-8000-000000000702'
      AND request.status = 'pending'
  ) <> 1 THEN
    RAISE EXCEPTION 'Left approval join changed membership or request invariants.';
  END IF;
END;
$$;

-- A removed member stays blocked even when the lobby is open.
RESET ROLE;
UPDATE public.lobby_join_requests AS request
SET
  status = 'cancelled',
  resolved_at = now(),
  resolved_by = '00000000-0000-4000-8000-000000000702'
WHERE request.lobby_id = (SELECT lobby_id FROM phase014_context)
  AND request.user_id = '00000000-0000-4000-8000-000000000702'
  AND request.status = 'pending';

UPDATE public.lobbies AS lobby
SET join_policy = 'open'
WHERE lobby.id = (SELECT lobby_id FROM phase014_context);

UPDATE public.lobby_members AS membership
SET
  membership_status = 'removed',
  ended_at = now(),
  ended_by = '00000000-0000-4000-8000-000000000701'
WHERE membership.id = (SELECT membership_id FROM phase014_context);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000702","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000702', true);

DO $$
DECLARE
  removed_state text;
BEGIN
  SELECT membership_state INTO STRICT removed_state
  FROM public.join_lobby_secure((SELECT join_code FROM phase014_context));

  IF removed_state <> 'removed' THEN
    RAISE EXCEPTION 'Removed join state changed: %', removed_state;
  END IF;
END;
$$;
RESET ROLE;

-- Invalid codes retain the non-enumerating not-found response.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000703","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000703', true);

DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.join_lobby_secure('PHASE014-NOT-FOUND');
    RAISE EXCEPTION 'Invalid join code unexpectedly succeeded.';
  EXCEPTION
    WHEN no_data_found THEN NULL;
  END;
END;
$$;
RESET ROLE;

-- A freshly rejected request is subject to the existing 42-hour cooldown.
UPDATE public.lobbies AS lobby
SET join_policy = 'approval_required'
WHERE lobby.id = (SELECT lobby_id FROM phase014_context);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000703","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000703', true);
SELECT membership_state
FROM public.join_lobby_secure((SELECT join_code FROM phase014_context));
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000701","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000701', true);
SELECT public.resolve_lobby_join_request(
  (
    SELECT request.id
    FROM public.lobby_join_requests AS request
    WHERE request.lobby_id = (SELECT lobby_id FROM phase014_context)
      AND request.user_id = '00000000-0000-4000-8000-000000000703'
      AND request.status = 'pending'
  ),
  'rejected'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000703","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000703', true);

DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.join_lobby_secure((SELECT join_code FROM phase014_context));
    RAISE EXCEPTION 'Rejected cooldown unexpectedly allowed a new request.';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%42 hodin%' THEN
        RAISE;
      END IF;
  END;
END;
$$;
RESET ROLE;

ROLLBACK;
