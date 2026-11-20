-- Cosmetics only: retain existing cache and counters and keep the results reserve.
ALTER TABLE tipovacka_private.mma_api_budget
  DROP CONSTRAINT mma_api_budget_portrait_reserved_requests_check,
  ADD CONSTRAINT mma_api_budget_portrait_reserved_requests_check
    CHECK (portrait_reserved_requests BETWEEN 0 AND 150);

CREATE OR REPLACE FUNCTION public.claim_mma_fighter_portrait(p_fighter_id bigint DEFAULT NULL)
RETURNS TABLE(fighter_id bigint,claim_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id bigint; v_token uuid := pg_catalog.gen_random_uuid();
  v_month date := date_trunc('month',now() AT TIME ZONE 'UTC')::date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('mma-sync-claim',0));
  IF EXISTS (SELECT 1 FROM tipovacka_private.mma_portrait_sync_state s
    WHERE s.last_attempt_at > now()-interval '10 seconds') THEN RETURN; END IF;

  SELECT f.id INTO v_id
  FROM public.mma_events e
  JOIN public.mma_fights fight ON fight.tournament_id=e.tournament_id
  CROSS JOIN LATERAL (VALUES (fight.fighter_a_id),(fight.fighter_b_id)) corner(id)
  JOIN public.mma_fighters f ON f.id=corner.id
  LEFT JOIN tipovacka_private.mma_portrait_sync_state s ON s.fighter_id=f.id
  WHERE e.status IN('announced','scheduled','live')
    AND fight.status <> 'cancelled'
    AND f.portrait IS NULL
    AND (p_fighter_id IS NULL OR f.id=p_fighter_id)
    AND (s.fighter_id IS NULL OR s.next_attempt_at <= now())
    AND (s.lease_until IS NULL OR s.lease_until <= now())
  ORDER BY (e.lock_time_utc <= now()), e.lock_time_utc,
    (s.last_attempt_at IS NOT NULL), fight.ordering, s.last_attempt_at NULLS FIRST, f.id
  LIMIT 1;
  IF v_id IS NULL THEN RETURN; END IF;

  INSERT INTO tipovacka_private.mma_api_budget(month,reserved_requests) VALUES(v_month,0) ON CONFLICT DO NOTHING;
  UPDATE tipovacka_private.mma_api_budget b
    SET reserved_requests=b.reserved_requests+1,portrait_reserved_requests=b.portrait_reserved_requests+1
    WHERE b.month=v_month AND b.reserved_requests<800 AND b.portrait_reserved_requests<150;
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
