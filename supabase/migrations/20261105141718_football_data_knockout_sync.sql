-- Full CL season, fixed football-final-shootout-v1 contract. No existing results are rewritten by this migration.
CREATE OR REPLACE FUNCTION tipovacka_private.football_data_game_score(score_param jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE part jsonb; duration text := score_param->>'duration';
  ft jsonb := score_param->'fullTime'; r jsonb := score_param->'regularTime';
  e jsonb := score_param->'extraTime'; p jsonb := score_param->'penalties';
  gh integer; ga integer;
BEGIN
  IF duration IS NULL OR duration NOT IN ('REGULAR','EXTRA_TIME','PENALTY_SHOOTOUT') THEN RETURN NULL; END IF;
  FOR part IN SELECT value FROM jsonb_array_elements(
    CASE duration WHEN 'REGULAR' THEN jsonb_build_array(ft)
      WHEN 'EXTRA_TIME' THEN jsonb_build_array(ft,r,e) ELSE jsonb_build_array(ft,r,e,p) END
  ) LOOP
    IF jsonb_typeof(part) IS DISTINCT FROM 'object'
      OR jsonb_typeof(part->'home') IS DISTINCT FROM 'number' OR jsonb_typeof(part->'away') IS DISTINCT FROM 'number'
      OR coalesce(part->>'home','') !~ '^[0-9]{1,2}$' OR coalesce(part->>'away','') !~ '^[0-9]{1,2}$' THEN RETURN NULL; END IF;
  END LOOP;
  IF duration='REGULAR' THEN RETURN ft; END IF;
  gh := (r->>'home')::integer+(e->>'home')::integer;
  ga := (r->>'away')::integer+(e->>'away')::integer;
  IF duration='EXTRA_TIME' THEN
    IF (ft->>'home')::integer<>gh OR (ft->>'away')::integer<>ga THEN RETURN NULL; END IF;
    RETURN jsonb_build_object('home',gh,'away',ga);
  END IF;
  IF p->>'home'=p->>'away' OR (ft->>'home')::integer<>gh+(p->>'home')::integer
    OR (ft->>'away')::integer<>ga+(p->>'away')::integer THEN RETURN NULL; END IF;
  RETURN p;
END;
$$;
REVOKE ALL ON FUNCTION tipovacka_private.football_data_game_score(jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sync_football_data_catalog(
  batch_param jsonb, dry_run_param boolean DEFAULT true, bootstrap_param boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  tournament_key constant text := 'uefa-champions-league-2026-27';
  item jsonb; club jsonb; m record; old public.matches%ROWTYPE;
  score_rows jsonb; expected_score jsonb; expected_count integer; changed boolean; score_changed boolean;
  target_enabled boolean; prior_context text;
  created_clubs integer := 0; updated_clubs integer := 0; results_corrected integer := 0; inserted_matches integer := 0; updated_matches integer := 0;
  unchanged_matches integer := 0; updated_predictions integer := 0; manual_skipped integer := 0;
  conflicts jsonb := '[]'::jsonb; summary jsonb; new_lock timestamptz;
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE='42501';
  END IF;
  IF dry_run_param IS NULL OR bootstrap_param IS NULL OR batch_param->>'competition' IS DISTINCT FROM 'CL'
    OR batch_param->>'season' IS DISTINCT FROM '2026'
    OR jsonb_typeof(batch_param->'matches') IS DISTINCT FROM 'array'
    OR jsonb_typeof(batch_param->'clubs') IS DISTINCT FROM 'array'
    OR jsonb_array_length(batch_param->'matches') NOT BETWEEN 144 AND 189
    OR (SELECT count(*) FROM jsonb_array_elements(batch_param->'matches') x WHERE coalesce(x->>'stage','League Phase')='League Phase')<>144
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(batch_param->'matches') x WHERE x->>'stage' IN ('Playoffs','Round of 16','Quarterfinals','Semifinals','Final') GROUP BY x->>'stage' HAVING count(*) > CASE x->>'stage' WHEN 'Playoffs' THEN 16 WHEN 'Round of 16' THEN 16 WHEN 'Quarterfinals' THEN 8 WHEN 'Semifinals' THEN 4 ELSE 1 END)
    OR coalesce(batch_param->>'scoring_rule','football-final-shootout-v1')<>'football-final-shootout-v1'
    OR (batch_param ? 'awaiting_fixtures' AND jsonb_typeof(batch_param->'awaiting_fixtures') IS DISTINCT FROM 'array')
    OR jsonb_array_length(batch_param->'clubs') <> 36 THEN
    RAISE EXCEPTION 'Invalid CL catalog batch.' USING ERRCODE='22023';
  END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('football-data:CL:2026',0)) THEN
    RETURN jsonb_build_object('busy',true,'wrote_to_db',false);
  END IF;
  SELECT enabled INTO target_enabled FROM tipovacka_private.football_data_sync_state WHERE tournament_id=tournament_key;
  IF (target_enabled IS NULL AND NOT bootstrap_param) OR target_enabled = false THEN
    RAISE EXCEPTION 'Football data target is disabled or not initialized.' USING ERRCODE='55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tournaments WHERE id=tournament_key
    AND (sport_id <> 'football' OR external_id IS DISTINCT FROM 'football-data.org:CL:2026')) THEN
    RAISE EXCEPTION 'Tournament identity conflict.' USING ERRCODE='23505';
  END IF;
  IF NOT dry_run_param THEN
    INSERT INTO public.tournaments(id,sport_id,slug,name,status,external_id)
      VALUES(tournament_key,'football',tournament_key,'UEFA Champions League 2026/27','hidden','football-data.org:CL:2026')
      ON CONFLICT (id) DO NOTHING;
    INSERT INTO tipovacka_private.football_data_sync_state(tournament_id) VALUES(tournament_key) ON CONFLICT DO NOTHING;
  END IF;
  FOR club IN SELECT value FROM jsonb_array_elements(batch_param->'clubs') LOOP
    IF club->>'id' IS NULL OR club->>'name' IS NULL
      OR (club->>'logo_url' IS NOT NULL AND (club->>'logo_url') !~ '^https://crests\.football-data\.org/[1-9][0-9]*\.(png|svg)$')
      OR (club->>'id') !~ '^football-data-team-[1-9][0-9]*$' OR length(btrim(club->>'name')) NOT BETWEEN 1 AND 160 THEN
      RAISE EXCEPTION 'Invalid club.' USING ERRCODE='22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.participants WHERE id=club->>'id' AND sport_id<>'football') THEN
      RAISE EXCEPTION 'Club identity conflict.' USING ERRCODE='23505';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.participants WHERE id=club->>'id') THEN
      created_clubs := created_clubs+1;
      IF NOT dry_run_param THEN
        INSERT INTO public.participants(id,sport_id,name,short_name,type,logo_url)
          VALUES(club->>'id','football',club->>'name',club->>'short_name','team',club->>'logo_url');
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
  IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(batch_param->'clubs'))<>36
    OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(batch_param->'matches'))<>jsonb_array_length(batch_param->'matches') THEN
    RAISE EXCEPTION 'Duplicate catalog identity.' USING ERRCODE='22023';
  END IF;
  prior_context := current_setting('tipovacka.football_data_sync',true);
  PERFORM set_config('tipovacka.football_data_sync','on',true);
  FOR item IN SELECT value FROM jsonb_array_elements(batch_param->'matches') ORDER BY value->>'id' LOOP
    SELECT * INTO m FROM jsonb_to_record(item) AS x(
      id text, provider_match_id text, home_id text, away_id text, kickoff timestamptz,
      matchday integer, stage text, provider_status text, provider_updated_at timestamptz, provider_score jsonb,
      home_score integer, away_score integer, status text
    );
    m.stage := coalesce(m.stage,'League Phase');
    expected_score := tipovacka_private.football_data_game_score(m.provider_score);
    IF m.id IS DISTINCT FROM 'football-data-match-'||m.provider_match_id
      OR m.provider_match_id IS NULL OR m.provider_match_id !~ '^[1-9][0-9]*$'
      OR m.stage NOT IN ('League Phase','Playoffs','Round of 16','Quarterfinals','Semifinals','Final')
      OR (m.stage='League Phase' AND (m.matchday IS NULL OR m.matchday NOT BETWEEN 1 AND 8))
      OR (m.stage<>'League Phase' AND m.matchday IS NOT NULL AND m.matchday NOT IN (1,2))
      OR m.kickoff IS NULL OR m.provider_updated_at IS NULL OR m.home_id IS NULL OR m.away_id IS NULL OR m.home_id=m.away_id
      OR m.status NOT IN ('scheduled','live','finished') OR m.status IS NULL
      OR m.provider_status NOT IN ('TIMED','SCHEDULED','IN_PLAY','PAUSED','EXTRA_TIME','PENALTY_SHOOTOUT','FINISHED','SUSPENDED','POSTPONED','CANCELLED','AWARDED')
      OR m.provider_status IS NULL OR jsonb_typeof(m.provider_score) IS DISTINCT FROM 'object'
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(batch_param->'clubs') c WHERE c->>'id'=m.home_id)
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(batch_param->'clubs') c WHERE c->>'id'=m.away_id)
      OR (m.status='finished' AND (m.home_score IS NULL OR m.away_score IS NULL
        OR m.home_score NOT BETWEEN 0 AND 99 OR m.away_score NOT BETWEEN 0 AND 99
        OR m.provider_status<>'FINISHED' OR m.kickoff>now()
        OR expected_score IS NULL
        OR m.home_score IS DISTINCT FROM (expected_score->>'home')::integer
        OR m.away_score IS DISTINCT FROM (expected_score->>'away')::integer
        OR (m.stage='League Phase' AND m.provider_score->>'duration' IS DISTINCT FROM 'REGULAR')
        OR (m.stage='Final' AND m.home_score=m.away_score)))
      OR (m.status<>'finished' AND (m.home_score IS NOT NULL OR m.away_score IS NOT NULL)) THEN
      RAISE EXCEPTION 'Invalid CL fixture or scoring facts.' USING ERRCODE='22023';
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
          m.home_score,m.away_score,'football-data.org',m.provider_match_id,m.matchday,m.provider_status,
          m.provider_updated_at,m.provider_score);
      END IF;
      CONTINUE;
    END IF;
    IF old.tournament_id<>tournament_key OR old.provider_name IS DISTINCT FROM 'football-data.org'
      OR old.provider_match_id IS DISTINCT FROM m.provider_match_id
      OR old.home_participant_id<>m.home_id OR old.away_participant_id<>m.away_id
      OR old.matchday IS DISTINCT FROM m.matchday OR old.stage IS DISTINCT FROM m.stage THEN
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('match_id',m.id,'reason','identity_conflict')); CONTINUE;
    END IF;
    IF old.result_source='manual-admin' OR ((old.home_score IS NOT NULL OR old.away_score IS NOT NULL OR old.status='finished')
      AND old.result_source IS DISTINCT FROM 'football-data.org') THEN
      manual_skipped := manual_skipped+1; CONTINUE;
    END IF;
    IF old.provider_updated_at > m.provider_updated_at THEN
      unchanged_matches := unchanged_matches+1; CONTINUE;
    END IF;
    score_changed := old.home_score IS DISTINCT FROM m.home_score OR old.away_score IS DISTINCT FROM m.away_score;
    -- Newer revisions correct API-owned results automatically; manual provenance stays protected.
    IF old.status='finished' AND (m.status<>'finished' OR (
      score_changed AND (old.provider_updated_at IS NULL OR m.provider_updated_at<=old.provider_updated_at)
    )) THEN
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('match_id',m.id,'reason','unconfirmed_result_revision')); CONTINUE;
    END IF;
    IF old.lock_time_utc <= now() THEN new_lock := least(new_lock,old.lock_time_utc); END IF;
    changed := ROW(old.start_time_utc,old.lock_time_utc,old.status,old.home_score,old.away_score,
      old.provider_status,old.provider_updated_at,old.provider_score) IS DISTINCT FROM
      ROW(m.kickoff,new_lock,m.status,m.home_score,m.away_score,m.provider_status,m.provider_updated_at,m.provider_score);
    IF NOT changed THEN unchanged_matches := unchanged_matches+1; CONTINUE; END IF;
    IF score_changed THEN
      PERFORM 1 FROM public.predictions WHERE match_id=m.id ORDER BY user_id,lobby_id FOR UPDATE;
      SELECT count(*) INTO expected_count FROM public.predictions WHERE match_id=m.id;
      score_rows := item->'scores';
      IF jsonb_typeof(score_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(score_rows)<>expected_count
        OR (SELECT count(DISTINCT (s->>'user_id',s->>'lobby_id')) FROM jsonb_array_elements(score_rows) s)<>expected_count
        OR EXISTS (
          SELECT 1 FROM jsonb_to_recordset(score_rows) s(user_id uuid,lobby_id text,
            predicted_home_score integer,predicted_away_score integer,points_earned integer)
          LEFT JOIN public.predictions p ON p.match_id=m.id AND p.user_id=s.user_id AND p.lobby_id=s.lobby_id
          WHERE p.user_id IS NULL OR p.predicted_home_score IS DISTINCT FROM s.predicted_home_score
            OR p.predicted_away_score IS DISTINCT FROM s.predicted_away_score
            OR s.points_earned IS NULL OR s.points_earned NOT BETWEEN 0 AND 5
        ) THEN RAISE EXCEPTION 'Prediction snapshot changed; retry sync.' USING ERRCODE='40001'; END IF;
      -- Official Events are deferred; do not silently omit them if enabled later.
      IF to_regclass('public.official_event_predictions') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM public.official_event_predictions WHERE match_id=$1' INTO expected_count USING m.id;
        IF expected_count>0 THEN RAISE EXCEPTION 'Official Event scoring is not supported by CL sync.' USING ERRCODE='55000'; END IF;
      END IF;
      IF NOT dry_run_param THEN
        UPDATE public.predictions p SET points_earned=s.points_earned,updated_at=now()
          FROM jsonb_to_recordset(score_rows) s(user_id uuid,lobby_id text,points_earned integer)
          WHERE p.match_id=m.id AND p.user_id=s.user_id AND p.lobby_id=s.lobby_id;
        GET DIAGNOSTICS expected_count = ROW_COUNT;
        updated_predictions := updated_predictions+expected_count;
      END IF;
    END IF;
    IF old.status='finished' AND score_changed THEN results_corrected := results_corrected+1; END IF;
    updated_matches := updated_matches+1;
    IF NOT dry_run_param THEN
      UPDATE public.matches SET start_time_utc=m.kickoff,lock_time_utc=new_lock,status=m.status,
        home_score=m.home_score,away_score=m.away_score,provider_status=m.provider_status,
        provider_updated_at=m.provider_updated_at,provider_score=m.provider_score,updated_at=now() WHERE id=m.id;
    END IF;
  END LOOP;
  PERFORM set_config('tipovacka.football_data_sync',coalesce(prior_context,''),true);
  summary := jsonb_build_object('dry_run',dry_run_param,'wrote_to_db',NOT dry_run_param,
    'tournament_id',tournament_key,'clubs_created',created_clubs,'clubs_updated',updated_clubs,'results_corrected',results_corrected,'matches_inserted',inserted_matches,
    'matches_updated',updated_matches,'unchanged',unchanged_matches,'manual_skipped',manual_skipped,
    'conflicts',conflicts,'predictions_updated',updated_predictions,
    'scoring_rule','football-final-shootout-v1','awaiting_fixtures',jsonb_array_length(coalesce(batch_param->'awaiting_fixtures','[]'::jsonb)));
  IF NOT dry_run_param THEN
    UPDATE tipovacka_private.football_data_sync_state SET
      last_success_at=CASE WHEN jsonb_array_length(conflicts)=0 THEN now() ELSE last_success_at END,
      last_summary=summary WHERE tournament_id=tournament_key;
  END IF;
  RETURN summary;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_football_data_catalog(jsonb,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_football_data_catalog(jsonb,boolean,boolean) TO service_role;
