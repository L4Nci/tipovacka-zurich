-- Existing-catalog integration test; modifies only cosmetic/operational metadata.
-- Does not create fake results or picks. Every change is rolled back.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('mma-sync-claim',0));
SELECT set_config('portrait_test.id',(SELECT f.fighter_a_id::text FROM public.mma_fights f
  JOIN public.mma_events e ON e.tournament_id=f.tournament_id
  WHERE f.fighter_a_id IS NOT NULL AND f.status <> 'cancelled'
    AND e.status IN('announced','scheduled','live') ORDER BY f.id LIMIT 1),true);
SELECT set_config('portrait_test.facts',(SELECT jsonb_build_object('id',f.id,'name',f.name,'country_code',f.country_code)::text
  FROM public.mma_fighters f WHERE f.id=current_setting('portrait_test.id')::bigint),true);
SELECT set_config('portrait_test.sample',jsonb_build_object(
  'url','https://d33t2v9cbr12gb.cloudfront.net/commons/'||repeat('a',64)||'.webp',
  'width',520,'height',679,'artist','Rollback author','license','CC BY 3.0',
  'license_url','https://creativecommons.org/licenses/by/3.0',
  'source_page','https://commons.wikimedia.org/wiki/File:Rollback.png')::text,true);
INSERT INTO tipovacka_private.mma_api_budget(month,reserved_requests,portrait_reserved_requests)
  VALUES(date_trunc('month',now() AT TIME ZONE 'UTC')::date,0,0)
  ON CONFLICT(month) DO UPDATE SET reserved_requests=0,portrait_reserved_requests=0;
UPDATE tipovacka_private.mma_portrait_sync_state SET last_attempt_at=now()-interval '1 minute';
INSERT INTO tipovacka_private.mma_portrait_sync_state(fighter_id,next_attempt_at,last_attempt_at)
  VALUES(current_setting('portrait_test.id')::bigint,now()-interval '1 day',now()-interval '1 minute')
  ON CONFLICT(fighter_id) DO UPDATE SET next_attempt_at=EXCLUDED.next_attempt_at,last_attempt_at=EXCLUDED.last_attempt_at,
    claim_token=NULL,lease_until=NULL;

SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    UPDATE public.mma_fighters SET portrait=current_setting('portrait_test.sample')::jsonb
      WHERE id=current_setting('portrait_test.id')::bigint;
    RAISE EXCEPTION 'Player wrote fighter metadata';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.claim_mma_fighter_portrait(current_setting('portrait_test.id')::bigint);
    RAISE EXCEPTION 'Player reserved provider requests';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.complete_mma_fighter_portrait(current_setting('portrait_test.id')::bigint,gen_random_uuid(),NULL,true);
    RAISE EXCEPTION 'Player completed portrait metadata';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM 1 FROM tipovacka_private.mma_portrait_sync_state;
    RAISE EXCEPTION 'Player read private refresh state';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.claim_mma_fighter_portrait(current_setting('portrait_test.id')::bigint);
    RAISE EXCEPTION 'Anonymous reserved requests';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ DECLARE lease record; n integer; BEGIN
  SELECT * INTO lease FROM public.claim_mma_fighter_portrait(current_setting('portrait_test.id')::bigint);
  IF lease.fighter_id IS NULL THEN RAISE EXCEPTION 'Server could not claim an uncached portrait'; END IF;
  PERFORM set_config('portrait_test.token',lease.claim_token::text,true);
  SELECT count(*) INTO n FROM public.claim_mma_fighter_portrait(lease.fighter_id);
  IF n<>0 THEN RAISE EXCEPTION 'Duplicate claim consumed API quota'; END IF;
  IF public.complete_mma_fighter_portrait(lease.fighter_id,gen_random_uuid(),NULL,true) THEN
    RAISE EXCEPTION 'Wrong lease overwrote metadata'; END IF;
  IF NOT public.complete_mma_fighter_portrait(lease.fighter_id,lease.claim_token,current_setting('portrait_test.sample')::jsonb,true) THEN
    RAISE EXCEPTION 'Server failed to store portrait'; END IF;
  IF public.complete_mma_fighter_portrait(lease.fighter_id,lease.claim_token,NULL,true) THEN
    RAISE EXCEPTION 'Old lease completed twice'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.mma_fighters WHERE id=current_setting('portrait_test.id')::bigint
    AND portrait=current_setting('portrait_test.sample')::jsonb) THEN RAISE EXCEPTION 'Portrait not stored'; END IF;
  IF NOT EXISTS(SELECT 1 FROM tipovacka_private.mma_api_budget WHERE month=date_trunc('month',now() AT TIME ZONE 'UTC')::date
    AND reserved_requests=1 AND portrait_reserved_requests=1) THEN RAISE EXCEPTION 'Reservation counters incorrect'; END IF;
  IF NOT EXISTS(SELECT 1 FROM tipovacka_private.mma_portrait_sync_state WHERE fighter_id=current_setting('portrait_test.id')::bigint
    AND next_attempt_at=now()+interval '30 days') THEN RAISE EXCEPTION 'Success did not cache for 30 days'; END IF;
END $$;
-- Failed profile lookup retains the previous photo and waits one day.
UPDATE tipovacka_private.mma_portrait_sync_state SET next_attempt_at=now()-interval '1 day',last_attempt_at=now()-interval '1 minute'
  WHERE fighter_id=current_setting('portrait_test.id')::bigint;
SET LOCAL ROLE service_role;
DO $$ DECLARE lease record; BEGIN
  SELECT * INTO lease FROM public.claim_mma_fighter_portrait(current_setting('portrait_test.id')::bigint);
  IF lease.fighter_id IS NULL OR NOT public.complete_mma_fighter_portrait(lease.fighter_id,lease.claim_token,NULL,false) THEN
    RAISE EXCEPTION 'Failure could not be deferred'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.mma_fighters WHERE id=current_setting('portrait_test.id')::bigint AND portrait IS NOT NULL)
    OR NOT EXISTS(SELECT 1 FROM tipovacka_private.mma_portrait_sync_state WHERE fighter_id=current_setting('portrait_test.id')::bigint
      AND next_attempt_at=now()+interval '1 day') THEN RAISE EXCEPTION 'Failure discarded old photo or retried immediately'; END IF;
END $$;
-- Expired worker cannot clear a newer response. Confirmed absence is cached too.
UPDATE tipovacka_private.mma_portrait_sync_state SET next_attempt_at=now()-interval '1 day',last_attempt_at=now()-interval '1 minute',
  claim_token=current_setting('portrait_test.token')::uuid,lease_until=now()-interval '1 second'
  WHERE fighter_id=current_setting('portrait_test.id')::bigint;
SET LOCAL ROLE service_role;
DO $$ DECLARE lease record; n integer; BEGIN
  IF public.complete_mma_fighter_portrait(current_setting('portrait_test.id')::bigint,current_setting('portrait_test.token')::uuid,NULL,true) THEN
    RAISE EXCEPTION 'Expired response overwrote metadata'; END IF;
  SELECT * INTO lease FROM public.claim_mma_fighter_portrait(current_setting('portrait_test.id')::bigint);
  IF lease.fighter_id IS NULL OR NOT public.complete_mma_fighter_portrait(lease.fighter_id,lease.claim_token,NULL,true) THEN
    RAISE EXCEPTION 'Empty portrait response could not be cached'; END IF;
  SELECT count(*) INTO n FROM public.claim_mma_fighter_portrait(lease.fighter_id);
  IF n<>0 THEN RAISE EXCEPTION 'Confirmed empty result was refetched'; END IF;
END $$;
RESET ROLE;
UPDATE tipovacka_private.mma_portrait_sync_state SET next_attempt_at=now()-interval '1 day',last_attempt_at=now()-interval '1 minute'
  WHERE fighter_id=current_setting('portrait_test.id')::bigint;
UPDATE tipovacka_private.mma_api_budget SET reserved_requests=100,portrait_reserved_requests=100
  WHERE month=date_trunc('month',now() AT TIME ZONE 'UTC')::date;
SET LOCAL ROLE service_role;
DO $$ DECLARE n integer; BEGIN
  SELECT count(*) INTO n FROM public.claim_mma_fighter_portrait(current_setting('portrait_test.id')::bigint);
  IF n<>0 THEN RAISE EXCEPTION 'Portrait monthly sub-budget bypassed'; END IF;
END $$;
RESET ROLE;
UPDATE tipovacka_private.mma_api_budget SET reserved_requests=800,portrait_reserved_requests=1
  WHERE month=date_trunc('month',now() AT TIME ZONE 'UTC')::date;
UPDATE tipovacka_private.mma_sync_state SET next_sync_at=now()-interval '1 minute'
  WHERE tournament_id=(SELECT tournament_id FROM public.mma_fights WHERE fighter_a_id=current_setting('portrait_test.id')::bigint LIMIT 1);
SET LOCAL ROLE service_role;
DO $$ DECLARE n integer; tid text; BEGIN
  SELECT count(*) INTO n FROM public.claim_mma_fighter_portrait(current_setting('portrait_test.id')::bigint);
  IF n<>0 THEN RAISE EXCEPTION 'Portrait used the results quota reserve'; END IF;
  SELECT tournament_id INTO tid FROM public.mma_fights WHERE fighter_a_id=current_setting('portrait_test.id')::bigint LIMIT 1;
  IF NOT public.claim_mma_sync(tid) THEN RAISE EXCEPTION 'Portrait sub-budget blocked result polling'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT jsonb_build_object('id',f.id,'name',f.name,'country_code',f.country_code)::text
      FROM public.mma_fighters f WHERE f.id=current_setting('portrait_test.id')::bigint) <> current_setting('portrait_test.facts') THEN
    RAISE EXCEPTION 'Portrait refresh changed fighter identity'; END IF;
END $$;
SELECT 'mma_portrait_cache_checks_passed' AS result;
ROLLBACK;
