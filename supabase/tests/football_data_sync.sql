-- Emulates verified server/player claims. All catalog, prediction and membership fixtures roll back.
BEGIN;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $test$
DECLARE batch jsonb; clubs jsonb; games jsonb; report jsonb; game jsonb;
  player uuid; lobby text; before_count integer; denied boolean;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('id','football-data-team-'||(900000+i),'name','Fixture club '||i,'short_name','F'||i))
    INTO clubs FROM generate_series(1,36) i;
  SELECT jsonb_agg(jsonb_build_object(
    'id','football-data-match-'||(900000+i),'provider_match_id',(900000+i)::text,
    'home_id','football-data-team-'||(900001+(i-1)%18),
    'away_id','football-data-team-'||(900019+(((i-1)%18+(i-1)/18)%18)),
    'kickoff',now()+interval '10 days','matchday',1+(i-1)/18,'provider_status','TIMED',
    'provider_updated_at',now()-interval '1 minute','provider_score',jsonb_build_object('duration','REGULAR','fullTime',jsonb_build_object('home',null,'away',null)),
    'home_score',null,'away_score',null,'status','scheduled','scores','[]'::jsonb
  ) ORDER BY i) INTO games FROM generate_series(1,144) i;
  batch := jsonb_build_object('competition','CL','season',2026,'clubs',clubs,'matches',games);
  SELECT count(*) INTO before_count FROM public.matches;
  report := public.sync_football_data_catalog(batch,true,true);
  IF report->>'matches_inserted'<>'144' OR report->>'wrote_to_db'<>'false'
    OR (SELECT count(*) FROM public.matches)<>before_count THEN RAISE EXCEPTION 'Dry-run wrote data or proposed an incomplete import.'; END IF;
  report := public.sync_football_data_catalog(batch,false,true);
  -- The real tournament may already be active; keep this fixture state explicit.
  UPDATE public.tournaments SET status='hidden' WHERE id='uefa-champions-league-2026-27';
  IF report->>'matches_inserted'<>'144' OR report->>'clubs_created'<>'36' THEN RAISE EXCEPTION 'Initial fixture import failed.'; END IF;
  batch := jsonb_set(batch,'{clubs,0,logo_url}','"https://crests.football-data.org/610.png"');
  report := public.sync_football_data_catalog(batch,true,false);
  IF report->>'clubs_updated'<>'1' OR (SELECT logo_url FROM public.participants WHERE id='football-data-team-900001') IS NOT NULL
    THEN RAISE EXCEPTION 'Crest dry-run changed data or missed the update.'; END IF;
  report := public.sync_football_data_catalog(batch,false,false);
  IF (SELECT logo_url FROM public.participants WHERE id='football-data-team-900001')<>'https://crests.football-data.org/610.png'
    THEN RAISE EXCEPTION 'Club crest was not imported.'; END IF;
  report := public.sync_football_data_catalog(batch,false,false);
  IF report->>'unchanged'<>'144' OR report->>'matches_inserted'<>'0' OR report->>'predictions_updated'<>'0'
    THEN RAISE EXCEPTION 'Repeated import is not idempotent.'; END IF;
  IF EXISTS (SELECT 1 FROM public.matches WHERE provider_match_id='900001'
    AND (home_score IS NOT NULL OR away_score IS NOT NULL)) THEN RAISE EXCEPTION 'Pending fixture became 0:0.'; END IF;

  SELECT lm.user_id,lm.lobby_id INTO STRICT player,lobby
    FROM public.lobby_members lm WHERE lm.membership_status='active' LIMIT 1;
  INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score)
    VALUES(player,lobby,'football-data-match-900001',2,1);
  game := (batch->'matches'->0) || jsonb_build_object('status','finished','provider_status','FINISHED',
    'kickoff',now()-interval '2 hours','home_score',2,'away_score',1,'provider_updated_at',now(),
    'provider_score',jsonb_build_object('duration','REGULAR','fullTime',jsonb_build_object('home',2,'away',1)));
  batch := jsonb_set(batch,'{matches,0}',game);
  denied := false;
  BEGIN
    PERFORM public.sync_football_data_catalog(batch,false,false);
  EXCEPTION WHEN serialization_failure THEN denied := true;
  END;
  IF NOT denied OR (SELECT home_score FROM public.matches WHERE id='football-data-match-900001') IS NOT NULL
    OR (SELECT points_earned FROM public.predictions WHERE match_id='football-data-match-900001')<>0
    THEN RAISE EXCEPTION 'Stale prediction snapshot did not roll back result and points.'; END IF;
  game := game || jsonb_build_object('scores',jsonb_build_array(jsonb_build_object(
    'user_id',player,'lobby_id',lobby,'predicted_home_score',2,'predicted_away_score',1,'points_earned',5)));
  batch := jsonb_set(batch,'{matches,0}',game);
  report := public.sync_football_data_catalog(batch,false,false);
  IF report->>'predictions_updated'<>'1' OR (SELECT home_score FROM public.matches WHERE id='football-data-match-900001')<>2
    OR (SELECT points_earned FROM public.predictions WHERE match_id='football-data-match-900001')<>5
    THEN RAISE EXCEPTION 'Atomic result and scoring failed.'; END IF;
  report := public.sync_football_data_catalog(batch,false,false);
  IF report->>'predictions_updated'<>'0' THEN RAISE EXCEPTION 'Repeated result re-awarded points.'; END IF;

  batch := jsonb_set(batch,'{matches,0,home_score}','3');
  batch := jsonb_set(batch,'{matches,0,provider_score,fullTime,home}','3');
  report := public.sync_football_data_catalog(batch,false,false);
  IF jsonb_array_length(report->'conflicts')<>1
    OR (SELECT home_score FROM public.matches WHERE id='football-data-match-900001')<>2
    THEN RAISE EXCEPTION 'Sync overwrote a confirmed result.'; END IF;
  batch := jsonb_set(batch,'{matches,0,provider_updated_at}',to_jsonb(now()+interval '1 second'));
  batch := jsonb_set(batch,'{matches,0,scores,0,points_earned}','2');
  report := public.sync_football_data_catalog(batch,false,false);
  IF report->>'results_corrected'<>'1'
    OR (SELECT home_score FROM public.matches WHERE id='football-data-match-900001')<>3
    OR (SELECT points_earned FROM public.predictions WHERE match_id='football-data-match-900001')<>2
    THEN RAISE EXCEPTION 'Newer provider correction did not atomically rescore predictions.'; END IF;
  report := public.sync_football_data_catalog(batch,false,false);
  IF report->>'results_corrected'<>'0' OR report->>'predictions_updated'<>'0'
    THEN RAISE EXCEPTION 'Repeated correction changed points twice.'; END IF;
  UPDATE public.matches SET home_score=4 WHERE id='football-data-match-900001';
  IF (SELECT result_source FROM public.matches WHERE id='football-data-match-900001')<>'manual-admin'
    THEN RAISE EXCEPTION 'Manual result provenance was not recorded.'; END IF;
  report := public.sync_football_data_catalog(batch,false,false);
  IF report->>'manual_skipped'<>'1' OR (SELECT home_score FROM public.matches WHERE id='football-data-match-900001')<>4
    THEN RAISE EXCEPTION 'Manual result was overwritten.'; END IF;

  -- Once a lock has passed, a later kickoff cannot reopen predictions.
  UPDATE public.matches SET lock_time_utc=now()-interval '1 minute' WHERE id='football-data-match-900002';
  report := public.sync_football_data_catalog(batch,false,false);
  IF (SELECT lock_time_utc FROM public.matches WHERE id='football-data-match-900002')>now()
    THEN RAISE EXCEPTION 'Reschedule reopened a locked match.'; END IF;
  -- Older upstream snapshots cannot undo a later fixture revision.
  batch := jsonb_set(batch,'{matches,2,provider_updated_at}',to_jsonb(now()-interval '1 hour'));
  batch := jsonb_set(batch,'{matches,2,kickoff}',to_jsonb(now()+interval '20 days'));
  report := public.sync_football_data_catalog(batch,false,false);
  IF (SELECT start_time_utc FROM public.matches WHERE id='football-data-match-900003')>now()+interval '15 days'
    THEN RAISE EXCEPTION 'Older snapshot changed a fixture.'; END IF;

  UPDATE tipovacka_private.football_data_sync_state SET enabled=false WHERE tournament_id='uefa-champions-league-2026-27';
  denied := false;
  BEGIN PERFORM public.sync_football_data_catalog(batch,false,false);
  EXCEPTION WHEN object_not_in_prerequisite_state THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Database kill switch was ignored.'; END IF;
  UPDATE tipovacka_private.football_data_sync_state SET enabled=true WHERE tournament_id='uefa-champions-league-2026-27';
  -- Prepare a real member context; no historical membership or tip is changed.
  SELECT lm.user_id,lm.lobby_id INTO STRICT player,lobby FROM public.lobby_members lm
    JOIN auth.users a ON a.id=lm.user_id WHERE lm.membership_status='active' LIMIT 1;
  INSERT INTO public.lobby_tournaments(lobby_id,tournament_id,status)
    VALUES(lobby,'uefa-champions-league-2026-27','active') ON CONFLICT DO NOTHING;
  PERFORM set_config('fd_test.player',player::text,true);
  PERFORM set_config('fd_test.lobby',lobby,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',player,
    'iss','https://hkhkbtzdyjbdeeoiurvw.supabase.co/auth/v1')::text,true);
END;
$test$;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE denied boolean;
BEGIN
  denied := false;
  BEGIN PERFORM public.sync_football_data_catalog('{}',false,false);
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Player invoked service-only sync.'; END IF;
  denied := false;
  BEGIN INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score)
    VALUES(current_setting('fd_test.player')::uuid,current_setting('fd_test.lobby'),'football-data-match-900004',1,1);
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Hidden catalog accepted a player prediction.'; END IF;
END;
$test$;
RESET ROLE;
UPDATE public.tournaments SET status='active' WHERE id='uefa-champions-league-2026-27';
UPDATE public.matches SET provider_status='POSTPONED' WHERE id='football-data-match-900004';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE denied boolean := false;
BEGIN
  BEGIN INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score)
    VALUES(current_setting('fd_test.player')::uuid,current_setting('fd_test.lobby'),'football-data-match-900004',1,1);
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Postponed match accepted a prediction.'; END IF;
END;
$test$;
RESET ROLE;
SELECT 'football_data_sync: all assertions passed; fixture changes roll back' AS test_result;
ROLLBACK;
