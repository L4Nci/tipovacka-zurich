-- Cosmetic metadata only. Existing fighter identity, sporting facts and picks are unchanged.
ALTER TABLE public.mma_fighters ADD COLUMN portrait jsonb;
ALTER TABLE public.mma_fighters ADD COLUMN portrait_checked_at timestamptz;
ALTER TABLE public.mma_fighters ADD CONSTRAINT mma_portrait_metadata CHECK (
  portrait IS NULL OR (jsonb_typeof(portrait)='object'
    AND jsonb_typeof(portrait->'url')='string'
    AND portrait->>'url' ~ '^https://d33t2v9cbr12gb[.]cloudfront[.]net/commons/[a-f0-9]{64}[.]webp$'
    AND jsonb_typeof(portrait->'artist')='string' AND length(btrim(portrait->>'artist')) BETWEEN 1 AND 500
    AND jsonb_typeof(portrait->'license')='string' AND length(portrait->>'license') BETWEEN 1 AND 80
    AND jsonb_typeof(portrait->'source_page')='string'
    AND portrait->>'source_page' LIKE 'https://commons.wikimedia.org/wiki/File:%') IS TRUE
);
ALTER TABLE tipovacka_private.mma_api_budget ADD COLUMN portrait_reserved_requests integer NOT NULL DEFAULT 0
  CHECK (portrait_reserved_requests BETWEEN 0 AND 100);

CREATE TABLE tipovacka_private.mma_portrait_sync_state (
  fighter_id bigint PRIMARY KEY REFERENCES public.mma_fighters(id) ON DELETE CASCADE,
  next_attempt_at timestamptz NOT NULL,
  last_attempt_at timestamptz NOT NULL,
  claim_token uuid,
  lease_until timestamptz,
  CHECK ((claim_token IS NULL) = (lease_until IS NULL))
);
ALTER TABLE tipovacka_private.mma_portrait_sync_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tipovacka_private.mma_portrait_sync_state FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.claim_mma_fighter_portrait(p_fighter_id bigint DEFAULT NULL)
RETURNS TABLE(fighter_id bigint,claim_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id bigint; v_token uuid := pg_catalog.gen_random_uuid();
  v_month date := date_trunc('month',now() AT TIME ZONE 'UTC')::date;
BEGIN
  -- Same lock/budget as result polling; cosmetics may reserve at most 100/month
  -- and stop at total 800, leaving at least 100 result requests in the 900 cap.
  PERFORM pg_advisory_xact_lock(hashtextextended('mma-sync-claim',0));
  IF EXISTS (SELECT 1 FROM tipovacka_private.mma_portrait_sync_state s
    WHERE s.last_attempt_at > now()-interval '10 seconds') THEN RETURN; END IF;
  SELECT f.id INTO v_id FROM public.mma_fighters f
    LEFT JOIN tipovacka_private.mma_portrait_sync_state s ON s.fighter_id=f.id
    WHERE (p_fighter_id IS NULL OR f.id=p_fighter_id)
      AND (s.fighter_id IS NULL OR s.next_attempt_at <= now())
      AND EXISTS (SELECT 1 FROM public.mma_fights fight JOIN public.mma_events e ON e.tournament_id=fight.tournament_id
        WHERE f.id IN(fight.fighter_a_id,fight.fighter_b_id) AND fight.status <> 'cancelled'
          AND e.status IN('announced','scheduled','live'))
    ORDER BY s.last_attempt_at NULLS FIRST,
      (SELECT min(fight.ordering) FROM public.mma_fights fight WHERE f.id IN(fight.fighter_a_id,fight.fighter_b_id)), f.id
    LIMIT 1;
  IF v_id IS NULL THEN RETURN; END IF;
  INSERT INTO tipovacka_private.mma_api_budget(month,reserved_requests) VALUES(v_month,0) ON CONFLICT DO NOTHING;
  UPDATE tipovacka_private.mma_api_budget b
    SET reserved_requests=b.reserved_requests+1,portrait_reserved_requests=b.portrait_reserved_requests+1
    WHERE b.month=v_month AND b.reserved_requests<800 AND b.portrait_reserved_requests<100;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO tipovacka_private.mma_portrait_sync_state(fighter_id,next_attempt_at,last_attempt_at,claim_token,lease_until)
    VALUES(v_id,now()+interval '15 minutes',now(),v_token,now()+interval '15 minutes')
    ON CONFLICT ON CONSTRAINT mma_portrait_sync_state_pkey DO UPDATE SET next_attempt_at=EXCLUDED.next_attempt_at,
      last_attempt_at=EXCLUDED.last_attempt_at,claim_token=EXCLUDED.claim_token,lease_until=EXCLUDED.lease_until;
  RETURN QUERY SELECT v_id,v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_mma_fighter_portrait(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mma_fighter_portrait(bigint) TO service_role;

CREATE FUNCTION public.complete_mma_fighter_portrait(p_fighter_id bigint,p_claim_token uuid,p_portrait jsonb,p_success boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM tipovacka_private.mma_portrait_sync_state s
    WHERE s.fighter_id=p_fighter_id AND s.claim_token=p_claim_token AND s.lease_until>=now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_success THEN
    UPDATE public.mma_fighters SET portrait=p_portrait,portrait_checked_at=now() WHERE id=p_fighter_id;
  END IF;
  UPDATE tipovacka_private.mma_portrait_sync_state SET claim_token=NULL,lease_until=NULL,
    next_attempt_at=now()+CASE WHEN p_success THEN interval '30 days' ELSE interval '1 day' END
    WHERE fighter_id=p_fighter_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_mma_fighter_portrait(bigint,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_mma_fighter_portrait(bigint,uuid,jsonb,boolean) TO service_role;
