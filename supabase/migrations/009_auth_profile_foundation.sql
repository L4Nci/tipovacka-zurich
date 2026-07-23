-- Phase 009: safe profile creation for e-mail confirmation and OAuth identities.
-- Existing profile rows are never updated.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested_username text;
  resolved_username text;
BEGIN
  requested_username := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data->>'username'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data->>'name'), ''),
    'uzivatel_' || replace(NEW.id::text, '-', '')
  );

  resolved_username := left(requested_username, 80);
  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE lower(username) = lower(resolved_username)
  ) THEN
    resolved_username := left(requested_username, 80) || '_' || replace(NEW.id::text, '-', '');
  END IF;

  BEGIN
    INSERT INTO public.profiles (id, username, role, created_at)
    VALUES (NEW.id, resolved_username, 'player', COALESCE(NEW.created_at, now()))
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION
    WHEN unique_violation THEN
      INSERT INTO public.profiles (id, username, role, created_at)
      VALUES (
        NEW.id,
        left(requested_username, 80) || '_' || replace(NEW.id::text, '-', ''),
        'player',
        COALESCE(NEW.created_at, now())
      )
      ON CONFLICT (id) DO NOTHING;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;

-- Repair only auth identities that currently have no profile. The generated
-- name deliberately triggers the application onboarding screen.
INSERT INTO public.profiles (id, username, role, created_at)
SELECT
  users.id,
  'uzivatel_' || replace(users.id::text, '-', ''),
  'player',
  COALESCE(users.created_at, now())
FROM auth.users AS users
WHERE NOT EXISTS (
  SELECT 1
  FROM public.profiles AS profiles
  WHERE profiles.id = users.id
)
ON CONFLICT (id) DO NOTHING;
