-- Run against the current Clerk-aware schema. All data and claims roll back.
-- Claims emulate verified PostgREST requests; test:clerk covers JWT verification.
BEGIN;
SELECT public.configure_clerk_identity_provider('https://longterm-rls-test.clerk.accounts.dev',ARRAY['http://localhost:3000']);
SELECT set_config('request.jwt.claims','{"role":"authenticated","iss":"https://longterm-rls-test.clerk.accounts.dev","sub":"user_longterm_a","sid":"sess_longterm_a","azp":"http://localhost:3000"}',true);
SET LOCAL ROLE authenticated;
SELECT set_config('lt_test.a',public.bootstrap_my_account()->>'id',true);
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"authenticated","iss":"https://longterm-rls-test.clerk.accounts.dev","sub":"user_longterm_b","sid":"sess_longterm_b","azp":"http://localhost:3000"}',true);
SET LOCAL ROLE authenticated;
SELECT set_config('lt_test.b',public.bootstrap_my_account()->>'id',true);
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO public.sports(id,slug,name) VALUES('lt-guard-test','lt-guard-test','Rollback only');
INSERT INTO public.participants(id,sport_id,name,short_name) VALUES
('lt-guard-a','lt-guard-test','Rollback A','A'),('lt-guard-b','lt-guard-test','Rollback B','B');
INSERT INTO public.tournaments(id,sport_id,slug,name,status)
  SELECT 'lt-guard-'||v,'lt-guard-test','lt-guard-'||v,'Rollback '||v,'active'
  FROM unnest(ARRAY['locked','future','empty','open','exact']) v;
INSERT INTO public.matches(id,tournament_id,home_participant_id,away_participant_id,start_time_utc,lock_time_utc,status)
  SELECT 'lt-guard-'||v||'-first','lt-guard-'||v,'lt-guard-a','lt-guard-b',
    CASE v WHEN 'locked' THEN now()-interval '1 day' WHEN 'exact' THEN now() ELSE now()+interval '1 day' END,
    CASE v WHEN 'locked' THEN now()-interval '1 day' WHEN 'exact' THEN now() ELSE now()+interval '1 day' END,'scheduled'
  FROM unnest(ARRAY['locked','future','open','exact']) v;
INSERT INTO public.lobbies(id,name,owner_id,tournament_id,join_code,visibility)
  SELECT 'lt-guard-'||v,'Rollback '||v,
    current_setting(CASE v WHEN 'home' THEN 'lt_test.a' ELSE 'lt_test.b' END)::uuid,
    'lt-guard-locked','LT-GUARD-ROLLBACK-'||v,'private'
  FROM unnest(ARRAY['home','other','outsider']) v;
INSERT INTO public.lobby_members(lobby_id,user_id,role)
  SELECT 'lt-guard-'||l,current_setting('lt_test.'||u)::uuid,'member'
  FROM unnest(ARRAY['home','other']) l CROSS JOIN unnest(ARRAY['a','b']) u;
INSERT INTO public.lobby_members(lobby_id,user_id,role)
  VALUES('lt-guard-outsider',current_setting('lt_test.b')::uuid,'member');
INSERT INTO public.lobby_tournaments(lobby_id,tournament_id,status)
  SELECT 'lt-guard-'||l,'lt-guard-'||t,'active'
  FROM unnest(ARRAY['home','other','outsider']) l
  CROSS JOIN unnest(ARRAY['locked','future','empty','open','exact']) t;
INSERT INTO public.longterm_predictions(lobby_id,tournament_id,user_id,prediction_type,predicted_participant_id,points_earned)
  SELECT 'lt-guard-home','lt-guard-'||t,current_setting('lt_test.a')::uuid,'tournament_winner','lt-guard-a',
    CASE t WHEN 'locked' THEN 10 ELSE 0 END FROM unnest(ARRAY['locked','exact']) t;
INSERT INTO public.longterm_predictions(lobby_id,tournament_id,user_id,prediction_type,predicted_participant_id)
  VALUES('lt-guard-other','lt-guard-locked',current_setting('lt_test.a')::uuid,'tournament_winner','lt-guard-a'),
    ('lt-guard-home','lt-guard-open',current_setting('lt_test.b')::uuid,'tournament_winner','lt-guard-a'),
    ('lt-guard-outsider','lt-guard-open',current_setting('lt_test.b')::uuid,'tournament_winner','lt-guard-a');

SELECT set_config('request.jwt.claims','{"role":"authenticated","iss":"https://longterm-rls-test.clerk.accounts.dev","sub":"user_longterm_a","sid":"sess_longterm_a","azp":"http://localhost:3000"}',true);
SET LOCAL ROLE authenticated;
-- Real client payload: repeatable upsert, editable participant, points remain zero.
DO $$ DECLARE i integer; n integer; assignment text; BEGIN
  FOR i IN 1..2 LOOP
    INSERT INTO public.longterm_predictions(lobby_id,tournament_id,user_id,prediction_type,predicted_participant_id,points_earned)
      VALUES('lt-guard-home','lt-guard-open',public.current_player_id(),'tournament_winner','lt-guard-a',0)
      ON CONFLICT(lobby_id,tournament_id,user_id,prediction_type) DO UPDATE
      SET predicted_participant_id=EXCLUDED.predicted_participant_id,points_earned=EXCLUDED.points_earned,updated_at=now();
  END LOOP;
  UPDATE public.longterm_predictions SET predicted_participant_id='lt-guard-b',updated_at=now()
    WHERE lobby_id='lt-guard-home' AND tournament_id='lt-guard-open' AND user_id=public.current_player_id();
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Own open pick edit failed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.longterm_predictions WHERE lobby_id='lt-guard-home'
      AND tournament_id='lt-guard-open' AND user_id=public.current_player_id()
      AND predicted_participant_id='lt-guard-b' AND points_earned=0) THEN
    RAISE EXCEPTION 'Open pick payload changed unexpectedly';
  END IF;
  -- No fixtures still means open; the fix must preserve that existing rule.
  INSERT INTO public.longterm_predictions(lobby_id,tournament_id,user_id,prediction_type,predicted_participant_id)
    VALUES('lt-guard-other','lt-guard-empty',public.current_player_id(),'tournament_winner','lt-guard-a');

  -- Open-source contexts must also be immutable, independent of the old lock.
  FOREACH assignment IN ARRAY ARRAY[
    'tournament_id=''lt-guard-future''','tournament_id=''lt-guard-empty''',
    'lobby_id=''lt-guard-other''','lobby_id=''lt-guard-other'',tournament_id=''lt-guard-future''',
    'id=gen_random_uuid()','user_id='''||current_setting('lt_test.b')||'''::uuid',
    'prediction_type=''forged_type''','points_earned=999'
  ] LOOP
    BEGIN
      EXECUTE 'UPDATE public.longterm_predictions SET '||assignment||
        ' WHERE lobby_id=''lt-guard-home'' AND tournament_id=''lt-guard-open'' AND user_id=public.current_player_id()';
      RAISE EXCEPTION 'Open pick context/points mutation accepted: %',assignment;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;

  -- Original exploit omits points_earned. Test scored and zero-point old rows.
  FOREACH assignment IN ARRAY ARRAY[
    'tournament_id=''lt-guard-future''','tournament_id=''lt-guard-empty''',
    'lobby_id=''lt-guard-other''','lobby_id=''lt-guard-other'',tournament_id=''lt-guard-future''',
    'predicted_participant_id=''lt-guard-b'''
  ] LOOP
    BEGIN
      EXECUTE 'UPDATE public.longterm_predictions SET '||assignment||
        ' WHERE tournament_id=''lt-guard-locked'' AND user_id=public.current_player_id()';
      GET DIAGNOSTICS n=ROW_COUNT;
      IF n <> 0 THEN RAISE EXCEPTION 'Locked pick mutation accepted: %',assignment; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  UPDATE public.longterm_predictions SET predicted_participant_id='lt-guard-b'
    WHERE tournament_id='lt-guard-exact' AND user_id=public.current_player_id();
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'Exact first-kickoff boundary accepted update'; END IF;
  BEGIN
    INSERT INTO public.longterm_predictions(lobby_id,tournament_id,user_id,prediction_type,predicted_participant_id)
      VALUES('lt-guard-other','lt-guard-exact',public.current_player_id(),'tournament_winner','lt-guard-a');
    RAISE EXCEPTION 'Exact boundary accepted insert';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.longterm_predictions WHERE tournament_id='lt-guard-open';
    GET DIAGNOSTICS n=ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'Player deleted a pick'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.longterm_predictions WHERE tournament_id='lt-guard-locked'
      AND predicted_participant_id='lt-guard-a') <> 2
    OR NOT EXISTS(SELECT 1 FROM public.longterm_predictions WHERE lobby_id='lt-guard-home'
      AND tournament_id='lt-guard-locked' AND points_earned=10) THEN
    RAISE EXCEPTION 'Closed fixtures were changed';
  END IF;
END $$;
-- Same-lobby owner, lobby admin and platform admin cannot edit another player's pick.
DO $$ DECLARE mode text; n integer; BEGIN
  FOREACH mode IN ARRAY ARRAY['owner','lobby-admin','platform-admin'] LOOP
    UPDATE public.lobby_members SET role=CASE mode WHEN 'lobby-admin' THEN 'admin' ELSE 'member' END
      WHERE lobby_id='lt-guard-home' AND user_id=current_setting('lt_test.a')::uuid;
    UPDATE public.profiles SET role=CASE mode WHEN 'platform-admin' THEN 'admin' ELSE 'player' END
      WHERE id=current_setting('lt_test.a')::uuid;
    PERFORM set_config('request.jwt.claims','{"role":"authenticated","iss":"https://longterm-rls-test.clerk.accounts.dev","sub":"user_longterm_a","sid":"sess_longterm_a","azp":"http://localhost:3000"}',true);
    SET LOCAL ROLE authenticated;
    UPDATE public.longterm_predictions SET predicted_participant_id='lt-guard-b'
      WHERE lobby_id='lt-guard-home' AND tournament_id='lt-guard-open' AND user_id=current_setting('lt_test.b')::uuid;
    GET DIAGNOSTICS n=ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'Elevated UI role edited someone else: %',mode; END IF;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  END LOOP;
END $$;
UPDATE public.profiles SET role='player' WHERE id=current_setting('lt_test.a')::uuid;
-- Removed/left memberships cannot read or write, even for the lobby owner.
DO $$ DECLARE state text; n integer; BEGIN
  FOREACH state IN ARRAY ARRAY['removed','left'] LOOP
    UPDATE public.lobby_members SET membership_status=state,ended_at=now(),ended_by=current_setting('lt_test.b')::uuid
      WHERE lobby_id='lt-guard-home' AND user_id=current_setting('lt_test.a')::uuid;
    PERFORM set_config('request.jwt.claims','{"role":"authenticated","iss":"https://longterm-rls-test.clerk.accounts.dev","sub":"user_longterm_a","sid":"sess_longterm_a","azp":"http://localhost:3000"}',true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM public.longterm_predictions WHERE lobby_id='lt-guard-home';
    IF n <> 0 THEN RAISE EXCEPTION 'Inactive member read lobby picks: %',state; END IF;
    UPDATE public.longterm_predictions SET predicted_participant_id='lt-guard-a' WHERE lobby_id='lt-guard-home';
    GET DIAGNOSTICS n=ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'Inactive member edited pick: %',state; END IF;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  END LOOP;
END $$;
INSERT INTO public.lobby_join_requests(lobby_id,user_id,status)
  VALUES('lt-guard-outsider',current_setting('lt_test.a')::uuid,'pending');
SELECT set_config('request.jwt.claims','{"role":"authenticated","iss":"https://longterm-rls-test.clerk.accounts.dev","sub":"user_longterm_a","sid":"sess_longterm_a","azp":"http://localhost:3000"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n integer; BEGIN
  SELECT count(*) INTO n FROM public.longterm_predictions WHERE lobby_id='lt-guard-outsider';
  IF n <> 0 THEN RAISE EXCEPTION 'Pending applicant read private picks'; END IF;
  BEGIN
    INSERT INTO public.longterm_predictions(lobby_id,tournament_id,user_id,prediction_type,predicted_participant_id)
      VALUES('lt-guard-outsider','lt-guard-open',public.current_player_id(),'tournament_winner','lt-guard-a');
    RAISE EXCEPTION 'Pending applicant inserted a pick';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
-- Trusted result scoring must still work after the cutoff, in both directions.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
UPDATE public.longterm_predictions SET points_earned=0,updated_at=now()
  WHERE lobby_id='lt-guard-home' AND tournament_id='lt-guard-locked';
UPDATE public.longterm_predictions SET points_earned=10,updated_at=now()
  WHERE lobby_id='lt-guard-home' AND tournament_id='lt-guard-locked';
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.longterm_predictions WHERE lobby_id='lt-guard-home'
    AND tournament_id='lt-guard-locked' AND points_earned=10) THEN
    RAISE EXCEPTION 'Trusted scoring no longer works';
  END IF;
END $$;
RESET ROLE;
SELECT 'longterm_context_permissions_passed' AS result;
ROLLBACK;
