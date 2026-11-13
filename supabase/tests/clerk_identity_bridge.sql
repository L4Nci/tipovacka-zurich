-- Trusted SQL test harness emulates PostgREST's verified claims, not token verification.
-- The separate jose tests exercise JWT signatures. Every fixture is rolled back.
BEGIN;

SELECT public.configure_clerk_identity_provider('https://rls-test.clerk.accounts.dev',ARRAY['http://localhost:3000']);
SELECT set_config('request.jwt.claims',jsonb_build_object(
  'iss','https://rls-test.clerk.accounts.dev','sub','user_rls_test_a',
  'sid','sess_rls_test_a','azp','http://localhost:3000','role','authenticated',
  'user_metadata',jsonb_build_object('role','admin'))::text,true);
SET LOCAL ROLE authenticated;

DO $test$
DECLARE a jsonb; b jsonb; n integer;
BEGIN
  a := public.bootstrap_my_account();
  b := public.bootstrap_my_account();
  IF a->>'id' IS DISTINCT FROM b->>'id' OR a->>'role' <> 'player'
     OR a->>'needs_profile_completion' <> 'true' THEN
    RAISE EXCEPTION 'Bootstrap is not idempotent or does not enforce player/onboarding.';
  END IF;
  PERFORM set_config('clerk_test.player_a',a->>'id',true);
  a := public.complete_my_profile('Stejné jméno','😀','#fee2e2','cs');
  IF a->>'needs_profile_completion' <> 'false' OR a->>'display_name' <> 'Stejné jméno' THEN
    RAISE EXCEPTION 'Profile completion failed.';
  END IF;
  IF public.current_player_id()::text IS DISTINCT FROM a->>'id' THEN
    RAISE EXCEPTION 'Identity does not resolve to its internal UUID.';
  END IF;

  BEGIN
    UPDATE public.profiles SET role='admin' WHERE id=(a->>'id')::uuid;
    RAISE EXCEPTION 'Self-promotion unexpectedly succeeded.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.profiles SET id=gen_random_uuid() WHERE id=(a->>'id')::uuid;
    RAISE EXCEPTION 'Identity reassignment unexpectedly succeeded.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.configure_clerk_identity_provider('https://attacker.example',ARRAY['http://localhost:3000']);
    RAISE EXCEPTION 'Client configured an identity provider.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.resolve_clerk_player_identity('https://rls-test.clerk.accounts.dev','user_rls_test_a');
    RAISE EXCEPTION 'Client used a server-only resolver.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM tipovacka_private.player_auth_identities;
    RAISE EXCEPTION 'Client read the private identity map.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.complete_my_profile('x','😀','#fee2e2','cs');
    RAISE EXCEPTION 'Invalid profile name was accepted.';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$test$;

SELECT set_config('request.jwt.claims',jsonb_build_object(
  'iss','https://rls-test.clerk.accounts.dev','sub','user_rls_test_b',
  'sid','sess_rls_test_b','azp','http://localhost:3000','role','authenticated')::text,true);
DO $test$
DECLARE b jsonb; n integer;
BEGIN
  b := public.bootstrap_my_account();
  IF b->>'id' = current_setting('clerk_test.player_a') THEN RAISE EXCEPTION 'Two identities share a player.'; END IF;
  PERFORM set_config('clerk_test.player_b',b->>'id',true);
  b := public.complete_my_profile('Stejné jméno','😀','#dbeafe','en');
  IF b->>'display_name' <> 'Stejné jméno' THEN RAISE EXCEPTION 'Non-unique display names failed.'; END IF;
  SELECT count(*) INTO n FROM public.profiles WHERE id=current_setting('clerk_test.player_a')::uuid;
  IF n <> 0 THEN RAISE EXCEPTION 'Unrelated private profile is visible.'; END IF;
  UPDATE public.profiles SET username='cizí změna' WHERE id=current_setting('clerk_test.player_a')::uuid;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'Unrelated private profile was updated.'; END IF;
  IF public.is_admin() THEN RAISE EXCEPTION 'New player gained admin access.'; END IF;
END;
$test$;

SELECT set_config('request.jwt.claims',jsonb_build_object(
  'iss','https://rls-test.clerk.accounts.dev','sub','user_rls_test_a',
  'sid','sess_rls_test_a','azp','https://foreign.example','role','authenticated')::text,true);
DO $test$
BEGIN
  IF public.current_player_id() IS NOT NULL THEN RAISE EXCEPTION 'Foreign origin resolved an identity.'; END IF;
  BEGIN
    PERFORM public.bootstrap_my_account();
    RAISE EXCEPTION 'Foreign-origin bootstrap succeeded.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$test$;

SELECT set_config('request.jwt.claims',jsonb_build_object(
  'iss','https://untrusted.example','sub','user_rls_test_a',
  'sid','sess_rls_test_a','azp','http://localhost:3000','role','authenticated')::text,true);
DO $test$
BEGIN
  IF public.current_player_id() IS NOT NULL THEN RAISE EXCEPTION 'Untrusted issuer resolved an identity.'; END IF;
  BEGIN
    PERFORM public.bootstrap_my_account();
    RAISE EXCEPTION 'Untrusted-issuer bootstrap succeeded.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$test$;

RESET ROLE;
INSERT INTO public.tournaments(id,sport_id,slug,name,status)
  VALUES('clerk-rls-test-tournament','football','clerk-rls-test-tournament','Rollback auth test','active');
INSERT INTO public.lobbies(id,name,owner_id,tournament_id,join_code,visibility)
  VALUES('clerk-rls-test-lobby','Rollback auth test',current_setting('clerk_test.player_a')::uuid,
    'clerk-rls-test-tournament','CLERK-RLS-ROLLBACK-ONLY','private');
INSERT INTO public.lobby_members(lobby_id,user_id,role)
  -- The existing database stores ownership in lobbies.owner_id; membership roles are admin/member.
  VALUES('clerk-rls-test-lobby',current_setting('clerk_test.player_a')::uuid,'member');
INSERT INTO public.lobby_tournaments(lobby_id,tournament_id,status)
  VALUES('clerk-rls-test-lobby','clerk-rls-test-tournament','active');
INSERT INTO public.matches(id,tournament_id,home_participant_id,away_participant_id,start_time_utc,lock_time_utc,status,stage)
  SELECT 'clerk-rls-test-open','clerk-rls-test-tournament',ids[1],ids[2],now()+interval '1 hour',now()+interval '1 hour','scheduled','Group test'
  FROM (SELECT array_agg(id ORDER BY id) AS ids FROM public.participants WHERE sport_id='football') AS teams;
INSERT INTO public.matches(id,tournament_id,home_participant_id,away_participant_id,start_time_utc,lock_time_utc,status,stage)
  SELECT 'clerk-rls-test-locked','clerk-rls-test-tournament',ids[1],ids[2],now()-interval '1 hour',now()-interval '1 hour','scheduled','Group test'
  FROM (SELECT array_agg(id ORDER BY id) AS ids FROM public.participants WHERE sport_id='football') AS teams;
-- A result can arrive before the cached kickoff/lock time is corrected.
INSERT INTO public.matches(id,tournament_id,home_participant_id,away_participant_id,start_time_utc,lock_time_utc,status,stage,home_score,away_score)
  SELECT 'clerk-rls-test-resulted','clerk-rls-test-tournament',ids[1],ids[2],now()+interval '1 hour',now()+interval '1 hour','finished','Group test',2,1
  FROM (SELECT array_agg(id ORDER BY id) AS ids FROM public.participants WHERE sport_id='football') AS teams;
INSERT INTO public.matches(id,tournament_id,home_participant_id,away_participant_id,start_time_utc,lock_time_utc,status,stage)
  SELECT 'clerk-rls-test-finished-empty','clerk-rls-test-tournament',ids[1],ids[2],now()+interval '1 hour',now()+interval '1 hour','finished','Group test'
  FROM (SELECT array_agg(id ORDER BY id) AS ids FROM public.participants WHERE sport_id='football') AS teams;
INSERT INTO public.matches(id,tournament_id,home_participant_id,away_participant_id,start_time_utc,lock_time_utc,status,stage,home_score)
  SELECT 'clerk-rls-test-partial-score','clerk-rls-test-tournament',ids[1],ids[2],now()+interval '1 hour',now()+interval '1 hour','scheduled','Group test',1
  FROM (SELECT array_agg(id ORDER BY id) AS ids FROM public.participants WHERE sport_id='football') AS teams;

SELECT set_config('request.jwt.claims',jsonb_build_object(
  'iss','https://rls-test.clerk.accounts.dev','sub','user_rls_test_a',
  'sid','sess_rls_test_a','azp','http://localhost:3000','role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE closed_match_id text;
BEGIN
  INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score)
    VALUES(public.current_player_id(),'clerk-rls-test-lobby','clerk-rls-test-open',2,1);
  FOREACH closed_match_id IN ARRAY ARRAY['clerk-rls-test-resulted','clerk-rls-test-finished-empty','clerk-rls-test-partial-score'] LOOP
    BEGIN
      INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score)
        VALUES(public.current_player_id(),'clerk-rls-test-lobby',closed_match_id,2,1);
      RAISE EXCEPTION 'A player predicted after a result or final state was recorded: %',closed_match_id;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  BEGIN
    UPDATE public.predictions SET points_earned=999 WHERE lobby_id='clerk-rls-test-lobby' AND match_id='clerk-rls-test-open';
    RAISE EXCEPTION 'A player changed their own earned points.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score)
      VALUES(current_setting('clerk_test.player_b')::uuid,'clerk-rls-test-lobby','clerk-rls-test-open',2,1);
    RAISE EXCEPTION 'A player wrote another player prediction.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score)
      VALUES(public.current_player_id(),'clerk-rls-test-lobby','clerk-rls-test-locked',2,1);
    RAISE EXCEPTION 'A player predicted after locking.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$test$;
RESET ROLE;
-- A pre-existing tip must also be immutable once a result exists.
INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score)
  VALUES(current_setting('clerk_test.player_a')::uuid,'clerk-rls-test-lobby','clerk-rls-test-resulted',1,0);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE n integer;
BEGIN
  BEGIN
    UPDATE public.predictions SET predicted_home_score=2,predicted_away_score=1
      WHERE lobby_id='clerk-rls-test-lobby' AND match_id='clerk-rls-test-resulted';
    GET DIAGNOSTICS n=ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'A player edited a tip after a result was recorded with a future lock time.'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$test$;
SELECT set_config('request.jwt.claims',jsonb_build_object(
  'iss','https://rls-test.clerk.accounts.dev','sub','user_rls_test_b',
  'sid','sess_rls_test_b','azp','http://localhost:3000','role','authenticated')::text,true);
DO $test$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.predictions WHERE lobby_id='clerk-rls-test-lobby';
  IF n <> 0 THEN RAISE EXCEPTION 'Outsider read private lobby predictions.'; END IF;
  BEGIN
    INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score)
      VALUES(public.current_player_id(),'clerk-rls-test-lobby','clerk-rls-test-open',1,0);
    RAISE EXCEPTION 'Outsider predicted in a private lobby.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$test$;
-- An invite activates this same player as an ordinary member, never an admin.
DO $test$
DECLARE n integer; r text;
BEGIN
  PERFORM public.join_lobby_secure('CLERK-RLS-ROLLBACK-ONLY');
  PERFORM public.join_lobby_secure('CLERK-RLS-ROLLBACK-ONLY');
  SELECT count(*),min(role) INTO n,r FROM public.lobby_members
    WHERE lobby_id='clerk-rls-test-lobby' AND user_id=public.current_player_id();
  IF n <> 1 OR r <> 'member' THEN RAISE EXCEPTION 'Joining is not idempotent or granted an elevated role.'; END IF;
  INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score)
    VALUES(public.current_player_id(),'clerk-rls-test-lobby','clerk-rls-test-open',1,0)
    ON CONFLICT(user_id,lobby_id,match_id) DO UPDATE
      SET predicted_home_score=EXCLUDED.predicted_home_score,predicted_away_score=EXCLUDED.predicted_away_score;
  UPDATE public.predictions SET predicted_home_score=3,predicted_away_score=2
    WHERE user_id=public.current_player_id() AND lobby_id='clerk-rls-test-lobby' AND match_id='clerk-rls-test-open';
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Member cannot edit their own open prediction.'; END IF;
  UPDATE public.predictions SET predicted_home_score=9
    WHERE user_id=current_setting('clerk_test.player_a')::uuid AND lobby_id='clerk-rls-test-lobby' AND match_id='clerk-rls-test-open';
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'A member edited another member prediction.'; END IF;
  SELECT count(*) INTO n FROM public.predictions
    WHERE user_id=current_setting('clerk_test.player_a')::uuid AND lobby_id='clerk-rls-test-lobby'
      AND match_id='clerk-rls-test-open' AND predicted_home_score=2 AND predicted_away_score=1;
  IF n <> 1 THEN RAISE EXCEPTION 'Member tips affected one another.'; END IF;
  BEGIN
    PERFORM public.remove_lobby_member_secure('clerk-rls-test-lobby',current_setting('clerk_test.player_a')::uuid);
    RAISE EXCEPTION 'An ordinary member removed the lobby owner.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object(
  'iss','https://hkhkbtzdyjbdeeoiurvw.supabase.co/auth/v1',
  'sub',(SELECT id::text FROM public.profiles WHERE username <> 'Stejné jméno' ORDER BY created_at LIMIT 1),
  'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF public.current_player_id() IS NOT NULL THEN RAISE EXCEPTION 'Retired Supabase UUID identity still resolves.'; END IF;
END;
$test$;
RESET ROLE;
ROLLBACK;
