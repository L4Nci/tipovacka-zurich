-- TEST-only provider ledger in the existing database. No normal subscription,
-- plan, capability, profile, prediction or membership is changed or granted.
-- Public RPC entry points are invoker/service-only; all state is private.
SET lock_timeout = '3s';
SET statement_timeout = '20s';

CREATE SCHEMA billing_test_private;
REVOKE ALL ON SCHEMA billing_test_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA billing_test_private TO service_role;

CREATE TABLE billing_test_private.customers (
  account_id text NOT NULL CHECK (account_id ~ '^acct_[A-Za-z0-9]+$' AND length(account_id) <= 128),
  player_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  customer_id text CHECK (customer_id ~ '^cus_[A-Za-z0-9]+$' AND length(customer_id) <= 128),
  reconcile_version bigint NOT NULL DEFAULT 0 CHECK (reconcile_version >= 0),
  lease_token uuid,
  lease_until timestamptz,
  customer_seed uuid NOT NULL DEFAULT gen_random_uuid(),
  recovery_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, player_id),
  CHECK ((lease_token IS NULL) = (lease_until IS NULL))
);
CREATE UNIQUE INDEX billing_test_customer_binding_unique
  ON billing_test_private.customers(account_id, customer_id) WHERE customer_id IS NOT NULL;

CREATE TABLE billing_test_private.checkout_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  account_id text NOT NULL,
  player_id uuid NOT NULL,
  offer_key text NOT NULL CHECK (offer_key IN ('fan_vip_monthly', 'fan_vip_annual')),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'open', 'completed', 'expired', 'retired')),
  session_id text CHECK (session_id ~ '^cs_test_[A-Za-z0-9]+$' AND length(session_id) <= 256),
  checkout_url text CHECK (checkout_url ~ '^https://checkout[.]stripe[.]com/' AND checkout_url !~ '[[:space:][:cntrl:]]' AND length(checkout_url) <= 4096),
  expires_at timestamptz CHECK (expires_at IS NULL OR isfinite(expires_at)),
  subscription_id text CHECK (subscription_id ~ '^sub_[A-Za-z0-9]+$' AND length(subscription_id) <= 128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, player_id) REFERENCES billing_test_private.customers(account_id, player_id) ON DELETE RESTRICT,
  UNIQUE (account_id, player_id, id),
  CHECK ((session_id IS NULL) = (expires_at IS NULL) AND (checkout_url IS NULL OR session_id IS NOT NULL)),
  CHECK (state<>'open' OR checkout_url IS NOT NULL),
  CHECK (state = 'reserved' OR session_id IS NOT NULL)
);
CREATE UNIQUE INDEX billing_test_checkout_one_open
  ON billing_test_private.checkout_intents(account_id, player_id) WHERE state IN ('reserved', 'open');
CREATE UNIQUE INDEX billing_test_checkout_session_unique
  ON billing_test_private.checkout_intents(account_id, session_id) WHERE session_id IS NOT NULL;
CREATE UNIQUE INDEX billing_test_checkout_subscription_unique
  ON billing_test_private.checkout_intents(account_id, subscription_id) WHERE subscription_id IS NOT NULL;

CREATE TABLE billing_test_private.events (
  account_id text NOT NULL CHECK (account_id ~ '^acct_[A-Za-z0-9]+$' AND length(account_id) <= 128),
  event_id text NOT NULL CHECK ((event_id ~ '^evt_[A-Za-z0-9]+$'
    OR event_id ~ '^obs_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') AND length(event_id) <= 128),
  event_type text NOT NULL CHECK (event_type ~ '^[A-Za-z0-9_.]+$' AND length(event_type) <= 128),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  customer_id text CHECK (customer_id ~ '^cus_[A-Za-z0-9]+$' AND length(customer_id) <= 128),
  livemode boolean NOT NULL DEFAULT false CHECK (livemode=false),
  object_id text CHECK (object_id ~ '^[A-Za-z0-9_]+$' AND length(object_id)<=256),
  invoice_id text CHECK (invoice_id ~ '^in_[A-Za-z0-9]+$' AND length(invoice_id)<=128),
  charge_id text CHECK (charge_id ~ '^ch_[A-Za-z0-9]+$' AND length(charge_id)<=128),
  payment_intent_id text CHECK (payment_intent_id ~ '^pi_[A-Za-z0-9]+$' AND length(payment_intent_id)<=128),
  session_id text CHECK (session_id ~ '^cs_test_[A-Za-z0-9]+$' AND length(session_id)<=256),
  subscription_id text CHECK (subscription_id ~ '^sub_[A-Za-z0-9]+$' AND length(subscription_id)<=128),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'processing', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  received_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error_code text CHECK (last_error_code ~ '^[a-z0-9_]{1,64}$'),
  delivery_lease_token uuid,
  delivery_lease_until timestamptz,
  CHECK ((delivery_lease_token IS NULL) = (delivery_lease_until IS NULL)),
  PRIMARY KEY (account_id, event_id)
);

CREATE TABLE billing_test_private.outcomes (
  account_id text NOT NULL,
  player_id uuid NOT NULL,
  intent_id uuid NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('pending','verified','requires_review')),
  subscription_id text CHECK (subscription_id ~ '^sub_[A-Za-z0-9]+$' AND length(subscription_id) <= 128),
  invoice_id text CHECK (invoice_id ~ '^in_[A-Za-z0-9]+$' AND length(invoice_id) <= 128),
  snapshot jsonb,
  reconcile_version bigint NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, player_id, intent_id),
  UNIQUE (account_id, subscription_id),
  CHECK (outcome<>'verified' OR (subscription_id IS NOT NULL AND snapshot IS NOT NULL)),
  FOREIGN KEY (account_id, player_id, intent_id)
    REFERENCES billing_test_private.checkout_intents(account_id, player_id, id) ON DELETE RESTRICT
);

-- Historical funding evidence is independent of the latest diagnostic result.
-- It is scoped to a precise invoice line/payment, never just the buyer.
CREATE TABLE billing_test_private.funding_periods (
  account_id text NOT NULL,
  player_id uuid NOT NULL,
  intent_id uuid NOT NULL,
  subscription_id text NOT NULL CHECK (subscription_id ~ '^sub_[A-Za-z0-9]+$' AND length(subscription_id)<=128),
  invoice_id text NOT NULL CHECK (invoice_id ~ '^in_[A-Za-z0-9]+$' AND length(invoice_id)<=128),
  invoice_line_id text NOT NULL CHECK (invoice_line_id ~ '^il_[A-Za-z0-9]+$' AND length(invoice_line_id)<=128),
  payment_intent_id text NOT NULL CHECK (payment_intent_id ~ '^pi_[A-Za-z0-9]+$' AND length(payment_intent_id)<=128),
  charge_id text NOT NULL CHECK (charge_id ~ '^ch_[A-Za-z0-9]+$' AND length(charge_id)<=128),
  starts_at timestamptz NOT NULL CHECK (isfinite(starts_at)),
  ends_at timestamptz NOT NULL CHECK (isfinite(ends_at) AND ends_at>starts_at),
  payment_state text NOT NULL CHECK (payment_state IN ('paid','refunded','chargeback')),
  requires_review boolean NOT NULL DEFAULT false,
  snapshot jsonb NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id,invoice_id,invoice_line_id),
  UNIQUE (account_id,payment_intent_id),
  UNIQUE (account_id,charge_id),
  FOREIGN KEY (account_id,player_id,intent_id) REFERENCES billing_test_private.checkout_intents(account_id,player_id,id) ON DELETE RESTRICT
);
CREATE TABLE billing_test_private.rate_limits (
  account_id text NOT NULL CHECK (account_id ~ '^acct_[A-Za-z0-9]+$' AND length(account_id)<=128),
  player_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('checkout','status','portal')),
  bucket timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits>0),
  PRIMARY KEY (account_id,player_id,action,bucket)
);
CREATE TABLE billing_test_private.invoice_reviews (
  account_id text NOT NULL,
  player_id uuid NOT NULL,
  intent_id uuid NOT NULL,
  invoice_id text NOT NULL CHECK (invoice_id ~ '^in_[A-Za-z0-9]+$' AND length(invoice_id)<=128),
  requires_review boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id,invoice_id),
  FOREIGN KEY (account_id,player_id,intent_id) REFERENCES billing_test_private.checkout_intents(account_id,player_id,id) ON DELETE RESTRICT
);
CREATE INDEX billing_test_due_events ON billing_test_private.events(account_id,next_attempt_at)
  WHERE state<>'completed';
CREATE INDEX billing_test_funding_buyer ON billing_test_private.funding_periods(account_id,player_id,ends_at);

ALTER TABLE billing_test_private.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_test_private.checkout_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_test_private.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_test_private.outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_test_private.funding_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_test_private.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_test_private.invoice_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA billing_test_private FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA billing_test_private TO service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA billing_test_private FROM PUBLIC, anon, authenticated;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA billing_test_private TO service_role;

CREATE FUNCTION billing_test_private.intent_json(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', intent.id, 'offerKey', intent.offer_key, 'state', intent.state,
    'customerId', customer.customer_id, 'sessionId', intent.session_id,
    'checkoutUrl', intent.checkout_url, 'expiresAt', intent.expires_at,
    'idempotencyKey', 'fan-vip-test-checkout-' || intent.id::text,
    'createdAt',intent.created_at,'customerCreatedAt',customer.created_at,
    'customerIdempotencyKey','fan-vip-test-customer-' || customer.customer_seed::text
  ) FROM billing_test_private.checkout_intents intent
  JOIN billing_test_private.customers customer USING(account_id, player_id)
  WHERE intent.id=p_id;
$$;

CREATE FUNCTION billing_test_private.status_json(p_account_id text,p_player_id uuid,p_intent_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'intent', billing_test_private.intent_json(intent.id),
    'outcome', outcome.outcome,
    'snapshot', outcome.snapshot,
    'subscriptionId', outcome.subscription_id,
    'invoiceId', outcome.invoice_id,
    'verifiedAt', outcome.verified_at,
    'reviewInvoiceIds', COALESCE((SELECT jsonb_agg(review.invoice_id ORDER BY review.invoice_id)
      FROM billing_test_private.invoice_reviews review WHERE review.account_id=p_account_id
        AND review.player_id=p_player_id AND review.intent_id=intent.id AND review.requires_review),'[]'::jsonb),
    'fundingPeriods', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'snapshot',funding.snapshot,'invoiceId',funding.invoice_id,'invoiceLineId',funding.invoice_line_id,
      'paymentIntentId',funding.payment_intent_id,'chargeId',funding.charge_id,'requiresReview',funding.requires_review)
      ORDER BY funding.starts_at,funding.invoice_id,funding.invoice_line_id)
      FROM billing_test_private.funding_periods funding WHERE funding.account_id=p_account_id
        AND funding.player_id=p_player_id AND funding.intent_id=intent.id),'[]'::jsonb)
  ) FROM (SELECT 1) anchor
  LEFT JOIN LATERAL (
    SELECT id FROM billing_test_private.checkout_intents candidate
    WHERE candidate.account_id=p_account_id AND candidate.player_id=p_player_id
      AND (p_intent_id IS NULL OR candidate.id=p_intent_id)
    ORDER BY candidate.created_at DESC,candidate.sequence DESC LIMIT 1
  ) intent ON true
  LEFT JOIN billing_test_private.outcomes outcome ON outcome.account_id=p_account_id
    AND outcome.player_id=p_player_id AND outcome.intent_id=intent.id;
$$;

CREATE FUNCTION public.billing_test_consume_rate_limit(p_account_id text,p_player_id uuid,p_action text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE accepted integer; maximum integer;
BEGIN
  maximum:=CASE p_action WHEN 'checkout' THEN 6 WHEN 'status' THEN 30 WHEN 'portal' THEN 6 ELSE NULL END;
  IF maximum IS NULL THEN RAISE EXCEPTION 'Invalid billing action' USING ERRCODE='PBT01'; END IF;
  INSERT INTO billing_test_private.rate_limits(account_id,player_id,action,bucket,hits)
    VALUES(p_account_id,p_player_id,p_action,date_trunc('minute',clock_timestamp()),1)
    ON CONFLICT(account_id,player_id,action,bucket) DO UPDATE SET hits=billing_test_private.rate_limits.hits+1
      WHERE billing_test_private.rate_limits.hits<maximum RETURNING hits INTO accepted;
  RETURN accepted IS NOT NULL;
END;
$$;

-- The verified event is durable before provider network/customer resolution.
CREATE FUNCTION public.billing_test_enqueue_event(p_account_id text,p_event jsonb,p_fingerprint text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE existing billing_test_private.events%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_event) IS DISTINCT FROM 'object' OR p_event->'livemode' IS DISTINCT FROM 'false'::jsonb
    OR p_event->>'id' IS NULL OR p_event->>'type' IS NULL
    OR p_event-ARRAY['id','type','livemode','customerId','objectId','invoiceId','chargeId','paymentIntentId','checkoutSessionId','subscriptionId']<>'{}'::jsonb THEN
    RAISE EXCEPTION 'Invalid TEST event' USING ERRCODE='PBT02'; END IF;
  INSERT INTO billing_test_private.events(account_id,event_id,event_type,fingerprint,customer_id,
    object_id,invoice_id,charge_id,payment_intent_id,session_id,subscription_id)
    VALUES(p_account_id,p_event->>'id',p_event->>'type',p_fingerprint,p_event->>'customerId',
      p_event->>'objectId',p_event->>'invoiceId',p_event->>'chargeId',p_event->>'paymentIntentId',p_event->>'checkoutSessionId',p_event->>'subscriptionId')
    ON CONFLICT DO NOTHING;
  SELECT * INTO existing FROM billing_test_private.events WHERE account_id=p_account_id AND event_id=p_event->>'id' FOR UPDATE;
  IF existing.fingerprint IS DISTINCT FROM p_fingerprint OR existing.event_type IS DISTINCT FROM p_event->>'type'
    OR existing.object_id IS DISTINCT FROM p_event->>'objectId' OR existing.invoice_id IS DISTINCT FROM p_event->>'invoiceId'
    OR existing.charge_id IS DISTINCT FROM p_event->>'chargeId' OR existing.session_id IS DISTINCT FROM p_event->>'checkoutSessionId'
    OR existing.payment_intent_id IS DISTINCT FROM p_event->>'paymentIntentId'
    OR existing.subscription_id IS DISTINCT FROM p_event->>'subscriptionId'
    OR (p_event->>'customerId' IS NOT NULL AND existing.customer_id IS DISTINCT FROM p_event->>'customerId') THEN
    RAISE EXCEPTION 'Billing TEST event equivocation' USING ERRCODE='PBT02'; END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION public.billing_test_bind_event_customer(p_account_id text,p_event_id text,p_fingerprint text,p_customer_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_customer_id IS NULL THEN RAISE EXCEPTION 'Missing customer' USING ERRCODE='PBT02'; END IF;
  UPDATE billing_test_private.events SET customer_id=p_customer_id
    WHERE account_id=p_account_id AND event_id=p_event_id AND fingerprint=p_fingerprint
      AND (customer_id IS NULL OR customer_id=p_customer_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Event customer binding conflict' USING ERRCODE='PBT02'; END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION public.billing_test_list_pending_events(p_account_id text,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit<1 OR p_limit>100 THEN RAISE EXCEPTION 'Invalid inbox limit' USING ERRCODE='PBT01'; END IF;
  WITH due AS (
    SELECT event.account_id,event.event_id FROM billing_test_private.events event
    WHERE event.account_id=p_account_id AND event.state<>'completed' AND event.next_attempt_at<=clock_timestamp()
      AND (event.delivery_lease_until IS NULL OR event.delivery_lease_until<=clock_timestamp())
      AND NOT EXISTS(SELECT 1 FROM billing_test_private.customers customer WHERE customer.account_id=event.account_id
        AND customer.customer_id=event.customer_id AND customer.lease_until>clock_timestamp())
    ORDER BY event.next_attempt_at,event.received_at,event.event_id LIMIT p_limit FOR UPDATE OF event SKIP LOCKED
  ), claimed AS (
    UPDATE billing_test_private.events event SET delivery_lease_token=gen_random_uuid(),
      delivery_lease_until=clock_timestamp()+interval '60 seconds',attempts=attempts+1
    FROM due WHERE event.account_id=due.account_id AND event.event_id=due.event_id RETURNING event.*
  ) SELECT COALESCE(jsonb_agg(jsonb_build_object('id',event_id,'type',event_type,'livemode',false,
    'customerId',customer_id,'objectId',object_id,'invoiceId',invoice_id,'chargeId',charge_id,
    'paymentIntentId',payment_intent_id,
    'checkoutSessionId',session_id,'subscriptionId',subscription_id,'fingerprint',fingerprint,
    'attempts',attempts,'claimToken',delivery_lease_token) ORDER BY received_at,event_id),'[]'::jsonb) INTO result FROM claimed;
  RETURN result;
END;
$$;

CREATE FUNCTION public.billing_test_defer_event(p_account_id text,p_event_id text,p_fingerprint text,p_error_code text,p_claim_token uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_error_code IS NULL OR p_error_code!~'^[a-z0-9_]{1,64}$' THEN
    RAISE EXCEPTION 'Invalid safe error code' USING ERRCODE='PBT01'; END IF;
  UPDATE billing_test_private.events SET state='failed',last_error_code=p_error_code,
    next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,5*power(2,least(attempts,9)))::double precision),
    delivery_lease_token=NULL,delivery_lease_until=NULL
    WHERE account_id=p_account_id AND event_id=p_event_id AND fingerprint=p_fingerprint
      AND state IN ('pending','failed')
      AND (p_claim_token IS NOT NULL AND delivery_lease_token=p_claim_token
        OR p_claim_token IS NULL AND delivery_lease_token IS NULL);
  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.billing_test_list_reconciliation_candidates(p_account_id text,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit<1 OR p_limit>100 THEN RAISE EXCEPTION 'Invalid reconciliation limit' USING ERRCODE='PBT01'; END IF;
  WITH due AS (
    SELECT buyer.account_id,buyer.player_id,intent.id AS intent_id FROM billing_test_private.customers buyer
    JOIN LATERAL (SELECT id,state,session_id,created_at FROM billing_test_private.checkout_intents candidate
      WHERE candidate.account_id=buyer.account_id AND candidate.player_id=buyer.player_id
      ORDER BY candidate.created_at DESC,candidate.sequence DESC LIMIT 1) intent ON true
    LEFT JOIN billing_test_private.outcomes outcome ON outcome.account_id=buyer.account_id
      AND outcome.player_id=buyer.player_id AND outcome.intent_id=intent.id
    WHERE buyer.account_id=p_account_id
      AND intent.state IN ('reserved','open','completed') AND (buyer.lease_until IS NULL OR buyer.lease_until<=clock_timestamp())
      AND COALESCE(outcome.verified_at,intent.created_at)<clock_timestamp()-interval '10 minutes'
      AND (buyer.recovery_requested_at IS NULL OR buyer.recovery_requested_at<clock_timestamp()-interval '10 minutes')
    ORDER BY COALESCE(outcome.verified_at,intent.created_at),buyer.player_id LIMIT p_limit FOR UPDATE OF buyer SKIP LOCKED
  ), scheduled AS (
    UPDATE billing_test_private.customers buyer SET recovery_requested_at=clock_timestamp() FROM due
      WHERE buyer.account_id=due.account_id AND buyer.player_id=due.player_id RETURNING buyer.account_id,buyer.player_id
  ) SELECT COALESCE(jsonb_agg(jsonb_build_object('playerId',player_id,
    'status',billing_test_private.status_json(account_id,player_id,NULL)) ORDER BY player_id),'[]'::jsonb) INTO result FROM scheduled;
  RETURN result;
END;
$$;

CREATE FUNCTION public.billing_test_reserve_checkout(p_account_id text,p_player_id uuid,p_offer_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE existing_id uuid;
BEGIN
  IF p_offer_key IS NULL OR p_offer_key NOT IN ('fan_vip_monthly','fan_vip_annual') THEN
    RAISE EXCEPTION 'Unknown billing test offer' USING ERRCODE='PBT01'; END IF;
  INSERT INTO billing_test_private.customers(account_id,player_id)
    VALUES(p_account_id,p_player_id) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM billing_test_private.customers WHERE account_id=p_account_id AND player_id=p_player_id FOR UPDATE;
  -- Never infer provider expiry from a local clock/timeout. A reserved/open
  -- intent retains its seed until exact canonical expiry is explicitly saved.
  -- Completed subscriptions also block duplicate purchases across intervals.
  SELECT id INTO existing_id FROM billing_test_private.checkout_intents
    WHERE account_id=p_account_id AND player_id=p_player_id AND state IN ('reserved','open','completed')
    ORDER BY created_at DESC,sequence DESC LIMIT 1;
  IF existing_id IS NULL THEN
    INSERT INTO billing_test_private.checkout_intents(account_id,player_id,offer_key)
      VALUES(p_account_id,p_player_id,p_offer_key) RETURNING id INTO existing_id;
  END IF;
  RETURN billing_test_private.intent_json(existing_id);
END;
$$;

CREATE FUNCTION public.billing_test_bind_customer(p_account_id text,p_player_id uuid,p_customer_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE existing text;
BEGIN
  SELECT customer_id INTO existing FROM billing_test_private.customers
    WHERE account_id=p_account_id AND player_id=p_player_id FOR UPDATE;
  IF NOT FOUND OR p_customer_id IS NULL OR (existing IS NOT NULL AND existing<>p_customer_id) THEN
    RAISE EXCEPTION 'Customer binding conflict' USING ERRCODE='PBT01'; END IF;
  UPDATE billing_test_private.customers SET customer_id=p_customer_id
    WHERE account_id=p_account_id AND player_id=p_player_id;
  RETURN true;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Customer binding conflict' USING ERRCODE='PBT01';
END;
$$;

CREATE FUNCTION public.billing_test_save_checkout(p_account_id text,p_player_id uuid,p_intent_id uuid,
  p_customer_id text,p_session_id text,p_checkout_url text,p_expires_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE existing billing_test_private.checkout_intents%ROWTYPE; bound_customer text;
BEGIN
  SELECT customer_id INTO bound_customer FROM billing_test_private.customers
    WHERE account_id=p_account_id AND player_id=p_player_id FOR UPDATE;
  IF NOT FOUND OR bound_customer IS NULL OR bound_customer IS DISTINCT FROM p_customer_id THEN
    RAISE EXCEPTION 'Unknown customer binding' USING ERRCODE='PBT01'; END IF;
  SELECT * INTO existing FROM billing_test_private.checkout_intents
    WHERE account_id=p_account_id AND player_id=p_player_id AND id=p_intent_id FOR UPDATE;
  IF NOT FOUND OR existing.state='expired' THEN
    RAISE EXCEPTION 'Unknown billing test intent' USING ERRCODE='PBT01'; END IF;
  IF existing.session_id IS NOT NULL THEN
    IF existing.session_id IS DISTINCT FROM p_session_id OR existing.checkout_url IS DISTINCT FROM p_checkout_url
      OR existing.expires_at IS DISTINCT FROM p_expires_at THEN
      RAISE EXCEPTION 'Checkout binding conflict' USING ERRCODE='PBT01'; END IF;
  ELSE
    IF p_session_id IS NULL OR p_checkout_url IS NULL OR p_expires_at IS NULL THEN
      RAISE EXCEPTION 'Incomplete checkout binding' USING ERRCODE='PBT01'; END IF;
    UPDATE billing_test_private.checkout_intents SET session_id=p_session_id,
      checkout_url=p_checkout_url,expires_at=p_expires_at,state='open',updated_at=clock_timestamp()
      WHERE id=existing.id;
  END IF;
  RETURN billing_test_private.intent_json(existing.id);
END;
$$;

-- A successful provider create followed by DB failure may be recovered only
-- after canonical retrieval. Terminal Sessions legitimately have no URL.
CREATE FUNCTION public.billing_test_bind_recovered_checkout(p_account_id text,p_player_id uuid,p_intent_id uuid,p_session jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE existing billing_test_private.checkout_intents%ROWTYPE; bound_customer text;
  expiry timestamptz; provider_state text; attached_subscription text;
BEGIN
  SELECT customer_id INTO bound_customer FROM billing_test_private.customers
    WHERE account_id=p_account_id AND player_id=p_player_id FOR UPDATE;
  IF NOT FOUND OR bound_customer IS NULL OR jsonb_typeof(p_session) IS DISTINCT FROM 'object'
    OR p_session-ARRAY['id','customerId','checkoutIntentId','offerKey','status','subscriptionId','url','expiresAt']<>'{}'::jsonb
    OR bound_customer IS DISTINCT FROM p_session->>'customerId'
    OR p_session->>'checkoutIntentId' IS DISTINCT FROM p_intent_id::text
    OR COALESCE(p_session->>'id','')!~'^cs_test_[A-Za-z0-9]{1,248}$'
    OR COALESCE(p_session->>'status','') NOT IN ('open','complete','expired')
    OR NOT (p_session ? 'subscriptionId') OR NOT (p_session ? 'url')
    OR COALESCE(p_session->>'expiresAt','')!~'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{3})?Z$' THEN
    RAISE EXCEPTION 'Recovered Session binding conflict' USING ERRCODE='PBT01'; END IF;
  BEGIN expiry:=(p_session->>'expiresAt')::timestamptz;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Invalid recovered Session expiry' USING ERRCODE='PBT01'; END;
  IF NOT isfinite(expiry) THEN RAISE EXCEPTION 'Invalid recovered Session expiry' USING ERRCODE='PBT01'; END IF;
  provider_state:=p_session->>'status'; attached_subscription:=p_session->>'subscriptionId';
  IF provider_state='complete' AND attached_subscription IS NULL
    OR provider_state IN ('open','expired') AND attached_subscription IS NOT NULL
    OR provider_state='open' AND p_session->>'url' IS NULL THEN
    RAISE EXCEPTION 'Incomplete recovered Session state' USING ERRCODE='PBT01'; END IF;
  SELECT * INTO existing FROM billing_test_private.checkout_intents
    WHERE account_id=p_account_id AND player_id=p_player_id AND id=p_intent_id FOR UPDATE;
  IF NOT FOUND OR existing.state='retired' OR existing.offer_key IS DISTINCT FROM p_session->>'offerKey'
    OR existing.session_id IS NOT NULL AND existing.session_id IS DISTINCT FROM p_session->>'id'
    OR existing.expires_at IS NOT NULL AND existing.expires_at IS DISTINCT FROM expiry
    OR existing.checkout_url IS NOT NULL AND p_session->>'url' IS NOT NULL AND existing.checkout_url IS DISTINCT FROM p_session->>'url'
    OR existing.subscription_id IS NOT NULL AND existing.subscription_id IS DISTINCT FROM attached_subscription
    OR existing.state='expired' AND provider_state<>'expired'
    OR existing.state='completed' AND provider_state<>'complete' THEN
    RAISE EXCEPTION 'Immutable recovered Session changed' USING ERRCODE='PBT01'; END IF;
  UPDATE billing_test_private.checkout_intents SET session_id=p_session->>'id',
    checkout_url=COALESCE(checkout_url,p_session->>'url'),expires_at=expiry,
    subscription_id=COALESCE(subscription_id,attached_subscription),
    state=CASE provider_state WHEN 'complete' THEN 'completed' WHEN 'expired' THEN 'expired' ELSE 'open' END,
    updated_at=clock_timestamp() WHERE id=p_intent_id;
  RETURN billing_test_private.intent_json(p_intent_id);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Recovered Session already bound' USING ERRCODE='PBT01';
END;
$$;

-- Server may call only after retrieving this bound session from Stripe and
-- confirming its canonical status is expired. No caller-supplied time is proof.
CREATE FUNCTION public.billing_test_expire_checkout(p_account_id text,p_player_id uuid,p_intent_id uuid,p_session_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM billing_test_private.customers WHERE account_id=p_account_id AND player_id=p_player_id FOR UPDATE;
  UPDATE billing_test_private.checkout_intents SET state='expired',updated_at=clock_timestamp()
    WHERE account_id=p_account_id AND player_id=p_player_id AND id=p_intent_id
      AND session_id=p_session_id AND state IN ('open','expired') AND subscription_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cannot expire this billing test intent' USING ERRCODE='PBT01'; END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION public.billing_test_get_status(p_account_id text,p_player_id uuid,p_intent_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT billing_test_private.status_json(p_account_id,p_player_id,p_intent_id);
$$;

CREATE FUNCTION public.billing_test_find_event_status(p_account_id text,p_customer_id text,p_references jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE candidate billing_test_private.checkout_intents%ROWTYPE; matched_id uuid; match_count integer;
BEGIN
  IF jsonb_typeof(p_references) IS DISTINCT FROM 'object'
    OR p_references-ARRAY['sessionId','subscriptionId','invoiceId','chargeId']<>'{}'::jsonb THEN
    RAISE EXCEPTION 'Invalid event references' USING ERRCODE='PBT02'; END IF;
  IF COALESCE(p_references->>'sessionId',p_references->>'subscriptionId',p_references->>'invoiceId',p_references->>'chargeId') IS NULL THEN RETURN NULL; END IF;
  -- A new invoice/subscription may not have a local funding binding yet. Use
  -- known anchors, but never ignore a KNOWN reference to a different intent.
  WITH matches AS (
    SELECT id FROM billing_test_private.checkout_intents WHERE account_id=p_account_id
      AND (session_id=p_references->>'sessionId' OR subscription_id=p_references->>'subscriptionId')
    UNION SELECT intent_id FROM billing_test_private.funding_periods WHERE account_id=p_account_id
      AND (invoice_id=p_references->>'invoiceId' OR charge_id=p_references->>'chargeId')
    UNION SELECT intent_id FROM billing_test_private.invoice_reviews WHERE account_id=p_account_id
      AND invoice_id=p_references->>'invoiceId'
  ) SELECT count(DISTINCT id),min(id::text)::uuid INTO match_count,matched_id FROM matches;
  IF match_count<>1 THEN RETURN NULL; END IF;
  SELECT intent.* INTO candidate FROM billing_test_private.checkout_intents intent
    JOIN billing_test_private.customers buyer USING(account_id,player_id)
    WHERE intent.account_id=p_account_id AND intent.id=matched_id AND buyer.customer_id=p_customer_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN billing_test_private.status_json(p_account_id,candidate.player_id,candidate.id);
END;
$$;

-- Only a server canonical provider check may authorize this operation. The DB
-- independently fences in-flight workers and unfinished/reviewed funding.
CREATE FUNCTION public.billing_test_retire_checkout(p_account_id text,p_player_id uuid,p_intent_id uuid,p_subscription_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE buyer billing_test_private.customers%ROWTYPE;
BEGIN
  SELECT * INTO buyer FROM billing_test_private.customers WHERE account_id=p_account_id AND player_id=p_player_id FOR UPDATE;
  IF NOT FOUND OR buyer.lease_until>clock_timestamp()
    OR EXISTS(SELECT 1 FROM billing_test_private.funding_periods funding WHERE funding.account_id=p_account_id
      AND funding.player_id=p_player_id AND (funding.requires_review OR funding.payment_state='paid' AND funding.ends_at>clock_timestamp()))
    OR EXISTS(SELECT 1 FROM billing_test_private.invoice_reviews review WHERE review.account_id=p_account_id
      AND review.player_id=p_player_id AND review.requires_review)
    OR EXISTS(SELECT 1 FROM billing_test_private.outcomes outcome WHERE outcome.account_id=p_account_id
      AND outcome.player_id=p_player_id AND outcome.intent_id=p_intent_id AND outcome.outcome='requires_review') THEN
    RAISE EXCEPTION 'Unresolved funded TEST subscription' USING ERRCODE='PBT01'; END IF;
  UPDATE billing_test_private.checkout_intents SET state='retired',updated_at=clock_timestamp()
    WHERE account_id=p_account_id AND player_id=p_player_id AND id=p_intent_id
      AND subscription_id=p_subscription_id AND p_subscription_id IS NOT NULL AND state IN ('completed','retired');
  IF NOT FOUND THEN RAISE EXCEPTION 'Terminal subscription binding conflict' USING ERRCODE='PBT01'; END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION public.billing_test_begin_reconciliation(p_account_id text,p_customer_id text,p_event_id text,
  p_event_type text,p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE buyer billing_test_private.customers%ROWTYPE; event_row billing_test_private.events%ROWTYPE; token uuid;
BEGIN
  -- Consistent buyer -> event lock order, shared with completion/failure.
  SELECT * INTO buyer FROM billing_test_private.customers
    WHERE account_id=p_account_id AND customer_id=p_customer_id FOR UPDATE;
  INSERT INTO billing_test_private.events(account_id,event_id,event_type,fingerprint,customer_id)
    VALUES(p_account_id,p_event_id,p_event_type,p_fingerprint,p_customer_id) ON CONFLICT DO NOTHING;
  SELECT * INTO event_row FROM billing_test_private.events
    WHERE account_id=p_account_id AND event_id=p_event_id FOR UPDATE;
  IF event_row.fingerprint IS DISTINCT FROM p_fingerprint OR event_row.event_type IS DISTINCT FROM p_event_type
    OR (event_row.customer_id IS NOT NULL AND event_row.customer_id IS DISTINCT FROM p_customer_id) THEN
    RAISE EXCEPTION 'Billing test event equivocation' USING ERRCODE='PBT02'; END IF;
  IF event_row.state='completed' THEN RETURN jsonb_build_object('kind','completed'); END IF;
  -- Keep unmapped events pending for retry; do not acknowledge relevant mapping
  -- races as completed. Unknown/unrelated events may be filtered by the adapter.
  IF buyer.player_id IS NULL THEN RETURN jsonb_build_object('kind','unmapped'); END IF;
  IF buyer.lease_until>clock_timestamp() THEN RETURN jsonb_build_object('kind','busy'); END IF;
  token:=pg_catalog.gen_random_uuid();
  UPDATE billing_test_private.customers SET lease_token=token,lease_until=clock_timestamp()+interval '60 seconds',
    reconcile_version=reconcile_version+1
    WHERE account_id=p_account_id AND player_id=buyer.player_id RETURNING * INTO buyer;
  UPDATE billing_test_private.events SET state='processing',attempts=attempts+1,customer_id=p_customer_id,
    delivery_lease_token=NULL,delivery_lease_until=NULL,last_error_code=NULL
    WHERE account_id=p_account_id AND event_id=p_event_id;
  RETURN jsonb_build_object('kind','claimed','playerId',buyer.player_id,
    'leaseToken',token,'leaseVersion',buyer.reconcile_version,
    'status',billing_test_private.status_json(p_account_id,buyer.player_id,NULL));
END;
$$;

CREATE FUNCTION public.billing_test_complete_reconciliation(p_account_id text,p_player_id uuid,p_event_id text,
  p_fingerprint text,p_lease_token uuid,p_lease_version bigint,p_intent_id uuid,
  p_subscription_id text,p_invoice_id text,p_snapshot jsonb,p_outcome text,
  p_funding_periods jsonb DEFAULT '[]'::jsonb,p_review_invoice_ids jsonb DEFAULT '[]'::jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE buyer billing_test_private.customers%ROWTYPE; event_row billing_test_private.events%ROWTYPE;
  intent_row billing_test_private.checkout_intents%ROWTYPE; paid jsonb; starts_at timestamptz; ends_at timestamptz;
  item jsonb; funding_snapshot jsonb; existing_funding billing_test_private.funding_periods%ROWTYPE; review_id text;
BEGIN
  SELECT * INTO buyer FROM billing_test_private.customers
    WHERE account_id=p_account_id AND player_id=p_player_id FOR UPDATE;
  IF NOT FOUND OR buyer.lease_token IS DISTINCT FROM p_lease_token
    OR buyer.reconcile_version IS DISTINCT FROM p_lease_version OR buyer.lease_until<=clock_timestamp()
    OR buyer.lease_until IS NULL OR p_lease_token IS NULL THEN RETURN false; END IF;
  SELECT * INTO event_row FROM billing_test_private.events
    WHERE account_id=p_account_id AND event_id=p_event_id FOR UPDATE;
  IF NOT FOUND OR event_row.state<>'processing' OR event_row.fingerprint IS DISTINCT FROM p_fingerprint
    OR event_row.customer_id IS DISTINCT FROM buyer.customer_id THEN
    RAISE EXCEPTION 'Unknown billing test reconciliation' USING ERRCODE='PBT03'; END IF;
  SELECT * INTO intent_row FROM billing_test_private.checkout_intents
    WHERE account_id=p_account_id AND player_id=p_player_id AND id=p_intent_id FOR UPDATE;
  IF NOT FOUND OR intent_row.state NOT IN ('open','completed','expired','retired')
    OR (intent_row.subscription_id IS NOT NULL AND p_subscription_id IS NOT NULL
      AND intent_row.subscription_id IS DISTINCT FROM p_subscription_id) THEN
    RAISE EXCEPTION 'Subscription binding conflict' USING ERRCODE='PBT03'; END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('pending','verified','requires_review')
    OR (p_outcome='verified' AND (p_subscription_id IS NULL OR p_snapshot IS NULL OR intent_row.state='expired')) THEN
    RAISE EXCEPTION 'Invalid billing test outcome' USING ERRCODE='PBT04'; END IF;
  IF p_snapshot IS NOT NULL THEN
  IF jsonb_typeof(p_snapshot)<>'object'
    OR p_snapshot->>'environment' IS DISTINCT FROM 'test'
    OR p_snapshot->>'offerKey' IS DISTINCT FROM intent_row.offer_key
    OR COALESCE(p_snapshot->>'subscriptionState','') NOT IN ('active','cancelled','past_due','pending','trialing','suspended')
    OR jsonb_typeof(p_snapshot->'cancelAtPeriodEnd') IS DISTINCT FROM 'boolean'
    OR NOT (p_snapshot ? 'paidPeriod')
    OR p_snapshot-ARRAY['environment','offerKey','subscriptionState','cancelAtPeriodEnd','paidPeriod']<>'{}'::jsonb THEN
    RAISE EXCEPTION 'Invalid billing test snapshot' USING ERRCODE='PBT04'; END IF;
  paid:=p_snapshot->'paidPeriod';
  IF paid<>'null'::jsonb THEN
    IF jsonb_typeof(paid)<>'object' OR paid-ARRAY['startsAt','endsAt','paymentState']<>'{}'::jsonb
      OR COALESCE(paid->>'paymentState','') NOT IN ('paid','pending','unpaid','refunded','chargeback')
      OR COALESCE(paid->>'startsAt','')!~'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{3})?Z$'
      OR COALESCE(paid->>'endsAt','')!~'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{3})?Z$' THEN
      RAISE EXCEPTION 'Invalid billing test period' USING ERRCODE='PBT04'; END IF;
    BEGIN starts_at:=(paid->>'startsAt')::timestamptz; ends_at:=(paid->>'endsAt')::timestamptz;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Invalid billing test period' USING ERRCODE='PBT04'; END;
    IF NOT isfinite(starts_at) OR NOT isfinite(ends_at) OR ends_at<=starts_at
      OR ends_at>starts_at+(CASE WHEN intent_row.offer_key='fan_vip_monthly' THEN interval '32 days' ELSE interval '370 days' END)
      OR (paid->>'paymentState' IN ('paid','refunded','chargeback') AND p_invoice_id IS NULL) THEN
      RAISE EXCEPTION 'Invalid billing test period' USING ERRCODE='PBT04'; END IF;
  END IF;
  END IF;
  IF jsonb_typeof(p_funding_periods) IS DISTINCT FROM 'array' OR jsonb_array_length(p_funding_periods)>500
    OR jsonb_typeof(p_review_invoice_ids) IS DISTINCT FROM 'array' OR jsonb_array_length(p_review_invoice_ids)>500 THEN
    RAISE EXCEPTION 'Invalid TEST funding records' USING ERRCODE='PBT04'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_funding_periods) LOOP
    funding_snapshot:=item->'snapshot';
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR p_subscription_id IS NULL OR intent_row.state='expired'
      OR item-ARRAY['snapshot','invoiceId','invoiceLineId','paymentIntentId','chargeId','requiresReview']<>'{}'::jsonb
      OR COALESCE(item->>'invoiceId','')!~'^in_[A-Za-z0-9]{1,125}$'
      OR COALESCE(item->>'invoiceLineId','')!~'^il_[A-Za-z0-9]{1,125}$'
      OR COALESCE(item->>'paymentIntentId','')!~'^pi_[A-Za-z0-9]{1,125}$'
      OR COALESCE(item->>'chargeId','')!~'^ch_[A-Za-z0-9]{1,125}$'
      OR jsonb_typeof(funding_snapshot) IS DISTINCT FROM 'object'
      OR funding_snapshot->>'environment' IS DISTINCT FROM 'test'
      OR funding_snapshot->>'offerKey' IS DISTINCT FROM intent_row.offer_key
      OR COALESCE(funding_snapshot->>'subscriptionState','') NOT IN ('active','cancelled','past_due','pending','trialing','suspended')
      OR jsonb_typeof(funding_snapshot->'cancelAtPeriodEnd') IS DISTINCT FROM 'boolean'
      OR funding_snapshot-ARRAY['environment','offerKey','subscriptionState','cancelAtPeriodEnd','paidPeriod']<>'{}'::jsonb THEN
      RAISE EXCEPTION 'Invalid funding binding' USING ERRCODE='PBT04'; END IF;
    paid:=funding_snapshot->'paidPeriod';
    IF jsonb_typeof(paid) IS DISTINCT FROM 'object' OR paid-ARRAY['startsAt','endsAt','paymentState']<>'{}'::jsonb
      OR COALESCE(paid->>'paymentState','') NOT IN ('paid','refunded','chargeback')
      OR COALESCE(paid->>'startsAt','')!~'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{3})?Z$'
      OR COALESCE(paid->>'endsAt','')!~'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{3})?Z$' THEN
      RAISE EXCEPTION 'Invalid funded period' USING ERRCODE='PBT04'; END IF;
    BEGIN starts_at:=(paid->>'startsAt')::timestamptz; ends_at:=(paid->>'endsAt')::timestamptz;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Invalid funded dates' USING ERRCODE='PBT04'; END;
    IF NOT isfinite(starts_at) OR NOT isfinite(ends_at) OR ends_at<=starts_at
      OR ends_at>starts_at+(CASE WHEN intent_row.offer_key='fan_vip_monthly' THEN interval '32 days' ELSE interval '370 days' END) THEN
      RAISE EXCEPTION 'Invalid funded dates' USING ERRCODE='PBT04'; END IF;
    SELECT * INTO existing_funding FROM billing_test_private.funding_periods WHERE account_id=p_account_id
      AND invoice_id=item->>'invoiceId' AND invoice_line_id=item->>'invoiceLineId' FOR UPDATE;
    IF FOUND AND (existing_funding.player_id<>p_player_id OR existing_funding.intent_id<>p_intent_id
      OR existing_funding.subscription_id<>p_subscription_id OR existing_funding.payment_intent_id<>item->>'paymentIntentId'
      OR existing_funding.charge_id<>item->>'chargeId' OR existing_funding.starts_at<>starts_at OR existing_funding.ends_at<>ends_at) THEN
      RAISE EXCEPTION 'Immutable funding binding changed' USING ERRCODE='PBT04'; END IF;
    INSERT INTO billing_test_private.funding_periods(account_id,player_id,intent_id,subscription_id,invoice_id,
      invoice_line_id,payment_intent_id,charge_id,starts_at,ends_at,payment_state,snapshot,requires_review)
      VALUES(p_account_id,p_player_id,p_intent_id,p_subscription_id,item->>'invoiceId',item->>'invoiceLineId',
        item->>'paymentIntentId',item->>'chargeId',starts_at,ends_at,paid->>'paymentState',funding_snapshot,false)
      ON CONFLICT(account_id,invoice_id,invoice_line_id) DO UPDATE SET payment_state=EXCLUDED.payment_state,
        snapshot=EXCLUDED.snapshot,requires_review=false,verified_at=clock_timestamp();
    UPDATE billing_test_private.invoice_reviews SET requires_review=false,updated_at=clock_timestamp()
      WHERE account_id=p_account_id AND player_id=p_player_id AND intent_id=p_intent_id AND invoice_id=item->>'invoiceId';
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_review_invoice_ids) LOOP
    review_id:=item#>>'{}';
    IF jsonb_typeof(item)<>'string' OR COALESCE(review_id,'')!~'^in_[A-Za-z0-9]{1,125}$' THEN
      RAISE EXCEPTION 'Invalid review invoice' USING ERRCODE='PBT04'; END IF;
    INSERT INTO billing_test_private.invoice_reviews(account_id,player_id,intent_id,invoice_id)
      VALUES(p_account_id,p_player_id,p_intent_id,review_id)
      ON CONFLICT(account_id,invoice_id) DO UPDATE SET requires_review=true,updated_at=clock_timestamp()
        WHERE billing_test_private.invoice_reviews.player_id=p_player_id AND billing_test_private.invoice_reviews.intent_id=p_intent_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Review invoice binding conflict' USING ERRCODE='PBT04'; END IF;
    UPDATE billing_test_private.funding_periods SET requires_review=true WHERE account_id=p_account_id
      AND player_id=p_player_id AND intent_id=p_intent_id AND invoice_id=review_id;
  END LOOP;
  INSERT INTO billing_test_private.outcomes(account_id,player_id,intent_id,outcome,subscription_id,invoice_id,snapshot,reconcile_version,verified_at)
    VALUES(p_account_id,p_player_id,p_intent_id,p_outcome,p_subscription_id,p_invoice_id,p_snapshot,p_lease_version,clock_timestamp())
    ON CONFLICT(account_id,player_id,intent_id) DO UPDATE SET
      outcome=EXCLUDED.outcome,subscription_id=COALESCE(EXCLUDED.subscription_id,billing_test_private.outcomes.subscription_id),
      invoice_id=EXCLUDED.invoice_id,snapshot=EXCLUDED.snapshot,
      reconcile_version=EXCLUDED.reconcile_version,verified_at=EXCLUDED.verified_at;
  UPDATE billing_test_private.checkout_intents SET subscription_id=COALESCE(p_subscription_id,subscription_id),
    state=CASE WHEN state<>'retired' AND (p_snapshot#>>'{paidPeriod,paymentState}'='paid'
      OR EXISTS(SELECT 1 FROM billing_test_private.funding_periods funding WHERE funding.account_id=p_account_id
        AND funding.intent_id=p_intent_id AND funding.payment_state='paid')) THEN 'completed' ELSE state END,updated_at=clock_timestamp()
    WHERE id=p_intent_id;
  UPDATE billing_test_private.events SET state='completed',completed_at=clock_timestamp(),
    delivery_lease_token=NULL,delivery_lease_until=NULL,last_error_code=NULL
    WHERE account_id=p_account_id AND event_id=p_event_id;
  UPDATE billing_test_private.customers SET lease_token=NULL,lease_until=NULL
    WHERE account_id=p_account_id AND player_id=p_player_id;
  RETURN true;
END;
$$;

CREATE FUNCTION public.billing_test_fail_reconciliation(p_account_id text,p_player_id uuid,p_event_id text,
  p_fingerprint text,p_lease_token uuid,p_lease_version bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE buyer billing_test_private.customers%ROWTYPE;
BEGIN
  SELECT * INTO buyer FROM billing_test_private.customers
    WHERE account_id=p_account_id AND player_id=p_player_id FOR UPDATE;
  IF NOT FOUND OR p_lease_token IS NULL OR buyer.lease_token IS DISTINCT FROM p_lease_token
    OR buyer.reconcile_version IS DISTINCT FROM p_lease_version THEN RETURN false; END IF;
  UPDATE billing_test_private.events SET state='failed',last_error_code='provider_unavailable',
    next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,5*power(2,least(attempts,9)))::double precision),
    delivery_lease_token=NULL,delivery_lease_until=NULL
    WHERE account_id=p_account_id AND event_id=p_event_id AND fingerprint=p_fingerprint
      AND customer_id=buyer.customer_id AND state='processing';
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE billing_test_private.customers SET lease_token=NULL,lease_until=NULL
    WHERE account_id=p_account_id AND player_id=p_player_id;
  RETURN true;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA billing_test_private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA billing_test_private TO service_role;
DO $$ DECLARE routine regprocedure; BEGIN
  FOR routine IN SELECT procedure.oid::regprocedure FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
    WHERE namespace.nspname='public' AND procedure.proname IN (
      'billing_test_reserve_checkout','billing_test_bind_customer','billing_test_save_checkout',
      'billing_test_bind_recovered_checkout',
      'billing_test_expire_checkout','billing_test_get_status','billing_test_begin_reconciliation',
      'billing_test_complete_reconciliation','billing_test_fail_reconciliation','billing_test_enqueue_event',
      'billing_test_bind_event_customer','billing_test_list_pending_events','billing_test_defer_event',
      'billing_test_find_event_status','billing_test_retire_checkout','billing_test_consume_rate_limit',
      'billing_test_list_reconciliation_candidates') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',routine);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',routine);
  END LOOP;
END; $$;

COMMENT ON SCHEMA billing_test_private IS 'Service-only Stripe TEST verification. Never normal paid capabilities; no production payment activation.';
