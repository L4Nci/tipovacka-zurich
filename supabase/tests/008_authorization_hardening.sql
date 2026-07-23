-- Run only after 008_authorization_hardening.sql in local/staging Supabase.
-- This test uses a temporary table and always rolls back; it never updates profiles.

BEGIN;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

CREATE TEMP TABLE profile_role_probe (
  role text NOT NULL,
  username text NOT NULL
);

INSERT INTO profile_role_probe (role, username) VALUES ('player', 'before');

CREATE TRIGGER protect_profile_platform_role_probe
  BEFORE UPDATE OF role ON profile_role_probe
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.protect_profile_platform_role();

DO $$
BEGIN
  BEGIN
    UPDATE profile_role_probe SET role = 'admin';
    RAISE EXCEPTION 'Expected platform role update to be blocked.';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  UPDATE profile_role_probe SET username = 'after';

  IF NOT EXISTS (
    SELECT 1
    FROM profile_role_probe
    WHERE role = 'player' AND username = 'after'
  ) THEN
    RAISE EXCEPTION 'Expected non-role profile update to remain allowed.';
  END IF;
END;
$$;

ROLLBACK;
