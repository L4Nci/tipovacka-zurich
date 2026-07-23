-- Local/staging rollback-only contract checks for migration 009.
-- Run after 009_auth_profile_foundation.sql has been applied.

BEGIN;

DO $$
DECLARE
  first_user_id uuid := '00000000-0000-4000-8000-000000000091';
  second_user_id uuid := '00000000-0000-4000-8000-000000000092';
  apple_user_id uuid := '00000000-0000-4000-8000-000000000093';
  metadata_free_user_id uuid := '00000000-0000-4000-8000-000000000094';
  first_profile public.profiles%ROWTYPE;
  second_profile public.profiles%ROWTYPE;
  apple_profile public.profiles%ROWTYPE;
  metadata_free_profile public.profiles%ROWTYPE;
  profile_count_before integer;
  profile_count_after integer;
BEGIN
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
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    first_user_id,
    'authenticated',
    'authenticated',
    'auth-009-first@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"],"role":"admin"}'::jsonb,
    '{"username":"Auth 009"}'::jsonb,
    now(),
    now()
  );

  SELECT * INTO STRICT first_profile
  FROM public.profiles
  WHERE id = first_user_id;

  IF first_profile.role <> 'player' THEN
    RAISE EXCEPTION 'Auth metadata incorrectly assigned platform role: %', first_profile.role;
  END IF;

  IF first_profile.username <> 'Auth 009' THEN
    RAISE EXCEPTION 'Expected requested display name, got %', first_profile.username;
  END IF;

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
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    second_user_id,
    'authenticated',
    'authenticated',
    'auth-009-second@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"google","providers":["google"],"role":"admin"}'::jsonb,
    '{"full_name":"Auth 009"}'::jsonb,
    now(),
    now()
  );

  SELECT * INTO STRICT second_profile
  FROM public.profiles
  WHERE id = second_user_id;

  IF second_profile.role <> 'player' THEN
    RAISE EXCEPTION 'OAuth metadata incorrectly assigned platform role: %', second_profile.role;
  END IF;

  IF second_profile.username = first_profile.username THEN
    RAISE EXCEPTION 'Duplicate display name was not resolved safely.';
  END IF;

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
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    apple_user_id,
    'authenticated',
    'authenticated',
    'relay-address@privaterelay.appleid.com',
    'not-a-real-password-hash',
    now(),
    '{"provider":"apple","providers":["apple"],"role":"admin"}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

  SELECT * INTO STRICT apple_profile
  FROM public.profiles
  WHERE id = apple_user_id;

  IF apple_profile.role <> 'player'
    OR apple_profile.username <> 'uzivatel_' || replace(apple_user_id::text, '-', '') THEN
    RAISE EXCEPTION 'Apple relay fallback was not provisioned safely: %, %',
      apple_profile.username,
      apple_profile.role;
  END IF;

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    encrypted_password,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    metadata_free_user_id,
    'authenticated',
    'authenticated',
    'not-a-real-password-hash',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

  SELECT * INTO STRICT metadata_free_profile
  FROM public.profiles
  WHERE id = metadata_free_user_id;

  IF metadata_free_profile.role <> 'player'
    OR metadata_free_profile.username <> 'uzivatel_' || replace(metadata_free_user_id::text, '-', '') THEN
    RAISE EXCEPTION 'Metadata-free identity was not provisioned safely: %, %',
      metadata_free_profile.username,
      metadata_free_profile.role;
  END IF;

  UPDATE auth.users
  SET raw_user_meta_data = '{"username":"Changed metadata","role":"admin"}'::jsonb
  WHERE id = first_user_id;

  SELECT * INTO STRICT first_profile
  FROM public.profiles
  WHERE id = first_user_id;

  IF first_profile.username <> 'Auth 009' OR first_profile.role <> 'player' THEN
    RAISE EXCEPTION 'Existing profile was overwritten after auth metadata changed.';
  END IF;

  SELECT count(*) INTO profile_count_before
  FROM public.profiles
  WHERE id IN (first_user_id, second_user_id, apple_user_id, metadata_free_user_id);

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

  SELECT count(*) INTO profile_count_after
  FROM public.profiles
  WHERE id IN (first_user_id, second_user_id, apple_user_id, metadata_free_user_id);

  IF profile_count_before <> 4 OR profile_count_after <> profile_count_before THEN
    RAISE EXCEPTION 'Repeated profile backfill was not idempotent: before %, after %',
      profile_count_before,
      profile_count_after;
  END IF;
END;
$$;

DO $$
DECLARE
  function_acl aclitem[];
BEGIN
  SELECT proacl INTO function_acl
  FROM pg_proc
  WHERE oid = 'public.handle_new_user()'::regprocedure;

  IF has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE')
    OR has_function_privilege('service_role', 'public.handle_new_user()', 'EXECUTE') THEN
    RAISE EXCEPTION 'handle_new_user has an overly broad EXECUTE grant: %', function_acl;
  END IF;
END;
$$;

ROLLBACK;
