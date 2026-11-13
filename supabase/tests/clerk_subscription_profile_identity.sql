-- Run after the FK candidate. Trusted Clerk claims exercise DB authorization,
-- not cryptographic session validation. Only rollback fixtures are written;
-- no payment, plan or entitlement is enabled for an existing player.
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SELECT public.configure_clerk_identity_provider(
  'https://billing-identity-test.clerk.accounts.dev',ARRAY['http://localhost:3000']);
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://billing-identity-test.clerk.accounts.dev','sub','user_billing_identity_a',
  'sid','sess_billing_identity_a','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
SELECT set_config('billing_test.a',public.bootstrap_my_account()->>'id',true);
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://billing-identity-test.clerk.accounts.dev','sub','user_billing_identity_b',
  'sid','sess_billing_identity_b','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
SELECT set_config('billing_test.b',public.bootstrap_my_account()->>'id',true);
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO public.plans(key,name) VALUES('billing-identity-test','Rollback only, not a sale');
INSERT INTO public.entitlements(key,description) VALUES('billing_identity_test_capability','Rollback-only capability');
INSERT INTO public.plan_entitlements(plan_key,entitlement_key)
  VALUES('billing-identity-test','billing_identity_test_capability');

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM auth.users WHERE id IN(current_setting('billing_test.a')::uuid,current_setting('billing_test.b')::uuid)) THEN
    RAISE EXCEPTION 'Clerk fixture unexpectedly depends on a native Auth row'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.subscriptions'::regclass
    AND conname='subscriptions_user_id_fkey' AND confrelid='public.profiles'::regclass
    AND confdeltype='r' AND convalidated) THEN RAISE EXCEPTION 'Subscriber profile FK was not validated/restricting'; END IF;
END $$;
INSERT INTO public.subscriptions(user_id,plan_key,status,valid_from,valid_until)
VALUES(current_setting('billing_test.a')::uuid,'billing-identity-test','active',now()-interval '1 hour',now()+interval '1 hour');
DO $$ DECLARE constraint_name text; BEGIN
  BEGIN
    INSERT INTO public.subscriptions(user_id,plan_key,status)
      VALUES(gen_random_uuid(),'billing-identity-test','active');
    RAISE EXCEPTION 'Unmapped subscriber UUID accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS constraint_name=CONSTRAINT_NAME;
    IF constraint_name<>'subscriptions_user_id_fkey' THEN RAISE; END IF;
  END;
END $$;

SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://billing-identity-test.clerk.accounts.dev','sub','user_billing_identity_a',
  'sid','sess_billing_identity_a','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF public.has_entitlement('billing_identity_test_capability') IS DISTINCT FROM true
    OR NOT EXISTS(SELECT 1 FROM public.get_my_entitlements() capability WHERE capability='billing_identity_test_capability')
    OR public.is_admin() THEN
    RAISE EXCEPTION 'Paid capability missing or confused with admin identity'; END IF;
  BEGIN PERFORM 1 FROM public.subscriptions; RAISE EXCEPTION 'Player read raw billing records';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.subscriptions(user_id,plan_key,status)
    VALUES(public.current_player_id(),'billing-identity-test','active'); RAISE EXCEPTION 'Player minted subscription';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.subscriptions SET user_id=current_setting('billing_test.b')::uuid;
    RAISE EXCEPTION 'Player transferred subscription'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.plan_entitlements(plan_key,entitlement_key)
    VALUES('free','billing_identity_test_capability'); RAISE EXCEPTION 'Player changed plan capabilities';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.profiles SET role='admin' WHERE id=public.current_player_id();
    RAISE EXCEPTION 'Capability elevated profile role'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://billing-identity-test.clerk.accounts.dev','sub','user_billing_identity_b',
  'sid','sess_billing_identity_b','azp','http://localhost:3000',
  'user_metadata',jsonb_build_object('role','admin','isVIP',true))::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF public.has_entitlement('billing_identity_test_capability') IS DISTINCT FROM false
    OR EXISTS(SELECT 1 FROM public.get_my_entitlements()) OR public.is_admin() THEN
    RAISE EXCEPTION 'Another player or metadata inherited paid capabilities/admin'; END IF;
END $$;
RESET ROLE;

-- The UUID belongs to A's profile, but a retired native JWT must not resolve it.
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','supabase','sub',current_setting('billing_test.a'))::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF public.current_player_id() IS NOT NULL OR public.has_entitlement('billing_identity_test_capability') IS DISTINCT FROM false
    OR EXISTS(SELECT 1 FROM public.get_my_entitlements()) OR public.is_admin() THEN
    RAISE EXCEPTION 'Native UUID JWT recovered Clerk subscription'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM public.get_my_entitlements(); RAISE EXCEPTION 'Anonymous entitlement reader exposed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.has_entitlement('billing_identity_test_capability'); RAISE EXCEPTION 'Anonymous capability reader exposed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- Check the existing status/time reader contract, without choosing a future
-- provider grace period, renewal policy or subscription product.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.subscriptions SET status='trialing',valid_from=now()+interval '1 hour',valid_until=now()+interval '2 hours'
  WHERE user_id=current_setting('billing_test.a')::uuid;
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://billing-identity-test.clerk.accounts.dev','sub','user_billing_identity_a',
  'sid','sess_billing_identity_a','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF public.has_entitlement('billing_identity_test_capability') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Future capability granted early'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.subscriptions SET status='active',valid_from=now()-interval '2 hours',valid_until=now()-interval '1 hour'
  WHERE user_id=current_setting('billing_test.a')::uuid;
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://billing-identity-test.clerk.accounts.dev','sub','user_billing_identity_a',
  'sid','sess_billing_identity_a','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF public.has_entitlement('billing_identity_test_capability') IS DISTINCT FROM false
    OR EXISTS(SELECT 1 FROM public.get_my_entitlements()) THEN RAISE EXCEPTION 'Expired capability stayed active'; END IF;
END $$;
RESET ROLE;

-- Remove only this rollback identity mapping so the tested failure comes from
-- billing's specific FK, rather than the identity bridge's own RESTRICT FK.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DELETE FROM tipovacka_private.player_auth_identities WHERE player_id=current_setting('billing_test.a')::uuid;
DO $$ DECLARE constraint_name text; BEGIN
  BEGIN DELETE FROM public.profiles WHERE id=current_setting('billing_test.a')::uuid;
    RAISE EXCEPTION 'Deleting player cascaded away billing history';
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS constraint_name=CONSTRAINT_NAME;
    IF constraint_name<>'subscriptions_user_id_fkey' THEN RAISE; END IF;
  END;
  IF NOT EXISTS(SELECT 1 FROM public.subscriptions WHERE user_id=current_setting('billing_test.a')::uuid)
    OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=current_setting('billing_test.a')::uuid) THEN
    RAISE EXCEPTION 'Failed profile deletion did not preserve subscription/player'; END IF;
  IF EXISTS(SELECT 1 FROM public.profiles WHERE id IN(current_setting('billing_test.a')::uuid,
    current_setting('billing_test.b')::uuid) AND role<>'player') THEN
    RAISE EXCEPTION 'Billing fixture changed an account role'; END IF;
END $$;
ROLLBACK;
