-- Execute after the candidate migration, inside the runner's BEGIN/ROLLBACK.
-- Only unique rollback fixtures below are mutated, never populated real cards.
SELECT pg_advisory_xact_lock(hashtextextended('mma-sync-claim',0));
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
CREATE TEMP TABLE ufc_season_batches(payload jsonb);
INSERT INTO tipovacka_private.mma_event_catalog(provider_event_id,tournament_id,season_year,published_start_at)
SELECT 98701000+n,'ufcal-event-'||(98701000+n),2026,now()+n*interval '1 day' FROM generate_series(1,2)n;
INSERT INTO tipovacka_private.mma_event_catalog(provider_event_id,tournament_id,season_year,published_start_at)
VALUES(98701003,'ufcal-event-98701003',2027,'2027-01-10T22:00:00Z');
INSERT INTO ufc_season_batches
SELECT jsonb_build_object('observed_at',clock_timestamp(),'snapshot_hash',repeat('a',64),
  'event',jsonb_build_object('tournament_id',c.tournament_id,'provider_event_id',c.provider_event_id,'provider_slug','ufc-rollback-'||c.provider_event_id,
    'name','UFC rollback '||c.provider_event_id,'org','ufc','sport','mma','starts_at',c.published_start_at,'main_card_at',null,'status','scheduled'),
  'fighters',jsonb_build_array(jsonb_build_object('id',98701101,'name','Season QA A','country_code','CZ'),
    jsonb_build_object('id',98701102,'name','Season QA B','country_code','NZ')),
  'fights',jsonb_build_array(jsonb_build_object('id','ufcal-fight-'||c.provider_event_id,'provider_fight_id',c.provider_event_id,
    'fighter_a_id',98701101,'fighter_b_id',98701102,'ordering',1,'card_section','main','weight_class','Test',
    'scheduled_rounds',3,'status','scheduled','winner_fighter_id',null,'method',null,'finish_round',null)))
FROM tipovacka_private.mma_event_catalog c WHERE c.provider_event_id BETWEEN 98701001 AND 98701003;
SELECT public.sync_mma_event(payload,false) FROM ufc_season_batches;
INSERT INTO public.profiles(id,username,role) VALUES
  ('10000000-1111-4111-8111-200000000001','ufc_season_qa_a','player'),
  ('10000000-1111-4111-8111-200000000002','ufc_season_qa_b','player');
INSERT INTO public.lobbies(id,name,owner_id,tournament_id,join_code,visibility) VALUES
  ('ufc-season-qa-a','Season QA A','10000000-1111-4111-8111-200000000001','ufc-2026','UFCSEA000000001','private'),
  ('ufc-season-qa-b','Season QA B','10000000-1111-4111-8111-200000000002','ufc-2026','UFCSEA000000002','private');
INSERT INTO public.lobby_tournaments(lobby_id,tournament_id,status) VALUES
  ('ufc-season-qa-a','ufc-2026','active'),('ufc-season-qa-b','ufc-2026','active');
INSERT INTO public.lobby_members(lobby_id,user_id,role,membership_status) VALUES
  ('ufc-season-qa-a','10000000-1111-4111-8111-200000000001','member','active'),
  ('ufc-season-qa-b','10000000-1111-4111-8111-200000000002','member','active');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","iss":"supabase","sub":"10000000-1111-4111-8111-200000000001"}',true);
INSERT INTO public.mma_predictions(lobby_id,fight_id,user_id,predicted_winner_id,lineup_version)
SELECT 'ufc-season-qa-a','ufcal-fight-'||(98701000+n),public.current_player_id(),98701101,1 FROM generate_series(1,2)n;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.get_my_mma_home() WHERE lobby_id='ufc-season-qa-a')<>1 THEN RAISE EXCEPTION 'Annual home duplicated cards'; END IF;
  IF (SELECT count(*) FROM public.get_mma_lobby_leaderboard('ufc-season-qa-a','ufc-2026'))<>1 THEN RAISE EXCEPTION 'Season membership missing'; END IF;
  IF (SELECT match_count FROM public.get_lobby_tournament_catalog('ufc-season-qa-a') WHERE tournament_id='ufc-2026')<2
    THEN RAISE EXCEPTION 'Season catalog lost MMA bout counts'; END IF;
  BEGIN
    INSERT INTO public.mma_predictions(lobby_id,fight_id,user_id,predicted_winner_id,lineup_version)
      VALUES('ufc-season-qa-a','ufcal-fight-98701003',public.current_player_id(),98701101,1);
    RAISE EXCEPTION 'Next season silently enrolled player';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.mma_predictions(lobby_id,fight_id,user_id,predicted_winner_id,lineup_version)
      VALUES('ufc-season-qa-b','ufcal-fight-98701001',public.current_player_id(),98701101,1);
    RAISE EXCEPTION 'Foreign lobby accepted pick';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.mma_predictions SET fight_id='ufcal-fight-98701003' WHERE lobby_id='ufc-season-qa-a' AND fight_id='ufcal-fight-98701001';
    RAISE EXCEPTION 'Pick context moved';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.mma_predictions SET points_earned=1 WHERE lobby_id='ufc-season-qa-a';
    RAISE EXCEPTION 'Player assigned points';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.claim_mma_discovery(); RAISE EXCEPTION 'Player claimed API budget';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.list_mma_sync_targets(); RAISE EXCEPTION 'Player read private catalog';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.mma_seasons VALUES('ufc-2028',2028,'ufc'); RAISE EXCEPTION 'Player created season';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
-- Explicitly enable the next year; points must remain isolated by year and card.
RESET ROLE;
INSERT INTO public.lobby_tournaments(lobby_id,tournament_id,status) VALUES('ufc-season-qa-a','ufc-2027','active');
SET LOCAL ROLE authenticated;
INSERT INTO public.mma_predictions(lobby_id,fight_id,user_id,predicted_winner_id,lineup_version)
VALUES('ufc-season-qa-a','ufcal-fight-98701003',public.current_player_id(),98701101,1);
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE ufc_season_batches SET payload=jsonb_set(jsonb_set(jsonb_set(jsonb_set(payload,'{fights,0,status}','"finished"'),
  '{fights,0,winner_fighter_id}','98701101'),'{observed_at}',to_jsonb(clock_timestamp())),'{snapshot_hash}',to_jsonb(repeat('b',64)));
SELECT public.sync_mma_event(payload,false) FROM ufc_season_batches;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","iss":"supabase","sub":"10000000-1111-4111-8111-200000000001"}',true);
DO $$ BEGIN
  IF (SELECT points FROM public.get_mma_lobby_leaderboard('ufc-season-qa-a','ufc-2026'))<>2 THEN RAISE EXCEPTION 'Annual points double-counted/missing'; END IF;
  IF (SELECT points FROM public.get_mma_lobby_leaderboard('ufc-season-qa-a','ufcal-event-98701001'))<>1 THEN RAISE EXCEPTION 'Card points not isolated'; END IF;
  IF (SELECT points FROM public.get_mma_lobby_leaderboard('ufc-season-qa-a','ufc-2027'))<>1 THEN RAISE EXCEPTION 'Years mixed'; END IF;
  BEGIN
    UPDATE public.mma_predictions SET predicted_winner_id=98701102 WHERE lobby_id='ufc-season-qa-a';
    RAISE EXCEPTION 'Settled bout reopened';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ BEGIN
  BEGIN
    PERFORM public.sync_mma_event(jsonb_set(payload,'{observed_at}',to_jsonb(now()-interval '1 hour')),false) FROM ufc_season_batches LIMIT 1;
    RAISE EXCEPTION 'Older snapshot accepted';
  EXCEPTION WHEN invalid_parameter_value OR serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.sync_mma_event(jsonb_set(payload,'{event,provider_event_id}','98799999'),false) FROM ufc_season_batches LIMIT 1;
    RAISE EXCEPTION 'Unregistered event accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","iss":"supabase","sub":"10000000-1111-4111-8111-200000000002"}',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.mma_predictions WHERE lobby_id='ufc-season-qa-a') THEN RAISE EXCEPTION 'Foreign picks leaked'; END IF;
  BEGIN
    PERFORM * FROM public.get_mma_lobby_leaderboard('ufc-season-qa-a','ufc-2026'); RAISE EXCEPTION 'Foreign season ranking leaked';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Discovery uses a matching lease, one daily refresh and the same monthly budget as results.
UPDATE tipovacka_private.mma_discovery_state SET next_attempt_at=now()-interval '1 minute',claim_token=NULL,lease_until=NULL;
INSERT INTO tipovacka_private.mma_api_budget(month,reserved_requests) VALUES(date_trunc('month',now() AT TIME ZONE 'UTC')::date,0)
  ON CONFLICT(month) DO UPDATE SET reserved_requests=0;
SET LOCAL ROLE service_role;
DO $$ DECLARE token uuid; BEGIN
  token:=public.claim_mma_discovery();
  IF token IS NULL OR public.claim_mma_discovery() IS NOT NULL THEN RAISE EXCEPTION 'Discovery duplicate claim'; END IF;
  BEGIN
    PERFORM public.complete_mma_discovery(gen_random_uuid(),'[]'); RAISE EXCEPTION 'Wrong discovery lease accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  PERFORM public.complete_mma_discovery(token,jsonb_build_array(jsonb_build_object('provider_event_id',98702001,'org','ufc','sport','mma','starts_at',now()+interval '2 days')));
  IF public.claim_mma_discovery() IS NOT NULL THEN RAISE EXCEPTION 'Daily discovery cache ignored'; END IF;
  IF NOT public.claim_mma_sync('ufcal-event-98702001') OR public.claim_mma_sync('ufcal-event-98702001') THEN RAISE EXCEPTION 'Pending card lease invalid'; END IF;
END $$;
RESET ROLE;
UPDATE tipovacka_private.mma_api_budget SET reserved_requests=900 WHERE month=date_trunc('month',now() AT TIME ZONE 'UTC')::date;
UPDATE tipovacka_private.mma_discovery_state SET next_attempt_at=now()-interval '1 minute';
UPDATE tipovacka_private.mma_event_catalog SET next_attempt_at=now()-interval '1 minute' WHERE provider_event_id=98702001;
SET LOCAL ROLE service_role;
DO $$ BEGIN
  IF public.claim_mma_discovery() IS NOT NULL OR public.claim_mma_sync('ufcal-event-98702001') THEN RAISE EXCEPTION 'Shared monthly budget bypassed'; END IF;
END $$;
RESET ROLE;
UPDATE public.lobby_members SET membership_status='removed',ended_at=now() WHERE lobby_id='ufc-season-qa-a';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","iss":"supabase","sub":"10000000-1111-4111-8111-200000000001"}',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.mma_predictions WHERE lobby_id='ufc-season-qa-a') OR EXISTS(SELECT 1 FROM public.get_my_mma_home() WHERE lobby_id='ufc-season-qa-a') THEN
    RAISE EXCEPTION 'Removed membership retained access'; END IF;
  BEGIN
    PERFORM * FROM public.get_mma_lobby_leaderboard('ufc-season-qa-a','ufc-2026'); RAISE EXCEPTION 'Removed member ranking leaked';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'ufc_season_league_passed' AS result;
