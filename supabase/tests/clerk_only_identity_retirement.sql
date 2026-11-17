-- Run after the Clerk-only migration. Trusted claims emulate verified requests;
-- they do not test a cryptographic JWT or a real OAuth session.
-- All fixture identities/history and account deletion end in ROLLBACK.
BEGIN;
SELECT set_config('retirement_test.legacy_id',gen_random_uuid()::text,true);
SELECT public.configure_clerk_identity_provider(
  'https://retirement-test.clerk.accounts.dev',ARRAY['http://localhost:3000']);

SELECT set_config('request.jwt.claims',jsonb_build_object(
  'role','authenticated','iss','https://retirement-test.clerk.accounts.dev',
  'sub','user_retirement_a','sid','sess_retirement_a','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
SELECT set_config('retirement_test.a',public.bootstrap_my_account()->>'id',true);
DO $$ BEGIN
  IF public.current_player_id()::text IS DISTINCT FROM current_setting('retirement_test.a')
    OR public.is_admin() THEN RAISE EXCEPTION 'Enabled Clerk player did not resolve safely'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims',jsonb_build_object(
  'role','authenticated','iss','https://retirement-test.clerk.accounts.dev',
  'sub','user_retirement_b','sid','sess_retirement_b','azp','http://localhost:3000',
  'user_metadata',jsonb_build_object('role','admin'))::text,true);
SET LOCAL ROLE authenticated;
SELECT set_config('retirement_test.b',public.bootstrap_my_account()->>'id',true);
DO $$ BEGIN
  IF public.is_admin() THEN RAISE EXCEPTION 'Metadata granted platform admin'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(id,email,raw_user_meta_data,created_at)
VALUES(current_setting('retirement_test.legacy_id')::uuid,
  'retirement-rollback-only@example.invalid','{"username":"retirement-rollback-only"}',now());
UPDATE public.profiles SET role='admin' WHERE id=current_setting('retirement_test.legacy_id')::uuid;
INSERT INTO public.sports(id,slug,name) VALUES('retirement-test','retirement-test','Rollback only');
INSERT INTO public.participants(id,sport_id,name,short_name) VALUES
  ('retirement-a','retirement-test','Rollback A','A'),('retirement-b','retirement-test','Rollback B','B');
INSERT INTO public.tournaments(id,sport_id,slug,name,status)
VALUES('retirement-test','retirement-test','retirement-test','Rollback only','active');
INSERT INTO public.matches(id,tournament_id,home_participant_id,away_participant_id,
  start_time_utc,lock_time_utc,status,stage)
VALUES('retirement-test-match','retirement-test','retirement-a','retirement-b',
  now()+interval '1 day',now()+interval '1 day','scheduled','Group test');
INSERT INTO public.lobbies(id,name,owner_id,tournament_id,join_code,visibility) VALUES
  ('retirement-test-history','Rollback history',current_setting('retirement_test.legacy_id')::uuid,
    'retirement-test','RETIREMENT-ROLLBACK-HISTORY','private'),
  ('retirement-test-clerk','Rollback Clerk',current_setting('retirement_test.a')::uuid,
    'retirement-test','RETIREMENT-ROLLBACK-CLERK','private');
INSERT INTO public.lobby_members(lobby_id,user_id,role) VALUES
  ('retirement-test-history',current_setting('retirement_test.legacy_id')::uuid,'member'),
  ('retirement-test-clerk',current_setting('retirement_test.a')::uuid,'member');
INSERT INTO public.lobby_tournaments(lobby_id,tournament_id,status) VALUES
  ('retirement-test-history','retirement-test','active'),('retirement-test-clerk','retirement-test','active');
INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score)
VALUES(current_setting('retirement_test.legacy_id')::uuid,'retirement-test-history','retirement-test-match',2,1);

-- A historical admin's UUID is denied even while its auth row still exists.
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://hkhkbtzdyjbdeeoiurvw.supabase.co/auth/v1',
  'sub',current_setting('retirement_test.legacy_id'))::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF public.current_player_id() IS NOT NULL OR public.is_admin()
    OR public.is_lobby_member('retirement-test-history') THEN
    RAISE EXCEPTION 'Legacy UUID retained access before auth cleanup'; END IF;
  IF EXISTS(SELECT 1 FROM public.predictions WHERE lobby_id='retirement-test-history') THEN
    RAISE EXCEPTION 'Legacy JWT read historical private predictions'; END IF;
END $$;
RESET ROLE;

-- Deleting only the auth identity must preserve its player and game references.
DELETE FROM auth.users WHERE id=current_setting('retirement_test.legacy_id')::uuid;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=current_setting('retirement_test.legacy_id')::uuid)
    OR NOT EXISTS(SELECT 1 FROM public.predictions WHERE lobby_id='retirement-test-history')
    OR NOT EXISTS(SELECT 1 FROM public.lobbies WHERE id='retirement-test-history'
      AND owner_id=current_setting('retirement_test.legacy_id')::uuid) THEN
    RAISE EXCEPTION 'Auth cleanup deleted historical game data'; END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE issuer text; BEGIN
  FOREACH issuer IN ARRAY ARRAY['supabase','https://hkhkbtzdyjbdeeoiurvw.supabase.co/auth/v1'] LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
      'iss',issuer,'sub',current_setting('retirement_test.legacy_id'))::text,true);
    IF public.current_player_id() IS NOT NULL OR public.is_admin() THEN
      RAISE EXCEPTION 'Deleted auth identity still resolved through its surviving player'; END IF;
  END LOOP;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims',jsonb_build_object(
  'role','authenticated','iss','https://retirement-test.clerk.accounts.dev',
  'sub','user_retirement_a','sid','sess_retirement_a','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score)
VALUES(public.current_player_id(),'retirement-test-clerk','retirement-test-match',1,0);
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object(
  'role','authenticated','iss','https://retirement-test.clerk.accounts.dev',
  'sub','user_retirement_b','sid','sess_retirement_b','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.predictions WHERE lobby_id='retirement-test-clerk') THEN
    RAISE EXCEPTION 'Clerk outsider read another lobby'; END IF;
  BEGIN
    INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score)
    VALUES(public.current_player_id(),'retirement-test-clerk','retirement-test-match',1,0);
    RAISE EXCEPTION 'Clerk outsider inserted in another lobby';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- Clerk-only must still respect disabled identities and authorized origins.
UPDATE tipovacka_private.player_auth_identities SET disabled_at=now()
WHERE issuer='https://retirement-test.clerk.accounts.dev' AND subject='user_retirement_a';
SELECT set_config('request.jwt.claims',jsonb_build_object(
  'role','authenticated','iss','https://retirement-test.clerk.accounts.dev',
  'sub','user_retirement_a','sid','sess_retirement_a','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF public.current_player_id() IS NOT NULL THEN RAISE EXCEPTION 'Disabled Clerk identity resolved'; END IF;
  BEGIN
    PERFORM public.bootstrap_my_account();
    RAISE EXCEPTION 'Disabled identity was bootstrapped again';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
UPDATE tipovacka_private.player_auth_identities SET disabled_at=NULL
WHERE issuer='https://retirement-test.clerk.accounts.dev' AND subject='user_retirement_a';
SELECT set_config('request.jwt.claims',jsonb_build_object(
  'role','authenticated','iss','https://retirement-test.clerk.accounts.dev',
  'sub','user_retirement_a','sid','sess_retirement_a','azp','https://foreign.example')::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF public.current_player_id() IS NOT NULL THEN RAISE EXCEPTION 'Foreign origin resolved'; END IF;
END $$;
RESET ROLE;

-- Scheduler/server authority remains separate from player login.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$ BEGIN
  IF public.current_player_id() IS NOT NULL THEN RAISE EXCEPTION 'Service role became a player'; END IF;
  IF public.resolve_clerk_player_identity('https://retirement-test.clerk.accounts.dev','user_retirement_a')::text
    IS DISTINCT FROM current_setting('retirement_test.a') THEN
    RAISE EXCEPTION 'Server Clerk resolver changed'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
