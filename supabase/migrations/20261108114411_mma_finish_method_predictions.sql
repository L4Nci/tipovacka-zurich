-- Optional finish-method picks. Sports outcomes and player context remain server guarded.
ALTER TABLE public.mma_predictions ADD COLUMN predicted_method text
  CHECK(predicted_method IN('ko_tko','submission','decision'));
ALTER TABLE public.mma_predictions DROP CONSTRAINT mma_predictions_points_earned_check;
ALTER TABLE public.mma_predictions ADD CONSTRAINT mma_predictions_points_earned_check CHECK(points_earned IN(0,1,3,5));
ALTER TABLE public.mma_fights ADD COLUMN method_normalized text
  CHECK(method_normalized IN('ko_tko','submission','technical_submission','decision_unanimous','decision_split',
    'decision_majority','decision','draw','no_contest','dq','other'));
ALTER TABLE public.mma_fights ADD CONSTRAINT mma_fights_method_result_check CHECK(
  method_normalized IS NULL OR (method_normalized='draw' AND status='draw')
  OR (method_normalized='no_contest' AND status='void')
  OR (method_normalized NOT IN('draw','no_contest') AND status IN('finished','awaiting_result','cancelled')));
ALTER TABLE public.mma_events DROP CONSTRAINT mma_events_rules_version_check;
ALTER TABLE public.mma_events ADD CONSTRAINT mma_events_rules_version_check
  CHECK(rules_version IN('mma-winner-v1','mma-winner-method-v2'));
ALTER TABLE public.mma_events ALTER COLUMN rules_version SET DEFAULT 'mma-winner-method-v2';

-- Only genuinely open, unscored cards adopt the new contract. Historical/locked cards keep v1.
UPDATE public.mma_events e SET rules_version='mma-winner-method-v2'
WHERE e.rules_version='mma-winner-v1' AND e.status IN('announced','scheduled') AND e.lock_time_utc>clock_timestamp()
  AND NOT EXISTS(SELECT 1 FROM public.mma_fights f WHERE f.tournament_id=e.tournament_id AND f.status IN('finished','draw','void'))
  AND NOT EXISTS(SELECT 1 FROM public.mma_predictions p JOIN public.mma_fights f ON f.id=p.fight_id
    WHERE f.tournament_id=e.tournament_id AND p.points_earned<>0);

CREATE FUNCTION tipovacka_private.mma_method_group(p_method text) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT CASE WHEN p_method='ko_tko' THEN 'ko_tko'
    WHEN p_method IN('submission','technical_submission') THEN 'submission'
    WHEN p_method IN('decision','decision_unanimous','decision_split','decision_majority') THEN 'decision'
    ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION tipovacka_private.mma_method_group(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION tipovacka_private.mma_prediction_points(p_rules text,p_pick bigint,p_winner bigint,p_status text,
  p_picked_version integer,p_current_version integer,p_picked_method text,p_actual_method text) RETURNS integer
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT CASE WHEN p_status IS DISTINCT FROM 'finished' OR p_winner IS NULL OR p_picked_version IS DISTINCT FROM p_current_version
    OR p_actual_method IN('draw','no_contest') THEN 0
    WHEN p_rules='mma-winner-v1' THEN CASE WHEN p_pick=p_winner THEN 1 ELSE 0 END
    WHEN p_rules='mma-winner-method-v2' THEN
      CASE WHEN p_pick=p_winner THEN 3 ELSE 0 END
      + CASE WHEN p_picked_method=tipovacka_private.mma_method_group(p_actual_method) THEN 1 ELSE 0 END
      + CASE WHEN p_pick=p_winner AND p_picked_method=tipovacka_private.mma_method_group(p_actual_method) THEN 1 ELSE 0 END
    ELSE 0 END;
$$;
REVOKE ALL ON FUNCTION tipovacka_private.mma_prediction_points(text,bigint,bigint,text,integer,integer,text,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.sync_mma_event(batch_param jsonb,dry_run_param boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  ev jsonb := batch_param->'event'; item jsonb; previous public.mma_fights%ROWTYPE;
  v_id text := ev->>'tournament_id'; v_event_id bigint := (ev->>'provider_event_id')::bigint;
  v_observed timestamptz := (batch_param->>'observed_at')::timestamptz;
  v_old public.mma_events%ROWTYPE; v_lock timestamptz; v_version integer; v_points integer := 0;
  v_next timestamptz; v_count integer; v_season integer; v_season_id text; v_rules text;
BEGIN
  IF v_id IS NULL OR v_event_id IS NULL
    OR NOT EXISTS(SELECT 1 FROM tipovacka_private.mma_event_catalog c WHERE c.tournament_id=v_id AND c.provider_event_id=v_event_id)
    OR ev->>'org' IS DISTINCT FROM 'ufc' OR ev->>'sport' IS DISTINCT FROM 'mma'
    OR v_observed IS NULL OR v_observed > now()+interval '1 minute'
    OR v_observed < now()-interval '15 minutes'
    OR COALESCE(batch_param->>'snapshot_hash','') !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(batch_param->'fights') IS DISTINCT FROM 'array'
    OR jsonb_array_length(batch_param->'fights') NOT BETWEEN 1 AND 40
    OR jsonb_typeof(batch_param->'fighters') IS DISTINCT FROM 'array'
    OR jsonb_array_length(batch_param->'fighters') NOT BETWEEN 1 AND 80
    OR ev->>'name' IS NULL OR char_length(ev->>'name') NOT BETWEEN 1 AND 200
    OR ev->>'provider_slug' IS NULL OR ev->>'starts_at' IS NULL
    OR ev->>'status' IS NULL OR ev->>'status' NOT IN ('announced','scheduled','live','completed','cancelled','postponed') THEN
    RAISE EXCEPTION 'Invalid registered UFC batch.' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('mma-event:'||v_id,0));
  SELECT * INTO v_old FROM public.mma_events WHERE tournament_id=v_id FOR UPDATE;
  v_rules:=COALESCE(v_old.rules_version,'mma-winner-method-v2');
  IF v_old.tournament_id IS NULL AND ((ev->>'starts_at')::timestamptz AT TIME ZONE 'UTC')::date
    IS DISTINCT FROM (SELECT (published_start_at AT TIME ZONE 'UTC')::date FROM tipovacka_private.mma_event_catalog WHERE provider_event_id=v_event_id) THEN
    RAISE EXCEPTION 'Unexpected first MMA event date.' USING ERRCODE='22023';
  END IF;
  IF v_old.source_observed_at > v_observed THEN
    RAISE EXCEPTION 'Older MMA observation rejected.' USING ERRCODE='40001';
  END IF;
  IF v_old.source_observed_at = v_observed AND v_old.snapshot_hash <> batch_param->>'snapshot_hash' THEN
    RAISE EXCEPTION 'Conflicting MMA observation.' USING ERRCODE='40001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mma_fights old WHERE old.tournament_id=v_id
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(batch_param->'fights') f WHERE f->>'id'=old.id)) THEN
    RAISE EXCEPTION 'Known MMA fight disappeared from the full card.' USING ERRCODE='40001';
  END IF;
  IF (SELECT count(DISTINCT f->>'id') FROM jsonb_array_elements(batch_param->'fighters') f)
      <> jsonb_array_length(batch_param->'fighters')
    OR (SELECT count(DISTINCT f->>'id') FROM jsonb_array_elements(batch_param->'fights') f)
      <> jsonb_array_length(batch_param->'fights') THEN
    RAISE EXCEPTION 'Duplicate MMA identities.' USING ERRCODE='22023';
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(batch_param->'fights') LOOP
    IF item->>'id' IS DISTINCT FROM 'ufcal-fight-'||(item->>'provider_fight_id')
      OR (item->>'provider_fight_id')::bigint <= 0
      OR item->>'status' IS NULL OR item->>'status' NOT IN ('scheduled','finished','draw','void','cancelled','awaiting_result')
      OR item->>'card_section' IS NULL OR item->>'card_section' NOT IN ('main','prelims','early_prelims','unknown')
      OR (item->>'ordering')::integer NOT BETWEEN 1 AND 100
      OR ((item->>'fighter_a_id') IS NOT NULL AND NOT EXISTS
        (SELECT 1 FROM jsonb_array_elements(batch_param->'fighters') f WHERE f->>'id'=item->>'fighter_a_id'))
      OR ((item->>'fighter_b_id') IS NOT NULL AND NOT EXISTS
        (SELECT 1 FROM jsonb_array_elements(batch_param->'fighters') f WHERE f->>'id'=item->>'fighter_b_id'))
      OR (item->>'status'='finished' AND (item->>'winner_fighter_id' IS NULL
        OR item->>'fighter_a_id' IS NULL OR item->>'fighter_b_id' IS NULL
        OR item->>'winner_fighter_id' NOT IN (item->>'fighter_a_id',item->>'fighter_b_id')))
      OR (item->>'method_normalized' IS NOT NULL AND item->>'method_normalized' NOT IN
        ('ko_tko','submission','technical_submission','decision_unanimous','decision_split','decision_majority','decision','draw','no_contest','dq','other'))
      OR (item->>'status'='scheduled' AND item->>'method_normalized' IS NOT NULL)
      OR (item->>'method_normalized'='draw' AND item->>'status'<>'draw')
      OR (item->>'method_normalized'='no_contest' AND item->>'status'<>'void')
      OR (item->>'status'='draw' AND item->>'method_normalized' IS NOT NULL AND item->>'method_normalized'<>'draw')
      OR (item->>'status'='void' AND item->>'method_normalized' IS NOT NULL AND item->>'method_normalized'<>'no_contest')
      OR (item->>'status'<>'finished' AND item->>'winner_fighter_id' IS NOT NULL) THEN
      RAISE EXCEPTION 'Invalid MMA fight.' USING ERRCODE='22023';
    END IF;
    SELECT * INTO previous FROM public.mma_fights WHERE id=item->>'id';
    IF previous.id IS NOT NULL AND (previous.tournament_id<>v_id
      OR previous.provider_fight_id<>(item->>'provider_fight_id')::bigint) THEN
      RAISE EXCEPTION 'MMA fight identity conflict.' USING ERRCODE='23514';
    END IF;
    IF previous.status IN ('finished','draw','void') AND item->>'status' IN ('scheduled','awaiting_result') THEN
      RAISE EXCEPTION 'Settled MMA result cannot silently become pending.' USING ERRCODE='40001';
    END IF;
    IF previous.status='finished' AND item->>'status'='finished' AND previous.method_normalized IS NOT NULL
      AND item->>'method_normalized' IS NULL THEN
      RAISE EXCEPTION 'Verified MMA finish cannot silently disappear.' USING ERRCODE='40001';
    END IF;
  END LOOP;
  IF COALESCE(dry_run_param,true) THEN RETURN jsonb_build_object('tournament_id',v_id,'dry_run',true,'wrote_to_db',false,
    'fights',jsonb_array_length(batch_param->'fights'),'fighters',jsonb_array_length(batch_param->'fighters')); END IF;

  SELECT season_year INTO v_season FROM tipovacka_private.mma_event_catalog WHERE provider_event_id=v_event_id;
  v_season_id:='ufc-'||v_season;
  INSERT INTO public.tournaments(id,sport_id,slug,name,status,external_id)
    VALUES(v_season_id,'mma',v_season_id,'UFC '||v_season,'active','ufc-season-'||v_season)
    ON CONFLICT(id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.tournaments WHERE id=v_season_id AND sport_id='mma' AND external_id='ufc-season-'||v_season) THEN
    RAISE EXCEPTION 'UFC season identity conflict.' USING ERRCODE='23514'; END IF;
  INSERT INTO public.mma_seasons(tournament_id,season_year) VALUES(v_season_id,v_season) ON CONFLICT DO NOTHING;
  INSERT INTO public.sports(id,slug,name,icon,is_active) VALUES('mma','mma','MMA','mma',true)
    ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.tournaments(id,sport_id,slug,name,status,external_id)
    VALUES(v_id,'mma',v_id,ev->>'name','hidden',v_event_id::text)
    ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,status=EXCLUDED.status
      WHERE public.tournaments.sport_id='mma' AND public.tournaments.external_id=v_event_id::text;
  IF NOT FOUND THEN RAISE EXCEPTION 'MMA tournament identity conflict.' USING ERRCODE='23514'; END IF;
  v_lock := CASE WHEN v_old.lock_time_utc <= now() THEN v_old.lock_time_utc ELSE (ev->>'starts_at')::timestamptz END;
  INSERT INTO public.mma_events(tournament_id,season_tournament_id,provider_event_id,provider_slug,starts_at,main_card_at,lock_time_utc,status,source_observed_at,snapshot_hash)
    VALUES(v_id,v_season_id,v_event_id,ev->>'provider_slug',(ev->>'starts_at')::timestamptz,
      NULLIF(ev->>'main_card_at','')::timestamptz,v_lock,ev->>'status',v_observed,batch_param->>'snapshot_hash')
    ON CONFLICT(tournament_id) DO UPDATE SET provider_slug=EXCLUDED.provider_slug,starts_at=EXCLUDED.starts_at,
      main_card_at=EXCLUDED.main_card_at,lock_time_utc=EXCLUDED.lock_time_utc,status=EXCLUDED.status,
      source_observed_at=EXCLUDED.source_observed_at,snapshot_hash=EXCLUDED.snapshot_hash
      WHERE public.mma_events.provider_event_id=EXCLUDED.provider_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MMA event identity conflict.' USING ERRCODE='23514'; END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(batch_param->'fighters') LOOP
    INSERT INTO public.mma_fighters(id,name,country_code)
      VALUES((item->>'id')::bigint,item->>'name',NULLIF(item->>'country_code',''))
      ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,country_code=EXCLUDED.country_code;
  END LOOP;
  FOR item IN SELECT * FROM jsonb_array_elements(batch_param->'fights') LOOP
    SELECT * INTO previous FROM public.mma_fights WHERE id=item->>'id' FOR UPDATE;
    IF previous.id IS NOT NULL AND (previous.tournament_id<>v_id
      OR previous.provider_fight_id<>(item->>'provider_fight_id')::bigint) THEN
      RAISE EXCEPTION 'MMA fight identity conflict.' USING ERRCODE='23514';
    END IF;
    IF previous.status IN ('finished','draw','void') AND item->>'status' IN ('scheduled','awaiting_result') THEN
      RAISE EXCEPTION 'Settled MMA result cannot silently become pending.' USING ERRCODE='40001';
    END IF;
    v_version := COALESCE(previous.lineup_version,1);
    IF previous.id IS NOT NULL AND ((previous.fighter_a_id,previous.fighter_b_id) IS DISTINCT FROM
      ((item->>'fighter_a_id')::bigint,(item->>'fighter_b_id')::bigint)
      OR (previous.status='cancelled') IS DISTINCT FROM (item->>'status'='cancelled')) THEN v_version:=v_version+1; END IF;
    INSERT INTO public.mma_fights(id,tournament_id,provider_fight_id,fighter_a_id,fighter_b_id,ordering,
      card_section,weight_class,scheduled_rounds,status,winner_fighter_id,method,method_normalized,finish_round,lineup_version)
    VALUES(item->>'id',v_id,(item->>'provider_fight_id')::bigint,(item->>'fighter_a_id')::bigint,
      (item->>'fighter_b_id')::bigint,(item->>'ordering')::integer,item->>'card_section',item->>'weight_class',
      (item->>'scheduled_rounds')::integer,item->>'status',(item->>'winner_fighter_id')::bigint,
      item->>'method',item->>'method_normalized',(item->>'finish_round')::integer,v_version)
    ON CONFLICT(id) DO UPDATE SET fighter_a_id=EXCLUDED.fighter_a_id,fighter_b_id=EXCLUDED.fighter_b_id,
      ordering=EXCLUDED.ordering,card_section=EXCLUDED.card_section,weight_class=EXCLUDED.weight_class,
      scheduled_rounds=EXCLUDED.scheduled_rounds,status=EXCLUDED.status,winner_fighter_id=EXCLUDED.winner_fighter_id,
      method=EXCLUDED.method,method_normalized=EXCLUDED.method_normalized,finish_round=EXCLUDED.finish_round,lineup_version=EXCLUDED.lineup_version;
  END LOOP;
  UPDATE public.mma_predictions p SET points_earned=tipovacka_private.mma_prediction_points(v_rules,p.predicted_winner_id,f.winner_fighter_id,f.status,p.lineup_version,f.lineup_version,p.predicted_method,f.method_normalized)
    FROM public.mma_fights f WHERE p.fight_id=f.id AND f.tournament_id=v_id
    AND p.points_earned IS DISTINCT FROM tipovacka_private.mma_prediction_points(v_rules,p.predicted_winner_id,f.winner_fighter_id,f.status,p.lineup_version,f.lineup_version,p.predicted_method,f.method_normalized);
  GET DIAGNOSTICS v_points=ROW_COUNT;
  v_next := now()+CASE WHEN now() BETWEEN v_lock-interval '6 hours' AND v_lock+interval '12 hours'
    AND ev->>'status'<>'completed' THEN interval '15 minutes'
    WHEN now() BETWEEN v_lock-interval '7 days' AND v_lock+interval '72 hours' THEN interval '6 hours'
    WHEN now()<v_lock+interval '30 days' THEN interval '1 day' ELSE interval '30 days' END;
  INSERT INTO tipovacka_private.mma_sync_state(tournament_id,next_sync_at,last_success_at)
    VALUES(v_id,v_next,now()) ON CONFLICT(tournament_id) DO UPDATE SET next_sync_at=EXCLUDED.next_sync_at,last_success_at=EXCLUDED.last_success_at;
  SELECT count(*) INTO v_count FROM public.mma_fights WHERE tournament_id=v_id;
  RETURN jsonb_build_object('tournament_id',v_id,'dry_run',false,'wrote_to_db',true,'fights',v_count,'predictions_updated',v_points,'next_sync_at',v_next);
END;
$$;
REVOKE ALL ON FUNCTION public.sync_mma_event(jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_mma_event(jsonb,boolean) TO service_role;


CREATE OR REPLACE FUNCTION public.guard_mma_prediction() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE e public.mma_events%ROWTYPE; f public.mma_fights%ROWTYPE;
BEGIN
  -- Definer is needed only for row locks; players never receive UPDATE on sports facts.
  IF auth.jwt()->>'role' = 'service_role' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.user_id,NEW.lobby_id,NEW.fight_id,NEW.created_at)
    IS DISTINCT FROM (OLD.user_id,OLD.lobby_id,OLD.fight_id,OLD.created_at) THEN
    RAISE EXCEPTION 'Prediction context is immutable.' USING ERRCODE='42501';
  END IF;
  -- Same lock order as the importer; a concurrent card/result update cannot race this save.
  SELECT event.* INTO e FROM public.mma_events event JOIN public.mma_fights fight
    ON fight.tournament_id=event.tournament_id WHERE fight.id=NEW.fight_id FOR SHARE OF event;
  SELECT * INTO f FROM public.mma_fights WHERE id=NEW.fight_id FOR SHARE;
  IF e.tournament_id IS NULL OR f.id IS NULL OR e.lock_time_utc <= clock_timestamp()
    OR e.status NOT IN ('announced','scheduled') OR f.status <> 'scheduled'
    OR NEW.user_id IS DISTINCT FROM public.current_player_id()
    OR NOT public.is_lobby_member(NEW.lobby_id)
    OR NOT EXISTS (SELECT 1 FROM public.lobby_tournaments lt WHERE lt.lobby_id=NEW.lobby_id
      AND lt.tournament_id IN(e.tournament_id,e.season_tournament_id) AND lt.status='active') THEN
    RAISE EXCEPTION 'This MMA prediction is not open.' USING ERRCODE='42501';
  END IF;
  IF NEW.lineup_version <> f.lineup_version OR f.fighter_a_id IS NULL OR f.fighter_b_id IS NULL
    OR NEW.predicted_winner_id NOT IN (f.fighter_a_id,f.fighter_b_id) THEN
    RAISE EXCEPTION 'Fight card changed. Refresh before predicting.' USING ERRCODE='40001';
  END IF;
  IF NEW.predicted_method IS NOT NULL AND (e.rules_version<>'mma-winner-method-v2'
    OR NEW.predicted_method NOT IN('ko_tko','submission','decision')) THEN
    RAISE EXCEPTION 'Finish-method prediction is not supported for this card.' USING ERRCODE='22023';
  END IF;
  IF (TG_OP='INSERT' AND NEW.points_earned <> 0)
    OR (TG_OP='UPDATE' AND NEW.points_earned IS DISTINCT FROM OLD.points_earned) THEN
    RAISE EXCEPTION 'Points are server-managed.' USING ERRCODE='42501';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_mma_prediction() FROM PUBLIC,anon,authenticated;
