-- Entire fixture set and result/prediction changes are rolled back.
BEGIN;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $test$
DECLARE code text; prefix text; provider text; tournament text; n integer; team_count integer;
  clubs jsonb; games jsonb; batch jsonb; report jsonb; game jsonb; fixture text; before_count integer; denied boolean;
  actor record; i integer;
BEGIN
  IF has_function_privilege('authenticated','public.sync_hockey_catalog(jsonb,boolean,boolean)','EXECUTE')
    OR has_function_privilege('anon','public.sync_hockey_catalog(jsonb,boolean,boolean)','EXECUTE')
    THEN RAISE EXCEPTION 'Public role can invoke hockey sync.'; END IF;
  FOREACH code IN ARRAY ARRAY['NHL','ELH'] LOOP
    IF code='NHL' THEN prefix:='nhl'; provider:='nhl-web'; tournament:='nhl-2026-27'; n:=1344; team_count:=32;
    ELSE prefix:='hokej-cz'; provider:='hokej-cz'; tournament:='czech-extraliga-2026-27'; n:=364; team_count:=14; END IF;
    SELECT jsonb_agg(jsonb_build_object('id',prefix||'-team-'||(960000+x),'name','Hockey fixture '||x,'short_name','H'||x))
      INTO clubs FROM generate_series(1,team_count) x;
    SELECT jsonb_agg(jsonb_build_object('id',prefix||'-match-'||(960000+x),'provider_match_id',(960000+x)::text,
      'home_id',prefix||'-team-'||(960001+(x-1)%(team_count/2)),
      'away_id',prefix||'-team-'||(960001+team_count/2+((x-1)%(team_count/2)+(x-1)/(team_count/2))%(team_count/2)),
      'kickoff',now()+interval '10 days','stage','Regular Season',
      'matchday',CASE WHEN code='ELH' THEN 1+(x-1)/7 END,
      'provider_status','TIMED','provider_updated_at',now()-interval '1 minute','status','scheduled',
      'provider_score',jsonb_build_object('source',provider,'season',CASE WHEN code='NHL' THEN 20262027 ELSE 2026 END,
        'game_type',2,'duration',null,'fullTime',null,'kickoff',now()+interval '10 days'),
      'home_score',null,'away_score',null,'scores','[]'::jsonb) ORDER BY x) INTO games FROM generate_series(1,n) x;
    batch:=jsonb_build_object('competition',code,'season',2026,'scoring_rule','hockey-final-v1','clubs',clubs,'matches',games,'awaiting_fixtures','[]'::jsonb);
    SELECT count(*) INTO before_count FROM public.matches;
    report:=public.sync_hockey_catalog(batch,true,true);
    IF (report->>'matches_inserted')::integer<>n OR report->>'wrote_to_db'<>'false'
      OR (SELECT count(*) FROM public.matches)<>before_count THEN RAISE EXCEPTION 'Hockey dry run mutated data.'; END IF;
    report:=public.sync_hockey_catalog(batch,false,true);
    IF (report->>'matches_inserted')::integer<>n THEN RAISE EXCEPTION 'Hockey import incomplete.'; END IF;
    report:=public.sync_hockey_catalog(batch,false,false);
    IF (report->>'unchanged')::integer<>n OR report->>'predictions_updated'<>'0' THEN RAISE EXCEPTION 'Hockey sync is not idempotent.'; END IF;
    fixture:=prefix||'-match-960001'; i:=0;
    FOR actor IN SELECT DISTINCT ON (lobby_id) user_id,lobby_id FROM public.lobby_members WHERE membership_status='active' ORDER BY lobby_id,user_id LIMIT 2 LOOP
      INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score)
        VALUES(actor.user_id,actor.lobby_id,fixture,CASE WHEN i=0 THEN 3 ELSE 2 END,CASE WHEN i=0 THEN 2 ELSE 1 END);
      i:=i+1;
    END LOOP;
    IF i<>2 THEN RAISE EXCEPTION 'Test requires two existing lobbies.'; END IF;
    game:=(batch->'matches'->0)||jsonb_build_object('status','finished','provider_status','FINISHED',
      'kickoff',now()-interval '1 hour','provider_updated_at',now(),'home_score',3,'away_score',2,
      'provider_score',jsonb_build_object('source',provider,'season',CASE WHEN code='NHL' THEN 20262027 ELSE 2026 END,'game_type',2,
        'kickoff',now()-interval '1 hour','duration','SHOOTOUT','fullTime',jsonb_build_object('home',3,'away',2)));
    SELECT jsonb_agg(jsonb_build_object('user_id',user_id,'lobby_id',lobby_id,'predicted_home_score',predicted_home_score,
      'predicted_away_score',predicted_away_score,'points_earned',CASE WHEN predicted_home_score=3 THEN 5 ELSE 2 END))
      INTO games FROM public.predictions WHERE match_id=fixture;
    game:=game||jsonb_build_object('scores',games); batch:=jsonb_set(batch,'{matches,0}',game);
    report:=public.sync_hockey_catalog(batch,false,false);
    IF report->>'predictions_updated'<>'2' OR (SELECT sum(points_earned) FROM public.predictions WHERE match_id=fixture)<>7
      THEN RAISE EXCEPTION 'Final hockey result did not score across lobbies (5/2).'; END IF;
    UPDATE public.matches SET home_score=0,away_score=1 WHERE id=fixture;
    UPDATE public.predictions SET points_earned=0 WHERE match_id=fixture;
    report:=public.sync_hockey_catalog(batch,false,false);
    IF report->>'local_repairs'<>'1' OR (SELECT home_score FROM public.matches WHERE id=fixture)<>3
      OR (SELECT sum(points_earned) FROM public.predictions WHERE match_id=fixture)<>7 THEN RAISE EXCEPTION 'Hockey self healing failed.'; END IF;
    report:=public.sync_hockey_catalog(batch,false,false);
    IF report->>'predictions_updated'<>'0' THEN RAISE EXCEPTION 'Hockey points awarded twice.'; END IF;
    denied:=false;
    BEGIN PERFORM public.sync_hockey_catalog(jsonb_set(batch,'{matches,0,home_score}','4'),false,false);
      EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
    IF NOT denied THEN RAISE EXCEPTION 'Hockey accepted a score that disagrees with provider facts.'; END IF;
    UPDATE tipovacka_private.hockey_sync_state SET enabled=false WHERE tournament_id=tournament;
    denied:=false;
    BEGIN PERFORM public.sync_hockey_catalog(batch,false,false);
      EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true; END;
    IF NOT denied THEN RAISE EXCEPTION 'Hockey kill switch ignored.'; END IF;
    UPDATE tipovacka_private.hockey_sync_state SET enabled=true WHERE tournament_id=tournament;
  END LOOP;
END;
$test$;
-- Player tests use real existing legacy membership claims, temporary tournament relation only.
DO $test$
DECLARE actor record;
BEGIN
  SELECT lm.user_id,lm.lobby_id INTO STRICT actor FROM public.lobby_members lm JOIN auth.users a ON a.id=lm.user_id
    WHERE membership_status='active' LIMIT 1;
  INSERT INTO public.lobby_tournaments(lobby_id,tournament_id,status) VALUES(actor.lobby_id,'nhl-2026-27','active') ON CONFLICT DO NOTHING;
  UPDATE public.tournaments SET status='active' WHERE id='nhl-2026-27';
  PERFORM set_config('hockey_test.player',actor.user_id::text,true); PERFORM set_config('hockey_test.lobby',actor.lobby_id,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor.user_id,
    'iss','https://hkhkbtzdyjbdeeoiurvw.supabase.co/auth/v1')::text,true);
END;
$test$;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE denied boolean:=false;
BEGIN
  BEGIN INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score)
    VALUES(current_setting('hockey_test.player')::uuid,current_setting('hockey_test.lobby'),'nhl-match-960004',1,1);
    EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Hockey draw was accepted.'; END IF;
  INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score)
    VALUES(current_setting('hockey_test.player')::uuid,current_setting('hockey_test.lobby'),'nhl-match-960004',2,1);
END;
$test$;
RESET ROLE;
UPDATE public.matches SET provider_status='SCHEDULED' WHERE id='nhl-match-960004';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE denied boolean:=false;
BEGIN
  BEGIN UPDATE public.predictions SET predicted_home_score=3 WHERE match_id='nhl-match-960004'
      AND user_id=current_setting('hockey_test.player')::uuid AND lobby_id=current_setting('hockey_test.lobby');
    EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Provisional hockey match accepted an edit.'; END IF;
END;
$test$;
RESET ROLE;
ROLLBACK;
