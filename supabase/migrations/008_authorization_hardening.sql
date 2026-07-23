-- Prevent authenticated clients from changing platform roles or self-assigning
-- privileged lobby roles. Existing rows and roles are preserved.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO postgres;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

CREATE OR REPLACE FUNCTION public.is_lobby_member(lobby_id_val text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lobby_members
    WHERE lobby_id = lobby_id_val
      AND user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_lobby_member(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_lobby_member(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_lobby_member(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_lobby_member(text) TO postgres;
GRANT EXECUTE ON FUNCTION public.is_lobby_member(text) TO service_role;

CREATE OR REPLACE FUNCTION public.protect_profile_platform_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND (SELECT auth.uid()) IS NOT NULL THEN
    RAISE EXCEPTION 'Platform role cannot be changed by an authenticated client.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_platform_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_profile_platform_role() FROM anon;
REVOKE ALL ON FUNCTION public.protect_profile_platform_role() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.protect_profile_platform_role() TO postgres;
GRANT EXECUTE ON FUNCTION public.protect_profile_platform_role() TO service_role;

DROP TRIGGER IF EXISTS protect_profile_platform_role ON public.profiles;
CREATE TRIGGER protect_profile_platform_role
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.protect_profile_platform_role();

CREATE OR REPLACE FUNCTION public.is_lobby_owner(lobby_id_val text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lobbies
    WHERE id = lobby_id_val
      AND owner_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_lobby_owner(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_lobby_owner(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_lobby_owner(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_lobby_owner(text) TO postgres;
GRANT EXECUTE ON FUNCTION public.is_lobby_owner(text) TO service_role;

DROP POLICY IF EXISTS "Lobby members insert membership policy" ON public.lobby_members;
CREATE POLICY "Lobby members insert membership policy" ON public.lobby_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_lobby_owner(lobby_members.lobby_id)
      AND (
        lobby_members.role IN ('member', 'admin')
        OR (
          lobby_members.user_id = auth.uid()
          AND lobby_members.role = 'owner'
        )
      )
    )
    OR (
      lobby_members.user_id = auth.uid()
      AND lobby_members.role = 'member'
    )
  );
