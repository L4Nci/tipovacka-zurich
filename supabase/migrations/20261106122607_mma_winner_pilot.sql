-- Winner-only MMA pilot. Independent predictions/results; never encode a winner as a goal score.
CREATE TABLE public.mma_fighters (
  id bigint PRIMARY KEY CHECK (id > 0),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  country_code text CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$')
);
CREATE TABLE public.mma_events (
  tournament_id text PRIMARY KEY REFERENCES public.tournaments(id) ON DELETE RESTRICT,
  provider_event_id bigint NOT NULL UNIQUE CHECK (provider_event_id IN (2563,3533)),
  provider_slug text NOT NULL,
  starts_at timestamptz NOT NULL,
  main_card_at timestamptz,
  lock_time_utc timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('announced','scheduled','live','completed','cancelled','postponed')),
  rules_version text NOT NULL DEFAULT 'mma-winner-v1' CHECK (rules_version = 'mma-winner-v1'),
  source_observed_at timestamptz NOT NULL,
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$')
);
CREATE TABLE public.mma_fights (
  id text PRIMARY KEY,
  tournament_id text NOT NULL REFERENCES public.mma_events(tournament_id) ON DELETE RESTRICT,
  provider_fight_id bigint NOT NULL UNIQUE CHECK (provider_fight_id > 0),
  fighter_a_id bigint REFERENCES public.mma_fighters(id),
  fighter_b_id bigint REFERENCES public.mma_fighters(id),
  ordering integer NOT NULL CHECK (ordering BETWEEN 1 AND 100),
  card_section text NOT NULL CHECK (card_section IN ('main','prelims','early_prelims','unknown')),
  weight_class text,
  scheduled_rounds integer CHECK (scheduled_rounds IN (3,5)),
  status text NOT NULL CHECK (status IN ('scheduled','finished','draw','void','cancelled','awaiting_result')),
  winner_fighter_id bigint REFERENCES public.mma_fighters(id),
  method text,
  finish_round integer CHECK (finish_round BETWEEN 1 AND 5),
  lineup_version integer NOT NULL DEFAULT 1 CHECK (lineup_version > 0),
  CHECK (fighter_a_id IS NULL OR fighter_b_id IS NULL OR fighter_a_id <> fighter_b_id),
  CHECK ((status = 'finished' AND fighter_a_id IS NOT NULL AND fighter_b_id IS NOT NULL
      AND winner_fighter_id IS NOT NULL AND winner_fighter_id IN (fighter_a_id,fighter_b_id))
    OR (status <> 'finished' AND winner_fighter_id IS NULL))
);
CREATE INDEX mma_fights_event_idx ON public.mma_fights(tournament_id,ordering);
CREATE TABLE public.mma_predictions (
  lobby_id text NOT NULL REFERENCES public.lobbies(id) ON DELETE RESTRICT,
  fight_id text NOT NULL REFERENCES public.mma_fights(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  predicted_winner_id bigint NOT NULL REFERENCES public.mma_fighters(id),
  lineup_version integer NOT NULL CHECK (lineup_version > 0),
  points_earned integer NOT NULL DEFAULT 0 CHECK (points_earned IN (0,1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lobby_id,fight_id,user_id)
);
CREATE INDEX mma_predictions_user_idx ON public.mma_predictions(user_id,lobby_id);

ALTER TABLE public.mma_fighters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mma_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mma_fights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mma_predictions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mma_fighters,public.mma_events,public.mma_fights,public.mma_predictions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.mma_fighters,public.mma_events,public.mma_fights,public.mma_predictions TO authenticated;
GRANT INSERT,UPDATE ON public.mma_predictions TO authenticated;
GRANT ALL ON public.mma_fighters,public.mma_events,public.mma_fights,public.mma_predictions TO service_role;
CREATE POLICY mma_fighters_read ON public.mma_fighters FOR SELECT TO authenticated USING (true);
CREATE POLICY mma_events_read ON public.mma_events FOR SELECT TO authenticated USING (true);
CREATE POLICY mma_fights_read ON public.mma_fights FOR SELECT TO authenticated USING (true);
CREATE POLICY mma_predictions_read ON public.mma_predictions FOR SELECT TO authenticated
  USING (public.is_lobby_member(lobby_id));
CREATE POLICY mma_predictions_insert ON public.mma_predictions FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_player_id()) AND public.is_lobby_member(lobby_id));
CREATE POLICY mma_predictions_update ON public.mma_predictions FOR UPDATE TO authenticated
  USING (user_id = (SELECT public.current_player_id()) AND public.is_lobby_member(lobby_id))
  WITH CHECK (user_id = (SELECT public.current_player_id()) AND public.is_lobby_member(lobby_id));

CREATE FUNCTION public.guard_mma_prediction() RETURNS trigger
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
      AND lt.tournament_id=e.tournament_id AND lt.status='active') THEN
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
CREATE TRIGGER guard_mma_prediction BEFORE INSERT OR UPDATE ON public.mma_predictions
  FOR EACH ROW EXECUTE FUNCTION public.guard_mma_prediction();

CREATE TABLE tipovacka_private.mma_sync_state (
  tournament_id text PRIMARY KEY REFERENCES public.mma_events(tournament_id),
  next_sync_at timestamptz NOT NULL,
  last_attempt_at timestamptz,
  last_success_at timestamptz
);
CREATE TABLE tipovacka_private.mma_api_budget (
  month date PRIMARY KEY,
  reserved_requests integer NOT NULL CHECK (reserved_requests BETWEEN 0 AND 900)
);
ALTER TABLE tipovacka_private.mma_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipovacka_private.mma_api_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tipovacka_private.mma_sync_state,tipovacka_private.mma_api_budget FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.claim_mma_sync(p_tournament_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_month date := date_trunc('month',now() AT TIME ZONE 'UTC')::date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('mma-sync-claim',0));
  IF NOT EXISTS (SELECT 1 FROM tipovacka_private.mma_sync_state
    WHERE tournament_id=p_tournament_id AND next_sync_at <= now()) THEN RETURN false; END IF;
  INSERT INTO tipovacka_private.mma_api_budget(month,reserved_requests) VALUES(v_month,0) ON CONFLICT DO NOTHING;
  UPDATE tipovacka_private.mma_api_budget SET reserved_requests=reserved_requests+1
    WHERE month=v_month AND reserved_requests<900;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE tipovacka_private.mma_sync_state SET last_attempt_at=now(),next_sync_at=now()+interval '15 minutes'
    WHERE tournament_id=p_tournament_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_mma_sync(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mma_sync(text) TO service_role;

CREATE FUNCTION public.sync_mma_event(batch_param jsonb,dry_run_param boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  ev jsonb := batch_param->'event'; item jsonb; previous public.mma_fights%ROWTYPE;
  v_id text := ev->>'tournament_id'; v_event_id bigint := (ev->>'provider_event_id')::bigint;
  v_observed timestamptz := (batch_param->>'observed_at')::timestamptz;
  v_old public.mma_events%ROWTYPE; v_lock timestamptz; v_version integer; v_points integer := 0;
  v_next timestamptz; v_count integer;
BEGIN
  IF v_id IS NULL OR v_event_id IS NULL
    OR (v_id,v_event_id) NOT IN (('ufc-334-2026',2563),('ufc-qatar-2026-11-21',3533))
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
    RAISE EXCEPTION 'Invalid MMA pilot batch.' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('mma-event:'||v_id,0));
  SELECT * INTO v_old FROM public.mma_events WHERE tournament_id=v_id FOR UPDATE;
  IF v_old.tournament_id IS NULL AND ((ev->>'starts_at')::timestamptz AT TIME ZONE 'UTC')::date
    IS DISTINCT FROM (CASE v_event_id WHEN 2563 THEN date '2026-11-14' ELSE date '2026-11-21' END) THEN
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

  INSERT INTO public.sports(id,slug,name,icon,is_active) VALUES('mma','mma','MMA','mma',true)
    ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.tournaments(id,sport_id,slug,name,status,external_id)
    VALUES(v_id,'mma',v_id,ev->>'name',CASE WHEN ev->>'status'='completed' THEN 'finished' ELSE 'active' END,v_event_id::text)
    ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,status=EXCLUDED.status
      WHERE public.tournaments.sport_id='mma' AND public.tournaments.external_id=v_event_id::text;
  IF NOT FOUND THEN RAISE EXCEPTION 'MMA tournament identity conflict.' USING ERRCODE='23514'; END IF;
  v_lock := CASE WHEN v_old.lock_time_utc <= now() THEN v_old.lock_time_utc ELSE (ev->>'starts_at')::timestamptz END;
  INSERT INTO public.mma_events(tournament_id,provider_event_id,provider_slug,starts_at,main_card_at,lock_time_utc,status,source_observed_at,snapshot_hash)
    VALUES(v_id,v_event_id,ev->>'provider_slug',(ev->>'starts_at')::timestamptz,
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
  v_next := now()+CASE WHEN now() BETWEEN v_lock-interval '24 hours' AND v_lock+interval '16 hours'
    AND ev->>'status'<>'completed' THEN interval '15 minutes'
    WHEN now()<v_lock+interval '72 hours' THEN interval '6 hours'
    WHEN now()<v_lock+interval '30 days' THEN interval '1 day' ELSE interval '7 days' END;
  INSERT INTO tipovacka_private.mma_sync_state(tournament_id,next_sync_at,last_success_at)
    VALUES(v_id,v_next,now()) ON CONFLICT(tournament_id) DO UPDATE SET next_sync_at=EXCLUDED.next_sync_at,last_success_at=EXCLUDED.last_success_at;
  SELECT count(*) INTO v_count FROM public.mma_fights WHERE tournament_id=v_id;
  RETURN jsonb_build_object('tournament_id',v_id,'dry_run',false,'wrote_to_db',true,'fights',v_count,'predictions_updated',v_points,'next_sync_at',v_next);
END;
$$;
REVOKE ALL ON FUNCTION public.sync_mma_event(jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_mma_event(jsonb,boolean) TO service_role;

CREATE FUNCTION public.get_mma_lobby_leaderboard(p_lobby_id text,p_tournament_id text)
RETURNS TABLE(user_id uuid,username text,avatar_emoji text,avatar_bg text,points bigint,predictions_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.current_player_id() IS NULL OR NOT public.is_lobby_member(p_lobby_id)
    OR NOT EXISTS (SELECT 1 FROM public.lobby_tournaments WHERE lobby_id=p_lobby_id AND tournament_id=p_tournament_id) THEN
    RAISE EXCEPTION 'Lobby access denied.' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT m.user_id,p.username,p.avatar_emoji,p.avatar_bg,
    COALESCE(sum(CASE WHEN f.tournament_id=p_tournament_id THEN pick.points_earned ELSE 0 END),0)::bigint,
    count(pick.fight_id) FILTER(WHERE f.tournament_id=p_tournament_id)::bigint
    FROM public.lobby_members m JOIN public.profiles p ON p.id=m.user_id
    LEFT JOIN public.mma_predictions pick ON pick.user_id=m.user_id AND pick.lobby_id=p_lobby_id
    LEFT JOIN public.mma_fights f ON f.id=pick.fight_id
    WHERE m.lobby_id=p_lobby_id AND m.membership_status='active'
    GROUP BY m.user_id,p.username,p.avatar_emoji,p.avatar_bg
    ORDER BY 5 DESC,p.username,m.user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_mma_lobby_leaderboard(text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_mma_lobby_leaderboard(text,text) TO authenticated;

CREATE FUNCTION public.get_my_mma_home()
RETURNS TABLE(lobby_id text,tournament_id text,missing_count bigint,urgent_count bigint,next_lock timestamptz,
  open_count bigint,fight_count bigint,settled_count bigint,event_status text,event_starts_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT lt.lobby_id,e.tournament_id,
    count(f.id) FILTER(WHERE e.lock_time_utc>now() AND e.status IN ('announced','scheduled') AND f.status='scheduled'
      AND f.fighter_a_id IS NOT NULL AND f.fighter_b_id IS NOT NULL
      AND (p.fight_id IS NULL OR p.lineup_version<>f.lineup_version)),
    count(f.id) FILTER(WHERE e.lock_time_utc>now() AND e.lock_time_utc<=now()+interval '48 hours'
      AND e.status IN ('announced','scheduled') AND f.status='scheduled'
      AND f.fighter_a_id IS NOT NULL AND f.fighter_b_id IS NOT NULL
      AND (p.fight_id IS NULL OR p.lineup_version<>f.lineup_version)),
    min(e.lock_time_utc) FILTER(WHERE e.lock_time_utc>now() AND e.status IN ('announced','scheduled')
      AND f.status='scheduled' AND f.fighter_a_id IS NOT NULL AND f.fighter_b_id IS NOT NULL
      AND (p.fight_id IS NULL OR p.lineup_version<>f.lineup_version)),
    count(f.id) FILTER(WHERE e.lock_time_utc>now() AND e.status IN ('announced','scheduled')
      AND f.status='scheduled' AND f.fighter_a_id IS NOT NULL AND f.fighter_b_id IS NOT NULL),
    count(f.id),count(f.id) FILTER(WHERE f.status IN ('finished','draw','void','cancelled')),e.status,e.starts_at
  FROM public.lobby_tournaments lt JOIN public.mma_events e ON e.tournament_id=lt.tournament_id
  LEFT JOIN public.mma_fights f ON f.tournament_id=e.tournament_id
  LEFT JOIN public.mma_predictions p ON p.fight_id=f.id AND p.lobby_id=lt.lobby_id AND p.user_id=public.current_player_id()
  WHERE lt.status='active' AND public.is_lobby_member(lt.lobby_id)
  GROUP BY lt.lobby_id,e.tournament_id,e.status,e.starts_at;
$$;
REVOKE ALL ON FUNCTION public.get_my_mma_home() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_mma_home() TO authenticated;

-- Small shared read model: keep all missing picks attached to their lobby/competition.
CREATE FUNCTION public.get_my_pending_match_counts()
RETURNS TABLE(lobby_id text,tournament_id text,missing_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT lt.lobby_id,lt.tournament_id,count(m.id)
  FROM public.lobby_tournaments lt JOIN public.matches m ON m.tournament_id=lt.tournament_id
  LEFT JOIN public.predictions p ON p.match_id=m.id AND p.lobby_id=lt.lobby_id AND p.user_id=public.current_player_id()
  WHERE lt.status='active' AND public.is_lobby_member(lt.lobby_id) AND p.match_id IS NULL
    AND m.status='scheduled' AND m.home_score IS NULL AND m.away_score IS NULL AND m.lock_time_utc>now()
    AND m.home_participant_id !~* '(^|-)tba($|-)' AND m.away_participant_id !~* '(^|-)tba($|-)'
  GROUP BY lt.lobby_id,lt.tournament_id;
$$;
REVOKE ALL ON FUNCTION public.get_my_pending_match_counts() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_pending_match_counts() TO authenticated;
NOTIFY pgrst,'reload schema';
