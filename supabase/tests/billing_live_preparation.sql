-- Synthetic LIVE facts only, never a Stripe request or persistent VIP grant.
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SET LOCAL TIME ZONE 'UTC';
SELECT public.configure_clerk_identity_provider('https://billing-live-fixture.clerk.accounts.dev',ARRAY['https://fantip.example']);
SELECT set_config('request.jwt.claims','{"role":"authenticated","iss":"https://billing-live-fixture.clerk.accounts.dev","sub":"user_billing_live_fixture","sid":"sess_fixture","azp":"https://fantip.example"}',true);
SET LOCAL ROLE authenticated;
SELECT set_config('billing_live_fixture.player',public.bootstrap_my_account()->>'id',true);
RESET ROLE;
INSERT INTO public.plans(key,name) VALUES('fan_vip','Synthetic VIP fixture') ON CONFLICT DO NOTHING;
INSERT INTO public.entitlements(key,description) VALUES('billing_live_fixture','Synthetic accepted capability') ON CONFLICT DO NOTHING;
INSERT INTO public.plan_entitlements(plan_key,entitlement_key) VALUES('fan_vip','billing_live_fixture') ON CONFLICT DO NOTHING;

SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM public.billing_live_get_activation('acct_LiveFixture'); RAISE EXCEPTION 'Anonymous may read activation';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.billing_live_accept_activation('{}'); RAISE EXCEPTION 'Player may activate billing';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ DECLARE a uuid:=current_setting('billing_live_fixture.player')::uuid; seed uuid; contract jsonb;
  snapshot jsonb; funding jsonb; claim jsonb; result jsonb; first_source uuid;
BEGIN
  IF has_schema_privilege('authenticated','billing_live_private','USAGE') OR has_schema_privilege('anon','billing_live_private','USAGE') THEN
    RAISE EXCEPTION 'Private Live schema exposed'; END IF;
  contract:=jsonb_build_object('status','accepted','version','fixture-v1','accountId','acct_LiveFixture','planKey','fan_vip',
    'currency','CZK','monthlyAmountMinor',4900,'annualAmountMinor',49900,'sellerReference','fixture-seller',
    'sellerDisplayName','Synthetic fixture seller','offerSummary','Synthetic accepted appearance capability',
    'renewalSummary','Synthetic renewal terms','cancellationSummary','Synthetic cancellation terms',
    'termsUrl','https://fantip.example/terms','privacyUrl','https://fantip.example/privacy','refundUrl','https://fantip.example/refund',
    'supportEmail','support@fantip.example','termsVersion','fixture-terms','refundPolicyVersion','fixture-refund',
    'appearancePolicyVersion','fixture-appearance','acceptedCapabilities',jsonb_build_array('billing_live_fixture'),
    'ownedLobbyQuota',3,'taxModel','no_tax','appOrigin','https://fantip.example','clerkIssuer','https://identity.fantip.example',
    'acceptedAt',to_char(now()-interval '1 hour','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  result:=public.billing_live_accept_activation(contract);
  IF result->>'enabled'<>'false' OR EXISTS(SELECT 1 FROM public.subscriptions WHERE user_id=a) THEN
    RAISE EXCEPTION 'Accepting policy activated billing or granted access'; END IF;
  BEGIN PERFORM public.billing_live_accept_activation(jsonb_set(contract,'{monthlyAmountMinor}','2900'));
    RAISE EXCEPTION 'Unapproved price accepted'; EXCEPTION WHEN SQLSTATE 'PBL05' THEN NULL; END;
  BEGIN PERFORM public.billing_live_accept_activation(jsonb_set(contract,'{sellerDisplayName}','"changed seller"'));
    RAISE EXCEPTION 'Accepted contract mutable'; EXCEPTION WHEN SQLSTATE 'PBL05' THEN NULL; END;
  seed:=(public.billing_live_reserve_checkout('acct_LiveFixture',a,'fan_vip_monthly')->>'id')::uuid;
  PERFORM public.billing_live_bind_customer('acct_LiveFixture',a,'cus_LiveFixture');
  BEGIN PERFORM public.billing_live_admit_checkout('acct_LiveFixture',a,seed,'fixture-v1');
    RAISE EXCEPTION 'Disabled offer admitted a purchase'; EXCEPTION WHEN SQLSTATE 'PBL05' THEN NULL; END;
  PERFORM public.billing_live_set_activation('acct_LiveFixture','fixture-v1',true);
  PERFORM public.billing_live_admit_checkout('acct_LiveFixture',a,seed,'fixture-v1');
  PERFORM public.billing_live_bind_recovered_checkout('acct_LiveFixture',a,seed,jsonb_build_object(
    'id','cs_live_Fixture','customerId','cus_LiveFixture','checkoutIntentId',seed,'offerKey','fan_vip_monthly',
    'status','complete','subscriptionId','sub_LiveFixture','url',NULL,
    'expiresAt',to_char(now()+interval '1 hour','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  -- Pause AFTER admission, BEFORE first payment webhook. Paid access must still arrive.
  PERFORM public.billing_live_set_activation('acct_LiveFixture','fixture-v1',false);
  snapshot:=jsonb_build_object('environment','live','offerKey','fan_vip_monthly','subscriptionState','cancelled',
    'cancelAtPeriodEnd',true,'paidPeriod',jsonb_build_object('startsAt',to_char(now()-interval '1 hour','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'endsAt',to_char(now()+interval '29 days','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'paymentState','paid'));
  funding:=jsonb_build_object('snapshot',snapshot,'invoiceId','in_LiveOne','invoiceLineId','il_LiveOne','paymentIntentId','pi_LiveOne','chargeId','ch_LiveOne');
  claim:=public.billing_live_begin_reconciliation('acct_LiveFixture','cus_LiveFixture','evt_LiveOne','invoice.paid',repeat('a',64));
  IF NOT (SELECT livemode FROM billing_live_private.events WHERE account_id='acct_LiveFixture' AND event_id='evt_LiveOne') THEN
    RAISE EXCEPTION 'Live reconciliation persisted TEST mode'; END IF;
  BEGIN
    PERFORM public.billing_live_enqueue_event('acct_LiveFixture',
      '{"id":"evt_TestRejected","type":"invoice.paid","livemode":false}'::jsonb,repeat('d',64));
    RAISE EXCEPTION 'Live inbox accepted TEST event';
  EXCEPTION WHEN SQLSTATE 'PBT02' THEN NULL; END;
  PERFORM public.billing_live_enqueue_event('acct_LiveFixture',
    '{"id":"evt_LiveQueued","type":"invoice.paid","livemode":true}'::jsonb,repeat('e',64));
  IF NOT (SELECT livemode FROM billing_live_private.events WHERE account_id='acct_LiveFixture' AND event_id='evt_LiveQueued') THEN
    RAISE EXCEPTION 'Live inbox persisted TEST mode'; END IF;
  BEGIN
    UPDATE billing_live_private.events SET livemode=false WHERE event_id='evt_LiveQueued';
    RAISE EXCEPTION 'Live inbox permits TEST mode mutation';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN PERFORM public.billing_live_complete_reconciliation('acct_LiveFixture',a,'evt_LiveOne',repeat('a',64),
    (claim->>'leaseToken')::uuid,(claim->>'leaseVersion')::bigint,seed,'sub_LiveFixture','in_LiveOne',
    jsonb_set(snapshot,'{environment}','"test"'),'verified',jsonb_build_array(jsonb_set(funding,'{snapshot,environment}','"test"')));
    RAISE EXCEPTION 'TEST facts entered Live grant path'; EXCEPTION WHEN SQLSTATE 'PBT04' THEN NULL; END;
  IF NOT public.billing_live_complete_reconciliation('acct_LiveFixture',a,'evt_LiveOne',repeat('a',64),
    (claim->>'leaseToken')::uuid,(claim->>'leaseVersion')::bigint,seed,'sub_LiveFixture','in_LiveOne',snapshot,'verified',jsonb_build_array(funding)) THEN
    RAISE EXCEPTION 'Live completion failed'; END IF;
  IF (SELECT count(*) FROM public.subscriptions WHERE user_id=a AND status='active' AND provider='stripe_live' AND valid_until IS NOT NULL)<>1 THEN
    RAISE EXCEPTION 'Paid admitted delayed webhook did not create finite access after sale pause'; END IF;
  SET CONSTRAINTS billing_live_source_required IMMEDIATE;
  SET CONSTRAINTS billing_live_source_required DEFERRED;
  SELECT subscription_id INTO first_source FROM billing_live_private.grant_sources WHERE invoice_id='in_LiveOne';
  PERFORM public.billing_live_project_entitlements('acct_LiveFixture',a,seed);
  IF (SELECT count(*) FROM public.subscriptions WHERE user_id=a)<>1 THEN RAISE EXCEPTION 'Projection duplicated access'; END IF;
  -- A separately funded period survives a refund of the first funding payment.
  funding:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(funding,'{invoiceId}','"in_LiveTwo"'),'{invoiceLineId}','"il_LiveTwo"'),
    '{paymentIntentId}','"pi_LiveTwo"'),'{chargeId}','"ch_LiveTwo"');
  claim:=public.billing_live_begin_reconciliation('acct_LiveFixture','cus_LiveFixture','evt_LiveTwo','invoice.paid',repeat('b',64));
  PERFORM public.billing_live_complete_reconciliation('acct_LiveFixture',a,'evt_LiveTwo',repeat('b',64),
    (claim->>'leaseToken')::uuid,(claim->>'leaseVersion')::bigint,seed,'sub_LiveFixture','in_LiveTwo',snapshot,'verified',jsonb_build_array(funding));
  snapshot:=jsonb_set(snapshot,'{paidPeriod,paymentState}','"refunded"');
  funding:=jsonb_build_object('snapshot',snapshot,'invoiceId','in_LiveOne','invoiceLineId','il_LiveOne','paymentIntentId','pi_LiveOne','chargeId','ch_LiveOne');
  claim:=public.billing_live_begin_reconciliation('acct_LiveFixture','cus_LiveFixture','evt_LiveRefund','charge.refunded',repeat('c',64));
  PERFORM public.billing_live_complete_reconciliation('acct_LiveFixture',a,'evt_LiveRefund',repeat('c',64),
    (claim->>'leaseToken')::uuid,(claim->>'leaseVersion')::bigint,seed,'sub_LiveFixture','in_LiveOne',snapshot,'verified',jsonb_build_array(funding));
  IF (SELECT status FROM public.subscriptions WHERE id=first_source)<>'cancelled'
    OR (SELECT count(*) FROM public.subscriptions WHERE user_id=a AND status='active')<>1 THEN
    RAISE EXCEPTION 'Refund revoked another invoice period'; END IF;
  BEGIN
    INSERT INTO public.subscriptions(user_id,plan_key,status,provider,provider_reference,valid_until)
      VALUES(a,'fan_vip','active','stripe_live','forged',now()+interval '1 month');
    SET CONSTRAINTS billing_live_source_required IMMEDIATE;
    RAISE EXCEPTION 'Forged grant has no source';
    EXCEPTION WHEN SQLSTATE 'PBL05' THEN NULL;
  END;
  BEGIN
    INSERT INTO public.subscriptions(user_id,plan_key,status,provider,provider_reference,valid_until)
      VALUES(a,'fan_vip','active','stripe_live','infinite',NULL);
    RAISE EXCEPTION 'Live infinite grant accepted'; EXCEPTION WHEN check_violation THEN NULL;
  END;
END; $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF NOT public.has_entitlement('billing_live_fixture') THEN RAISE EXCEPTION 'Verified Live access not visible to same Clerk player'; END IF;
END; $$;
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
