-- Run within BEGIN/ROLLBACK, after the candidate migration and BEFORE the first real MMA import.
-- Only rollback fixtures are created; populated pilot catalogs must not be used as fixture space.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.mma_events) THEN RAISE EXCEPTION 'Use an empty MMA catalog for this bootstrap regression suite.'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
CREATE TEMP TABLE mma_qa_batch(payload jsonb);
INSERT INTO mma_qa_batch VALUES(jsonb_build_object(
  'observed_at',clock_timestamp(),'snapshot_hash',repeat('a',64),
  'event',jsonb_build_object('tournament_id','ufc-334-2026','provider_event_id',2563,'provider_slug','ufc-2026-11-15',
    'name','MMA QA rollback','org','ufc','sport','mma','starts_at','2026-11-14T22:00:00Z','main_card_at','2026-11-15T02:00:00Z','status','scheduled'),
  'fighters',jsonb_build_array(jsonb_build_object('id',98700001,'name','MMA QA A','country_code','CZ'),
    jsonb_build_object('id',98700002,'name','MMA QA B','country_code','NZ'),jsonb_build_object('id',98700003,'name','MMA QA C','country_code','PL')),
  'fights',jsonb_build_array(jsonb_build_object('id','ufcal-fight-98700001','provider_fight_id',98700001,
    'fighter_a_id',98700001,'fighter_b_id',98700002,'ordering',1,'card_section','main','weight_class','Test',
    'scheduled_rounds',3,'status','scheduled','winner_fighter_id',null,'method',null,'finish_round',null))
));
DO $$ BEGIN
  PERFORM public.sync_mma_event(payload,true) FROM mma_qa_batch;
  IF EXISTS(SELECT 1 FROM public.mma_fights WHERE id='ufcal-fight-98700001') THEN RAISE EXCEPTION 'Dry run wrote data.'; END IF;
END $$;
SELECT public.sync_mma_event(payload,false) FROM mma_qa_batch;
INSERT INTO public.profiles(id,username,role) VALUES
  ('10000000-1111-4111-8111-100000000001','mma_qa_a','player'),
  ('10000000-1111-4111-8111-100000000002','mma_qa_b','player');
INSERT INTO public.lobbies(id,name,owner_id,tournament_id,join_code,visibility) VALUES
  ('mma-qa-a','MMA QA A','10000000-1111-4111-8111-100000000001','ufc-334-2026','MMAQA0000000001','private'),
  ('mma-qa-b','MMA QA B','10000000-1111-4111-8111-100000000002','ufc-334-2026','MMAQA0000000002','private');
INSERT INTO public.lobby_tournaments(lobby_id,tournament_id,status) VALUES
  ('mma-qa-a','ufc-334-2026','active'),('mma-qa-b','ufc-334-2026','active');
INSERT INTO public.lobby_members(lobby_id,user_id,role,membership_status) VALUES
  ('mma-qa-a','10000000-1111-4111-8111-100000000001','member','active'),
  ('mma-qa-b','10000000-1111-4111-8111-100000000002','member','active');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","iss":"supabase","sub":"10000000-1111-4111-8111-100000000001"}',true);
INSERT INTO public.mma_predictions(lobby_id,fight_id,user_id,predicted_winner_id,lineup_version)
  VALUES('mma-qa-a','ufcal-fight-98700001',public.current_player_id(),98700001,1);
UPDATE public.mma_predictions SET predicted_winner_id=98700002 WHERE lobby_id='mma-qa-a';
UPDATE public.mma_predictions SET predicted_winner_id=98700001 WHERE lobby_id='mma-qa-a';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.mma_predictions WHERE lobby_id='mma-qa-a') <> 1 THEN RAISE EXCEPTION 'Own prediction not visible to the fixture identity.'; END IF;
  IF (SELECT missing_count FROM public.get_my_mma_home() WHERE lobby_id='mma-qa-a') <> 0 THEN RAISE EXCEPTION 'Saved pick still missing.'; END IF;
  BEGIN
    INSERT INTO public.mma_predictions(lobby_id,fight_id,user_id,predicted_winner_id,lineup_version)
      VALUES('mma-qa-b','ufcal-fight-98700001',public.current_player_id(),98700001,1);
    RAISE EXCEPTION 'Foreign lobby insert allowed.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.mma_predictions SET user_id='10000000-1111-4111-8111-100000000002' WHERE lobby_id='mma-qa-a';
    RAISE EXCEPTION 'Context reassignment allowed.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.mma_predictions SET points_earned=1 WHERE lobby_id='mma-qa-a';
    RAISE EXCEPTION 'Client points allowed.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.mma_fights SET winner_fighter_id=98700001 WHERE id='ufcal-fight-98700001';
    RAISE EXCEPTION 'Client sports-fact update allowed.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM * FROM public.get_mma_lobby_leaderboard('mma-qa-b','ufc-334-2026');
    RAISE EXCEPTION 'Foreign leaderboard allowed.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.sync_mma_event('{}',false);
    RAISE EXCEPTION 'Client sync allowed.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
-- Missing role claims are unrecognized by the existing identity bridge and must fail closed.
SELECT set_config('request.jwt.claims','{"iss":"supabase","sub":"10000000-1111-4111-8111-100000000001"}',true);
DO $$ BEGIN
  IF public.current_player_id() IS NOT NULL OR EXISTS(SELECT 1 FROM public.mma_predictions) THEN RAISE EXCEPTION 'Unrecognized identity can read picks.'; END IF;
  BEGIN
    INSERT INTO public.mma_predictions(lobby_id,fight_id,user_id,predicted_winner_id,lineup_version)
      VALUES('mma-qa-a','ufcal-fight-98700001','10000000-1111-4111-8111-100000000001',98700001,1);
    RAISE EXCEPTION 'Unrecognized identity can save picks.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);

-- A replaced opponent invalidates the old prediction without rewriting its selected fighter.
UPDATE mma_qa_batch SET payload=jsonb_set(jsonb_set(jsonb_set(payload,'{fights,0,fighter_b_id}','98700003'),
  '{snapshot_hash}',to_jsonb(repeat('b',64))),'{observed_at}',to_jsonb(clock_timestamp()));
SELECT public.sync_mma_event(payload,false) FROM mma_qa_batch;
DO $$ BEGIN
  IF (SELECT lineup_version FROM public.mma_fights WHERE id='ufcal-fight-98700001') <> 2 THEN RAISE EXCEPTION 'Lineup version not changed.'; END IF;
  IF (SELECT predicted_winner_id FROM public.mma_predictions WHERE lobby_id='mma-qa-a') <> 98700001 THEN RAISE EXCEPTION 'Selected fighter silently changed.'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","iss":"supabase","sub":"10000000-1111-4111-8111-100000000001"}',true);
DO $$ BEGIN
  IF (SELECT missing_count FROM public.get_my_mma_home() WHERE lobby_id='mma-qa-a') <> 1 THEN RAISE EXCEPTION 'Replaced lineup did not request a new pick.'; END IF;
  BEGIN
    UPDATE public.mma_predictions SET predicted_winner_id=98700001,lineup_version=1 WHERE lobby_id='mma-qa-a';
    RAISE EXCEPTION 'Stale lineup accepted.';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
END $$;
UPDATE public.mma_predictions SET predicted_winner_id=98700001,lineup_version=2 WHERE lobby_id='mma-qa-a';
SELECT set_config('request.jwt.claims','{"role":"authenticated","iss":"supabase","sub":"10000000-1111-4111-8111-100000000002"}',true);
INSERT INTO public.mma_predictions(lobby_id,fight_id,user_id,predicted_winner_id,lineup_version)
  VALUES('mma-qa-b','ufcal-fight-98700001',public.current_player_id(),98700003,2);
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE mma_qa_batch SET payload=jsonb_set(jsonb_set(jsonb_set(jsonb_set(payload,'{fights,0,status}','"finished"'),
  '{fights,0,winner_fighter_id}','98700001'),'{snapshot_hash}',to_jsonb(repeat('c',64))),'{observed_at}',to_jsonb(clock_timestamp()));
SELECT public.sync_mma_event(payload,false) FROM mma_qa_batch;
DO $$ BEGIN
  IF (SELECT points_earned FROM public.mma_predictions WHERE lobby_id='mma-qa-a') <> 1 THEN RAISE EXCEPTION 'Correct winner not scored.'; END IF;
END $$;
-- Same verified observation repairs corrupted derived points.
UPDATE public.mma_predictions SET points_earned=0 WHERE lobby_id='mma-qa-a';
SELECT public.sync_mma_event(payload,false) FROM mma_qa_batch;
DO $$ BEGIN
  IF (SELECT points_earned FROM public.mma_predictions WHERE lobby_id='mma-qa-a') <> 1 THEN RAISE EXCEPTION 'Points did not self-heal.'; END IF;
END $$;
-- A later authoritative winner correction rescales every lobby pick automatically.
UPDATE mma_qa_batch SET payload=jsonb_set(jsonb_set(jsonb_set(payload,'{fights,0,winner_fighter_id}','98700003'),
  '{snapshot_hash}',to_jsonb(repeat('d',64))),'{observed_at}',to_jsonb(clock_timestamp()));
SELECT public.sync_mma_event(payload,false) FROM mma_qa_batch;
DO $$ BEGIN
  IF (SELECT points_earned FROM public.mma_predictions WHERE lobby_id='mma-qa-a') <> 0 THEN RAISE EXCEPTION 'Correction did not rescore.'; END IF;
  IF (SELECT points_earned FROM public.mma_predictions WHERE lobby_id='mma-qa-b') <> 1 THEN RAISE EXCEPTION 'Correction did not rescore the second lobby.'; END IF;
  BEGIN
    PERFORM public.sync_mma_event(jsonb_set(payload,'{observed_at}',to_jsonb(now()-interval '1 hour')),false) FROM mma_qa_batch;
    RAISE EXCEPTION 'Old observation accepted.';
  EXCEPTION WHEN invalid_parameter_value OR serialization_failure THEN NULL; END;
END $$;
-- A single due lease prevents repeated calls; the free-tier reservation cap fails closed.
UPDATE tipovacka_private.mma_sync_state SET next_sync_at=now()-interval '1 minute' WHERE tournament_id='ufc-334-2026';
DO $$ BEGIN
  IF NOT public.claim_mma_sync('ufc-334-2026') THEN RAISE EXCEPTION 'Due card not claimed.'; END IF;
  IF public.claim_mma_sync('ufc-334-2026') THEN RAISE EXCEPTION 'Card claimed twice.'; END IF;
END $$;
UPDATE tipovacka_private.mma_api_budget SET reserved_requests=900 WHERE month=date_trunc('month',now() AT TIME ZONE 'UTC')::date;
UPDATE tipovacka_private.mma_sync_state SET next_sync_at=now()-interval '1 minute' WHERE tournament_id='ufc-334-2026';
DO $$ BEGIN
  IF public.claim_mma_sync('ufc-334-2026') THEN RAISE EXCEPTION 'Monthly budget bypassed.'; END IF;
END $$;
-- Even a future erroneous clock cannot reopen a settled bout.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","iss":"supabase","sub":"10000000-1111-4111-8111-100000000001"}',true);
DO $$ BEGIN
  BEGIN
    UPDATE public.mma_predictions SET predicted_winner_id=98700003 WHERE lobby_id='mma-qa-a';
    RAISE EXCEPTION 'Settled fight could be predicted.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.mma_events SET lock_time_utc=now()-interval '1 minute' WHERE tournament_id='ufc-334-2026';
SELECT public.sync_mma_event(payload,false) FROM mma_qa_batch;
DO $$ BEGIN
  IF (SELECT lock_time_utc FROM public.mma_events WHERE tournament_id='ufc-334-2026') > now() THEN RAISE EXCEPTION 'Elapsed event lock reopened.'; END IF;
END $$;
UPDATE public.lobby_members SET membership_status='removed',ended_at=now() WHERE lobby_id='mma-qa-a';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","iss":"supabase","sub":"10000000-1111-4111-8111-100000000001"}',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.mma_predictions WHERE lobby_id='mma-qa-a') THEN RAISE EXCEPTION 'Removed member can read picks.'; END IF;
END $$;
RESET ROLE;
SELECT 'MMA RLS, lineup, scoring, corrections and elapsed-lock checks passed; rollback required.' AS result;
