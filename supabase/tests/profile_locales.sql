-- Trusted verified-claim simulation, not a cryptographic OAuth test.
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SELECT public.configure_clerk_identity_provider('https://locale-test.clerk.accounts.dev',ARRAY['http://localhost:3000']);
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://locale-test.clerk.accounts.dev','sub','user_locale_test',
  'sid','sess_locale_test','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
SELECT public.bootstrap_my_account();
DO $$ DECLARE preference text; result jsonb;
BEGIN
  FOREACH preference IN ARRAY ARRAY['cs','en','de','pl','sk'] LOOP
    result:=public.complete_my_profile('Locale test','😀','#fee2e2',preference);
    IF result->>'locale' IS DISTINCT FROM preference OR public.is_admin() THEN
      RAISE EXCEPTION 'Preference not preserved or profile completion elevated identity';
    END IF;
  END LOOP;
  BEGIN
    PERFORM public.complete_my_profile('Locale test','😀','#fee2e2','unsupported');
    RAISE EXCEPTION 'Unsupported locale accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.complete_my_profile('L','😀','#fee2e2','de');
    RAISE EXCEPTION 'Display-name validation weakened';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.complete_my_profile('Locale test','<img>','#fee2e2','de');
    RAISE EXCEPTION 'Avatar validation weakened';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"authenticated","iss":"https://example.supabase.co/auth/v1","sub":"11111111-1111-1111-1111-111111111111"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.complete_my_profile('Locale test','😀','#fee2e2','pl');
    RAISE EXCEPTION 'Non-Clerk identity updated a profile';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
