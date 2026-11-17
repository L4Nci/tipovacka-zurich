-- Retire the historical Supabase UUID-login path without deleting player history.
-- Auth-user/session cleanup and owner-selected admin promotion are separate,
-- backed-up operations; neither belongs in a generic schema migration.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';
CREATE OR REPLACE FUNCTION public.current_player_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_identity jsonb := tipovacka_private.current_clerk_identity();
  v_player uuid;
BEGIN
  IF v_identity IS NULL THEN RETURN NULL; END IF;
  SELECT player_id INTO v_player
  FROM tipovacka_private.player_auth_identities
  WHERE issuer = v_identity->>'issuer'
    AND subject = v_identity->>'subject'
    AND disabled_at IS NULL;
  RETURN v_player;
END;
$$;
REVOKE ALL ON FUNCTION public.current_player_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_player_id() TO authenticated, service_role;
