-- Full-season fixture expansion and shootout scoring. Every fixture and prediction rolls back.
BEGIN;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $test$
DECLARE clubs jsonb; games jsonb; batch jsonb; ko jsonb; report jsonb; bad jsonb;
  u1 uuid; u2 uuid; l1 text; l2 text; denied boolean; before_count integer;
BEGIN
  IF tipovacka_private.football_data_game_score('{"duration":"EXTRA_TIME","fullTime":{"home":3,"away":2},"regularTime":{"home":3,"away":0},"extraTime":{"home":0,"away":2}}')
    IS DISTINCT FROM '{"home":3,"away":2}'::jsonb THEN RAISE EXCEPTION 'Period scores were interpreted as cumulative.'; END IF;
  IF tipovacka_private.football_data_game_score('{"duration":"PENALTY_SHOOTOUT","fullTime":{"home":5,"away":4},"regularTime":{"home":1,"away":1},"extraTime":{"home":0,"away":0},"penalties":{"home":4,"away":3}}')
    IS DISTINCT FROM '{"home":4,"away":3}'::jsonb THEN RAISE EXCEPTION 'Shootout was not isolated from official goals.'; END IF;
  IF tipovacka_private.football_data_game_score('{"duration":"PENALTY_SHOOTOUT","fullTime":{"home":6,"away":4},"regularTime":{"home":1,"away":1},"extraTime":{"home":0,"away":0},"penalties":{"home":4,"away":3}}')
    IS NOT NULL THEN RAISE EXCEPTION 'Inconsistent provider facts accepted.'; END IF;

  SELECT jsonb_agg(jsonb_build_object('id','football-data-team-'||(910000+i),'name','KO fixture club '||i,'short_name','K'||i)) INTO clubs FROM generate_series(1,36) i;
  SELECT jsonb_agg(jsonb_build_object(
    'id','football-data-match-'||(910000+i),'provider_match_id',(910000+i)::text,
    'home_id','football-data-team-'||(910001+(i-1)%18),'away_id','football-data-team-'||(910019+(((i-1)%18+(i-1)/18)%18)),
    'kickoff',now()+interval '10 days','matchday',1+(i-1)/18,'stage','League Phase','provider_status','TIMED',
    'provider_updated_at',now()-interval '1 minute','provider_score',jsonb_build_object('duration','REGULAR','fullTime',jsonb_build_object('home',null,'away',null)),
    'home_score',null,'away_score',null,'status','scheduled','scores','[]'::jsonb
  ) ORDER BY i) INTO games FROM generate_series(1,144) i;
  ko := (games->0)||jsonb_build_object('id','football-data-match-919001','provider_match_id','919001','stage','Final','matchday',null);
  batch := jsonb_build_object('competition','CL','season',2026,'scoring_rule','football-final-shootout-v1','clubs',clubs,'matches',games||jsonb_build_array(ko),'awaiting_fixtures',jsonb_build_array(919002));
  SELECT count(*) INTO before_count FROM public.matches;
  report := public.sync_football_data_catalog(batch,true,false);
  IF report->>'matches_inserted'<>'145' OR report->>'awaiting_fixtures'<>'1'
    OR (SELECT count(*) FROM public.matches)<>before_count THEN RAISE EXCEPTION 'Full-season dry-run failed.'; END IF;
  report := public.sync_football_data_catalog(batch,false,false);
  IF (SELECT stage FROM public.matches WHERE id='football-data-match-919001')<>'Final'
    OR (SELECT matchday FROM public.matches WHERE id='football-data-match-919001') IS NOT NULL THEN RAISE EXCEPTION 'Final phase/null leg not imported.'; END IF;

  SELECT user_id,lobby_id INTO STRICT u1,l1 FROM public.lobby_members WHERE membership_status='active' ORDER BY lobby_id,user_id LIMIT 1;
  SELECT user_id,lobby_id INTO STRICT u2,l2 FROM public.lobby_members WHERE membership_status='active' AND lobby_id<>l1 ORDER BY lobby_id,user_id LIMIT 1;
  INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score)
    VALUES(u1,l1,'football-data-match-919001',4,3),(u2,l2,'football-data-match-919001',5,4);
  ko := ko||jsonb_build_object('status','finished','provider_status','FINISHED','kickoff',now()-interval '2 hours',
    'home_score',4,'away_score',3,'provider_updated_at',now(),
    'provider_score','{"duration":"PENALTY_SHOOTOUT","fullTime":{"home":5,"away":4},"regularTime":{"home":1,"away":1},"extraTime":{"home":0,"away":0},"penalties":{"home":4,"away":3}}'::jsonb);
  batch := jsonb_set(batch,'{matches,144}',ko);
  denied := false;
  BEGIN PERFORM public.sync_football_data_catalog(batch,false,false);
  EXCEPTION WHEN serialization_failure THEN denied:=true; END;
  IF NOT denied OR (SELECT home_score FROM public.matches WHERE id='football-data-match-919001') IS NOT NULL
    THEN RAISE EXCEPTION 'Missing prediction snapshot did not roll back.'; END IF;

  ko := ko||jsonb_build_object('scores',jsonb_build_array(
    jsonb_build_object('user_id',u1,'lobby_id',l1,'predicted_home_score',4,'predicted_away_score',3,'points_earned',5),
    jsonb_build_object('user_id',u2,'lobby_id',l2,'predicted_home_score',5,'predicted_away_score',4,'points_earned',3)));
  batch := jsonb_set(batch,'{matches,144}',ko);
  report := public.sync_football_data_catalog(batch,false,false);
  IF report->>'predictions_updated'<>'2' OR (SELECT home_score FROM public.matches WHERE id='football-data-match-919001')<>4
    OR (SELECT points_earned FROM public.predictions WHERE match_id='football-data-match-919001' AND lobby_id=l1)<>5
    OR (SELECT points_earned FROM public.predictions WHERE match_id='football-data-match-919001' AND lobby_id=l2)<>3
    THEN RAISE EXCEPTION 'Shootout was not scored atomically across lobbies.'; END IF;
  report := public.sync_football_data_catalog(batch,false,false);
  IF report->>'predictions_updated'<>'0' OR report->>'matches_inserted'<>'0' THEN RAISE EXCEPTION 'Duplicate cron run changed score or created duplicates.'; END IF;

  bad := ko||jsonb_build_object('home_score',2,'away_score',2,'provider_updated_at',now()+interval '1 minute',
    'provider_score','{"duration":"REGULAR","fullTime":{"home":2,"away":2}}'::jsonb);
  denied := false;
  BEGIN PERFORM public.sync_football_data_catalog(jsonb_set(batch,'{matches,144}',bad),false,false);
  EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  IF NOT denied OR (SELECT home_score FROM public.matches WHERE id='football-data-match-919001')<>4 THEN RAISE EXCEPTION 'Drawn final overwrote the confirmed score.'; END IF;

  bad := ko||jsonb_build_object('home_score',5); denied := false;
  BEGIN PERFORM public.sync_football_data_catalog(jsonb_set(batch,'{matches,144}',bad),false,false);
  EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Game score that disagrees with shootout facts accepted.'; END IF;
END;
$test$;
ROLLBACK;
