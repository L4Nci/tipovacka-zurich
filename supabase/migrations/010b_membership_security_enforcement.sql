-- =========================================================================
-- Supabase Migration: 010b_membership_security_enforcement.sql
-- Description: Final direct-write and lobby-discovery enforcement after the
--              Phase 010 frontend has cut over to secure RPCs.
--
-- Deploy only after 010_membership_security_foundation.sql is applied and the
-- production frontend is confirmed to use create_lobby_secure() and
-- join_lobby_secure().
-- =========================================================================

-- Existing owner-role rows are intentionally grandfathered. NOT VALID avoids a
-- table scan/rewrite while enforcing the rule for every new or updated row.
ALTER TABLE public.lobby_members
  ADD CONSTRAINT lobby_members_new_roles_check
  CHECK (role IN ('admin', 'member')) NOT VALID;

-- Direct REST/Data API membership mutation is disabled. Future lifecycle and
-- approval flows must use narrowly scoped RPCs instead of restoring these grants.
DROP POLICY IF EXISTS "Lobby members insert membership policy" ON public.lobby_members;
DROP POLICY IF EXISTS "Lobby members delete membership policy" ON public.lobby_members;

REVOKE INSERT, UPDATE, DELETE ON public.lobby_members FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.lobby_members FROM authenticated;

-- Lobby creation is RPC-only. Existing owner edits remain available only for
-- non-security metadata columns; owner_id and join_code are server-managed.
DROP POLICY IF EXISTS "Lobbies insert policy" ON public.lobbies;
REVOKE INSERT ON public.lobbies FROM anon;
REVOKE INSERT ON public.lobbies FROM authenticated;
REVOKE UPDATE ON public.lobbies FROM anon;
REVOKE UPDATE ON public.lobbies FROM authenticated;
GRANT UPDATE (name, short_description, long_description, visibility)
  ON public.lobbies TO authenticated;

DROP POLICY IF EXISTS "Lobbies select policy" ON public.lobbies;
CREATE POLICY "Lobbies select policy" ON public.lobbies
  FOR SELECT TO authenticated
  USING (
    public.is_lobby_member(lobbies.id)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Lobbies update own policy" ON public.lobbies;
CREATE POLICY "Lobbies update own policy" ON public.lobbies
  FOR UPDATE TO authenticated
  USING (
    public.is_lobby_owner(lobbies.id)
    OR public.is_admin()
  )
  WITH CHECK (
    lobbies.owner_id = (SELECT auth.uid())
    OR public.is_admin()
  );
