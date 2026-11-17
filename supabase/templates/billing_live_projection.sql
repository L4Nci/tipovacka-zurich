-- Hand-maintained LIVE-only delta. The preceding ledger is generated from TEST.
-- No offer, admission, plan, capability, enabled flag or subscription is seeded.
ALTER TABLE billing_live_private.funding_periods ADD CONSTRAINT billing_live_funding_mode
  CHECK (snapshot->>'environment' IS NOT DISTINCT FROM 'live');
ALTER TABLE billing_live_private.outcomes ADD CONSTRAINT billing_live_outcome_mode
  CHECK (snapshot IS NULL OR snapshot->>'environment' IS NOT DISTINCT FROM 'live');

CREATE TABLE billing_live_private.activation (
  account_id text PRIMARY KEY CHECK (account_id ~ '^acct_[A-Za-z0-9]{1,123}$'
    AND account_id<>'acct_1UQsnbC66ykHzmj6'),
  version text NOT NULL,
  contract jsonb NOT NULL CHECK (jsonb_typeof(contract)='object'
    AND contract->>'status'='accepted' AND contract->>'accountId'=account_id AND contract->>'version'=version),
  enabled boolean NOT NULL DEFAULT false,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  UNIQUE (account_id,version)
);
CREATE TABLE billing_live_private.checkout_admissions (
  account_id text NOT NULL,
  player_id uuid NOT NULL,
  intent_id uuid NOT NULL,
  version text NOT NULL,
  admitted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id,player_id,intent_id),
  FOREIGN KEY(account_id,version) REFERENCES billing_live_private.activation(account_id,version) ON DELETE RESTRICT,
  FOREIGN KEY(account_id,player_id,intent_id)
    REFERENCES billing_live_private.checkout_intents(account_id,player_id,id) ON DELETE RESTRICT
);
CREATE TABLE billing_live_private.grant_sources (
  account_id text NOT NULL,
  player_id uuid NOT NULL,
  intent_id uuid NOT NULL,
  invoice_id text NOT NULL,
  invoice_line_id text NOT NULL,
  subscription_id uuid NOT NULL UNIQUE REFERENCES public.subscriptions(id) ON DELETE RESTRICT,
  plan_key text NOT NULL REFERENCES public.plans(key) ON DELETE RESTRICT,
  version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id,invoice_id,invoice_line_id),
  FOREIGN KEY(account_id,invoice_id,invoice_line_id)
    REFERENCES billing_live_private.funding_periods(account_id,invoice_id,invoice_line_id) ON DELETE RESTRICT,
  FOREIGN KEY(account_id,player_id,intent_id)
    REFERENCES billing_live_private.checkout_admissions(account_id,player_id,intent_id) ON DELETE RESTRICT,
  FOREIGN KEY(account_id,version) REFERENCES billing_live_private.activation(account_id,version) ON DELETE RESTRICT
);
CREATE INDEX billing_live_grant_buyer ON billing_live_private.grant_sources(account_id,player_id,intent_id);
ALTER TABLE billing_live_private.activation ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_live_private.checkout_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_live_private.grant_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE billing_live_private.activation,billing_live_private.checkout_admissions,billing_live_private.grant_sources
  FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE billing_live_private.activation,billing_live_private.checkout_admissions,
  billing_live_private.grant_sources TO service_role;

-- Existing non-Stripe providers keep their existing contract. Every new LIVE
-- Stripe grant must have a finite, positive interval, never lifetime access.
ALTER TABLE public.subscriptions ADD CONSTRAINT billing_live_finite_subscription
  CHECK (provider IS DISTINCT FROM 'stripe_live' OR (valid_until IS NOT NULL AND isfinite(valid_from)
    AND isfinite(valid_until) AND valid_until>valid_from AND provider_reference IS NOT NULL)) NOT VALID;
ALTER TABLE public.subscriptions VALIDATE CONSTRAINT billing_live_finite_subscription;

CREATE FUNCTION billing_live_private.assert_contract(p_contract jsonb,p_require_purchasable boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item jsonb; accepted timestamptz; capability_count integer;
BEGIN
  IF jsonb_typeof(p_contract) IS DISTINCT FROM 'object'
    OR p_contract-ARRAY['status','version','accountId','planKey','currency','monthlyAmountMinor','annualAmountMinor',
      'sellerReference','sellerDisplayName','offerSummary','renewalSummary','cancellationSummary','termsUrl','privacyUrl',
      'refundUrl','supportEmail','termsVersion','refundPolicyVersion','appearancePolicyVersion','acceptedCapabilities',
      'ownedLobbyQuota','taxModel','appOrigin','clerkIssuer','acceptedAt']<>'{}'::jsonb
    OR p_contract->>'status' IS DISTINCT FROM 'accepted'
    OR COALESCE(p_contract->>'version','')!~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$'
    OR COALESCE(p_contract->>'accountId','')!~'^acct_[A-Za-z0-9]{1,123}$'
    OR p_contract->>'accountId'='acct_1UQsnbC66ykHzmj6'
    OR p_contract->>'planKey' IS DISTINCT FROM 'fan_vip' OR p_contract->>'currency' IS DISTINCT FROM 'CZK'
    OR p_contract->'monthlyAmountMinor' IS DISTINCT FROM '4900'::jsonb
    OR p_contract->'annualAmountMinor' IS DISTINCT FROM '49900'::jsonb
    OR p_contract->>'taxModel' IS DISTINCT FROM 'no_tax'
    OR jsonb_typeof(p_contract->'ownedLobbyQuota') IS DISTINCT FROM 'number'
    OR COALESCE(p_contract->>'ownedLobbyQuota','')!~'^[0-9]{1,5}$'
    OR (p_contract->>'ownedLobbyQuota')::integer NOT BETWEEN 2 AND 10000
    OR jsonb_typeof(p_contract->'acceptedCapabilities') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_contract->'acceptedCapabilities') NOT BETWEEN 1 AND 32 THEN
    RAISE EXCEPTION 'Live offer contract is incomplete or unsupported' USING ERRCODE='PBL05'; END IF;
  FOREACH capability_count IN ARRAY ARRAY[1] LOOP
    -- Keep token references separate from seller-facing prose; neither is a
    -- claim that this function checked legal compliance or implemented features.
    IF EXISTS(SELECT 1 FROM unnest(ARRAY['sellerReference','termsVersion','refundPolicyVersion','appearancePolicyVersion']) field
      WHERE COALESCE(p_contract->>field,'')!~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$')
      OR EXISTS(SELECT 1 FROM unnest(ARRAY['sellerDisplayName','offerSummary','renewalSummary','cancellationSummary']) field
        WHERE jsonb_typeof(p_contract->field) IS DISTINCT FROM 'string' OR COALESCE(p_contract->>field,'')=''
          OR p_contract->>field<>btrim(p_contract->>field) OR p_contract->>field~'[[:cntrl:]]'
          OR length(p_contract->>field)>(CASE WHEN field='sellerDisplayName' THEN 200 ELSE 1000 END))
      OR COALESCE(p_contract->>'supportEmail','')!~'^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
      OR length(p_contract->>'supportEmail')>254
      OR EXISTS(SELECT 1 FROM unnest(ARRAY['appOrigin','clerkIssuer']) field
        WHERE COALESCE(p_contract->>field,'')!~'^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z][A-Za-z0-9.-]*(:[0-9]{1,5})?$'
          OR p_contract->>field~*'([.]localhost(:[0-9]+)?$|[[:space:][:cntrl:]@])')
      OR EXISTS(SELECT 1 FROM unnest(ARRAY['termsUrl','privacyUrl','refundUrl']) field
        WHERE COALESCE(p_contract->>field,'')!~'^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z][A-Za-z0-9.-]*(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]@]*)?$'
          OR length(p_contract->>field)>2048) THEN
      RAISE EXCEPTION 'Live offer content is incomplete or unsafe' USING ERRCODE='PBL05'; END IF;
  END LOOP;
  IF COALESCE(p_contract->>'acceptedAt','')!~'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[.]\d{3}Z$' THEN
    RAISE EXCEPTION 'Live offer acceptance missing' USING ERRCODE='PBL05'; END IF;
  BEGIN accepted:=(p_contract->>'acceptedAt')::timestamptz;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Invalid Live offer acceptance' USING ERRCODE='PBL05'; END;
  IF NOT isfinite(accepted) OR accepted>clock_timestamp()
    OR to_char(accepted AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>p_contract->>'acceptedAt' THEN
    RAISE EXCEPTION 'Invalid Live offer acceptance' USING ERRCODE='PBL05'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_contract->'acceptedCapabilities') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'string' OR (item#>>'{}')!~'^[a-z][a-z0-9_]{2,63}$' THEN
      RAISE EXCEPTION 'Invalid accepted capability' USING ERRCODE='PBL05'; END IF;
  END LOOP;
  IF (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_contract->'acceptedCapabilities'))
      <>jsonb_array_length(p_contract->'acceptedCapabilities')
    OR NOT EXISTS(SELECT 1 FROM public.plans WHERE key=p_contract->>'planKey' AND (is_active OR NOT p_require_purchasable))
    OR (SELECT COALESCE(jsonb_agg(entitlement_key ORDER BY entitlement_key),'[]'::jsonb)
      FROM public.plan_entitlements WHERE plan_key=p_contract->>'planKey')
      IS DISTINCT FROM (SELECT jsonb_agg(value ORDER BY value) FROM jsonb_array_elements_text(p_contract->'acceptedCapabilities')) THEN
    RAISE EXCEPTION 'Live offer catalogue has not been accepted' USING ERRCODE='PBL05'; END IF;
END; $$;

CREATE FUNCTION public.billing_live_accept_activation(p_contract jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE normalized jsonb; stored billing_live_private.activation%ROWTYPE;
BEGIN
  PERFORM billing_live_private.assert_contract(p_contract);
  normalized:=jsonb_set(p_contract,'{acceptedCapabilities}',
    (SELECT jsonb_agg(value ORDER BY value) FROM jsonb_array_elements_text(p_contract->'acceptedCapabilities')));
  INSERT INTO billing_live_private.activation(account_id,version,contract)
    VALUES(normalized->>'accountId',normalized->>'version',normalized) ON CONFLICT DO NOTHING;
  SELECT * INTO stored FROM billing_live_private.activation WHERE account_id=normalized->>'accountId' FOR UPDATE;
  IF stored.contract IS DISTINCT FROM normalized THEN
    RAISE EXCEPTION 'Accepted Live contract is immutable' USING ERRCODE='PBL05'; END IF;
  RETURN jsonb_build_object('enabled',stored.enabled,'version',stored.version,'contract',stored.contract,
    'activatedAt',stored.activated_at);
END; $$;

CREATE FUNCTION public.billing_live_get_activation(p_account_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT jsonb_build_object('enabled',enabled,'version',version,'contract',contract,'activatedAt',activated_at)
    FROM billing_live_private.activation WHERE account_id=p_account_id;
$$;

CREATE FUNCTION public.billing_live_set_activation(p_account_id text,p_version text,p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE stored billing_live_private.activation%ROWTYPE;
BEGIN
  SELECT * INTO stored FROM billing_live_private.activation WHERE account_id=p_account_id FOR UPDATE;
  IF NOT FOUND OR stored.version IS DISTINCT FROM p_version OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'Unknown Live offer activation' USING ERRCODE='PBL05'; END IF;
  PERFORM billing_live_private.assert_contract(stored.contract,p_enabled);
  UPDATE billing_live_private.activation SET enabled=p_enabled,
    activated_at=CASE WHEN p_enabled THEN COALESCE(activated_at,clock_timestamp()) ELSE activated_at END
    WHERE account_id=p_account_id;
  RETURN true;
END; $$;

CREATE FUNCTION public.billing_live_admit_checkout(p_account_id text,p_player_id uuid,p_intent_id uuid,p_version text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE stored billing_live_private.activation%ROWTYPE; admitted billing_live_private.checkout_admissions%ROWTYPE;
BEGIN
  PERFORM 1 FROM billing_live_private.customers WHERE account_id=p_account_id AND player_id=p_player_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown Live buyer' USING ERRCODE='PBL05'; END IF;
  SELECT * INTO stored FROM billing_live_private.activation WHERE account_id=p_account_id FOR SHARE;
  IF NOT FOUND OR stored.version IS DISTINCT FROM p_version THEN
    RAISE EXCEPTION 'Unknown Live offer version' USING ERRCODE='PBL05'; END IF;
  SELECT * INTO admitted FROM billing_live_private.checkout_admissions WHERE account_id=p_account_id
    AND player_id=p_player_id AND intent_id=p_intent_id;
  IF FOUND THEN
    IF admitted.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Admission version changed' USING ERRCODE='PBL05'; END IF;
    RETURN true;
  END IF;
  IF NOT stored.enabled THEN RAISE EXCEPTION 'Live checkout is paused' USING ERRCODE='PBL05'; END IF;
  PERFORM billing_live_private.assert_contract(stored.contract);
  PERFORM 1 FROM billing_live_private.checkout_intents WHERE account_id=p_account_id AND player_id=p_player_id
    AND id=p_intent_id AND state IN ('reserved','open') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown uncompleted Live checkout' USING ERRCODE='PBL05'; END IF;
  INSERT INTO billing_live_private.checkout_admissions(account_id,player_id,intent_id,version)
    VALUES(p_account_id,p_player_id,p_intent_id,p_version);
  RETURN true;
END; $$;

CREATE FUNCTION public.billing_live_project_entitlements(p_account_id text,p_player_id uuid,p_intent_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE stored billing_live_private.activation%ROWTYPE; admitted billing_live_private.checkout_admissions%ROWTYPE;
  funding billing_live_private.funding_periods%ROWTYPE; source billing_live_private.grant_sources%ROWTYPE;
  access_id uuid; reference text; local_status text; changed integer:=0;
BEGIN
  PERFORM 1 FROM billing_live_private.customers WHERE account_id=p_account_id AND player_id=p_player_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('projected',0,'blocked',true); END IF;
  SELECT * INTO admitted FROM billing_live_private.checkout_admissions WHERE account_id=p_account_id
    AND player_id=p_player_id AND intent_id=p_intent_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('projected',0,'blocked',true); END IF;
  SELECT * INTO stored FROM billing_live_private.activation WHERE account_id=p_account_id AND version=admitted.version FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Live admission contract is missing' USING ERRCODE='PBL05'; END IF;
  -- Sale pause stops NEW admissions; admitted delayed payments, renewals and
  -- refunds continue processing under their original immutable offer.
  PERFORM billing_live_private.assert_contract(stored.contract,false);
  FOR funding IN SELECT * FROM billing_live_private.funding_periods WHERE account_id=p_account_id
    AND player_id=p_player_id AND intent_id=p_intent_id ORDER BY invoice_id,invoice_line_id FOR UPDATE LOOP
    IF funding.snapshot->>'environment' IS DISTINCT FROM 'live' OR funding.ends_at IS NULL
      OR NOT isfinite(funding.starts_at) OR NOT isfinite(funding.ends_at) OR funding.ends_at<=funding.starts_at
      OR funding.snapshot#>>'{paidPeriod,paymentState}' IS DISTINCT FROM funding.payment_state THEN
      RAISE EXCEPTION 'Live funding proof is incompatible' USING ERRCODE='PBL05'; END IF;
    local_status:=CASE WHEN funding.requires_review OR funding.payment_state<>'paid'
      OR funding.snapshot->>'subscriptionState' NOT IN ('active','cancelled','past_due') THEN 'cancelled'
      WHEN funding.ends_at<=clock_timestamp() THEN 'expired' ELSE 'active' END;
    SELECT * INTO source FROM billing_live_private.grant_sources WHERE account_id=p_account_id
      AND invoice_id=funding.invoice_id AND invoice_line_id=funding.invoice_line_id FOR UPDATE;
    IF NOT FOUND THEN
      IF local_status='cancelled' THEN CONTINUE; END IF;
      access_id:=gen_random_uuid();
      reference:='stripe-live:'||p_account_id||':'||funding.invoice_id||':'||funding.invoice_line_id;
      INSERT INTO public.subscriptions(id,user_id,plan_key,status,valid_from,valid_until,provider,provider_reference)
        VALUES(access_id,p_player_id,stored.contract->>'planKey',local_status,funding.starts_at,funding.ends_at,'stripe_live',reference);
      INSERT INTO billing_live_private.grant_sources(account_id,player_id,intent_id,invoice_id,invoice_line_id,
        subscription_id,plan_key,version) VALUES(p_account_id,p_player_id,p_intent_id,funding.invoice_id,funding.invoice_line_id,
          access_id,stored.contract->>'planKey',stored.version);
    ELSE
      IF source.player_id<>p_player_id OR source.intent_id<>p_intent_id OR source.plan_key<>stored.contract->>'planKey'
        OR source.version<>admitted.version THEN RAISE EXCEPTION 'Live grant source changed' USING ERRCODE='PBL05'; END IF;
      UPDATE public.subscriptions SET status=local_status,updated_at=clock_timestamp() WHERE id=source.subscription_id;
    END IF;
    changed:=changed+1;
  END LOOP;
  RETURN jsonb_build_object('projected',changed,'blocked',false);
END; $$;

-- Enforce source linkage even if a future service caller bypasses the projector.
-- Deferred evaluation permits subscription + source to be inserted atomically.
CREATE FUNCTION billing_live_private.require_subscription_source()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE access_row public.subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO access_row FROM public.subscriptions WHERE id=NEW.id;
  IF NOT FOUND OR access_row.provider IS DISTINCT FROM 'stripe_live' THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM billing_live_private.grant_sources source
    JOIN billing_live_private.funding_periods funding USING(account_id,invoice_id,invoice_line_id)
    JOIN billing_live_private.checkout_admissions admission ON admission.account_id=source.account_id
      AND admission.player_id=source.player_id AND admission.intent_id=source.intent_id AND admission.version=source.version
    WHERE source.subscription_id=access_row.id AND source.player_id=access_row.user_id AND source.plan_key=access_row.plan_key
      AND funding.player_id=source.player_id AND funding.intent_id=source.intent_id
      AND funding.snapshot->>'environment'='live' AND funding.starts_at=access_row.valid_from AND funding.ends_at=access_row.valid_until
      AND access_row.provider_reference='stripe-live:'||source.account_id||':'||source.invoice_id||':'||source.invoice_line_id
      AND ((funding.payment_state='paid' AND NOT funding.requires_review
        AND funding.snapshot->>'subscriptionState' IN ('active','cancelled','past_due') AND access_row.status IN ('active','expired'))
        OR ((funding.payment_state<>'paid' OR funding.requires_review
          OR funding.snapshot->>'subscriptionState' NOT IN ('active','cancelled','past_due')) AND access_row.status='cancelled'))) THEN
    RAISE EXCEPTION 'Normal Stripe access lacks matching admitted Live funding' USING ERRCODE='PBL05'; END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER billing_live_source_required AFTER INSERT OR UPDATE ON public.subscriptions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION billing_live_private.require_subscription_source();

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA billing_live_private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA billing_live_private TO service_role;
REVOKE ALL ON FUNCTION public.billing_live_accept_activation(jsonb),public.billing_live_get_activation(text),
  public.billing_live_set_activation(text,text,boolean),public.billing_live_admit_checkout(text,uuid,uuid,text),
  public.billing_live_project_entitlements(text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.billing_live_accept_activation(jsonb),public.billing_live_get_activation(text),
  public.billing_live_set_activation(text,text,boolean),public.billing_live_admit_checkout(text,uuid,uuid,text),
  public.billing_live_project_entitlements(text,uuid,uuid) TO service_role;
