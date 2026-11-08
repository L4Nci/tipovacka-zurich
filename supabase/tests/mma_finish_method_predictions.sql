-- Requires the locked fixture preparation, then the migration (when testing a candidate).
-- Enclose everything in BEGIN/ROLLBACK. No real sporting results or player picks are touched.
SELECT pg_advisory_xact_lock(hashtextextended('mma-sync-claim',0));
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ BEGIN
  IF (SELECT rules_version FROM public.mma_events WHERE tournament_id='ufcal-event-98704999') IS DISTINCT FROM 'mma-winner-v1' THEN
    RAISE EXCEPTION 'Locked historical card was upgraded'; END IF;
  IF tipovacka_private.mma_prediction_points('mma-winner-method-v2',1,1,'finished',1,1,'ko_tko','ko_tko')<>5
    OR tipovacka_private.mma_prediction_points('mma-winner-method-v2',1,1,'finished',1,1,'ko_tko','submission')<>3
    OR tipovacka_private.mma_prediction_points('mma-winner-method-v2',1,2,'finished',1,1,'ko_tko','ko_tko')<>1
    OR tipovacka_private.mma_prediction_points('mma-winner-method-v2',1,2,'finished',1,1,'ko_tko','submission')<>0
    OR tipovacka_private.mma_prediction_points('mma-winner-method-v2',1,1,'finished',1,1,NULL,'ko_tko')<>3
    OR tipovacka_private.mma_prediction_points('mma-winner-method-v2',1,1,'finished',1,1,'decision','dq')<>3
    OR tipovacka_private.mma_prediction_points('mma-winner-method-v2',1,1,'finished',1,1,'decision','other')<>3
    OR tipovacka_private.mma_prediction_points('mma-winner-method-v2',1,1,'finished',1,2,'ko_tko','ko_tko')<>0
    OR tipovacka_private.mma_prediction_points('mma-winner-method-v2',1,NULL,'void',1,1,'ko_tko','no_contest')<>0
    OR tipovacka_private.mma_prediction_points('mma-winner-method-v2',1,1,'finished',1,1,'ko_tko','draw')<>0
    OR tipovacka_private.mma_prediction_points('mma-winner-v1',1,1,'finished',1,1,'ko_tko','ko_tko')<>1 THEN
    RAISE EXCEPTION 'Versioned scoring table failed'; END IF;
END $$;
INSERT INTO tipovacka_private.mma_event_catalog(provider_event_id,tournament_id,season_year,published_start_at)
SELECT 98704000+n,'ufcal-event-'||(98704000+n),2026,now()+n*interval '1 day' FROM generate_series(1,2)n;
CREATE TEMP TABLE mma_method_batches(event_id bigint,payload jsonb);
INSERT INTO mma_method_batches
SELECT c.provider_event_id,jsonb_build_object('observed_at',clock_timestamp(),'snapshot_hash',repeat('b',64),
  'event',jsonb_build_object('tournament_id',c.tournament_id,'provider_event_id',c.provider_event_id,'provider_slug','ufc-method-qa-'||c.provider_event_id,
    'name','UFC method QA '||c.provider_event_id,'org','ufc','sport','mma','starts_at',c.published_start_at,'main_card_at',null,'status','scheduled'),
  'fighters',jsonb_build_array(jsonb_build_object('id',98704101,'name','Method QA A','country_code','CZ'),
    jsonb_build_object('id',98704102,'name','Method QA B','country_code','NZ'),jsonb_build_object('id',98704103,'name','Method QA C','country_code','PL')),
  'fights',(SELECT jsonb_agg(jsonb_build_object('id','ufcal-fight-'||(CASE WHEN c.provider_event_id=98704001 THEN 98704010+n ELSE 98704021 END),
    'provider_fight_id',CASE WHEN c.provider_event_id=98704001 THEN 98704010+n ELSE 98704021 END,
    'fighter_a_id',98704101,'fighter_b_id',98704102,'ordering',n,'card_section','main','weight_class','Test',
    'scheduled_rounds',3,'status','scheduled','winner_fighter_id',null,'method',null,'method_normalized',null,'finish_round',null))
    FROM generate_series(1,CASE WHEN c.provider_event_id=98704001 THEN 8 ELSE 1 END)n))
FROM tipovacka_private.mma_event_catalog c WHERE c.provider_event_id IN(98704001,98704002);
SELECT public.sync_mma_event(payload,false) FROM mma_method_batches;
UPDATE public.mma_events SET rules_version='mma-winner-v1' WHERE tournament_id='ufcal-event-98704002';
INSERT INTO public.profiles(id,username,role) VALUES
 ('10000000-1111-4111-8111-300000000001','mma_method_qa_a','player'),('10000000-1111-4111-8111-300000000002','mma_method_qa_b','player');
INSERT INTO public.lobbies(id,name,owner_id,tournament_id,join_code,visibility) VALUES
 ('mma-method-qa-a','Method QA A','10000000-1111-4111-8111-300000000001','ufc-2026','MMAMETHODQA0001','private'),
 ('mma-method-qa-b','Method QA B','10000000-1111-4111-8111-300000000002','ufc-2026','MMAMETHODQA0002','private');
INSERT INTO public.lobby_members(lobby_id,user_id,role,membership_status) VALUES
 ('mma-method-qa-a','10000000-1111-4111-8111-300000000001','member','active'),
 ('mma-method-qa-b','10000000-1111-4111-8111-300000000002','member','active');
INSERT INTO public.lobby_tournaments(lobby_id,tournament_id,status) VALUES('mma-method-qa-a','ufc-2026','active'),('mma-method-qa-b','ufc-2026','active');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","iss":"supabase","sub":"10000000-1111-4111-8111-300000000001"}',true);
SELECT set_config('method_test.missing_before',(SELECT missing_count::text FROM public.get_my_mma_home() WHERE lobby_id='mma-method-qa-a'),true);
INSERT INTO public.mma_predictions(lobby_id,fight_id,user_id,predicted_winner_id,lineup_version,predicted_method)
SELECT 'mma-method-qa-a','ufcal-fight-'||(98704010+n),public.current_player_id(),98704101,1,
  CASE n WHEN 6 THEN 'decision' WHEN 7 THEN 'submission' ELSE 'ko_tko' END FROM generate_series(1,8)n;
-- Both clearing and resaving use the same genuine upsert contract as the UI.
INSERT INTO public.mma_predictions(lobby_id,fight_id,user_id,predicted_winner_id,lineup_version,predicted_method)
VALUES('mma-method-qa-a','ufcal-fight-98704015',public.current_player_id(),98704101,1,NULL)
ON CONFLICT(lobby_id,fight_id,user_id) DO UPDATE SET predicted_method=EXCLUDED.predicted_method;
DO $$ BEGIN
  IF (SELECT predicted_method FROM public.mma_predictions WHERE lobby_id='mma-method-qa-a' AND fight_id='ufcal-fight-98704015') IS NOT NULL THEN
    RAISE EXCEPTION 'Optional finish did not clear'; END IF;
  IF (SELECT missing_count FROM public.get_my_mma_home() WHERE lobby_id='mma-method-qa-a')<>current_setting('method_test.missing_before')::bigint-8 THEN
    RAISE EXCEPTION 'Winner-only pick counted as missing'; END IF;
  BEGIN
    UPDATE public.mma_predictions SET predicted_method='dq' WHERE lobby_id='mma-method-qa-a' AND fight_id='ufcal-fight-98704011';
    RAISE EXCEPTION 'Unsupported player method accepted';
  EXCEPTION WHEN invalid_parameter_value OR check_violation THEN NULL; END;
  BEGIN
    UPDATE public.mma_predictions SET points_earned=5 WHERE lobby_id='mma-method-qa-a'; RAISE EXCEPTION 'Player assigned points';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.mma_predictions SET fight_id='ufcal-fight-98704021' WHERE lobby_id='mma-method-qa-a' AND fight_id='ufcal-fight-98704011';
    RAISE EXCEPTION 'Pick context moved';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.mma_predictions(lobby_id,fight_id,user_id,predicted_winner_id,lineup_version,predicted_method)
    VALUES('mma-method-qa-b','ufcal-fight-98704011',public.current_player_id(),98704101,1,'ko_tko');
    RAISE EXCEPTION 'Foreign lobby accepted method pick';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.mma_predictions(lobby_id,fight_id,user_id,predicted_winner_id,lineup_version,predicted_method)
    VALUES('mma-method-qa-a','ufcal-fight-98704021',public.current_player_id(),98704101,1,'ko_tko');
    RAISE EXCEPTION 'V1 accepted a method pick';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    INSERT INTO public.mma_predictions(lobby_id,fight_id,user_id,predicted_winner_id,lineup_version)
    VALUES('mma-method-qa-a','ufcal-fight-98704999',public.current_player_id(),98704101,1);
    RAISE EXCEPTION 'Past first-bell lock reopened';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.mma_fights SET method_normalized='ko_tko' WHERE id='ufcal-fight-98704011'; RAISE EXCEPTION 'Player wrote finish facts';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM tipovacka_private.mma_prediction_points('mma-winner-method-v2',1,1,'finished',1,1,'ko_tko','ko_tko');
    RAISE EXCEPTION 'Player called private scorer';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
INSERT INTO public.mma_predictions(lobby_id,fight_id,user_id,predicted_winner_id,lineup_version)
VALUES('mma-method-qa-a','ufcal-fight-98704021',public.current_player_id(),98704101,1);
SELECT set_config('request.jwt.claims','{"role":"authenticated","iss":"supabase","sub":"10000000-1111-4111-8111-300000000002"}',true);
INSERT INTO public.mma_predictions(lobby_id,fight_id,user_id,predicted_winner_id,lineup_version,predicted_method)
VALUES('mma-method-qa-b','ufcal-fight-98704011',public.current_player_id(),98704102,1,'ko_tko');
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.mma_predictions WHERE lobby_id='mma-method-qa-a') THEN RAISE EXCEPTION 'Foreign method picks leaked'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
-- Opponent changes invalidate the whole old pick, including its otherwise matching method.
UPDATE mma_method_batches SET payload=jsonb_set(jsonb_set(jsonb_set(payload,'{fights,6,fighter_b_id}','98704103'),
 '{observed_at}',to_jsonb(clock_timestamp())),'{snapshot_hash}',to_jsonb(repeat('1',64))) WHERE event_id=98704001;
SELECT public.sync_mma_event(payload,false) FROM mma_method_batches WHERE event_id=98704001;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","iss":"supabase","sub":"10000000-1111-4111-8111-300000000001"}',true);
DO $$ BEGIN
 BEGIN
  UPDATE public.mma_predictions SET predicted_method='submission' WHERE lobby_id='mma-method-qa-a' AND fight_id='ufcal-fight-98704017';
  RAISE EXCEPTION 'Stale lineup accepted a finish edit';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
END $$;
UPDATE public.mma_predictions SET lineup_version=2,predicted_method='submission' WHERE lobby_id='mma-method-qa-a' AND fight_id='ufcal-fight-98704017';
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE mma_method_batches b SET payload=jsonb_set(jsonb_set(jsonb_set(b.payload,'{fights}',(
 SELECT jsonb_agg(f||jsonb_build_object('status','finished','winner_fighter_id',CASE WHEN f->>'id' IN('ufcal-fight-98704013','ufcal-fight-98704014') THEN 98704102 ELSE 98704101 END,
 'method_normalized',CASE f->>'id' WHEN 'ufcal-fight-98704012' THEN 'submission' WHEN 'ufcal-fight-98704014' THEN 'submission'
 WHEN 'ufcal-fight-98704016' THEN 'decision_split' WHEN 'ufcal-fight-98704017' THEN 'technical_submission' WHEN 'ufcal-fight-98704018' THEN NULL ELSE 'ko_tko' END))
 FROM jsonb_array_elements(b.payload->'fights')f)), '{observed_at}',to_jsonb(clock_timestamp())),'{snapshot_hash}',to_jsonb(repeat('c',64)));
SELECT public.sync_mma_event(payload,false) FROM mma_method_batches;
DO $$ DECLARE expected integer[]:=ARRAY[5,3,1,0,3,5,5,3]; n integer; BEGIN
 FOR n IN 1..8 LOOP
  IF (SELECT points_earned FROM public.mma_predictions WHERE lobby_id='mma-method-qa-a' AND fight_id='ufcal-fight-'||(98704010+n))<>expected[n] THEN
    RAISE EXCEPTION 'Finish scoring case % failed',n; END IF;
 END LOOP;
 IF (SELECT points_earned FROM public.mma_predictions WHERE lobby_id='mma-method-qa-b')<>1 THEN RAISE EXCEPTION 'Second lobby not scored'; END IF;
 IF (SELECT points_earned FROM public.mma_predictions WHERE lobby_id='mma-method-qa-a' AND fight_id='ufcal-fight-98704021')<>1 THEN RAISE EXCEPTION 'Legacy v1 rescored'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","iss":"supabase","sub":"10000000-1111-4111-8111-300000000001"}',true);
DO $$ BEGIN
 IF (SELECT points FROM public.get_mma_lobby_leaderboard('mma-method-qa-a','ufcal-event-98704001'))<>25
   OR (SELECT points FROM public.get_mma_lobby_leaderboard('mma-method-qa-a','ufc-2026'))<>26 THEN
   RAISE EXCEPTION 'Event/year totals incorrect'; END IF;
 BEGIN
  UPDATE public.mma_predictions SET predicted_method='decision' WHERE lobby_id='mma-method-qa-a' AND fight_id='ufcal-fight-98704011';
  RAISE EXCEPTION 'Settled method could be changed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
-- Same verified snapshot repairs derived points without modifying the saved pick.
UPDATE public.mma_predictions SET points_earned=0 WHERE lobby_id='mma-method-qa-a' AND fight_id='ufcal-fight-98704011';
SELECT public.sync_mma_event(payload,false) FROM mma_method_batches WHERE event_id=98704001;
DO $$ BEGIN
 IF (SELECT points_earned FROM public.mma_predictions WHERE lobby_id='mma-method-qa-a' AND fight_id='ufcal-fight-98704011')<>5 THEN RAISE EXCEPTION 'Combination points did not self-heal'; END IF;
 BEGIN
  PERFORM public.sync_mma_event(jsonb_set(payload,'{observed_at}',to_jsonb(now()-interval '1 hour')),false) FROM mma_method_batches WHERE event_id=98704001;
  RAISE EXCEPTION 'Older finish observation accepted';
 EXCEPTION WHEN invalid_parameter_value OR serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.sync_mma_event(jsonb_set(jsonb_set(payload,'{fights,0,method_normalized}','null'),'{observed_at}',to_jsonb(clock_timestamp())),false)
    FROM mma_method_batches WHERE event_id=98704001;
  RAISE EXCEPTION 'Known finish silently disappeared';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
END $$;
-- A later classification adds the bonus to a formerly unclassified final.
UPDATE mma_method_batches SET payload=jsonb_set(jsonb_set(jsonb_set(payload,'{fights,7,method_normalized}','"ko_tko"'),
 '{observed_at}',to_jsonb(clock_timestamp())),'{snapshot_hash}',to_jsonb(repeat('d',64))) WHERE event_id=98704001;
SELECT public.sync_mma_event(payload,false) FROM mma_method_batches WHERE event_id=98704001;
DO $$ BEGIN
 IF (SELECT points_earned FROM public.mma_predictions WHERE lobby_id='mma-method-qa-a' AND fight_id='ufcal-fight-98704018')<>5 THEN RAISE EXCEPTION 'Late finish bonus not added'; END IF;
END $$;
-- Correct both winner and finish; all lobbies must reconcile independently.
UPDATE mma_method_batches SET payload=jsonb_set(jsonb_set(jsonb_set(jsonb_set(payload,'{fights,0,winner_fighter_id}','98704102'),
 '{fights,0,method_normalized}','"decision_split"'),'{observed_at}',to_jsonb(clock_timestamp())),'{snapshot_hash}',to_jsonb(repeat('e',64))) WHERE event_id=98704001;
SELECT public.sync_mma_event(payload,false) FROM mma_method_batches WHERE event_id=98704001;
DO $$ BEGIN
 IF (SELECT points_earned FROM public.mma_predictions WHERE lobby_id='mma-method-qa-a' AND fight_id='ufcal-fight-98704011')<>0
 OR (SELECT points_earned FROM public.mma_predictions WHERE lobby_id='mma-method-qa-b')<>3 THEN RAISE EXCEPTION 'Correction did not reconcile all lobbies'; END IF;
END $$;
-- Explicit no-contest correction removes winner and finish points.
UPDATE mma_method_batches SET payload=jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(payload,'{fights,0,winner_fighter_id}','null'),
 '{fights,0,status}','"void"'),'{fights,0,method_normalized}','"no_contest"'),'{observed_at}',to_jsonb(clock_timestamp())),'{snapshot_hash}',to_jsonb(repeat('f',64))) WHERE event_id=98704001;
SELECT public.sync_mma_event(payload,false) FROM mma_method_batches WHERE event_id=98704001;
DO $$ BEGIN
 IF (SELECT points_earned FROM public.mma_predictions WHERE lobby_id='mma-method-qa-b')<>0 THEN RAISE EXCEPTION 'Void finish still earns points'; END IF;
END $$;
SELECT 'mma_method_scoring_permissions_corrections_passed' AS result;
