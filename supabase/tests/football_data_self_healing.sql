-- Local corruption is repaired from verified API facts; contradictory/stale API data are not adopted.
BEGIN;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $test$
DECLARE clubs jsonb; games jsonb; batch jsonb; game jsonb; alternate jsonb; report jsonb;
  u1 uuid; u2 uuid; l1 text; l2 text; denied boolean;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('id','football-data-team-'||(920000+i),'name','Repair fixture club '||i,'short_name','R'||i)) INTO clubs FROM generate_series(1,36) i;
  SELECT jsonb_agg(jsonb_build_object(
    'id','football-data-match-'||(920000+i),'provider_match_id',(920000+i)::text,
    'home_id','football-data-team-'||(920001+(i-1)%18),'away_id','football-data-team-'||(920019+(((i-1)%18+(i-1)/18)%18)),
    'kickoff',now()+interval '10 days','matchday',1+(i-1)/18,'stage','League Phase','provider_status','TIMED',
    'provider_updated_at',now()-interval '2 minutes','provider_score',jsonb_build_object('duration','REGULAR','fullTime',jsonb_build_object('home',null,'away',null)),
    'home_score',null,'away_score',null,'status','scheduled','scores','[]'::jsonb
  ) ORDER BY i) INTO games FROM generate_series(1,144) i;
  batch := jsonb_build_object('competition','CL','season',2026,'clubs',clubs,'matches',games);
  PERFORM public.sync_football_data_catalog(batch,false,false);
  SELECT user_id,lobby_id INTO STRICT u1,l1 FROM public.lobby_members WHERE membership_status='active' ORDER BY lobby_id,user_id LIMIT 1;
  SELECT user_id,lobby_id INTO STRICT u2,l2 FROM public.lobby_members WHERE membership_status='active' AND lobby_id<>l1 ORDER BY lobby_id,user_id LIMIT 1;
  INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score)
    VALUES(u1,l1,'football-data-match-920001',3,1),(u2,l2,'football-data-match-920001',2,0);
  game := (games->0)||jsonb_build_object('status','finished','provider_status','FINISHED','kickoff',now()-interval '2 hours',
    'home_score',3,'away_score',1,'provider_updated_at',now()-interval '1 minute',
    'provider_score','{"duration":"REGULAR","fullTime":{"home":3,"away":1}}'::jsonb,
    'scores',jsonb_build_array(
      jsonb_build_object('user_id',u1,'lobby_id',l1,'predicted_home_score',3,'predicted_away_score',1,'points_earned',5),
      jsonb_build_object('user_id',u2,'lobby_id',l2,'predicted_home_score',2,'predicted_away_score',0,'points_earned',3)));
  batch := jsonb_set(batch,'{matches,0}',game);
  PERFORM public.sync_football_data_catalog(batch,false,false);

  UPDATE public.matches SET home_score=9,away_score=9 WHERE id='football-data-match-920001';
  UPDATE public.predictions SET points_earned=CASE WHEN lobby_id=l1 THEN 0 ELSE 5 END WHERE match_id='football-data-match-920001';
  report := public.sync_football_data_catalog(batch,true,false);
  IF report->>'local_repairs'<>'1' OR report->>'wrote_to_db'<>'false'
    OR (SELECT home_score FROM public.matches WHERE id='football-data-match-920001')<>9
    OR (SELECT points_earned FROM public.predictions WHERE match_id='football-data-match-920001' AND lobby_id=l1)<>0
    THEN RAISE EXCEPTION 'Repair dry-run changed data or missed corruption.'; END IF;
  report := public.sync_football_data_catalog(batch,false,false);
  IF report->>'local_repairs'<>'1' OR report->>'results_corrected'<>'1' OR report->>'predictions_updated'<>'2'
    OR (SELECT home_score FROM public.matches WHERE id='football-data-match-920001')<>3
    OR (SELECT away_score FROM public.matches WHERE id='football-data-match-920001')<>1
    OR (SELECT result_source FROM public.matches WHERE id='football-data-match-920001')<>'football-data.org'
    OR (SELECT points_earned FROM public.predictions WHERE match_id='football-data-match-920001' AND lobby_id=l1)<>5
    OR (SELECT points_earned FROM public.predictions WHERE match_id='football-data-match-920001' AND lobby_id=l2)<>3
    THEN RAISE EXCEPTION 'Same verified snapshot did not repair result and both lobbies atomically.'; END IF;
  report := public.sync_football_data_catalog(batch,false,false);
  IF report->>'local_repairs'<>'0' OR report->>'predictions_updated'<>'0' THEN RAISE EXCEPTION 'Repeated repair changed points twice.'; END IF;

  UPDATE public.predictions SET points_earned=0 WHERE match_id='football-data-match-920001' AND lobby_id=l1;
  report := public.sync_football_data_catalog(batch,false,false);
  IF report->>'local_repairs'<>'1' OR report->>'predictions_updated'<>'1' OR report->>'matches_updated'<>'0'
    OR report->>'results_corrected'<>'0'
    OR (SELECT points_earned FROM public.predictions WHERE match_id='football-data-match-920001' AND lobby_id=l1)<>5
    THEN RAISE EXCEPTION 'Unchanged result did not repair stale points.'; END IF;

  alternate := game||jsonb_build_object('home_score',1,'away_score',0,'provider_updated_at',now()-interval '1 hour',
    'provider_score','{"duration":"REGULAR","fullTime":{"home":1,"away":0}}'::jsonb);
  report := public.sync_football_data_catalog(jsonb_set(batch,'{matches,0}',alternate),false,false);
  IF jsonb_array_length(report->'conflicts')<>0 OR (SELECT home_score FROM public.matches WHERE id='football-data-match-920001')<>3
    THEN RAISE EXCEPTION 'Older provider snapshot overwrote newer facts.'; END IF;

  alternate := game||jsonb_build_object('home_score',2,'away_score',0,
    'provider_score','{"duration":"REGULAR","fullTime":{"home":2,"away":0}}'::jsonb);
  report := public.sync_football_data_catalog(jsonb_set(batch,'{matches,0}',alternate),false,false);
  IF report->'conflicts'->0->>'reason'<>'inconsistent_provider_revision'
    OR (SELECT home_score FROM public.matches WHERE id='football-data-match-920001')<>3
    THEN RAISE EXCEPTION 'Contradictory facts under the same revision were accepted.'; END IF;
  alternate := jsonb_set(alternate,'{provider_updated_at}',to_jsonb(now()));
  alternate := jsonb_set(alternate,'{scores,0,points_earned}','3');
  alternate := jsonb_set(alternate,'{scores,1,points_earned}','5');
  report := public.sync_football_data_catalog(jsonb_set(batch,'{matches,0}',alternate),false,false);
  IF report->>'results_corrected'<>'1' OR report->>'predictions_updated'<>'2'
    OR (SELECT home_score FROM public.matches WHERE id='football-data-match-920001')<>2
    THEN RAISE EXCEPTION 'Newer valid API correction did not resolve the conflict automatically.'; END IF;

  batch := jsonb_set(batch,'{matches,0}',alternate);
  batch := jsonb_set(batch,'{matches,0,scores,0,predicted_home_score}','1');
  denied := false;
  BEGIN PERFORM public.sync_football_data_catalog(batch,false,false);
  EXCEPTION WHEN serialization_failure THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Unchanged-result reconciliation ignored a changed prediction snapshot.'; END IF;
END;
$test$;
ROLLBACK;
