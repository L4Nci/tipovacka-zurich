-- Local/hosted-compatible transactional contract test. No provider call or paid
-- grant; all synthetic identities, customer/session IDs and ledger rows roll back.
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SET LOCAL TIME ZONE 'UTC';

SELECT public.configure_clerk_identity_provider(
  'https://billing-sandbox-test.clerk.accounts.dev',ARRAY['http://localhost:3000']);
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://billing-sandbox-test.clerk.accounts.dev','sub','user_billing_sandbox_a',
  'sid','sess_billing_sandbox_a','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
SELECT set_config('billing_sandbox_test.a',public.bootstrap_my_account()->>'id',true);
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://billing-sandbox-test.clerk.accounts.dev','sub','user_billing_sandbox_b',
  'sid','sess_billing_sandbox_b','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
SELECT set_config('billing_sandbox_test.b',public.bootstrap_my_account()->>'id',true);
RESET ROLE;

-- Protect whole-row content, not just counts. Baseline follows creation of the
-- two rollback profiles, so no normal table may change during billing tests.
CREATE TEMP TABLE billing_sandbox_normal_baseline AS
SELECT jsonb_build_object(
  'profiles',(SELECT md5(COALESCE(string_agg(row_to_json(item)::text,'|' ORDER BY row_to_json(item)::text),'')) FROM public.profiles item),
  'subscriptions',(SELECT md5(COALESCE(string_agg(row_to_json(item)::text,'|' ORDER BY row_to_json(item)::text),'')) FROM public.subscriptions item),
  'plans',(SELECT md5(COALESCE(string_agg(row_to_json(item)::text,'|' ORDER BY row_to_json(item)::text),'')) FROM public.plans item),
  'entitlements',(SELECT md5(COALESCE(string_agg(row_to_json(item)::text,'|' ORDER BY row_to_json(item)::text),'')) FROM public.entitlements item),
  'plan_entitlements',(SELECT md5(COALESCE(string_agg(row_to_json(item)::text,'|' ORDER BY row_to_json(item)::text),'')) FROM public.plan_entitlements item),
  'predictions',(SELECT md5(COALESCE(string_agg(row_to_json(item)::text,'|' ORDER BY row_to_json(item)::text),'')) FROM public.predictions item),
  'matches',(SELECT md5(COALESCE(string_agg(row_to_json(item)::text,'|' ORDER BY row_to_json(item)::text),'')) FROM public.matches item),
  'members',(SELECT md5(COALESCE(string_agg(row_to_json(item)::text,'|' ORDER BY row_to_json(item)::text),'')) FROM public.lobby_members item)
) AS digest;

DO $$ DECLARE routine regprocedure; relation regclass; BEGIN
  IF has_schema_privilege('anon','billing_test_private','USAGE')
    OR has_schema_privilege('authenticated','billing_test_private','USAGE') THEN
    RAISE EXCEPTION 'Client may enter private billing test schema'; END IF;
  FOR relation IN SELECT item.oid::regclass FROM pg_catalog.pg_class item
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=item.relnamespace
    WHERE namespace.nspname='billing_test_private' AND item.relkind='r' LOOP
    IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid=relation)
      OR has_table_privilege('anon',relation,'SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege('authenticated',relation,'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'Billing test table ACL/RLS exposed'; END IF;
  END LOOP;
  FOR routine IN SELECT procedure.oid::regprocedure FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
    WHERE namespace.nspname='public' AND procedure.proname LIKE 'billing_test_%' LOOP
    IF has_function_privilege('anon',routine,'EXECUTE')
      OR has_function_privilege('authenticated',routine,'EXECUTE')
      OR NOT has_function_privilege('service_role',routine,'EXECUTE')
      OR (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid=routine) THEN
      RAISE EXCEPTION 'Billing test RPC authority is wrong'; END IF;
  END LOOP;
END; $$;

SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM 1 FROM billing_test_private.customers; RAISE EXCEPTION 'Anonymous read billing test customers';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.billing_test_get_status('acct_SandboxA',current_setting('billing_sandbox_test.a')::uuid);
    RAISE EXCEPTION 'Anonymous executed billing test RPC'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM 1 FROM billing_test_private.outcomes; RAISE EXCEPTION 'Player read billing test outcomes';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.billing_test_reserve_checkout('acct_SandboxA',current_setting('billing_sandbox_test.a')::uuid,'fan_vip_monthly');
    RAISE EXCEPTION 'Player created billing test intent'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.billing_test_complete_reconciliation('acct_SandboxA',current_setting('billing_sandbox_test.a')::uuid,
    'evt_forged',repeat('0',64),gen_random_uuid(),1,gen_random_uuid(),'sub_forged','in_forged',NULL,'verified');
    RAISE EXCEPTION 'Player minted test outcome'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;

DO $$ DECLARE a uuid:=current_setting('billing_sandbox_test.a')::uuid;
  b uuid:=current_setting('billing_sandbox_test.b')::uuid;
  first_intent jsonb; second_intent jsonb; event_one jsonb; next_event jsonb; current_event jsonb;
  status jsonb; snapshot jsonb; invalid_snapshot jsonb; started text; ending text;
  expiry timestamptz:=date_trunc('second',now()+interval '1 hour');
BEGIN
  BEGIN PERFORM public.billing_test_reserve_checkout('acct_SandboxA',a,'cheap_override');
    RAISE EXCEPTION 'Unknown offer accepted'; EXCEPTION WHEN SQLSTATE 'PBT01' THEN NULL; END;
  first_intent:=public.billing_test_reserve_checkout('acct_SandboxA',a,'fan_vip_monthly');
  second_intent:=public.billing_test_reserve_checkout('acct_SandboxA',a,'fan_vip_annual');
  IF first_intent IS DISTINCT FROM second_intent OR first_intent->>'state'<>'reserved'
    OR first_intent->>'offerKey'<>'fan_vip_monthly' OR first_intent->>'customerId' IS NOT NULL THEN
    RAISE EXCEPTION 'Concurrent interval/retry did not reuse one immutable intent'; END IF;
  UPDATE billing_test_private.checkout_intents SET created_at=now()-interval '2 days' WHERE id=(first_intent->>'id')::uuid;
  IF public.billing_test_reserve_checkout('acct_SandboxA',a,'fan_vip_monthly')->>'id' IS DISTINCT FROM first_intent->>'id' THEN
    RAISE EXCEPTION 'Timeout invented another checkout seed'; END IF;
  PERFORM public.billing_test_bind_customer('acct_SandboxA',a,'cus_SandboxA');
  PERFORM public.billing_test_bind_customer('acct_SandboxA',a,'cus_SandboxA');
  BEGIN PERFORM public.billing_test_bind_customer('acct_SandboxA',a,'cus_Other');
    RAISE EXCEPTION 'Buyer rebound to another customer'; EXCEPTION WHEN SQLSTATE 'PBT01' THEN NULL; END;
  PERFORM public.billing_test_reserve_checkout('acct_SandboxA',b,'fan_vip_annual');
  BEGIN PERFORM public.billing_test_bind_customer('acct_SandboxA',b,'cus_SandboxA');
    RAISE EXCEPTION 'Provider customer bound to two buyers'; EXCEPTION WHEN SQLSTATE 'PBT01' THEN NULL; END;
  PERFORM public.billing_test_bind_customer('acct_SandboxA',b,'cus_SandboxB');
  first_intent:=public.billing_test_save_checkout('acct_SandboxA',a,(first_intent->>'id')::uuid,
    'cus_SandboxA','cs_test_SandboxA','https://checkout.stripe.com/c/pay/cs_test_SandboxA#fixture',expiry);
  IF public.billing_test_save_checkout('acct_SandboxA',a,(first_intent->>'id')::uuid,
    'cus_SandboxA','cs_test_SandboxA','https://checkout.stripe.com/c/pay/cs_test_SandboxA#fixture',expiry) IS DISTINCT FROM first_intent THEN
    RAISE EXCEPTION 'Checkout save is not idempotent'; END IF;
  BEGIN PERFORM public.billing_test_save_checkout('acct_SandboxA',b,(first_intent->>'id')::uuid,
    'cus_SandboxB','cs_test_SandboxA','https://checkout.stripe.com/c/pay/cs_test_SandboxA#fixture',expiry);
    RAISE EXCEPTION 'Other buyer bound another checkout'; EXCEPTION WHEN SQLSTATE 'PBT01' THEN NULL; END;
  BEGIN PERFORM public.billing_test_save_checkout('acct_SandboxA',a,(first_intent->>'id')::uuid,
    'cus_SandboxA','cs_test_Different','https://checkout.stripe.com/c/pay/cs_test_SandboxA#fixture',expiry);
    RAISE EXCEPTION 'Saved checkout changed its session'; EXCEPTION WHEN SQLSTATE 'PBT01' THEN NULL; END;
  IF public.billing_test_get_status('acct_SandboxA',b,(first_intent->>'id')::uuid)->'intent'<>'null'::jsonb
    OR public.billing_test_get_status('acct_SandboxB',a,(first_intent->>'id')::uuid)->'intent'<>'null'::jsonb THEN
    RAISE EXCEPTION 'Cross-buyer/account status exposed'; END IF;

  event_one:=public.billing_test_begin_reconciliation('acct_SandboxA','cus_SandboxA','evt_paid','invoice.paid',repeat('a',64));
  IF event_one->>'kind'<>'claimed' OR event_one->>'playerId'<>a::text
    OR event_one#>>'{status,intent,id}'<>first_intent->>'id' THEN RAISE EXCEPTION 'Claim failed buyer/intent binding'; END IF;
  IF public.billing_test_begin_reconciliation('acct_SandboxA','cus_SandboxA','evt_paid','invoice.paid',repeat('a',64))->>'kind'<>'busy'
    OR public.billing_test_begin_reconciliation('acct_SandboxA','cus_SandboxA','evt_updated','customer.subscription.updated',repeat('b',64))->>'kind'<>'busy' THEN
    RAISE EXCEPTION 'Concurrent same-buyer canonical fetch not fenced'; END IF;
  BEGIN PERFORM public.billing_test_begin_reconciliation('acct_SandboxA','cus_SandboxA','evt_paid','invoice.paid',repeat('f',64));
    RAISE EXCEPTION 'Event equivocation accepted'; EXCEPTION WHEN SQLSTATE 'PBT02' THEN NULL; END;
  started:=to_char(date_trunc('milliseconds',now()-interval '1 day'),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  ending:=to_char(date_trunc('milliseconds',now()+interval '29 days'),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  snapshot:=jsonb_build_object('environment','test','offerKey','fan_vip_monthly','subscriptionState','active',
    'cancelAtPeriodEnd',false,'paidPeriod',jsonb_build_object('startsAt',started,'endsAt',ending,'paymentState','paid'));
  FOREACH invalid_snapshot IN ARRAY ARRAY[
    jsonb_set(snapshot,'{environment}','"live"'),
    jsonb_set(snapshot,'{offerKey}','"fan_vip_annual"'),
    snapshot#-'{paidPeriod,endsAt}',
    jsonb_set(snapshot,'{paidPeriod,endsAt}','"infinity"'),
    jsonb_set(snapshot,'{paidPeriod,endsAt}',to_jsonb(to_char(now()+interval '2 years','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
  ] LOOP
    BEGIN PERFORM public.billing_test_complete_reconciliation('acct_SandboxA',a,'evt_paid',repeat('a',64),
      (event_one->>'leaseToken')::uuid,(event_one->>'leaseVersion')::bigint,(first_intent->>'id')::uuid,
      'sub_SandboxA','in_SandboxA',invalid_snapshot,'verified');
      RAISE EXCEPTION 'Invalid canonical TEST snapshot accepted'; EXCEPTION WHEN SQLSTATE 'PBT04' THEN NULL; END;
  END LOOP;
  IF public.billing_test_complete_reconciliation('acct_SandboxA',b,'evt_paid',repeat('a',64),
    (event_one->>'leaseToken')::uuid,(event_one->>'leaseVersion')::bigint,(first_intent->>'id')::uuid,
    'sub_SandboxA','in_SandboxA',snapshot,'verified') THEN RAISE EXCEPTION 'Wrong buyer completed lease'; END IF;
  IF NOT public.billing_test_complete_reconciliation('acct_SandboxA',a,'evt_paid',repeat('a',64),
    (event_one->>'leaseToken')::uuid,(event_one->>'leaseVersion')::bigint,(first_intent->>'id')::uuid,
    'sub_SandboxA','in_SandboxA',snapshot,'verified') THEN RAISE EXCEPTION 'Valid canonical result not committed'; END IF;
  status:=public.billing_test_get_status('acct_SandboxA',a);
  IF status->>'outcome'<>'verified' OR status->'snapshot' IS DISTINCT FROM snapshot
    OR status#>>'{intent,state}'<>'completed' THEN RAISE EXCEPTION 'Committed canonical result missing'; END IF;
  IF public.billing_test_reserve_checkout('acct_SandboxA',a,'fan_vip_annual')->>'id'<>first_intent->>'id' THEN
    RAISE EXCEPTION 'Paid completed subscription allowed duplicate annual checkout'; END IF;
  IF public.billing_test_begin_reconciliation('acct_SandboxA','cus_SandboxA','evt_paid','invoice.paid',repeat('a',64))->>'kind'<>'completed' THEN
    RAISE EXCEPTION 'Completed event not deduplicated'; END IF;
  IF public.billing_test_complete_reconciliation('acct_SandboxA',a,'evt_paid',repeat('a',64),
    (event_one->>'leaseToken')::uuid,(event_one->>'leaseVersion')::bigint,(first_intent->>'id')::uuid,
    'sub_SandboxA','in_SandboxA',snapshot,'verified') THEN RAISE EXCEPTION 'Released worker could commit twice'; END IF;

  next_event:=public.billing_test_begin_reconciliation('acct_SandboxA','cus_SandboxA','evt_updated','customer.subscription.updated',repeat('b',64));
  UPDATE billing_test_private.customers SET lease_until=clock_timestamp()-interval '1 second'
    WHERE account_id='acct_SandboxA' AND player_id=a;
  current_event:=public.billing_test_begin_reconciliation('acct_SandboxA','cus_SandboxA',
    'obs_11111111-1111-4111-8111-111111111111','app.status',repeat('c',64));
  IF current_event->>'kind'<>'claimed' OR (current_event->>'leaseVersion')::bigint<=(next_event->>'leaseVersion')::bigint THEN
    RAISE EXCEPTION 'Expired lease did not advance durable fence'; END IF;
  IF public.billing_test_complete_reconciliation('acct_SandboxA',a,'evt_updated',repeat('b',64),
    (next_event->>'leaseToken')::uuid,(next_event->>'leaseVersion')::bigint,(first_intent->>'id')::uuid,
    'sub_SandboxA','in_SandboxA',snapshot,'verified')
    OR public.billing_test_fail_reconciliation('acct_SandboxA',a,'evt_updated',repeat('b',64),
      (next_event->>'leaseToken')::uuid,(next_event->>'leaseVersion')::bigint) THEN
    RAISE EXCEPTION 'Stale worker overwrote/released newer lease'; END IF;
  IF NOT public.billing_test_complete_reconciliation('acct_SandboxA',a,
    'obs_11111111-1111-4111-8111-111111111111',repeat('c',64),
    (current_event->>'leaseToken')::uuid,(current_event->>'leaseVersion')::bigint,(first_intent->>'id')::uuid,
    NULL,NULL,NULL,'requires_review') THEN RAISE EXCEPTION 'Private review needs invented payment identifiers'; END IF;
  status:=public.billing_test_get_status('acct_SandboxA',a);
  IF status->>'outcome'<>'requires_review' OR status->'snapshot'<>'null'::jsonb
    OR status->>'subscriptionId'<>'sub_SandboxA' THEN RAISE EXCEPTION 'Review result lost canonical binding'; END IF;

  next_event:=public.billing_test_begin_reconciliation('acct_SandboxA','cus_SandboxA','evt_retry','invoice.payment_failed',repeat('d',64));
  IF NOT public.billing_test_fail_reconciliation('acct_SandboxA',a,'evt_retry',repeat('d',64),
    (next_event->>'leaseToken')::uuid,(next_event->>'leaseVersion')::bigint) THEN RAISE EXCEPTION 'Failure did not release lease'; END IF;
  IF public.billing_test_get_status('acct_SandboxA',a) IS DISTINCT FROM status THEN
    RAISE EXCEPTION 'Failed provider fetch overwrote last canonical state'; END IF;
  current_event:=public.billing_test_begin_reconciliation('acct_SandboxA','cus_SandboxA','evt_retry','invoice.payment_failed',repeat('d',64));
  IF current_event->>'kind'<>'claimed' THEN RAISE EXCEPTION 'Failed event cannot recover'; END IF;
  snapshot:=jsonb_set(snapshot,'{cancelAtPeriodEnd}','true');
  IF NOT public.billing_test_complete_reconciliation('acct_SandboxA',a,'evt_retry',repeat('d',64),
    (current_event->>'leaseToken')::uuid,(current_event->>'leaseVersion')::bigint,(first_intent->>'id')::uuid,
    'sub_SandboxA','in_SandboxA',snapshot,'verified') THEN RAISE EXCEPTION 'Recovery could not store paid-through cancellation'; END IF;

  second_intent:=public.billing_test_get_status('acct_SandboxA',b)->'intent';
  second_intent:=public.billing_test_save_checkout('acct_SandboxA',b,(second_intent->>'id')::uuid,
    'cus_SandboxB','cs_test_SandboxB','https://checkout.stripe.com/c/pay/cs_test_SandboxB',now()-interval '1 hour');
  IF public.billing_test_reserve_checkout('acct_SandboxA',b,'fan_vip_monthly')->>'id'<>second_intent->>'id' THEN
    RAISE EXCEPTION 'Local expiry opened new checkout without provider confirmation'; END IF;
  PERFORM public.billing_test_expire_checkout('acct_SandboxA',b,(second_intent->>'id')::uuid,'cs_test_SandboxB');
  current_event:=public.billing_test_begin_reconciliation('acct_SandboxA','cus_SandboxB','evt_expired','checkout.session.expired',repeat('e',64));
  IF NOT public.billing_test_complete_reconciliation('acct_SandboxA',b,'evt_expired',repeat('e',64),
    (current_event->>'leaseToken')::uuid,(current_event->>'leaseVersion')::bigint,(second_intent->>'id')::uuid,
    NULL,NULL,NULL,'pending') THEN RAISE EXCEPTION 'Expired checkout needed fake subscription'; END IF;
  IF public.billing_test_reserve_checkout('acct_SandboxA',b,'fan_vip_monthly')->>'id'=second_intent->>'id' THEN
    RAISE EXCEPTION 'Confirmed expired checkout could not restart'; END IF;
  IF public.billing_test_begin_reconciliation('acct_SandboxA','cus_Unmapped','evt_unmapped','invoice.paid',repeat('f',64))->>'kind'<>'unmapped'
    OR EXISTS(SELECT 1 FROM billing_test_private.events WHERE event_id='evt_unmapped' AND state='completed') THEN
    RAISE EXCEPTION 'Mapping race was falsely acknowledged as complete'; END IF;
END; $$;

-- Funding survives diagnostics, and reversals/reviews target only their invoice.
DO $$ DECLARE a uuid:=current_setting('billing_sandbox_test.a')::uuid;
  b uuid:=current_setting('billing_sandbox_test.b')::uuid;
  original jsonb; current_intent jsonb; claim jsonb; status jsonb; snapshot jsonb; old_snapshot jsonb;
  funding jsonb; old_funding jsonb; old_status jsonb; new_status jsonb; event jsonb; queued jsonb; next_claim jsonb;
  old_id uuid; new_id uuid; stable_customer_key text; i integer;
BEGIN
  original:=public.billing_test_get_status('acct_SandboxA',a)->'intent';
  IF original->>'createdAt' IS NULL OR original->>'customerCreatedAt' IS NULL
    OR original->>'customerIdempotencyKey' IS NULL THEN RAISE EXCEPTION 'Durable creation seeds absent'; END IF;
  snapshot:=jsonb_build_object('environment','test','offerKey','fan_vip_monthly','subscriptionState','active',
    'cancelAtPeriodEnd',false,'paidPeriod',jsonb_build_object('startsAt',to_char(now()-interval '1 day','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'endsAt',to_char(now()+interval '29 days','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'paymentState','paid'));
  old_snapshot:=jsonb_set(jsonb_set(snapshot,'{paidPeriod,startsAt}',to_jsonb(to_char(now()-interval '40 days','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),
    '{paidPeriod,endsAt}',to_jsonb(to_char(now()-interval '10 days','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  funding:=jsonb_build_object('snapshot',snapshot,'invoiceId','in_Current','invoiceLineId','il_Current',
    'paymentIntentId','pi_Current','chargeId','ch_Current');
  old_funding:=jsonb_build_object('snapshot',old_snapshot,'invoiceId','in_Old','invoiceLineId','il_Old',
    'paymentIntentId','pi_Old','chargeId','ch_Old');
  claim:=public.billing_test_begin_reconciliation('acct_SandboxA','cus_SandboxA','evt_funding','invoice.paid',repeat('1',64));
  IF NOT public.billing_test_complete_reconciliation('acct_SandboxA',a,'evt_funding',repeat('1',64),
    (claim->>'leaseToken')::uuid,(claim->>'leaseVersion')::bigint,(original->>'id')::uuid,
    'sub_SandboxA','in_Current',snapshot,'verified',jsonb_build_array(old_funding,funding)) THEN RAISE EXCEPTION 'Funding commit failed'; END IF;
  status:=public.billing_test_get_status('acct_SandboxA',a);
  IF jsonb_array_length(status->'fundingPeriods')<>2 THEN RAISE EXCEPTION 'Distinct funding periods lost'; END IF;
  IF public.billing_test_find_event_status('acct_SandboxA','cus_SandboxA',jsonb_build_object('subscriptionId','sub_SandboxA','invoiceId','in_NewUnknown'))#>>'{intent,id}'
    IS DISTINCT FROM original->>'id' THEN RAISE EXCEPTION 'Known subscription anchor rejected new invoice'; END IF;
  IF public.billing_test_find_event_status('acct_SandboxA','cus_SandboxA',jsonb_build_object('subscriptionId','sub_SandboxA','sessionId','cs_test_SandboxB')) IS NOT NULL
    OR public.billing_test_find_event_status('acct_SandboxA','cus_SandboxB',jsonb_build_object('chargeId','ch_Current')) IS NOT NULL
    OR public.billing_test_find_event_status('acct_SandboxA','cus_SandboxA',jsonb_build_object('chargeId','ch_Unknown')) IS NOT NULL THEN
    RAISE EXCEPTION 'Conflicting/unknown historical binding guessed'; END IF;
  claim:=public.billing_test_begin_reconciliation('acct_SandboxA','cus_SandboxA','evt_pendingNew','invoice.payment_failed',repeat('2',64));
  PERFORM public.billing_test_complete_reconciliation('acct_SandboxA',a,'evt_pendingNew',repeat('2',64),
    (claim->>'leaseToken')::uuid,(claim->>'leaseVersion')::bigint,(original->>'id')::uuid,'sub_SandboxA',NULL,NULL,'pending');
  IF public.billing_test_get_status('acct_SandboxA',a)->'fundingPeriods' IS DISTINCT FROM status->'fundingPeriods' THEN
    RAISE EXCEPTION 'New pending invoice erased funded periods'; END IF;
  BEGIN PERFORM public.billing_test_retire_checkout('acct_SandboxA',a,(original->>'id')::uuid,'sub_SandboxA');
    RAISE EXCEPTION 'Current paid funding permitted repurchase'; EXCEPTION WHEN SQLSTATE 'PBT01' THEN NULL; END;
  old_funding:=jsonb_set(old_funding,'{snapshot,paidPeriod,paymentState}','"refunded"');
  claim:=public.billing_test_begin_reconciliation('acct_SandboxA','cus_SandboxA','evt_oldRefund','charge.refunded',repeat('3',64));
  PERFORM public.billing_test_complete_reconciliation('acct_SandboxA',a,'evt_oldRefund',repeat('3',64),
    (claim->>'leaseToken')::uuid,(claim->>'leaseVersion')::bigint,(original->>'id')::uuid,'sub_SandboxA','in_Old',
    old_funding->'snapshot','verified',jsonb_build_array(old_funding));
  IF NOT EXISTS(SELECT 1 FROM billing_test_private.funding_periods WHERE account_id='acct_SandboxA'
    AND invoice_id='in_Current' AND payment_state='paid' AND NOT requires_review)
    OR NOT EXISTS(SELECT 1 FROM billing_test_private.funding_periods WHERE account_id='acct_SandboxA'
    AND invoice_id='in_Old' AND payment_state='refunded') THEN RAISE EXCEPTION 'Old refund affected unrelated payment'; END IF;
  claim:=public.billing_test_begin_reconciliation('acct_SandboxA','cus_SandboxA','evt_review','charge.dispute.created',repeat('4',64));
  PERFORM public.billing_test_complete_reconciliation('acct_SandboxA',a,'evt_review',repeat('4',64),
    (claim->>'leaseToken')::uuid,(claim->>'leaseVersion')::bigint,(original->>'id')::uuid,'sub_SandboxA',NULL,NULL,
    'requires_review','[]'::jsonb,'["in_Current"]'::jsonb);
  IF NOT EXISTS(SELECT 1 FROM billing_test_private.funding_periods WHERE invoice_id='in_Current' AND requires_review)
    OR EXISTS(SELECT 1 FROM billing_test_private.funding_periods WHERE invoice_id='in_Old' AND requires_review) THEN
    RAISE EXCEPTION 'Review was not invoice scoped'; END IF;
  claim:=public.billing_test_begin_reconciliation('acct_SandboxA','cus_SandboxA','evt_reviewResolved','charge.dispute.closed',repeat('5',64));
  PERFORM public.billing_test_complete_reconciliation('acct_SandboxA',a,'evt_reviewResolved',repeat('5',64),
    (claim->>'leaseToken')::uuid,(claim->>'leaseVersion')::bigint,(original->>'id')::uuid,'sub_SandboxA','in_Current',snapshot,
    'verified',jsonb_build_array(funding));
  IF EXISTS(SELECT 1 FROM billing_test_private.invoice_reviews WHERE invoice_id='in_Current' AND requires_review)
    OR EXISTS(SELECT 1 FROM billing_test_private.funding_periods WHERE invoice_id='in_Current' AND requires_review) THEN
    RAISE EXCEPTION 'Canonical successful proof could not resolve own review'; END IF;

  -- Retired historical payment can be refunded without rewriting a new intent.
  current_intent:=public.billing_test_get_status('acct_SandboxA',b)->'intent';
  stable_customer_key:=current_intent->>'customerIdempotencyKey'; old_id:=(current_intent->>'id')::uuid;
  current_intent:=public.billing_test_save_checkout('acct_SandboxA',b,old_id,'cus_SandboxB',
    'cs_test_BeforeRetire','https://checkout.stripe.com/c/pay/cs_test_BeforeRetire',now()+interval '1 hour');
  old_snapshot:=jsonb_set(old_snapshot,'{subscriptionState}','"cancelled"');
  old_funding:=jsonb_build_object('snapshot',old_snapshot,'invoiceId','in_BeforeRetire','invoiceLineId','il_BeforeRetire',
    'paymentIntentId','pi_BeforeRetire','chargeId','ch_BeforeRetire');
  claim:=public.billing_test_begin_reconciliation('acct_SandboxA','cus_SandboxB','evt_beforeRetire','invoice.paid',repeat('6',64));
  PERFORM public.billing_test_complete_reconciliation('acct_SandboxA',b,'evt_beforeRetire',repeat('6',64),
    (claim->>'leaseToken')::uuid,(claim->>'leaseVersion')::bigint,old_id,'sub_BeforeRetire','in_BeforeRetire',old_snapshot,
    'verified',jsonb_build_array(old_funding));
  PERFORM public.billing_test_retire_checkout('acct_SandboxA',b,old_id,'sub_BeforeRetire');
  current_intent:=public.billing_test_reserve_checkout('acct_SandboxA',b,'fan_vip_monthly'); new_id:=(current_intent->>'id')::uuid;
  IF new_id=old_id OR current_intent->>'customerIdempotencyKey' IS DISTINCT FROM stable_customer_key THEN
    RAISE EXCEPTION 'Repurchase replaced customer creation seed'; END IF;
  current_intent:=public.billing_test_save_checkout('acct_SandboxA',b,new_id,'cus_SandboxB',
    'cs_test_AfterRetire','https://checkout.stripe.com/c/pay/cs_test_AfterRetire',now()+interval '1 hour');
  funding:=jsonb_build_object('snapshot',snapshot,'invoiceId','in_AfterRetire','invoiceLineId','il_AfterRetire',
    'paymentIntentId','pi_AfterRetire','chargeId','ch_AfterRetire');
  claim:=public.billing_test_begin_reconciliation('acct_SandboxA','cus_SandboxB','evt_afterRetire','invoice.paid',repeat('7',64));
  PERFORM public.billing_test_complete_reconciliation('acct_SandboxA',b,'evt_afterRetire',repeat('7',64),
    (claim->>'leaseToken')::uuid,(claim->>'leaseVersion')::bigint,new_id,'sub_AfterRetire','in_AfterRetire',snapshot,
    'verified',jsonb_build_array(funding));
  new_status:=public.billing_test_get_status('acct_SandboxA',b);
  old_status:=public.billing_test_find_event_status('acct_SandboxA','cus_SandboxB','{"chargeId":"ch_BeforeRetire"}'::jsonb);
  IF old_status#>>'{intent,id}' IS DISTINCT FROM old_id::text THEN RAISE EXCEPTION 'Historical charge mapped to latest intent'; END IF;
  claim:=public.billing_test_begin_reconciliation('acct_SandboxA','cus_SandboxB','evt_refundRetired','charge.refunded',repeat('8',64));
  old_funding:=jsonb_set(old_funding,'{snapshot,paidPeriod,paymentState}','"refunded"');
  PERFORM public.billing_test_complete_reconciliation('acct_SandboxA',b,'evt_refundRetired',repeat('8',64),
    (claim->>'leaseToken')::uuid,(claim->>'leaseVersion')::bigint,old_id,'sub_BeforeRetire','in_BeforeRetire',old_funding->'snapshot',
    'verified',jsonb_build_array(old_funding));
  IF public.billing_test_get_status('acct_SandboxA',b,new_id) IS DISTINCT FROM new_status THEN
    RAISE EXCEPTION 'Historical refund overwrote latest subscription diagnostics or funding'; END IF;

  -- Durable inbox before resolving a charge's customer; leases survive restarts.
  event:=jsonb_build_object('id','evt_Inbox','type','charge.refunded','livemode',false,'customerId',NULL,
    'objectId','ch_Unresolved','chargeId','ch_Unresolved');
  PERFORM public.billing_test_enqueue_event('acct_SandboxA',event,repeat('9',64));
  PERFORM public.billing_test_enqueue_event('acct_SandboxA',event,repeat('9',64));
  BEGIN PERFORM public.billing_test_enqueue_event('acct_SandboxA',jsonb_set(event,'{livemode}','true'),repeat('9',64));
    RAISE EXCEPTION 'Live inbox event accepted'; EXCEPTION WHEN SQLSTATE 'PBT02' THEN NULL; END;
  BEGIN PERFORM public.billing_test_enqueue_event('acct_SandboxA',event,repeat('0',64));
    RAISE EXCEPTION 'Inbox equivocation accepted'; EXCEPTION WHEN SQLSTATE 'PBT02' THEN NULL; END;
  SELECT value INTO queued FROM jsonb_array_elements(public.billing_test_list_pending_events('acct_SandboxA',100)) WHERE value->>'id'='evt_Inbox';
  IF queued IS NULL OR queued->>'customerId' IS NOT NULL OR queued->>'claimToken' IS NULL THEN RAISE EXCEPTION 'Unmapped inbox not durably claimed'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.billing_test_list_pending_events('acct_SandboxA',100)) WHERE value->>'id'='evt_Inbox') THEN
    RAISE EXCEPTION 'Active event claim leased twice'; END IF;
  IF public.billing_test_defer_event('acct_SandboxA','evt_Inbox',repeat('9',64),'provider_unavailable',gen_random_uuid()) THEN
    RAISE EXCEPTION 'Stale inbox claim could change retry state'; END IF;
  IF NOT public.billing_test_defer_event('acct_SandboxA','evt_Inbox',repeat('9',64),'provider_unavailable',(queued->>'claimToken')::uuid) THEN
    RAISE EXCEPTION 'Unmapped network failure not retryable'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.billing_test_list_pending_events('acct_SandboxA',100)) WHERE value->>'id'='evt_Inbox') THEN
    RAISE EXCEPTION 'Inbox backoff ignored'; END IF;
  UPDATE billing_test_private.events SET next_attempt_at=now()-interval '1 second' WHERE event_id='evt_Inbox';
  SELECT value INTO next_claim FROM jsonb_array_elements(public.billing_test_list_pending_events('acct_SandboxA',100)) WHERE value->>'id'='evt_Inbox';
  IF next_claim->>'claimToken'=queued->>'claimToken' OR (next_claim->>'attempts')::integer<2 THEN RAISE EXCEPTION 'Inbox retry did not renew durable fence'; END IF;
  PERFORM public.billing_test_bind_event_customer('acct_SandboxA','evt_Inbox',repeat('9',64),'cus_SandboxA');
  BEGIN PERFORM public.billing_test_bind_event_customer('acct_SandboxA','evt_Inbox',repeat('9',64),'cus_SandboxB');
    RAISE EXCEPTION 'Inbox customer was rebound'; EXCEPTION WHEN SQLSTATE 'PBT02' THEN NULL; END;
  PERFORM public.billing_test_enqueue_event('acct_SandboxA',event,repeat('9',64));
  claim:=public.billing_test_begin_reconciliation('acct_SandboxA','cus_SandboxA','evt_Inbox','charge.refunded',repeat('9',64));
  IF claim->>'kind'<>'claimed' THEN RAISE EXCEPTION 'Resolved inbox could not claim buyer lease'; END IF;
  PERFORM public.billing_test_fail_reconciliation('acct_SandboxA',a,'evt_Inbox',repeat('9',64),
    (claim->>'leaseToken')::uuid,(claim->>'leaseVersion')::bigint);
  IF NOT EXISTS(SELECT 1 FROM billing_test_private.events WHERE event_id='evt_Inbox' AND state='failed'
    AND next_attempt_at>clock_timestamp() AND last_error_code='provider_unavailable') THEN RAISE EXCEPTION 'Buyer failure lost retry schedule'; END IF;
  FOR i IN 1..6 LOOP IF NOT public.billing_test_consume_rate_limit('acct_SandboxA',a,'checkout') THEN RAISE EXCEPTION 'Checkout rate bucket rejected early'; END IF; END LOOP;
  IF public.billing_test_consume_rate_limit('acct_SandboxA',a,'checkout')
    OR NOT public.billing_test_consume_rate_limit('acct_SandboxA',b,'checkout')
    OR NOT public.billing_test_consume_rate_limit('acct_SandboxB',a,'checkout') THEN RAISE EXCEPTION 'Durable rate bucket isolation failed'; END IF;
  UPDATE billing_test_private.events SET delivery_lease_until=now()-interval '1 second',
    delivery_lease_token=gen_random_uuid(),next_attempt_at=now()-interval '1 second' WHERE event_id='evt_Inbox';
  SELECT value INTO next_claim FROM jsonb_array_elements(public.billing_test_list_pending_events('acct_SandboxA',100)) WHERE value->>'id'='evt_Inbox';
  IF next_claim IS NULL THEN RAISE EXCEPTION 'Expired delivery lease could not be recovered'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.billing_test_list_reconciliation_candidates('acct_SandboxA',100))) THEN
    RAISE EXCEPTION 'Fresh canonical states scheduled again'; END IF;
  UPDATE billing_test_private.outcomes SET verified_at=now()-interval '11 minutes';
  IF jsonb_array_length(public.billing_test_list_reconciliation_candidates('acct_SandboxA',100))<>2
    OR jsonb_array_length(public.billing_test_list_reconciliation_candidates('acct_SandboxA',100))<>0 THEN
    RAISE EXCEPTION 'Lost-webhook reconciliation missing or not durably throttled'; END IF;
  UPDATE billing_test_private.customers SET recovery_requested_at=now()-interval '11 minutes',
    lease_token=gen_random_uuid(),lease_until=now()+interval '30 seconds' WHERE account_id='acct_SandboxA' AND player_id=a;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.billing_test_list_reconciliation_candidates('acct_SandboxA',100)) WHERE value->>'playerId'=a::text) THEN
    RAISE EXCEPTION 'Recovery ignored active canonical buyer lease'; END IF;
END; $$;

-- Provider Session created, DB save failed, user paid before the retry. A
-- canonical completed Session has no URL and must still recover the exact seed.
DO $$ DECLARE a uuid:=current_setting('billing_sandbox_test.a')::uuid;
  b uuid:=current_setting('billing_sandbox_test.b')::uuid;
  recovered jsonb; source jsonb; result jsonb; claim jsonb; snapshot jsonb; funding jsonb; seed uuid;
BEGIN
  recovered:=public.billing_test_reserve_checkout('acct_RecoveryOnly',a,'fan_vip_monthly'); seed:=(recovered->>'id')::uuid;
  PERFORM public.billing_test_bind_customer('acct_RecoveryOnly',a,'cus_Recovered');
  source:=jsonb_build_object('id','cs_test_RecoveredCompleted','customerId','cus_Recovered','checkoutIntentId',seed,
    'offerKey','fan_vip_monthly','status','complete','subscriptionId','sub_Recovered','url',NULL,
    'expiresAt',to_char(now()+interval '1 hour','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  result:=public.billing_test_bind_recovered_checkout('acct_RecoveryOnly',a,seed,source);
  IF result->>'state'<>'completed' OR result->>'checkoutUrl' IS NOT NULL OR result->>'sessionId'<>'cs_test_RecoveredCompleted'
    OR result->>'idempotencyKey' IS DISTINCT FROM recovered->>'idempotencyKey' THEN RAISE EXCEPTION 'Completed null-URL recovery lost immutable seed'; END IF;
  IF public.billing_test_bind_recovered_checkout('acct_RecoveryOnly',a,seed,source) IS DISTINCT FROM result THEN
    RAISE EXCEPTION 'Canonical completed recovery is not idempotent'; END IF;
  BEGIN PERFORM public.billing_test_bind_recovered_checkout('acct_RecoveryOnly',b,seed,source);
    RAISE EXCEPTION 'Recovered Session bound to another player'; EXCEPTION WHEN SQLSTATE 'PBT01' THEN NULL; END;
  BEGIN PERFORM public.billing_test_bind_recovered_checkout('acct_RecoveryOnly',a,seed,jsonb_set(source,'{offerKey}','"fan_vip_annual"'));
    RAISE EXCEPTION 'Recovered Session changed immutable offer'; EXCEPTION WHEN SQLSTATE 'PBT01' THEN NULL; END;
  BEGIN PERFORM public.billing_test_bind_recovered_checkout('acct_RecoveryOnly',a,seed,jsonb_set(source,'{subscriptionId}','"sub_Other"'));
    RAISE EXCEPTION 'Recovered Session rebound subscription'; EXCEPTION WHEN SQLSTATE 'PBT01' THEN NULL; END;
  BEGIN PERFORM public.billing_test_bind_recovered_checkout('acct_RecoveryOnly',a,seed,jsonb_set(source,'{id}','"cs_live_WrongMode"'));
    RAISE EXCEPTION 'Recovered live Session accepted'; EXCEPTION WHEN SQLSTATE 'PBT01' THEN NULL; END;
  result:=public.billing_test_find_event_status('acct_RecoveryOnly','cus_Recovered','{"subscriptionId":"sub_Recovered","invoiceId":"in_NewRecovered"}'::jsonb);
  IF result#>>'{intent,id}' IS DISTINCT FROM seed::text THEN RAISE EXCEPTION 'Recovered completed Session cannot map webhook'; END IF;
  claim:=public.billing_test_begin_reconciliation('acct_RecoveryOnly','cus_Recovered','evt_RecoveredPaid','invoice.paid',repeat('a',64));
  snapshot:=jsonb_build_object('environment','test','offerKey','fan_vip_monthly','subscriptionState','active',
    'cancelAtPeriodEnd',false,'paidPeriod',jsonb_build_object('startsAt',to_char(now()-interval '1 hour','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'endsAt',to_char(now()+interval '30 days','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'paymentState','paid'));
  funding:=jsonb_build_object('snapshot',snapshot,'invoiceId','in_NewRecovered','invoiceLineId','il_NewRecovered',
    'paymentIntentId','pi_NewRecovered','chargeId','ch_NewRecovered');
  IF NOT public.billing_test_complete_reconciliation('acct_RecoveryOnly',a,'evt_RecoveredPaid',repeat('a',64),
    (claim->>'leaseToken')::uuid,(claim->>'leaseVersion')::bigint,seed,'sub_Recovered','in_NewRecovered',snapshot,'verified',jsonb_build_array(funding)) THEN
    RAISE EXCEPTION 'Recovered completed Session cannot persist canonical funding'; END IF;
  -- A separate SQL statement observes the volatile completion before this
  -- STABLE reader; expression evaluation order is not a sequencing contract.
  IF jsonb_array_length(public.billing_test_get_status('acct_RecoveryOnly',a)->'fundingPeriods')<>1 THEN
    RAISE EXCEPTION 'Recovered canonical funding was not readable'; END IF;
  -- Canonical expired/no-subscription recovery does not invent a redirect URL.
  recovered:=public.billing_test_reserve_checkout('acct_RecoveryExpired',a,'fan_vip_monthly'); seed:=(recovered->>'id')::uuid;
  PERFORM public.billing_test_bind_customer('acct_RecoveryExpired',a,'cus_RecoveredExpired');
  source:=jsonb_build_object('id','cs_test_RecoveredExpired','customerId','cus_RecoveredExpired','checkoutIntentId',seed,
    'offerKey','fan_vip_monthly','status','expired','subscriptionId',NULL,'url',NULL,
    'expiresAt',to_char(now()-interval '1 hour','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  result:=public.billing_test_bind_recovered_checkout('acct_RecoveryExpired',a,seed,source);
  IF result->>'state'<>'expired' OR result->>'checkoutUrl' IS NOT NULL
    OR public.billing_test_reserve_checkout('acct_RecoveryExpired',a,'fan_vip_monthly')->>'id'=seed::text THEN
    RAISE EXCEPTION 'Expired null-URL recovery cannot safely restart'; END IF;
  recovered:=public.billing_test_reserve_checkout('acct_RecoveryUnbound',a,'fan_vip_monthly');
  UPDATE billing_test_private.checkout_intents SET created_at=now()-interval '11 minutes'
    WHERE account_id='acct_RecoveryUnbound' AND id=(recovered->>'id')::uuid;
  result:=public.billing_test_list_reconciliation_candidates('acct_RecoveryUnbound',10);
  IF jsonb_array_length(result)<>1 OR result#>>'{0,status,intent,customerId}' IS NOT NULL
    OR result#>>'{0,status,intent,sessionId}' IS NOT NULL THEN
    RAISE EXCEPTION 'Lost customer/Session response cannot be recovered by sweep'; END IF;
  PERFORM public.billing_test_enqueue_event('acct_RecoveryUnbound',jsonb_build_object('id','evt_PiOnlyRefund','type','refund.updated',
    'livemode',false,'customerId',NULL,'objectId','re_PiOnly','paymentIntentId','pi_PiOnly'),repeat('b',64));
  SELECT value INTO result FROM jsonb_array_elements(public.billing_test_list_pending_events('acct_RecoveryUnbound',10))
    WHERE value->>'id'='evt_PiOnlyRefund';
  IF result->>'paymentIntentId' IS DISTINCT FROM 'pi_PiOnly' THEN RAISE EXCEPTION 'PI-only refund reference lost across inbox restart'; END IF;
END; $$;
RESET ROLE;

SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://billing-sandbox-test.clerk.accounts.dev','sub','user_billing_sandbox_a',
  'sid','sess_billing_sandbox_a','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF public.has_entitlement('fan_vip') OR EXISTS(SELECT 1 FROM public.get_my_entitlements()) THEN
    RAISE EXCEPTION 'Verified TEST payment granted ordinary paid capabilities'; END IF;
END; $$;
RESET ROLE;
DO $$ DECLARE after_digest jsonb; BEGIN
  SELECT jsonb_build_object(
    'profiles',(SELECT md5(COALESCE(string_agg(row_to_json(item)::text,'|' ORDER BY row_to_json(item)::text),'')) FROM public.profiles item),
    'subscriptions',(SELECT md5(COALESCE(string_agg(row_to_json(item)::text,'|' ORDER BY row_to_json(item)::text),'')) FROM public.subscriptions item),
    'plans',(SELECT md5(COALESCE(string_agg(row_to_json(item)::text,'|' ORDER BY row_to_json(item)::text),'')) FROM public.plans item),
    'entitlements',(SELECT md5(COALESCE(string_agg(row_to_json(item)::text,'|' ORDER BY row_to_json(item)::text),'')) FROM public.entitlements item),
    'plan_entitlements',(SELECT md5(COALESCE(string_agg(row_to_json(item)::text,'|' ORDER BY row_to_json(item)::text),'')) FROM public.plan_entitlements item),
    'predictions',(SELECT md5(COALESCE(string_agg(row_to_json(item)::text,'|' ORDER BY row_to_json(item)::text),'')) FROM public.predictions item),
    'matches',(SELECT md5(COALESCE(string_agg(row_to_json(item)::text,'|' ORDER BY row_to_json(item)::text),'')) FROM public.matches item),
    'members',(SELECT md5(COALESCE(string_agg(row_to_json(item)::text,'|' ORDER BY row_to_json(item)::text),'')) FROM public.lobby_members item)
  ) INTO after_digest;
  IF after_digest IS DISTINCT FROM (SELECT digest FROM billing_sandbox_normal_baseline) THEN
    RAISE EXCEPTION 'Billing sandbox changed ordinary player/game/entitlement tables'; END IF;
END; $$;
ROLLBACK;
