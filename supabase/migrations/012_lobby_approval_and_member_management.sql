-- =========================================================================
-- Supabase Migration: 012_lobby_approval_and_member_management.sql
-- Description: Add open/approval-required lobby entry, atomic join requests,
--              and the final owner/admin member-management permission matrix.
--
-- This migration does not delete memberships, predictions, or scoring data.
-- Pending access is represented only by lobby_join_requests, never by a
-- lobby_members row.
-- =========================================================================

ALTER TABLE public.lobbies
  ADD COLUMN IF NOT EXISTS join_policy text NOT NULL DEFAULT 'open';

ALTER TABLE public.lobbies
  DROP CONSTRAINT IF EXISTS lobbies_join_policy_check;
ALTER TABLE public.lobbies
  ADD CONSTRAINT lobbies_join_policy_check
  CHECK (join_policy IN ('open', 'approval_required'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.lobby_members
    WHERE membership_status = 'pending'
  ) THEN
    RAISE EXCEPTION
      'Pending lobby_members rows must be resolved before Phase 012. Join requests use a separate table.';
  END IF;
END;
$$;

ALTER TABLE public.lobby_members
  DROP CONSTRAINT IF EXISTS lobby_members_membership_status_check;
ALTER TABLE public.lobby_members
  ADD CONSTRAINT lobby_members_membership_status_check
  CHECK (membership_status IN ('active', 'removed', 'left'));

ALTER TABLE public.lobby_members
  DROP CONSTRAINT IF EXISTS lobby_members_membership_end_check;
ALTER TABLE public.lobby_members
  ADD CONSTRAINT lobby_members_membership_end_check
  CHECK (
    (
      membership_status = 'active'
      AND ended_at IS NULL
      AND ended_by IS NULL
    )
    OR (
      membership_status IN ('removed', 'left')
      AND ended_at IS NOT NULL
    )
  );

CREATE TABLE public.lobby_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id text NOT NULL
    REFERENCES public.lobbies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  applicant_seen_at timestamptz,
  CONSTRAINT lobby_join_requests_resolution_check CHECK (
    (
      status = 'pending'
      AND resolved_at IS NULL
      AND resolved_by IS NULL
      AND applicant_seen_at IS NULL
    )
    OR (
      status IN ('approved', 'rejected', 'cancelled')
      AND resolved_at IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX lobby_join_requests_one_pending_idx
  ON public.lobby_join_requests(lobby_id, user_id)
  WHERE status = 'pending';

CREATE INDEX lobby_join_requests_lobby_pending_idx
  ON public.lobby_join_requests(lobby_id, created_at, id)
  WHERE status = 'pending';

CREATE INDEX lobby_join_requests_user_recent_idx
  ON public.lobby_join_requests(user_id, created_at DESC, id);

ALTER TABLE public.lobby_join_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.lobby_join_requests FROM PUBLIC;
REVOKE ALL ON TABLE public.lobby_join_requests FROM anon;
REVOKE ALL ON TABLE public.lobby_join_requests FROM service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.lobby_join_requests FROM authenticated;
GRANT SELECT ON public.lobby_join_requests TO authenticated;
GRANT ALL ON public.lobby_join_requests TO postgres;

CREATE OR REPLACE FUNCTION public.is_lobby_admin(lobby_id_val text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.lobbies
      WHERE id = lobby_id_val
        AND owner_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.lobby_members
      WHERE lobby_id = lobby_id_val
        AND user_id = (SELECT auth.uid())
        AND role = 'admin'
        AND membership_status = 'active'
    );
$$;

REVOKE ALL ON FUNCTION public.is_lobby_admin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_lobby_admin(text) FROM anon;
REVOKE ALL ON FUNCTION public.is_lobby_admin(text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.is_lobby_admin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_lobby_admin(text) TO postgres;

CREATE POLICY "Applicants and lobby admins can read join requests"
  ON public.lobby_join_requests
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_lobby_admin(lobby_id)
  );

-- Six-argument creation is the Phase 012 API. The existing five-argument
-- function remains available during rollout and continues to create open
-- lobbies.
CREATE OR REPLACE FUNCTION public.create_lobby_secure(
  lobby_name_param text,
  tournament_id_param text,
  visibility_param text,
  short_description_param text,
  long_description_param text,
  join_policy_param text
)
RETURNS TABLE (
  id text,
  name text,
  owner_id uuid,
  tournament_id text,
  short_description text,
  long_description text,
  join_code text,
  visibility text,
  created_at timestamptz,
  tournament_name text,
  is_owner boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  created_lobby record;
BEGIN
  IF join_policy_param NOT IN ('open', 'approval_required') THEN
    RAISE EXCEPTION 'Invalid lobby join policy.'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO STRICT created_lobby
  FROM public.create_lobby_secure(
    lobby_name_param,
    tournament_id_param,
    visibility_param,
    short_description_param,
    long_description_param
  );

  UPDATE public.lobbies
  SET join_policy = join_policy_param
  WHERE public.lobbies.id = created_lobby.id;

  RETURN QUERY
  SELECT
    created_lobby.id,
    created_lobby.name,
    created_lobby.owner_id,
    created_lobby.tournament_id,
    created_lobby.short_description,
    created_lobby.long_description,
    created_lobby.join_code,
    created_lobby.visibility,
    created_lobby.created_at,
    created_lobby.tournament_name,
    created_lobby.is_owner;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_lobby_secure(join_code_param text)
RETURNS TABLE (
  membership_state text,
  id text,
  name text,
  owner_id uuid,
  tournament_id text,
  short_description text,
  long_description text,
  join_code text,
  visibility text,
  created_at timestamptz,
  tournament_name text,
  is_owner boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  normalized_code text := upper(btrim(COALESCE(join_code_param, '')));
  target_lobby public.lobbies%ROWTYPE;
  target_membership public.lobby_members%ROWTYPE;
  result_state text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  IF normalized_code = '' OR length(normalized_code) > 128 THEN
    RAISE EXCEPTION 'Lobby not found.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT lobby.*
  INTO target_lobby
  FROM public.lobbies AS lobby
  WHERE lobby.join_code = normalized_code
  LIMIT 1
  FOR SHARE;

  IF target_lobby.id IS NULL THEN
    RAISE EXCEPTION 'Lobby not found.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT membership.*
  INTO target_membership
  FROM public.lobby_members AS membership
  WHERE membership.lobby_id = target_lobby.id
    AND membership.user_id = caller_id
  FOR UPDATE;

  IF target_membership.membership_status = 'active' THEN
    result_state := 'already_member';
  ELSIF target_membership.membership_status = 'removed' THEN
    result_state := 'removed';
  ELSIF target_lobby.join_policy = 'approval_required' THEN
    IF EXISTS (
      SELECT 1
      FROM public.lobby_join_requests AS rejected_request
      WHERE rejected_request.lobby_id = target_lobby.id
        AND rejected_request.user_id = caller_id
        AND rejected_request.status = 'rejected'
        AND rejected_request.resolved_at > now() - interval '42 hours'
    ) THEN
      RAISE EXCEPTION
        'Po zamítnutí můžeš novou žádost poslat nejdříve za 42 hodin.'
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.lobby_join_requests (
      lobby_id,
      user_id,
      status
    )
    VALUES (
      target_lobby.id,
      caller_id,
      'pending'
    )
    ON CONFLICT (lobby_id, user_id)
      WHERE status = 'pending'
    DO NOTHING;

    result_state := 'pending';
  ELSE
    UPDATE public.lobby_join_requests
    SET
      status = 'cancelled',
      resolved_at = now(),
      resolved_by = caller_id
    WHERE lobby_id = target_lobby.id
      AND user_id = caller_id
      AND status = 'pending';

    IF target_membership.membership_status = 'left' THEN
      UPDATE public.lobby_members
      SET
        membership_status = 'active',
        role = 'member',
        joined_at = now(),
        ended_at = NULL,
        ended_by = NULL
      WHERE id = target_membership.id;
      result_state := 'rejoined';
    ELSIF target_membership.id IS NULL THEN
      INSERT INTO public.lobby_members (
        lobby_id,
        user_id,
        role,
        membership_status
      )
      VALUES (
        target_lobby.id,
        caller_id,
        'member',
        'active'
      )
      ON CONFLICT (lobby_id, user_id) DO NOTHING;

      IF FOUND THEN
        result_state := 'joined';
      ELSE
        SELECT membership.*
        INTO target_membership
        FROM public.lobby_members AS membership
        WHERE membership.lobby_id = target_lobby.id
          AND membership.user_id = caller_id
        FOR UPDATE;

        IF target_membership.membership_status = 'active' THEN
          result_state := 'already_member';
        ELSIF target_membership.membership_status = 'left' THEN
          UPDATE public.lobby_members
          SET
            membership_status = 'active',
            role = 'member',
            joined_at = now(),
            ended_at = NULL,
            ended_by = NULL
          WHERE id = target_membership.id;
          result_state := 'rejoined';
        ELSIF target_membership.membership_status = 'removed' THEN
          result_state := 'removed';
        ELSE
          RAISE EXCEPTION 'Unsupported membership state.'
            USING ERRCODE = '22023';
        END IF;
      END IF;
    ELSE
      RAISE EXCEPTION 'Unsupported membership state.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    result_state,
    lobby.id,
    lobby.name,
    lobby.owner_id,
    lobby.tournament_id,
    lobby.short_description,
    lobby.long_description,
    CASE
      WHEN result_state IN ('joined', 'rejoined', 'already_member')
        THEN lobby.join_code
      ELSE ''
    END,
    lobby.visibility,
    lobby.created_at,
    tournament.name,
    lobby.owner_id = caller_id
  FROM public.lobbies AS lobby
  JOIN public.tournaments AS tournament
    ON tournament.id = lobby.tournament_id
  WHERE lobby.id = target_lobby.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_lobby_join_policy(
  lobby_id_param text,
  join_policy_param text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  IF join_policy_param NOT IN ('open', 'approval_required') THEN
    RAISE EXCEPTION 'Invalid lobby join policy.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_lobby_owner(lobby_id_param)
    OR public.is_admin()
  ) THEN
    RAISE EXCEPTION 'Only the lobby owner can change the join policy.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.lobbies
  SET join_policy = join_policy_param
  WHERE id = lobby_id_param;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lobby not found.'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN join_policy_param;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_lobby_join_request(
  request_id_param uuid,
  decision_param text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  target_request public.lobby_join_requests%ROWTYPE;
  target_membership public.lobby_members%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  IF decision_param NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected.'
      USING ERRCODE = '22023';
  END IF;

  SELECT request.*
  INTO target_request
  FROM public.lobby_join_requests AS request
  WHERE request.id = request_id_param
  FOR UPDATE;

  IF target_request.id IS NULL THEN
    RAISE EXCEPTION 'Join request not found.'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_lobby_admin(target_request.lobby_id) THEN
    RAISE EXCEPTION 'Only the lobby owner or admin can resolve this request.'
      USING ERRCODE = '42501';
  END IF;

  IF target_request.status <> 'pending' THEN
    RETURN target_request.status;
  END IF;

  IF decision_param = 'approved' THEN
    SELECT membership.*
    INTO target_membership
    FROM public.lobby_members AS membership
    WHERE membership.lobby_id = target_request.lobby_id
      AND membership.user_id = target_request.user_id
    FOR UPDATE;

    IF target_membership.membership_status = 'removed' THEN
      RAISE EXCEPTION 'Removed members must be restored explicitly.'
        USING ERRCODE = '42501';
    ELSIF target_membership.membership_status = 'active' THEN
      NULL;
    ELSIF target_membership.membership_status = 'left' THEN
      UPDATE public.lobby_members
      SET
        membership_status = 'active',
        role = 'member',
        joined_at = now(),
        ended_at = NULL,
        ended_by = NULL
      WHERE id = target_membership.id;
    ELSIF target_membership.id IS NULL THEN
      INSERT INTO public.lobby_members (
        lobby_id,
        user_id,
        role,
        membership_status
      )
      VALUES (
        target_request.lobby_id,
        target_request.user_id,
        'member',
        'active'
      );
    ELSE
      RAISE EXCEPTION 'Unsupported membership state.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.lobby_join_requests
  SET
    status = decision_param,
    resolved_at = now(),
    resolved_by = caller_id,
    applicant_seen_at = NULL
  WHERE id = target_request.id;

  RETURN decision_param;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_lobby_join_request(
  request_id_param uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  target_request public.lobby_join_requests%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  SELECT request.*
  INTO target_request
  FROM public.lobby_join_requests AS request
  WHERE request.id = request_id_param
    AND request.user_id = caller_id
  FOR UPDATE;

  IF target_request.id IS NULL THEN
    RAISE EXCEPTION 'Join request not found.'
      USING ERRCODE = 'P0002';
  END IF;

  IF target_request.status <> 'pending' THEN
    RETURN target_request.status;
  END IF;

  UPDATE public.lobby_join_requests
  SET
    status = 'cancelled',
    resolved_at = now(),
    resolved_by = caller_id
  WHERE id = target_request.id;

  RETURN 'cancelled';
END;
$$;

-- Owner/admin removal permissions are enforced in SQL. A lobby admin can
-- remove only an ordinary active member. The owner (or platform admin) may
-- also remove a lobby admin, but nobody may remove the lobby owner.
CREATE OR REPLACE FUNCTION public.remove_lobby_member_secure(
  lobby_id_param text,
  member_id_param uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  caller_is_owner boolean;
  caller_is_platform_admin boolean;
  caller_is_lobby_admin boolean;
  target_membership public.lobby_members%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.lobbies
    WHERE id = lobby_id_param
      AND owner_id = caller_id
  ) INTO caller_is_owner;

  SELECT public.is_admin() INTO caller_is_platform_admin;

  SELECT EXISTS (
    SELECT 1
    FROM public.lobby_members
    WHERE lobby_id = lobby_id_param
      AND user_id = caller_id
      AND role = 'admin'
      AND membership_status = 'active'
  ) INTO caller_is_lobby_admin;

  IF NOT (
    caller_is_owner
    OR caller_is_platform_admin
    OR caller_is_lobby_admin
  ) THEN
    RAISE EXCEPTION 'Only the lobby owner or admin can remove a member.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.lobbies
    WHERE id = lobby_id_param
      AND owner_id = member_id_param
  ) THEN
    RAISE EXCEPTION 'The lobby owner cannot be removed.'
      USING ERRCODE = '42501';
  END IF;

  SELECT membership.*
  INTO target_membership
  FROM public.lobby_members AS membership
  WHERE membership.lobby_id = lobby_id_param
    AND membership.user_id = member_id_param
  FOR UPDATE;

  IF target_membership.id IS NULL THEN
    RAISE EXCEPTION 'Membership not found.'
      USING ERRCODE = 'P0002';
  END IF;

  IF caller_is_lobby_admin
    AND NOT caller_is_owner
    AND NOT caller_is_platform_admin
    AND (
      target_membership.role = 'admin'
      OR target_membership.user_id = caller_id
    ) THEN
    RAISE EXCEPTION 'A lobby admin can remove only ordinary members.'
      USING ERRCODE = '42501';
  END IF;

  IF target_membership.membership_status = 'removed' THEN
    RETURN 'already_removed';
  END IF;

  IF target_membership.membership_status <> 'active' THEN
    RAISE EXCEPTION 'Only an active member can be removed.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.lobby_members
  SET
    membership_status = 'removed',
    role = 'member',
    ended_at = now(),
    ended_by = caller_id
  WHERE id = target_membership.id;

  RETURN 'removed';
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_lobby_member_secure(
  lobby_id_param text,
  member_id_param uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  target_membership public.lobby_members%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_lobby_owner(lobby_id_param)
    OR public.is_admin()
  ) THEN
    RAISE EXCEPTION 'Only the lobby owner can restore a member.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.lobbies
    WHERE id = lobby_id_param
      AND owner_id = member_id_param
  ) THEN
    RAISE EXCEPTION 'The lobby owner is already active.'
      USING ERRCODE = '42501';
  END IF;

  SELECT membership.*
  INTO target_membership
  FROM public.lobby_members AS membership
  WHERE membership.lobby_id = lobby_id_param
    AND membership.user_id = member_id_param
  FOR UPDATE;

  IF target_membership.id IS NULL THEN
    RAISE EXCEPTION 'Membership not found.'
      USING ERRCODE = 'P0002';
  END IF;

  IF target_membership.membership_status = 'active' THEN
    RETURN 'already_active';
  END IF;

  IF target_membership.membership_status <> 'removed' THEN
    RAISE EXCEPTION 'Only a removed member can be restored.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.lobby_members
  SET
    membership_status = 'active',
    role = 'member',
    joined_at = now(),
    ended_at = NULL,
    ended_by = NULL
  WHERE id = target_membership.id;

  RETURN 'restored';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_lobby_community(lobby_id_param text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  caller_is_platform_admin boolean;
  caller_is_owner boolean;
  caller_membership public.lobby_members%ROWTYPE;
  viewer_role text;
  lobby_policy text;
  members_json jsonb;
  requests_json jsonb;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  SELECT public.is_admin() INTO caller_is_platform_admin;

  SELECT
    lobby.owner_id = caller_id,
    lobby.join_policy
  INTO caller_is_owner, lobby_policy
  FROM public.lobbies AS lobby
  WHERE lobby.id = lobby_id_param;

  IF lobby_policy IS NULL THEN
    RAISE EXCEPTION 'Lobby not found.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT membership.*
  INTO caller_membership
  FROM public.lobby_members AS membership
  WHERE membership.lobby_id = lobby_id_param
    AND membership.user_id = caller_id;

  IF NOT caller_is_platform_admin
    AND NOT caller_is_owner
    AND caller_membership.membership_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Active lobby membership is required.'
      USING ERRCODE = '42501';
  END IF;

  viewer_role := CASE
    WHEN caller_is_platform_admin THEN 'platform_admin'
    WHEN caller_is_owner THEN 'owner'
    WHEN caller_membership.role = 'admin' THEN 'admin'
    ELSE 'member'
  END;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', membership.id,
      'user_id', membership.user_id,
      'username', profile.username,
      'lobby_role', CASE
        WHEN lobby.owner_id = membership.user_id THEN 'owner'
        WHEN membership.role = 'admin' THEN 'admin'
        ELSE 'member'
      END,
      'membership_status', membership.membership_status,
      'avatar_emoji', profile.avatar_emoji,
      'avatar_bg', profile.avatar_bg,
      'joined_at', membership.joined_at,
      'ended_at', membership.ended_at,
      'ended_by', membership.ended_by
    )
    ORDER BY
      CASE WHEN lobby.owner_id = membership.user_id THEN 0 ELSE 1 END,
      CASE membership.membership_status
        WHEN 'active' THEN 0
        WHEN 'removed' THEN 1
        ELSE 2
      END,
      profile.username,
      membership.user_id
  ), '[]'::jsonb)
  INTO members_json
  FROM public.lobby_members AS membership
  JOIN public.profiles AS profile
    ON profile.id = membership.user_id
  JOIN public.lobbies AS lobby
    ON lobby.id = membership.lobby_id
  WHERE membership.lobby_id = lobby_id_param
    AND (
      viewer_role IN ('owner', 'admin', 'platform_admin')
      OR membership.user_id = caller_id
    );

  IF viewer_role IN ('owner', 'admin', 'platform_admin') THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', request.id,
        'lobby_id', request.lobby_id,
        'user_id', request.user_id,
        'username', profile.username,
        'avatar_emoji', profile.avatar_emoji,
        'avatar_bg', profile.avatar_bg,
        'status', request.status,
        'created_at', request.created_at
      )
      ORDER BY request.created_at, request.id
    ), '[]'::jsonb)
    INTO requests_json
    FROM public.lobby_join_requests AS request
    JOIN public.profiles AS profile
      ON profile.id = request.user_id
    WHERE request.lobby_id = lobby_id_param
      AND request.status = 'pending';
  ELSE
    requests_json := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'lobby_id', lobby_id_param,
    'join_policy', lobby_policy,
    'viewer_role', viewer_role,
    'active_member_count', (
      SELECT count(*)
      FROM public.lobby_members
      WHERE lobby_id = lobby_id_param
        AND membership_status = 'active'
    ),
    'members', members_json,
    'pending_requests', requests_json
  );
END;
$$;

DO $$
DECLARE
  signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.create_lobby_secure(text,text,text,text,text,text)',
    'public.join_lobby_secure(text)',
    'public.set_lobby_join_policy(text,text)',
    'public.resolve_lobby_join_request(uuid,text)',
    'public.cancel_lobby_join_request(uuid)',
    'public.remove_lobby_member_secure(text,uuid)',
    'public.restore_lobby_member_secure(text,uuid)',
    'public.get_lobby_community(text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM service_role', signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', signature);
  END LOOP;
END;
$$;
