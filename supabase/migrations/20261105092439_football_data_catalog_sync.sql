-- Shared CL catalog only. Does not select pilot rounds or enroll any lobby.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS matchday integer,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_score jsonb,
  ADD COLUMN IF NOT EXISTS result_source text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_provider_pg
  ON public.matches(provider_name,provider_match_id)
  WHERE provider_name IS NOT NULL AND provider_match_id IS NOT NULL;

CREATE TABLE tipovacka_private.football_data_sync_state (
  tournament_id text PRIMARY KEY REFERENCES public.tournaments(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT true,
  last_success_at timestamptz,
  last_summary jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE tipovacka_private.football_data_sync_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tipovacka_private.football_data_sync_state FROM PUBLIC, anon, authenticated;

CREATE FUNCTION tipovacka_private.mark_football_data_result_source()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.provider_name = 'football-data.org' AND (
    TG_OP = 'INSERT' OR NEW.home_score IS DISTINCT FROM OLD.home_score
    OR NEW.away_score IS DISTINCT FROM OLD.away_score OR NEW.status IS DISTINCT FROM OLD.status
  ) THEN
    NEW.result_source := CASE WHEN current_setting('tipovacka.football_data_sync', true) = 'on'
      THEN 'football-data.org' ELSE 'manual-admin' END;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION tipovacka_private.mark_football_data_result_source() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER mark_football_data_result_source BEFORE INSERT OR UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION tipovacka_private.mark_football_data_result_source();

-- Serialize prediction writes with results, and block postponed/provisional games.
CREATE FUNCTION tipovacka_private.lock_football_data_prediction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE m public.matches%ROWTYPE;
BEGIN
  IF current_setting('role', true) = 'authenticated' AND (
    TG_OP = 'INSERT' OR NEW.match_id IS DISTINCT FROM OLD.match_id
    OR NEW.predicted_home_score IS DISTINCT FROM OLD.predicted_home_score
    OR NEW.predicted_away_score IS DISTINCT FROM OLD.predicted_away_score
  ) THEN
    SELECT * INTO m FROM public.matches WHERE id = NEW.match_id FOR SHARE;
    IF m.provider_name = 'football-data.org' AND (
      m.provider_status IS DISTINCT FROM 'TIMED' OR m.status <> 'scheduled'
      OR m.home_score IS NOT NULL OR m.away_score IS NOT NULL OR m.lock_time_utc <= now()
      OR EXISTS (SELECT 1 FROM public.tournaments WHERE id=m.tournament_id AND status='hidden')
    ) THEN RAISE EXCEPTION 'Prediction is locked.' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION tipovacka_private.lock_football_data_prediction() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER lock_football_data_prediction BEFORE INSERT OR UPDATE ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION tipovacka_private.lock_football_data_prediction();

CREATE FUNCTION public.sync_football_data_catalog(
  batch_param jsonb, dry_run_param boolean DEFAULT true, bootstrap_param boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  tournament_key constant text := 'uefa-champions-league-2026-27';
  item jsonb; club jsonb; m record; old public.matches%ROWTYPE;
  score_rows jsonb; expected_count integer; changed boolean; score_changed boolean;
  target_enabled boolean; prior_context text;
  created_clubs integer := 0; inserted_matches integer := 0; updated_matches integer := 0;
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
    OR jsonb_array_length(batch_param->'matches') <> 144
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
      OR (club->>'id') !~ '^football-data-team-[1-9][0-9]*$' OR length(btrim(club->>'name')) NOT BETWEEN 1 AND 160 THEN
      RAISE EXCEPTION 'Invalid club.' USING ERRCODE='22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.participants WHERE id=club->>'id' AND sport_id<>'football') THEN
      RAISE EXCEPTION 'Club identity conflict.' USING ERRCODE='23505';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.participants WHERE id=club->>'id') THEN
      created_clubs := created_clubs+1;
      IF NOT dry_run_param THEN
        INSERT INTO public.participants(id,sport_id,name,short_name,type)
          VALUES(club->>'id','football',club->>'name',club->>'short_name','team');
      END IF;
    END IF;
  END LOOP;
  IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(batch_param->'clubs'))<>36
    OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(batch_param->'matches'))<>144 THEN
    RAISE EXCEPTION 'Duplicate catalog identity.' USING ERRCODE='22023';
  END IF;
  prior_context := current_setting('tipovacka.football_data_sync',true);
  PERFORM set_config('tipovacka.football_data_sync','on',true);
  FOR item IN SELECT value FROM jsonb_array_elements(batch_param->'matches') ORDER BY value->>'id' LOOP
    SELECT * INTO m FROM jsonb_to_record(item) AS x(
      id text, provider_match_id text, home_id text, away_id text, kickoff timestamptz,
      matchday integer, provider_status text, provider_updated_at timestamptz, provider_score jsonb,
      home_score integer, away_score integer, status text
    );
    IF m.id IS DISTINCT FROM 'football-data-match-'||m.provider_match_id
      OR m.provider_match_id IS NULL OR m.provider_match_id !~ '^[1-9][0-9]*$'
      OR m.matchday IS NULL OR m.matchday NOT BETWEEN 1 AND 8
      OR m.kickoff IS NULL OR m.provider_updated_at IS NULL OR m.home_id IS NULL OR m.away_id IS NULL OR m.home_id=m.away_id
      OR m.status NOT IN ('scheduled','live','finished') OR m.status IS NULL
      OR m.provider_status NOT IN ('TIMED','SCHEDULED','IN_PLAY','PAUSED','FINISHED','SUSPENDED','POSTPONED','CANCELLED','AWARDED')
      OR m.provider_status IS NULL OR jsonb_typeof(m.provider_score) IS DISTINCT FROM 'object'
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(batch_param->'clubs') c WHERE c->>'id'=m.home_id)
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(batch_param->'clubs') c WHERE c->>'id'=m.away_id)
      OR (m.status='finished' AND (m.home_score IS NULL OR m.away_score IS NULL
        OR m.home_score NOT BETWEEN 0 AND 99 OR m.away_score NOT BETWEEN 0 AND 99
        OR m.provider_status<>'FINISHED' OR m.kickoff>now()
        OR m.provider_score->>'duration' IS DISTINCT FROM 'REGULAR'))
      OR (m.status<>'finished' AND (m.home_score IS NOT NULL OR m.away_score IS NOT NULL)) THEN
      RAISE EXCEPTION 'Invalid league-phase fixture.' USING ERRCODE='22023';
    END IF;
    SELECT * INTO old FROM public.matches WHERE id=m.id FOR UPDATE;
    new_lock := m.kickoff-interval '5 minutes';
    IF NOT FOUND THEN
      inserted_matches := inserted_matches+1;
      IF NOT dry_run_param THEN
        INSERT INTO public.matches(id,tournament_id,home_participant_id,away_participant_id,start_time_utc,
          lock_time_utc,status,stage,home_score,away_score,provider_name,provider_match_id,matchday,
          provider_status,provider_updated_at,provider_score)
        VALUES(m.id,tournament_key,m.home_id,m.away_id,m.kickoff,new_lock,m.status,'League Phase',
          m.home_score,m.away_score,'football-data.org',m.provider_match_id,m.matchday,m.provider_status,
          m.provider_updated_at,m.provider_score);
      END IF;
      CONTINUE;
    END IF;
    IF old.tournament_id<>tournament_key OR old.provider_name IS DISTINCT FROM 'football-data.org'
      OR old.provider_match_id IS DISTINCT FROM m.provider_match_id
      OR old.home_participant_id<>m.home_id OR old.away_participant_id<>m.away_id OR old.matchday<>m.matchday THEN
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
    -- A confirmed result, including an API result, requires manual correction.
    IF old.status='finished' AND (score_changed OR m.status<>'finished') THEN
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('match_id',m.id,'reason','confirmed_result_conflict')); CONTINUE;
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
    updated_matches := updated_matches+1;
    IF NOT dry_run_param THEN
      UPDATE public.matches SET start_time_utc=m.kickoff,lock_time_utc=new_lock,status=m.status,
        home_score=m.home_score,away_score=m.away_score,provider_status=m.provider_status,
        provider_updated_at=m.provider_updated_at,provider_score=m.provider_score,updated_at=now() WHERE id=m.id;
    END IF;
  END LOOP;
  PERFORM set_config('tipovacka.football_data_sync',coalesce(prior_context,''),true);
  summary := jsonb_build_object('dry_run',dry_run_param,'wrote_to_db',NOT dry_run_param,
    'tournament_id',tournament_key,'clubs_created',created_clubs,'matches_inserted',inserted_matches,
    'matches_updated',updated_matches,'unchanged',unchanged_matches,'manual_skipped',manual_skipped,
    'conflicts',conflicts,'predictions_updated',updated_predictions);
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
