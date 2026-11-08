-- One annual UFC competition contains immutable, individually identifiable cards.
-- Predictions remain keyed by lobby/fight/player; no picks or points are copied.
INSERT INTO public.sports(id,slug,name,icon,is_active) VALUES('mma','mma','MMA','mma',true) ON CONFLICT(id) DO NOTHING;
CREATE TABLE public.mma_seasons (
  tournament_id text PRIMARY KEY REFERENCES public.tournaments(id) ON DELETE RESTRICT,
  season_year integer NOT NULL UNIQUE CHECK (season_year BETWEEN 2026 AND 2100),
  organization text NOT NULL DEFAULT 'ufc' CHECK (organization='ufc'),
  CHECK (tournament_id='ufc-'||season_year::text)
);
ALTER TABLE public.mma_seasons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mma_seasons FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.mma_seasons TO authenticated;
GRANT ALL ON public.mma_seasons TO service_role;
CREATE POLICY mma_seasons_read ON public.mma_seasons FOR SELECT TO authenticated USING(true);

CREATE TABLE tipovacka_private.mma_event_catalog (
  provider_event_id bigint PRIMARY KEY CHECK(provider_event_id>0),
  tournament_id text NOT NULL UNIQUE,
  season_year integer NOT NULL CHECK(season_year BETWEEN 2026 AND 2100),
  published_start_at timestamptz NOT NULL,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  CHECK(tournament_id=CASE provider_event_id WHEN 2563 THEN 'ufc-334-2026'
    WHEN 3533 THEN 'ufc-qatar-2026-11-21' ELSE 'ufcal-event-'||provider_event_id::text END)
);
CREATE TABLE tipovacka_private.mma_discovery_state (
  organization text PRIMARY KEY CHECK(organization='ufc'),
  next_attempt_at timestamptz NOT NULL,
  claim_token uuid,
  lease_until timestamptz,
  CHECK((claim_token IS NULL)=(lease_until IS NULL))
);
ALTER TABLE tipovacka_private.mma_event_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipovacka_private.mma_discovery_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tipovacka_private.mma_event_catalog,tipovacka_private.mma_discovery_state FROM PUBLIC,anon,authenticated;
INSERT INTO tipovacka_private.mma_discovery_state VALUES('ufc',now(),NULL,NULL);
INSERT INTO tipovacka_private.mma_event_catalog(provider_event_id,tournament_id,season_year,published_start_at)
  SELECT provider_event_id,tournament_id,extract(year FROM starts_at AT TIME ZONE 'UTC')::integer,starts_at FROM public.mma_events;
INSERT INTO public.tournaments(id,sport_id,slug,name,status,external_id)
  SELECT DISTINCT 'ufc-'||season_year,'mma','ufc-'||season_year,'UFC '||season_year,'active','ufc-season-'||season_year
  FROM tipovacka_private.mma_event_catalog;
INSERT INTO public.mma_seasons(tournament_id,season_year)
  SELECT DISTINCT 'ufc-'||season_year,season_year FROM tipovacka_private.mma_event_catalog;
ALTER TABLE public.mma_events ADD COLUMN season_tournament_id text REFERENCES public.mma_seasons(tournament_id) ON DELETE RESTRICT;
UPDATE public.mma_events e SET season_tournament_id='ufc-'||c.season_year
  FROM tipovacka_private.mma_event_catalog c WHERE c.provider_event_id=e.provider_event_id;
ALTER TABLE public.mma_events ALTER COLUMN season_tournament_id SET NOT NULL;
CREATE INDEX mma_events_season_idx ON public.mma_events(season_tournament_id,starts_at);
ALTER TABLE public.mma_events DROP CONSTRAINT mma_events_provider_event_id_check;
ALTER TABLE public.mma_events ADD CONSTRAINT mma_events_provider_event_id_check CHECK(provider_event_id>0);

-- Collapse pilot attachments; retain legacy event relationships as archived history.
INSERT INTO public.lobby_tournaments(lobby_id,tournament_id,status)
  SELECT DISTINCT lt.lobby_id,e.season_tournament_id,'active' FROM public.lobby_tournaments lt
    JOIN public.mma_events e ON e.tournament_id=lt.tournament_id WHERE lt.status='active'
  ON CONFLICT(lobby_id,tournament_id) DO UPDATE SET status='active';
UPDATE public.lobby_tournaments lt SET status='archived'
  WHERE EXISTS(SELECT 1 FROM public.mma_events e WHERE e.tournament_id=lt.tournament_id);
UPDATE public.lobbies l SET tournament_id=e.season_tournament_id
  FROM public.mma_events e WHERE l.tournament_id=e.tournament_id;
UPDATE public.tournaments t SET status='hidden' WHERE EXISTS(SELECT 1 FROM public.mma_events e WHERE e.tournament_id=t.id);

CREATE FUNCTION public.claim_mma_discovery() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_token uuid:=gen_random_uuid(); v_month date:=date_trunc('month',now() AT TIME ZONE 'UTC')::date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('mma-sync-claim',0));
  IF NOT EXISTS(SELECT 1 FROM tipovacka_private.mma_discovery_state WHERE organization='ufc' AND next_attempt_at<=now()) THEN RETURN NULL; END IF;
  INSERT INTO tipovacka_private.mma_api_budget(month,reserved_requests) VALUES(v_month,0) ON CONFLICT DO NOTHING;
  UPDATE tipovacka_private.mma_api_budget SET reserved_requests=reserved_requests+1 WHERE month=v_month AND reserved_requests<900;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE tipovacka_private.mma_discovery_state SET next_attempt_at=now()+interval '6 hours',
    claim_token=v_token,lease_until=now()+interval '15 minutes' WHERE organization='ufc';
  RETURN v_token;
END $$;
REVOKE ALL ON FUNCTION public.claim_mma_discovery() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mma_discovery() TO service_role;

CREATE FUNCTION public.complete_mma_discovery(p_token uuid,p_events jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb; v_id bigint; v_start timestamptz; v_count integer:=0;
  v_today timestamptz:=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  PERFORM 1 FROM tipovacka_private.mma_discovery_state WHERE organization='ufc'
    AND claim_token=p_token AND lease_until>=now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expired MMA discovery lease.' USING ERRCODE='40001'; END IF;
  IF jsonb_typeof(p_events) IS DISTINCT FROM 'array' OR jsonb_array_length(p_events)>100 THEN
    RAISE EXCEPTION 'Invalid MMA discovery.' USING ERRCODE='22023'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p_events) LOOP
    v_id:=(item->>'provider_event_id')::bigint; v_start:=(item->>'starts_at')::timestamptz;
    IF v_id IS NULL OR v_id<=0 OR v_start IS NULL OR item->>'org' IS DISTINCT FROM 'ufc'
      OR item->>'sport' IS DISTINCT FROM 'mma' OR v_start<v_today-interval '1 day'
      OR v_start>=v_today+interval '43 days' THEN
      RAISE EXCEPTION 'Invalid discovered UFC identity/date.' USING ERRCODE='22023'; END IF;
    INSERT INTO tipovacka_private.mma_event_catalog(provider_event_id,tournament_id,season_year,published_start_at)
      VALUES(v_id,CASE v_id WHEN 2563 THEN 'ufc-334-2026' WHEN 3533 THEN 'ufc-qatar-2026-11-21'
        ELSE 'ufcal-event-'||v_id::text END,extract(year FROM v_start AT TIME ZONE 'UTC')::integer,v_start)
      ON CONFLICT(provider_event_id) DO UPDATE SET published_start_at=EXCLUDED.published_start_at;
    v_count:=v_count+1;
  END LOOP;
  UPDATE tipovacka_private.mma_discovery_state SET next_attempt_at=now()+interval '1 day',claim_token=NULL,lease_until=NULL
    WHERE organization='ufc';
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.complete_mma_discovery(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_mma_discovery(uuid,jsonb) TO service_role;

CREATE FUNCTION public.list_mma_sync_targets(p_due_only boolean DEFAULT true)
RETURNS TABLE(tournament_id text,provider_event_id bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT c.tournament_id,c.provider_event_id FROM tipovacka_private.mma_event_catalog c
    LEFT JOIN tipovacka_private.mma_sync_state s ON s.tournament_id=c.tournament_id
    LEFT JOIN public.mma_events e ON e.tournament_id=c.tournament_id
  WHERE NOT p_due_only OR COALESCE(s.next_sync_at,c.next_attempt_at)<=now()
  ORDER BY CASE WHEN e.status IN('announced','scheduled','live') AND e.starts_at BETWEEN now()-interval '12 hours' AND now()+interval '6 hours'
    THEN 0 WHEN e.tournament_id IS NULL THEN 1 ELSE 2 END,COALESCE(s.next_sync_at,c.next_attempt_at),c.provider_event_id
  LIMIT 2;
$$;
REVOKE ALL ON FUNCTION public.list_mma_sync_targets(boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_mma_sync_targets(boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_mma_sync(p_tournament_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_month date:=date_trunc('month',now() AT TIME ZONE 'UTC')::date; v_retry timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('mma-sync-claim',0));
  IF NOT EXISTS(SELECT 1 FROM tipovacka_private.mma_event_catalog c LEFT JOIN tipovacka_private.mma_sync_state s ON s.tournament_id=c.tournament_id
    WHERE c.tournament_id=p_tournament_id AND COALESCE(s.next_sync_at,c.next_attempt_at)<=now()) THEN RETURN false; END IF;
  INSERT INTO tipovacka_private.mma_api_budget(month,reserved_requests) VALUES(v_month,0) ON CONFLICT DO NOTHING;
  UPDATE tipovacka_private.mma_api_budget SET reserved_requests=reserved_requests+1 WHERE month=v_month AND reserved_requests<900;
  IF NOT FOUND THEN RETURN false; END IF;
  -- A distant, announced card may have no bouts yet. Failures/pending cards must not poll every 15 minutes all month.
  SELECT now()+CASE WHEN published_start_at BETWEEN now()-interval '12 hours' AND now()+interval '6 hours' THEN interval '15 minutes'
    WHEN published_start_at BETWEEN now()-interval '72 hours' AND now()+interval '7 days' THEN interval '6 hours'
    ELSE interval '1 day' END INTO v_retry FROM tipovacka_private.mma_event_catalog WHERE tournament_id=p_tournament_id;
  UPDATE tipovacka_private.mma_event_catalog SET next_attempt_at=v_retry WHERE tournament_id=p_tournament_id;
  UPDATE tipovacka_private.mma_sync_state SET last_attempt_at=now(),next_sync_at=v_retry WHERE tournament_id=p_tournament_id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.sync_mma_event(batch_param jsonb,dry_run_param boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  ev jsonb := batch_param->'event'; item jsonb; previous public.mma_fights%ROWTYPE;
  v_id text := ev->>'tournament_id'; v_event_id bigint := (ev->>'provider_event_id')::bigint;
  v_observed timestamptz := (batch_param->>'observed_at')::timestamptz;
  v_old public.mma_events%ROWTYPE; v_lock timestamptz; v_version integer; v_points integer := 0;
  v_next timestamptz; v_count integer; v_season integer; v_season_id text;
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
      card_section,weight_class,scheduled_rounds,status,winner_fighter_id,method,finish_round,lineup_version)
    VALUES(item->>'id',v_id,(item->>'provider_fight_id')::bigint,(item->>'fighter_a_id')::bigint,
      (item->>'fighter_b_id')::bigint,(item->>'ordering')::integer,item->>'card_section',item->>'weight_class',
      (item->>'scheduled_rounds')::integer,item->>'status',(item->>'winner_fighter_id')::bigint,
      item->>'method',(item->>'finish_round')::integer,v_version)
    ON CONFLICT(id) DO UPDATE SET fighter_a_id=EXCLUDED.fighter_a_id,fighter_b_id=EXCLUDED.fighter_b_id,
      ordering=EXCLUDED.ordering,card_section=EXCLUDED.card_section,weight_class=EXCLUDED.weight_class,
      scheduled_rounds=EXCLUDED.scheduled_rounds,status=EXCLUDED.status,winner_fighter_id=EXCLUDED.winner_fighter_id,
      method=EXCLUDED.method,finish_round=EXCLUDED.finish_round,lineup_version=EXCLUDED.lineup_version;
  END LOOP;
  UPDATE public.mma_predictions p SET points_earned=CASE WHEN p.lineup_version=f.lineup_version
    AND f.status='finished' AND p.predicted_winner_id=f.winner_fighter_id THEN 1 ELSE 0 END
    FROM public.mma_fights f WHERE p.fight_id=f.id AND f.tournament_id=v_id
    AND p.points_earned IS DISTINCT FROM (CASE WHEN p.lineup_version=f.lineup_version
      AND f.status='finished' AND p.predicted_winner_id=f.winner_fighter_id THEN 1 ELSE 0 END);
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
  IF (TG_OP='INSERT' AND NEW.points_earned <> 0)
    OR (TG_OP='UPDATE' AND NEW.points_earned IS DISTINCT FROM OLD.points_earned) THEN
    RAISE EXCEPTION 'Points are server-managed.' USING ERRCODE='42501';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_mma_prediction() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_mma_lobby_leaderboard(p_lobby_id text,p_tournament_id text)
RETURNS TABLE(user_id uuid,username text,avatar_emoji text,avatar_bg text,points bigint,predictions_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_season text;
BEGIN
  SELECT e.season_tournament_id INTO v_season FROM public.mma_events e WHERE e.tournament_id=p_tournament_id;
  IF public.current_player_id() IS NULL OR NOT public.is_lobby_member(p_lobby_id)
    OR NOT EXISTS(SELECT 1 FROM public.lobby_tournaments lt WHERE lt.lobby_id=p_lobby_id
      AND lt.tournament_id IN(p_tournament_id,v_season) AND lt.status='active') THEN
    RAISE EXCEPTION 'Lobby access denied.' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT m.user_id,p.username,p.avatar_emoji,p.avatar_bg,
    COALESCE(sum(pick.points_earned) FILTER(WHERE e.tournament_id=p_tournament_id OR e.season_tournament_id=p_tournament_id),0)::bigint,
    count(pick.fight_id) FILTER(WHERE e.tournament_id=p_tournament_id OR e.season_tournament_id=p_tournament_id)::bigint
  FROM public.lobby_members m JOIN public.profiles p ON p.id=m.user_id
    LEFT JOIN public.mma_predictions pick ON pick.user_id=m.user_id AND pick.lobby_id=p_lobby_id
    LEFT JOIN public.mma_fights f ON f.id=pick.fight_id LEFT JOIN public.mma_events e ON e.tournament_id=f.tournament_id
  WHERE m.lobby_id=p_lobby_id AND m.membership_status='active'
  GROUP BY m.user_id,p.username,p.avatar_emoji,p.avatar_bg ORDER BY 5 DESC,p.username,m.user_id;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_mma_home()
RETURNS TABLE(lobby_id text,tournament_id text,missing_count bigint,urgent_count bigint,next_lock timestamptz,
  open_count bigint,fight_count bigint,settled_count bigint,event_status text,event_starts_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  WITH contexts AS (
    SELECT lt.lobby_id,lt.tournament_id,e.tournament_id AS event_id,s.season_year
    FROM public.lobby_tournaments lt JOIN public.mma_seasons s ON s.tournament_id=lt.tournament_id
      JOIN public.mma_events e ON e.season_tournament_id=s.tournament_id
    WHERE lt.status='active' AND public.is_lobby_member(lt.lobby_id)
    UNION ALL
    SELECT lt.lobby_id,lt.tournament_id,e.tournament_id,NULL::integer
    FROM public.lobby_tournaments lt JOIN public.mma_events e ON e.tournament_id=lt.tournament_id
    WHERE lt.status='active' AND public.is_lobby_member(lt.lobby_id) AND NOT EXISTS(
      SELECT 1 FROM public.lobby_tournaments parent WHERE parent.lobby_id=lt.lobby_id
        AND parent.tournament_id=e.season_tournament_id AND parent.status='active')
  )
  SELECT c.lobby_id,c.tournament_id,
    count(f.id) FILTER(WHERE e.lock_time_utc>now() AND e.status IN('announced','scheduled') AND f.status='scheduled'
      AND f.fighter_a_id IS NOT NULL AND f.fighter_b_id IS NOT NULL AND (p.fight_id IS NULL OR p.lineup_version<>f.lineup_version)),
    count(f.id) FILTER(WHERE e.lock_time_utc>now() AND e.lock_time_utc<=now()+interval '48 hours'
      AND e.status IN('announced','scheduled') AND f.status='scheduled' AND f.fighter_a_id IS NOT NULL AND f.fighter_b_id IS NOT NULL
      AND (p.fight_id IS NULL OR p.lineup_version<>f.lineup_version)),
    min(e.lock_time_utc) FILTER(WHERE e.lock_time_utc>now() AND e.status IN('announced','scheduled') AND f.status='scheduled'
      AND f.fighter_a_id IS NOT NULL AND f.fighter_b_id IS NOT NULL AND (p.fight_id IS NULL OR p.lineup_version<>f.lineup_version)),
    count(f.id) FILTER(WHERE e.lock_time_utc>now() AND e.status IN('announced','scheduled') AND f.status='scheduled'
      AND f.fighter_a_id IS NOT NULL AND f.fighter_b_id IS NOT NULL),
    count(f.id),count(f.id) FILTER(WHERE f.status IN('finished','draw','void','cancelled')),
    CASE WHEN (max(c.season_year) IS NULL OR max(c.season_year)<extract(year FROM now() AT TIME ZONE 'UTC'))
      AND bool_and(e.status IN('completed','cancelled')) THEN 'completed' ELSE 'scheduled' END,
    COALESCE(min(e.starts_at) FILTER(WHERE e.lock_time_utc>now() AND e.status IN('announced','scheduled')),max(e.starts_at))
  FROM contexts c JOIN public.mma_events e ON e.tournament_id=c.event_id
    LEFT JOIN public.mma_fights f ON f.tournament_id=e.tournament_id
    LEFT JOIN public.mma_predictions p ON p.fight_id=f.id AND p.lobby_id=c.lobby_id AND p.user_id=public.current_player_id()
  GROUP BY c.lobby_id,c.tournament_id;
$$;

-- The competition picker must count MMA bouts instead of reporting a year with zero football matches.
CREATE OR REPLACE FUNCTION public.get_lobby_tournament_catalog(lobby_id_param text)
RETURNS TABLE(tournament_id text,tournament_name text,sport_id text,relation_status text,
  is_linked boolean,is_completed boolean,match_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF public.current_player_id() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE='42501'; END IF;
  IF NOT(public.is_lobby_member(lobby_id_param) OR public.is_admin()) THEN
    RAISE EXCEPTION 'Lobby membership required.' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT t.id,t.name,t.sport_id,lt.status,lt.id IS NOT NULL,
    CASE WHEN s.tournament_id IS NOT NULL THEN
      s.season_year<extract(year FROM now() AT TIME ZONE 'UTC')
      AND EXISTS(SELECT 1 FROM public.mma_events e WHERE e.season_tournament_id=t.id)
      AND NOT EXISTS(SELECT 1 FROM public.mma_events e WHERE e.season_tournament_id=t.id AND e.status NOT IN('completed','cancelled'))
    ELSE t.actual_tournament_winner_id IS NOT NULL
      AND EXISTS(SELECT 1 FROM public.matches m WHERE m.tournament_id=t.id)
      AND NOT EXISTS(SELECT 1 FROM public.matches m WHERE m.tournament_id=t.id AND (m.status<>'finished' OR m.home_score IS NULL OR m.away_score IS NULL)) END,
    CASE WHEN s.tournament_id IS NOT NULL THEN
      (SELECT count(*) FROM public.mma_fights f JOIN public.mma_events e ON e.tournament_id=f.tournament_id WHERE e.season_tournament_id=t.id)
    ELSE (SELECT count(*) FROM public.matches m WHERE m.tournament_id=t.id) END
  FROM public.tournaments t LEFT JOIN public.mma_seasons s ON s.tournament_id=t.id
    LEFT JOIN public.lobby_tournaments lt ON lt.lobby_id=lobby_id_param AND lt.tournament_id=t.id
  WHERE t.status<>'hidden' ORDER BY lt.id IS NULL,t.created_at DESC,t.name;
END $$;
