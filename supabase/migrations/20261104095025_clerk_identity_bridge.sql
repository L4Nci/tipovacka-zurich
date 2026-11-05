-- Clerk identity bridge for the existing project. Preserves every historical row.
-- Native Supabase Third-Party Auth must validate Clerk JWTs before these RPCs.
-- No issuer is trusted until explicitly configured through the server-only RPC.

CREATE SCHEMA IF NOT EXISTS tipovacka_private;
REVOKE ALL ON SCHEMA tipovacka_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS tipovacka_private.auth_issuers (
  issuer text PRIMARY KEY,
  authorized_parties text[] NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(authorized_parties) BETWEEN 1 AND 20)
);

CREATE TABLE IF NOT EXISTS tipovacka_private.player_auth_identities (
  issuer text NOT NULL REFERENCES tipovacka_private.auth_issuers(issuer),
  subject text NOT NULL CHECK (subject ~ '^user_.+'),
  player_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issuer, subject),
  UNIQUE (player_id)
);
ALTER TABLE tipovacka_private.auth_issuers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipovacka_private.player_auth_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA tipovacka_private FROM PUBLIC, anon, authenticated;

-- Keep UUIDs and their game foreign keys, while allowing profiles without auth.users.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_key;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'cs';
ALTER TABLE public.profiles ADD CONSTRAINT profiles_display_name_length
  CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 2 AND 40);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_locale_supported CHECK (locale IN ('cs', 'en'));

CREATE OR REPLACE FUNCTION public.configure_clerk_identity_provider(p_issuer text, p_authorized_parties text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_issuer text := rtrim(btrim(p_issuer), '/');
  v_parties text[];
BEGIN
  IF v_issuer IS NULL OR v_issuer !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' THEN
    RAISE EXCEPTION 'A canonical HTTPS Clerk issuer is required.' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT rtrim(btrim(value), '/')) INTO v_parties
    FROM unnest(p_authorized_parties) AS entries(value);
  IF cardinality(v_parties) IS NULL OR cardinality(v_parties) NOT BETWEEN 1 AND 20
     OR EXISTS (SELECT 1 FROM unnest(v_parties) p(value) WHERE value IS NULL OR
       value !~ '^(https://[A-Za-z0-9.-]+(:[0-9]+)?|http://(localhost|127[.]0[.]0[.]1|\[::1\])(:[0-9]+)?)$') THEN
    RAISE EXCEPTION 'Explicit authorized origins are required.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO tipovacka_private.auth_issuers(issuer, authorized_parties)
    VALUES(v_issuer, v_parties)
    ON CONFLICT (issuer) DO UPDATE SET authorized_parties = EXCLUDED.authorized_parties, enabled = true;
END;
$$;
REVOKE ALL ON FUNCTION public.configure_clerk_identity_provider(text,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_clerk_identity_provider(text,text[]) TO service_role;

CREATE OR REPLACE FUNCTION tipovacka_private.current_clerk_identity()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_claims jsonb := auth.jwt();
BEGIN
  IF v_claims->>'role' IS DISTINCT FROM 'authenticated'
     OR v_claims->>'sub' IS NULL OR v_claims->>'sub' !~ '^user_.+'
     OR v_claims->>'sid' IS NULL OR v_claims->>'sid' !~ '^sess_.+'
     OR (v_claims ? 'sts' AND v_claims->>'sts' IS DISTINCT FROM 'active')
     OR NOT EXISTS (
       SELECT 1 FROM tipovacka_private.auth_issuers i
       WHERE i.issuer = v_claims->>'iss' AND i.enabled
         AND v_claims->>'azp' = ANY(i.authorized_parties)
     ) THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('issuer',v_claims->>'iss','subject',v_claims->>'sub');
END;
$$;
REVOKE ALL ON FUNCTION tipovacka_private.current_clerk_identity() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.current_player_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_claims jsonb := auth.jwt();
  v_identity jsonb;
  v_player uuid;
BEGIN
  IF v_claims->>'role' IS DISTINCT FROM 'authenticated' THEN RETURN NULL; END IF;
  -- Compatibility for existing signed Supabase users; never cast a Clerk sub to UUID.
  IF v_claims->>'iss' IN ('https://hkhkbtzdyjbdeeoiurvw.supabase.co/auth/v1','supabase')
     AND COALESCE(v_claims->>'sub','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT id INTO v_player FROM public.profiles WHERE id = (v_claims->>'sub')::uuid;
    RETURN v_player;
  END IF;
  v_identity := tipovacka_private.current_clerk_identity();
  IF v_identity IS NULL THEN RETURN NULL; END IF;
  SELECT player_id INTO v_player FROM tipovacka_private.player_auth_identities
    WHERE issuer = v_identity->>'issuer' AND subject = v_identity->>'subject' AND disabled_at IS NULL;
  RETURN v_player;
END;
$$;
REVOKE ALL ON FUNCTION public.current_player_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_player_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION tipovacka_private.account_payload(p_player uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id',p.id,'username',p.username,'display_name',p.display_name,'role',p.role,
    'avatar_emoji',p.avatar_emoji,'avatar_bg',p.avatar_bg,'locale',p.locale,
    'needs_profile_completion',p.display_name IS NULL)
  FROM public.profiles p WHERE p.id = p_player;
$$;
REVOKE ALL ON FUNCTION tipovacka_private.account_payload(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_my_account()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_identity jsonb := tipovacka_private.current_clerk_identity();
  v_player uuid;
  v_disabled timestamptz;
BEGIN
  IF v_identity IS NULL THEN
    RAISE EXCEPTION 'A trusted Clerk session is required.' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended((v_identity->>'issuer') || chr(31) || (v_identity->>'subject'),0));
  SELECT player_id, disabled_at INTO v_player, v_disabled
    FROM tipovacka_private.player_auth_identities
    WHERE issuer = v_identity->>'issuer' AND subject = v_identity->>'subject';
  IF FOUND AND v_disabled IS NOT NULL THEN
    RAISE EXCEPTION 'This identity is disabled.' USING ERRCODE = '42501';
  END IF;
  IF v_player IS NULL THEN
    v_player := gen_random_uuid();
    INSERT INTO public.profiles(id,username,role,avatar_emoji,avatar_bg,locale)
      VALUES(v_player,'hrac_' || replace(v_player::text,'-',''),'player','😀','#fee2e2','cs');
    INSERT INTO tipovacka_private.player_auth_identities(issuer,subject,player_id)
      VALUES(v_identity->>'issuer',v_identity->>'subject',v_player);
  END IF;
  RETURN tipovacka_private.account_payload(v_player);
END;
$$;
REVOKE ALL ON FUNCTION public.bootstrap_my_account() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.bootstrap_my_account() TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_my_profile(
  p_display_name text, p_avatar_emoji text, p_avatar_bg text, p_locale text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_player uuid := public.current_player_id();
  v_name text := btrim(p_display_name);
BEGIN
  IF v_player IS NULL THEN RAISE EXCEPTION 'Sign-in and account bootstrap are required.' USING ERRCODE = '42501'; END IF;
  IF v_name IS NULL OR char_length(v_name) NOT BETWEEN 2 AND 40 OR v_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Display name must contain 2 to 40 plain-text characters.' USING ERRCODE = '22023';
  END IF;
  IF p_avatar_emoji IS NULL OR char_length(btrim(p_avatar_emoji)) NOT BETWEEN 1 AND 16
     OR p_avatar_emoji ~ '[[:cntrl:]<>]' OR p_avatar_bg IS NULL
     OR p_avatar_bg NOT IN ('#fee2e2','#ffedd5','#fef3c7','#dcfce7','#ccfbf1','#dbeafe','#e0e7ff','#f3e8ff','#fce7f3','#e2e8f0')
     OR p_locale IS NULL OR p_locale NOT IN ('cs','en') THEN
    RAISE EXCEPTION 'Invalid profile settings.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.profiles SET username=v_name, display_name=v_name,
    avatar_emoji=btrim(p_avatar_emoji), avatar_bg=p_avatar_bg, locale=p_locale WHERE id=v_player;
  RETURN tipovacka_private.account_payload(v_player);
END;
$$;
REVOKE ALL ON FUNCTION public.complete_my_profile(text,text,text,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.complete_my_profile(text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_clerk_player_identity(p_issuer text,p_subject text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.player_id FROM tipovacka_private.player_auth_identities m
  JOIN tipovacka_private.auth_issuers i ON i.issuer=m.issuer AND i.enabled
  WHERE m.issuer=p_issuer AND m.subject=p_subject AND m.disabled_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.resolve_clerk_player_identity(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_clerk_player_identity(text,text) TO service_role;

-- Preserve each existing function's body/attributes/grants, changing only identity resolution.
DO $migration$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid, pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
      AND position('auth.uid()' IN pg_get_functiondef(p.oid)) > 0
  LOOP
    EXECUTE replace(f.definition,'auth.uid()','public.current_player_id()');
  END LOOP;
END;
$migration$;

DO $migration$
DECLARE p record;
BEGIN
  FOR p IN SELECT * FROM pg_policies WHERE schemaname='public'
    AND (position('auth.uid()' IN COALESCE(qual,'')) > 0 OR position('auth.uid()' IN COALESCE(with_check,'')) > 0)
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I%s%s',p.policyname,p.tablename,
      CASE WHEN p.qual IS NOT NULL THEN ' USING (' || replace(p.qual,'auth.uid()','public.current_player_id()') || ')' ELSE '' END,
      CASE WHEN p.with_check IS NOT NULL THEN ' WITH CHECK (' || replace(p.with_check,'auth.uid()','public.current_player_id()') || ')' ELSE '' END);
  END LOOP;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.protect_profile_platform_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.jwt()->>'role' = 'authenticated' AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.id IS DISTINCT FROM OLD.id) THEN
    RAISE EXCEPTION 'Profile identity and platform role are server-managed.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_profile_platform_role() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS protect_profile_platform_role ON public.profiles;
CREATE TRIGGER protect_profile_platform_role BEFORE UPDATE OF id,role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_platform_role();

DROP POLICY IF EXISTS "Profiles select policy" ON public.profiles;
CREATE POLICY "Profiles select policy" ON public.profiles FOR SELECT TO authenticated USING (
  id = (SELECT public.current_player_id()) OR public.is_admin()
  OR EXISTS (SELECT 1 FROM public.lobby_members member
    WHERE member.user_id=profiles.id AND public.is_lobby_member(member.lobby_id))
);
ALTER POLICY "Profiles update policy" ON public.profiles
  USING (id = (SELECT public.current_player_id()))
  WITH CHECK (id = (SELECT public.current_player_id()));

-- RLS controls whose prediction can be edited; points remain server-managed even for its owner.
CREATE OR REPLACE FUNCTION public.protect_prediction_points()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF auth.jwt()->>'role' = 'authenticated' THEN
    IF (TG_OP='INSERT' AND COALESCE(NEW.points_earned,0) <> 0)
       OR (TG_OP='UPDATE' AND NEW.points_earned IS DISTINCT FROM OLD.points_earned) THEN
      RAISE EXCEPTION 'Prediction points are server-managed.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_prediction_points() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_prediction_points BEFORE INSERT OR UPDATE OF points_earned ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.protect_prediction_points();
CREATE TRIGGER protect_longterm_prediction_points BEFORE INSERT OR UPDATE OF points_earned ON public.longterm_predictions
  FOR EACH ROW EXECUTE FUNCTION public.protect_prediction_points();

NOTIFY pgrst, 'reload schema';
