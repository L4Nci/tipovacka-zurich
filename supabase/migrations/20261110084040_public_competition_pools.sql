-- Public entry reuses ordinary, isolated lobby predictions and existing sync.
-- No historical lobby is converted, no player is auto-enrolled, and no sports
-- facts, predictions, points, locks or Official/prize flags are changed.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';

CREATE TABLE tipovacka_private.public_competition_pools (
  slug text PRIMARY KEY CHECK (char_length(slug) BETWEEN 1 AND 80
    AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  lobby_id text NOT NULL UNIQUE REFERENCES public.lobbies(id) ON DELETE RESTRICT,
  tournament_id text NOT NULL UNIQUE REFERENCES public.tournaments(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  short_description text CHECK (char_length(short_description) <= 240),
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tipovacka_private.public_competition_pools ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tipovacka_private.public_competition_pools FROM PUBLIC, anon, authenticated;

INSERT INTO public.app_feature_flags(key,enabled,is_public)
VALUES ('public_competitions_enabled',false,true)
ON CONFLICT (key) DO NOTHING;

-- Registry membership is the only publication authority. In particular, the
-- underlying lobby stays private: ordinary public-lobby RLS exposes join codes.
CREATE FUNCTION tipovacka_private.public_competition_payload(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'slug',pool.slug,'name',pool.name,'short_description',pool.short_description,
    'tournament_id',t.id,'tournament_name',t.name,'sport_id',t.sport_id,
    'format',CASE WHEN season.tournament_id IS NULL THEN 'score' ELSE 'mma' END,
    'status',CASE WHEN t.status='finished' THEN 'closed'
      WHEN opportunities.next_lock_at IS NOT NULL THEN 'open' ELSE 'upcoming' END,
    'next_lock_at',opportunities.next_lock_at,
    'is_member',EXISTS (SELECT 1 FROM public.lobby_members member
      WHERE member.lobby_id=pool.lobby_id AND member.membership_status='active'
        AND member.user_id=public.current_player_id()),
    'participant_count',(SELECT count(*) FROM public.lobby_members member
      WHERE member.lobby_id=pool.lobby_id AND member.membership_status='active'
        AND member.user_id<>lobby.owner_id))
  FROM tipovacka_private.public_competition_pools pool
  JOIN public.lobbies lobby ON lobby.id=pool.lobby_id
  JOIN public.tournaments t ON t.id=pool.tournament_id
  JOIN public.sports sport ON sport.id=t.sport_id AND sport.is_active
  LEFT JOIN public.mma_seasons season ON season.tournament_id=t.id
  LEFT JOIN LATERAL (
    SELECT min(candidate.lock_at) AS next_lock_at FROM (
      SELECT match.lock_time_utc AS lock_at FROM public.matches match
      WHERE season.tournament_id IS NULL AND match.tournament_id=t.id
        AND match.status='scheduled' AND match.home_score IS NULL AND match.away_score IS NULL
        AND match.lock_time_utc>now()
        AND (match.provider_name IS DISTINCT FROM 'football-data.org' OR match.provider_status='TIMED')
      UNION ALL
      SELECT event.lock_time_utc FROM public.mma_events event
      WHERE event.season_tournament_id=season.tournament_id
        AND event.status IN ('announced','scheduled') AND event.lock_time_utc>now()
        AND EXISTS (SELECT 1 FROM public.mma_fights fight WHERE fight.tournament_id=event.tournament_id
          AND fight.status='scheduled' AND fight.fighter_a_id IS NOT NULL AND fight.fighter_b_id IS NOT NULL)
    ) candidate
  ) opportunities ON true
  WHERE pool.slug=p_slug AND pool.is_published AND t.status IN ('active','finished')
    AND lobby.visibility='private' AND lobby.join_policy='open'
    AND lobby.tournament_id=pool.tournament_id
    AND EXISTS (SELECT 1 FROM public.app_feature_flags flag
      WHERE flag.key='public_competitions_enabled' AND flag.enabled)
    AND EXISTS (SELECT 1 FROM public.lobby_tournaments link
      WHERE link.lobby_id=pool.lobby_id AND link.tournament_id=pool.tournament_id AND link.status='active')
    AND NOT EXISTS (SELECT 1 FROM public.lobby_tournaments link
      WHERE link.lobby_id=pool.lobby_id AND link.status='active' AND link.tournament_id<>pool.tournament_id);
$$;
REVOKE ALL ON FUNCTION tipovacka_private.public_competition_payload(text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_public_competitions()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(jsonb_agg(payload ORDER BY payload->>'name',payload->>'slug'),'[]'::jsonb)
  FROM (SELECT tipovacka_private.public_competition_payload(pool.slug) AS payload
    FROM tipovacka_private.public_competition_pools pool WHERE pool.is_published) entries
  WHERE payload IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.get_public_competitions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_competitions() TO anon,authenticated,service_role;

CREATE FUNCTION public.get_public_competition(p_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF p_slug IS NOT NULL AND char_length(p_slug) BETWEEN 1 AND 80 THEN
    result:=tipovacka_private.public_competition_payload(p_slug);
  END IF;
  IF result IS NULL THEN
    RAISE EXCEPTION 'Public competition not found.' USING ERRCODE='P0002';
  END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_public_competition(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_competition(text) TO anon,authenticated,service_role;

CREATE FUNCTION public.join_public_competition(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid:=public.current_player_id(); pool tipovacka_private.public_competition_pools%ROWTYPE;
  details jsonb; lobby public.lobbies%ROWTYPE; joined record;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Clerk account required.' USING ERRCODE='42501'; END IF;
  IF p_slug IS NULL OR char_length(p_slug) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Public competition not found.' USING ERRCODE='P0002';
  END IF;
  SELECT * INTO pool FROM tipovacka_private.public_competition_pools WHERE slug=p_slug FOR SHARE;
  details:=tipovacka_private.public_competition_payload(p_slug);
  IF pool.slug IS NULL OR details IS NULL THEN
    RAISE EXCEPTION 'Public competition not found.' USING ERRCODE='P0002';
  END IF;
  SELECT * INTO lobby FROM public.lobbies WHERE id=pool.lobby_id FOR SHARE;
  -- Existing participants may reopen finished results. New closed-season joins
  -- are refused; next year's competition requires its own explicit action.
  IF details->>'status'='closed' AND NOT EXISTS (SELECT 1 FROM public.lobby_members member
    WHERE member.lobby_id=pool.lobby_id AND member.user_id=caller AND member.membership_status='active') THEN
    RAISE EXCEPTION 'Public competition is closed.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO joined FROM public.join_lobby_secure(lobby.join_code);
  IF joined.membership_state='removed' THEN
    RETURN jsonb_build_object('slug',pool.slug,'membership_state','removed');
  END IF;
  IF joined.membership_state NOT IN ('joined','rejoined','already_member')
    OR NOT public.is_lobby_member(pool.lobby_id) THEN
    RAISE EXCEPTION 'Public competition access denied.' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('slug',pool.slug,'lobby_id',pool.lobby_id,
    'tournament_id',pool.tournament_id,'membership_state',joined.membership_state);
END;
$$;
REVOKE ALL ON FUNCTION public.join_public_competition(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.join_public_competition(text) TO authenticated;

-- These guards cover direct legacy lobby RPCs as well as the new public entry.
-- They do not alter any pre-existing/private lobby or existing member's picks.
CREATE FUNCTION tipovacka_private.guard_public_pool_lobby()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM tipovacka_private.public_competition_pools pool WHERE pool.lobby_id=OLD.id)
    AND (NEW.id,NEW.owner_id,NEW.tournament_id,NEW.visibility,NEW.join_policy)
      IS DISTINCT FROM (OLD.id,OLD.owner_id,OLD.tournament_id,OLD.visibility,OLD.join_policy) THEN
    RAISE EXCEPTION 'System competition context is immutable.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION tipovacka_private.guard_public_pool_lobby() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_public_pool_lobby BEFORE UPDATE ON public.lobbies
FOR EACH ROW EXECUTE FUNCTION tipovacka_private.guard_public_pool_lobby();

CREATE FUNCTION tipovacka_private.guard_public_pool_tournament()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND EXISTS (SELECT 1 FROM tipovacka_private.public_competition_pools pool
    WHERE pool.lobby_id=OLD.lobby_id AND pool.tournament_id=OLD.tournament_id)
    AND (TG_OP='DELETE' OR (NEW.lobby_id,NEW.tournament_id,NEW.status)
      IS DISTINCT FROM (OLD.lobby_id,OLD.tournament_id,'active'::text)) THEN
    RAISE EXCEPTION 'System competition attachment is immutable.' USING ERRCODE='42501';
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND EXISTS (
    SELECT 1 FROM tipovacka_private.public_competition_pools pool
    WHERE pool.lobby_id=NEW.lobby_id AND pool.tournament_id<>NEW.tournament_id) THEN
    RAISE EXCEPTION 'System pool contains exactly one competition.' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION tipovacka_private.guard_public_pool_tournament() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_public_pool_tournament BEFORE INSERT OR UPDATE OR DELETE ON public.lobby_tournaments
FOR EACH ROW EXECUTE FUNCTION tipovacka_private.guard_public_pool_tournament();

CREATE FUNCTION tipovacka_private.guard_public_pool_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pool_slug text; details jsonb; newly_active boolean:=TG_OP='INSERT';
BEGIN
  IF TG_OP='UPDATE' THEN
    newly_active:=(NEW.lobby_id,NEW.user_id,NEW.membership_status)
      IS DISTINCT FROM (OLD.lobby_id,OLD.user_id,OLD.membership_status);
  END IF;
  IF NOT newly_active OR NEW.membership_status<>'active' THEN RETURN NEW; END IF;
  SELECT slug INTO pool_slug FROM tipovacka_private.public_competition_pools WHERE lobby_id=NEW.lobby_id;
  IF pool_slug IS NOT NULL AND auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN
    details:=tipovacka_private.public_competition_payload(pool_slug);
    IF public.current_player_id() IS NULL OR details IS NULL OR details->>'status'='closed' THEN
      RAISE EXCEPTION 'Public competition entry is unavailable.' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION tipovacka_private.guard_public_pool_membership() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_public_pool_membership BEFORE INSERT OR UPDATE ON public.lobby_members
FOR EACH ROW EXECUTE FUNCTION tipovacka_private.guard_public_pool_membership();

-- Provisioning never converts an existing lobby. Service credentials are used
-- only on the server/CLI; a normal platform admin session cannot invoke it.
CREATE FUNCTION public.provision_public_competition(p_slug text,p_tournament_id text,p_name text,
  p_owner_player_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_player uuid:=p_owner_player_id; existing tipovacka_private.public_competition_pools%ROWTYPE;
  generated_lobby text; generated_code text; candidates integer; attempt integer;
BEGIN
  IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service access required.' USING ERRCODE='42501';
  END IF;
  IF p_slug IS NULL OR char_length(p_slug) NOT BETWEEN 1 AND 80 OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'A bounded canonical slug and name are required.' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('public-competition:'||p_slug,0));
  IF owner_player IS NULL THEN
    SELECT count(*), (array_agg(profile.id))[1] INTO candidates,owner_player
    FROM public.profiles profile WHERE profile.role='admin' AND EXISTS (
      SELECT 1 FROM tipovacka_private.player_auth_identities identity
      JOIN tipovacka_private.auth_issuers issuer ON issuer.issuer=identity.issuer AND issuer.enabled
      WHERE identity.player_id=profile.id AND identity.disabled_at IS NULL);
    IF candidates<>1 THEN
      RAISE EXCEPTION 'Choose an enabled Clerk platform admin explicitly.' USING ERRCODE='22023';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.id=owner_player AND profile.role='admin'
    AND EXISTS (SELECT 1 FROM tipovacka_private.player_auth_identities identity
      JOIN tipovacka_private.auth_issuers issuer ON issuer.issuer=identity.issuer AND issuer.enabled
      WHERE identity.player_id=profile.id AND identity.disabled_at IS NULL)) THEN
    RAISE EXCEPTION 'Owner must already be an enabled Clerk platform admin.' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tournaments t JOIN public.sports sport ON sport.id=t.sport_id
    WHERE t.id=p_tournament_id AND t.status='active' AND sport.is_active
      AND (t.sport_id<>'mma' OR EXISTS (SELECT 1 FROM public.mma_seasons season WHERE season.tournament_id=t.id))) THEN
    RAISE EXCEPTION 'An active score competition or annual MMA season is required.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO existing FROM tipovacka_private.public_competition_pools WHERE slug=p_slug;
  IF existing.slug IS NOT NULL THEN
    IF existing.tournament_id<>p_tournament_id OR NOT EXISTS (
      SELECT 1 FROM public.lobbies lobby WHERE lobby.id=existing.lobby_id AND lobby.owner_id=owner_player) THEN
      RAISE EXCEPTION 'Public slug already belongs to another competition or owner.' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('slug',existing.slug,'lobby_id',existing.lobby_id,
      'tournament_id',existing.tournament_id,'published',existing.is_published);
  END IF;
  FOR attempt IN 1..10 LOOP
    generated_lobby:='public-pool-'||encode(extensions.gen_random_bytes(12),'hex');
    generated_code:=upper(encode(extensions.gen_random_bytes(16),'hex'));
    BEGIN
      INSERT INTO public.lobbies(id,name,owner_id,tournament_id,join_code,visibility,join_policy)
      VALUES(generated_lobby,btrim(p_name),owner_player,p_tournament_id,generated_code,'private','open');
      EXIT;
    EXCEPTION WHEN unique_violation THEN IF attempt=10 THEN RAISE; END IF;
    END;
  END LOOP;
  INSERT INTO public.lobby_tournaments(lobby_id,tournament_id,status) VALUES(generated_lobby,p_tournament_id,'active');
  INSERT INTO public.lobby_members(lobby_id,user_id,role,membership_status)
    VALUES(generated_lobby,owner_player,'member','active');
  INSERT INTO tipovacka_private.public_competition_pools(slug,lobby_id,tournament_id,name)
    VALUES(p_slug,generated_lobby,p_tournament_id,btrim(p_name));
  RETURN jsonb_build_object('slug',p_slug,'lobby_id',generated_lobby,'tournament_id',p_tournament_id,'published',false);
END;
$$;
REVOKE ALL ON FUNCTION public.provision_public_competition(text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.provision_public_competition(text,text,text,uuid) TO service_role;

CREATE FUNCTION public.set_public_competition_publication(p_slug text,p_published boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pool tipovacka_private.public_competition_pools%ROWTYPE;
BEGIN
  IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service access required.' USING ERRCODE='42501';
  END IF;
  IF p_published IS NULL THEN RAISE EXCEPTION 'Publication state is required.' USING ERRCODE='22023'; END IF;
  SELECT * INTO pool FROM tipovacka_private.public_competition_pools WHERE slug=p_slug FOR UPDATE;
  IF pool.slug IS NULL THEN RAISE EXCEPTION 'Public competition not found.' USING ERRCODE='P0002'; END IF;
  IF p_published AND NOT EXISTS (
    SELECT 1 FROM public.lobbies lobby JOIN public.tournaments t ON t.id=pool.tournament_id
    JOIN public.lobby_tournaments link ON link.lobby_id=lobby.id AND link.tournament_id=t.id AND link.status='active'
    WHERE lobby.id=pool.lobby_id AND lobby.tournament_id=t.id AND lobby.visibility='private'
      AND lobby.join_policy='open' AND t.status IN ('active','finished')
      AND NOT EXISTS (SELECT 1 FROM public.lobby_tournaments other
        WHERE other.lobby_id=lobby.id AND other.status='active' AND other.tournament_id<>t.id)) THEN
    RAISE EXCEPTION 'Public competition context is invalid.' USING ERRCODE='42501';
  END IF;
  UPDATE tipovacka_private.public_competition_pools SET is_published=p_published,updated_at=now() WHERE slug=p_slug;
  RETURN jsonb_build_object('slug',p_slug,'published',p_published);
END;
$$;
REVOKE ALL ON FUNCTION public.set_public_competition_publication(text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_public_competition_publication(text,boolean) TO service_role;
