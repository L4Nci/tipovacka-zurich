-- Automated hockey catalogs use official final scores (including one deciding shootout goal).
CREATE TABLE tipovacka_private.hockey_sync_state (
  tournament_id text PRIMARY KEY REFERENCES public.tournaments(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT true, last_success_at timestamptz,
  last_summary jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE tipovacka_private.hockey_sync_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tipovacka_private.hockey_sync_state FROM PUBLIC,anon,authenticated;

CREATE FUNCTION tipovacka_private.hockey_game_score(facts jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE h integer; a integer;
BEGIN
  IF facts->>'duration' NOT IN ('REGULAR','OVERTIME','SHOOTOUT') OR facts->>'duration' IS NULL
    OR jsonb_typeof(facts->'fullTime') IS DISTINCT FROM 'object'
    OR coalesce(facts->'fullTime'->>'home','') !~ '^[0-9]{1,2}$'
    OR coalesce(facts->'fullTime'->>'away','') !~ '^[0-9]{1,2}$' THEN RETURN NULL; END IF;
  h:=(facts->'fullTime'->>'home')::integer; a:=(facts->'fullTime'->>'away')::integer;
  IF h=a OR (facts->>'duration' IN ('OVERTIME','SHOOTOUT') AND abs(h-a)<>1) THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('home',h,'away',a);
END; $$;
REVOKE ALL ON FUNCTION tipovacka_private.hockey_game_score(jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION tipovacka_private.mark_hockey_result_source()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.provider_name IN ('nhl-web','hokej-cz') AND (TG_OP='INSERT'
    OR NEW.home_score IS DISTINCT FROM OLD.home_score OR NEW.away_score IS DISTINCT FROM OLD.away_score
    OR NEW.status IS DISTINCT FROM OLD.status) THEN
    NEW.result_source := CASE WHEN current_setting('tipovacka.hockey_data_sync',true)='on'
      THEN NEW.provider_name ELSE 'manual-admin' END;
  END IF; RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION tipovacka_private.mark_hockey_result_source() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER mark_hockey_result_source BEFORE INSERT OR UPDATE ON public.matches
 FOR EACH ROW EXECUTE FUNCTION tipovacka_private.mark_hockey_result_source();

CREATE FUNCTION tipovacka_private.lock_hockey_prediction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.matches%ROWTYPE;
BEGIN
  IF current_setting('role',true)='authenticated' AND (TG_OP='INSERT'
    OR NEW.match_id IS DISTINCT FROM OLD.match_id OR NEW.predicted_home_score IS DISTINCT FROM OLD.predicted_home_score
    OR NEW.predicted_away_score IS DISTINCT FROM OLD.predicted_away_score) THEN
    SELECT * INTO m FROM public.matches WHERE id=NEW.match_id FOR SHARE;
    IF m.provider_name IN ('nhl-web','hokej-cz') AND (m.provider_status IS DISTINCT FROM 'TIMED'
      OR m.status<>'scheduled' OR m.home_score IS NOT NULL OR m.away_score IS NOT NULL
      OR m.lock_time_utc<=now() OR NEW.predicted_home_score=NEW.predicted_away_score
      OR EXISTS(SELECT 1 FROM public.tournaments WHERE id=m.tournament_id AND status='hidden'))
      THEN RAISE EXCEPTION 'Hockey prediction is locked or drawn.' USING ERRCODE='42501'; END IF;
  END IF; RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION tipovacka_private.lock_hockey_prediction() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER lock_hockey_prediction BEFORE INSERT OR UPDATE ON public.predictions
 FOR EACH ROW EXECUTE FUNCTION tipovacka_private.lock_hockey_prediction();

CREATE OR REPLACE FUNCTION public.sync_hockey_catalog(
  batch_param jsonb, dry_run_param boolean DEFAULT true, bootstrap_param boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  competition text := batch_param->>'competition';
  tournament_key text; tournament_name text; main_stage text := 'Regular Season'; club_count integer; main_count integer; max_count integer; round_count integer; provider_key text; identity_prefix text;
  item jsonb; club jsonb; m record; old public.matches%ROWTYPE;
  score_rows jsonb; expected_score jsonb; expected_count integer; changed boolean; score_changed boolean; points_changed boolean; same_snapshot boolean;
  target_enabled boolean; prior_context text;
  created_clubs integer := 0; updated_clubs integer := 0; results_corrected integer := 0; inserted_matches integer := 0; updated_matches integer := 0;
  unchanged_matches integer := 0; updated_predictions integer := 0; manual_skipped integer := 0;
  local_repairs integer := 0;
  conflicts jsonb := '[]'::jsonb; summary jsonb; new_lock timestamptz;
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE='42501';
  END IF;
  CASE competition
    WHEN 'NHL' THEN tournament_key:='nhl-2026-27'; tournament_name:='NHL 2026/27';
      provider_key:='nhl-web'; identity_prefix:='nhl'; club_count:=32; main_count:=1344; max_count:=1449;
    WHEN 'ELH' THEN tournament_key:='czech-extraliga-2026-27'; tournament_name:='Tipsport extraliga 2026/27';
      provider_key:='hokej-cz'; identity_prefix:='hokej-cz'; club_count:=14;
      main_count:=364-jsonb_array_length(coalesce(batch_param->'awaiting_fixtures','[]'::jsonb)); max_count:=main_count; round_count:=52;
    ELSE RAISE EXCEPTION 'Unsupported hockey competition.' USING ERRCODE='22023';
  END CASE;
  IF dry_run_param IS NULL OR bootstrap_param IS NULL
    OR batch_param->>'season' IS DISTINCT FROM '2026'
    OR jsonb_typeof(batch_param->'matches') IS DISTINCT FROM 'array'
    OR jsonb_typeof(batch_param->'clubs') IS DISTINCT FROM 'array'
    OR jsonb_array_length(batch_param->'matches') NOT BETWEEN main_count AND max_count
    OR (SELECT count(*) FROM jsonb_array_elements(batch_param->'matches') x WHERE coalesce(x->>'stage',main_stage)=main_stage)<>main_count
    OR (competition='NHL' AND jsonb_array_length(coalesce(batch_param->'awaiting_fixtures','[]'::jsonb))<>0)
    OR main_count < 1
    OR coalesce(batch_param->>'scoring_rule','hockey-final-v1')<>'hockey-final-v1'
    OR (batch_param ? 'awaiting_fixtures' AND jsonb_typeof(batch_param->'awaiting_fixtures') IS DISTINCT FROM 'array')
    OR jsonb_array_length(batch_param->'clubs') <> club_count THEN
    RAISE EXCEPTION 'Invalid hockey catalog batch.' USING ERRCODE='22023';
  END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('hockey:'||competition||':2026',0)) THEN
    RETURN jsonb_build_object('busy',true,'wrote_to_db',false);
  END IF;
  SELECT enabled INTO target_enabled FROM tipovacka_private.hockey_sync_state WHERE tournament_id=tournament_key;
  IF (target_enabled IS NULL AND NOT bootstrap_param) OR target_enabled = false THEN
    RAISE EXCEPTION 'Hockey target is disabled or not initialized.' USING ERRCODE='55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tournaments WHERE id=tournament_key
    AND (sport_id <> 'hockey' OR external_id IS DISTINCT FROM provider_key||':'||competition||':2026')) THEN
    RAISE EXCEPTION 'Tournament identity conflict.' USING ERRCODE='23505';
  END IF;
  IF NOT dry_run_param THEN
    INSERT INTO public.tournaments(id,sport_id,slug,name,status,external_id)
      VALUES(tournament_key,'hockey',tournament_key,tournament_name,'hidden',provider_key||':'||competition||':2026')
      ON CONFLICT (id) DO NOTHING;
    INSERT INTO tipovacka_private.hockey_sync_state(tournament_id) VALUES(tournament_key) ON CONFLICT DO NOTHING;
  END IF;
  FOR club IN SELECT value FROM jsonb_array_elements(batch_param->'clubs') LOOP
    IF club->>'id' IS NULL OR club->>'name' IS NULL
      OR (club->>'logo_url' IS NOT NULL AND ((provider_key='nhl-web' AND (club->>'logo_url') !~ '^https://assets\.nhle\.com/logos/nhl/svg/[A-Z]{3}_(secondary_)?light\.svg$') OR (provider_key='hokej-cz' AND (club->>'logo_url') !~ '^https://www\.hokej\.cz/files/logos/[a-zA-Z0-9_-]+\.png$')))
      OR (club->>'id') !~ ('^'||identity_prefix||'-team-[1-9][0-9]*$') OR length(btrim(club->>'name')) NOT BETWEEN 1 AND 160 THEN
      RAISE EXCEPTION 'Invalid club.' USING ERRCODE='22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.participants WHERE id=club->>'id' AND sport_id<>'hockey') THEN
      RAISE EXCEPTION 'Club identity conflict.' USING ERRCODE='23505';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.participants WHERE id=club->>'id') THEN
      created_clubs := created_clubs+1;
      IF NOT dry_run_param THEN
        INSERT INTO public.participants(id,sport_id,name,short_name,type,logo_url)
          VALUES(club->>'id','hockey',club->>'name',club->>'short_name','team',club->>'logo_url');
      END IF;
    ELSIF club->>'logo_url' IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.participants WHERE id=club->>'id' AND logo_url IS DISTINCT FROM club->>'logo_url'
    ) THEN
      updated_clubs := updated_clubs+1;
      IF NOT dry_run_param THEN
        UPDATE public.participants SET logo_url=club->>'logo_url' WHERE id=club->>'id';
      END IF;
    END IF;
  END LOOP;
  IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(batch_param->'clubs'))<>club_count
    OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(batch_param->'matches'))<>jsonb_array_length(batch_param->'matches') THEN
    RAISE EXCEPTION 'Duplicate catalog identity.' USING ERRCODE='22023';
  END IF;
  prior_context := current_setting('tipovacka.hockey_data_sync',true);
  PERFORM set_config('tipovacka.hockey_data_sync','on',true);
  FOR item IN SELECT value FROM jsonb_array_elements(batch_param->'matches') ORDER BY value->>'id' LOOP
    SELECT * INTO m FROM jsonb_to_record(item) AS x(
      id text, provider_match_id text, home_id text, away_id text, kickoff timestamptz,
      matchday integer, stage text, provider_status text, provider_updated_at timestamptz, provider_score jsonb,
      home_score integer, away_score integer, status text
    );
    m.stage := coalesce(m.stage,main_stage);
    expected_score := tipovacka_private.hockey_game_score(m.provider_score);
    IF m.id IS DISTINCT FROM identity_prefix||'-match-'||m.provider_match_id
      OR m.provider_match_id IS NULL OR m.provider_match_id !~ '^[1-9][0-9]*$'
      OR (m.stage<>main_stage AND (competition<>'NHL' OR m.stage<>'Playoffs'))
      OR (competition='ELH' AND (m.matchday IS NULL OR m.matchday NOT BETWEEN 1 AND round_count))
      OR (competition='NHL' AND m.matchday IS NOT NULL)
      OR m.kickoff IS NULL OR m.provider_updated_at IS NULL OR m.home_id IS NULL OR m.away_id IS NULL OR m.home_id=m.away_id
      OR m.status NOT IN ('scheduled','live','finished') OR m.status IS NULL
      OR m.provider_status NOT IN ('TIMED','SCHEDULED','LIVE','FINISHED')
      OR m.provider_status IS NULL OR jsonb_typeof(m.provider_score) IS DISTINCT FROM 'object'
      OR m.provider_score->>'source' IS DISTINCT FROM provider_key
      OR (m.provider_score->>'kickoff')::timestamptz IS DISTINCT FROM m.kickoff
      OR m.provider_updated_at>now()+interval '1 minute'
      OR m.provider_score->>'season' IS DISTINCT FROM (CASE WHEN competition='NHL' THEN '20262027' ELSE '2026' END)
      OR (competition='NHL' AND m.provider_score->>'game_type' IS DISTINCT FROM (CASE WHEN m.stage=main_stage THEN '2' ELSE '3' END))
      OR m.status IS DISTINCT FROM (CASE WHEN m.provider_status='FINISHED' THEN 'finished'
        WHEN m.provider_status='LIVE' THEN 'live' ELSE 'scheduled' END)
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(batch_param->'clubs') c WHERE c->>'id'=m.home_id)
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(batch_param->'clubs') c WHERE c->>'id'=m.away_id)
      OR (m.status='finished' AND (m.home_score IS NULL OR m.away_score IS NULL
        OR m.home_score NOT BETWEEN 0 AND 99 OR m.away_score NOT BETWEEN 0 AND 99
        OR m.provider_status<>'FINISHED' OR m.kickoff>now()
        OR expected_score IS NULL
        OR m.home_score IS DISTINCT FROM (expected_score->>'home')::integer
        OR m.away_score IS DISTINCT FROM (expected_score->>'away')::integer
        OR m.home_score=m.away_score))
      OR (m.status<>'finished' AND (m.home_score IS NOT NULL OR m.away_score IS NOT NULL)) THEN
      RAISE EXCEPTION 'Invalid hockey fixture or scoring facts.' USING ERRCODE='22023';
    END IF;
    SELECT * INTO old FROM public.matches WHERE id=m.id FOR UPDATE;
    new_lock := m.kickoff-interval '5 minutes';
    IF NOT FOUND THEN
      inserted_matches := inserted_matches+1;
      IF NOT dry_run_param THEN
        INSERT INTO public.matches(id,tournament_id,home_participant_id,away_participant_id,start_time_utc,
          lock_time_utc,status,stage,home_score,away_score,provider_name,provider_match_id,matchday,
          provider_status,provider_updated_at,provider_score)
        VALUES(m.id,tournament_key,m.home_id,m.away_id,m.kickoff,new_lock,m.status,m.stage,
          m.home_score,m.away_score,provider_key,m.provider_match_id,m.matchday,m.provider_status,
          m.provider_updated_at,m.provider_score);
      END IF;
      CONTINUE;
    END IF;
    IF old.tournament_id<>tournament_key OR old.provider_name IS DISTINCT FROM provider_key
      OR old.provider_match_id IS DISTINCT FROM m.provider_match_id
      OR old.home_participant_id<>m.home_id OR old.away_participant_id<>m.away_id
      OR old.matchday IS DISTINCT FROM m.matchday OR old.stage IS DISTINCT FROM m.stage THEN
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('match_id',m.id,'reason','identity_conflict')); CONTINUE;
    END IF;
    IF old.provider_updated_at > m.provider_updated_at THEN
      unchanged_matches := unchanged_matches+1; CONTINUE;
    END IF;
    same_snapshot := old.provider_updated_at IS NOT NULL AND old.provider_updated_at=m.provider_updated_at
      AND old.provider_status IS NOT DISTINCT FROM m.provider_status
      AND old.provider_score IS NOT DISTINCT FROM m.provider_score;
    -- An unchanged finished-result revision may repair local state, not introduce contradictory provider facts.
    IF old.status='finished' AND m.status='finished' AND old.provider_updated_at=m.provider_updated_at AND NOT same_snapshot THEN
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('match_id',m.id,'reason','inconsistent_provider_revision')); CONTINUE;
    END IF;
    IF old.status='finished' AND m.status<>'finished' AND NOT same_snapshot THEN
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('match_id',m.id,'reason','unconfirmed_result_revision')); CONTINUE;
    END IF;
    score_changed := old.home_score IS DISTINCT FROM m.home_score OR old.away_score IS DISTINCT FROM m.away_score;
    IF old.lock_time_utc <= now() THEN new_lock := least(new_lock,old.lock_time_utc); END IF;
    changed := ROW(old.start_time_utc,old.lock_time_utc,old.status,old.home_score,old.away_score,
      old.provider_status,old.provider_updated_at,old.provider_score,old.result_source) IS DISTINCT FROM
      ROW(m.kickoff,new_lock,m.status,m.home_score,m.away_score,m.provider_status,m.provider_updated_at,m.provider_score,provider_key);
    points_changed := m.status<>'finished' AND EXISTS (
      SELECT 1 FROM public.predictions WHERE match_id=m.id AND points_earned IS DISTINCT FROM 0
    );
    -- Unfinished games always earn zero, independently of the player's editable prediction.
    IF m.status='finished' OR score_changed OR points_changed THEN
      PERFORM 1 FROM public.predictions WHERE match_id=m.id ORDER BY user_id,lobby_id FOR UPDATE;
      SELECT count(*) INTO expected_count FROM public.predictions WHERE match_id=m.id;
      IF m.status='finished' THEN
        score_rows := item->'scores';
      ELSE
        SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'lobby_id',p.lobby_id,
          'predicted_home_score',p.predicted_home_score,'predicted_away_score',p.predicted_away_score,'points_earned',0)), '[]'::jsonb)
        INTO score_rows FROM public.predictions p WHERE p.match_id=m.id;
      END IF;
      IF jsonb_typeof(score_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(score_rows)<>expected_count
        OR (SELECT count(DISTINCT (s->>'user_id',s->>'lobby_id')) FROM jsonb_array_elements(score_rows) s)<>expected_count
        OR EXISTS (
          SELECT 1 FROM jsonb_to_recordset(score_rows) s(user_id uuid,lobby_id text,
            predicted_home_score integer,predicted_away_score integer,points_earned integer)
          LEFT JOIN public.predictions p ON p.match_id=m.id AND p.user_id=s.user_id AND p.lobby_id=s.lobby_id
          WHERE p.user_id IS NULL OR p.predicted_home_score IS DISTINCT FROM s.predicted_home_score
            OR p.predicted_away_score IS DISTINCT FROM s.predicted_away_score
            OR s.points_earned IS DISTINCT FROM CASE WHEN m.status<>'finished' THEN 0 WHEN p.predicted_home_score=m.home_score AND p.predicted_away_score=m.away_score THEN 5 WHEN sign(p.predicted_home_score-p.predicted_away_score)=sign(m.home_score-m.away_score) THEN 2 ELSE 0 END
        ) THEN RAISE EXCEPTION 'Prediction snapshot changed; retry sync.' USING ERRCODE='40001'; END IF;
      -- Official Events are deferred; do not silently omit them if enabled later.
      IF to_regclass('public.official_event_predictions') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM public.official_event_predictions WHERE match_id=$1' INTO expected_count USING m.id;
        IF expected_count>0 THEN RAISE EXCEPTION 'Official Event scoring is not supported by hockey sync.' USING ERRCODE='55000'; END IF;
      END IF;
      SELECT EXISTS (
        SELECT 1 FROM jsonb_to_recordset(score_rows) s(user_id uuid,lobby_id text,points_earned integer)
        JOIN public.predictions p ON p.match_id=m.id AND p.user_id=s.user_id AND p.lobby_id=s.lobby_id
        WHERE p.points_earned IS DISTINCT FROM s.points_earned
      ) INTO points_changed;
      IF NOT dry_run_param AND points_changed THEN
        UPDATE public.predictions p SET points_earned=s.points_earned,updated_at=now()
          FROM jsonb_to_recordset(score_rows) s(user_id uuid,lobby_id text,points_earned integer)
          WHERE p.match_id=m.id AND p.user_id=s.user_id AND p.lobby_id=s.lobby_id
            AND p.points_earned IS DISTINCT FROM s.points_earned;
        GET DIAGNOSTICS expected_count = ROW_COUNT;
        updated_predictions := updated_predictions+expected_count;
      END IF;
    END IF;
    IF same_snapshot AND (changed OR points_changed) THEN local_repairs := local_repairs+1; END IF;
    IF NOT changed THEN unchanged_matches := unchanged_matches+1; CONTINUE; END IF;
    IF old.status='finished' AND score_changed THEN results_corrected := results_corrected+1; END IF;
    updated_matches := updated_matches+1;
    IF NOT dry_run_param THEN
      UPDATE public.matches SET start_time_utc=m.kickoff,lock_time_utc=new_lock,status=m.status,
        home_score=m.home_score,away_score=m.away_score,provider_status=m.provider_status,
        provider_updated_at=m.provider_updated_at,provider_score=m.provider_score,result_source=provider_key,updated_at=now() WHERE id=m.id;
    END IF;
  END LOOP;
  PERFORM set_config('tipovacka.hockey_data_sync',coalesce(prior_context,''),true);
  summary := jsonb_build_object('dry_run',dry_run_param,'wrote_to_db',NOT dry_run_param,
    'tournament_id',tournament_key,'clubs_created',created_clubs,'clubs_updated',updated_clubs,'results_corrected',results_corrected,'matches_inserted',inserted_matches,
    'matches_updated',updated_matches,'unchanged',unchanged_matches,'manual_skipped',manual_skipped,
    'conflicts',conflicts,'predictions_updated',updated_predictions,
    'local_repairs',local_repairs,'scoring_rule','hockey-final-v1','awaiting_fixtures',jsonb_array_length(coalesce(batch_param->'awaiting_fixtures','[]'::jsonb)));
  IF NOT dry_run_param THEN
    UPDATE tipovacka_private.hockey_sync_state SET
      last_success_at=CASE WHEN jsonb_array_length(conflicts)=0 THEN now() ELSE last_success_at END,
      last_summary=summary WHERE tournament_id=tournament_key;
  END IF;
  RETURN summary;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_hockey_catalog(jsonb,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_hockey_catalog(jsonb,boolean,boolean) TO service_role;
