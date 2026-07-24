-- Supabase Migration: 014_fix_join_lobby_left_rejoin.sql
-- Purpose: Qualify table columns in join_lobby_secure() so a left member can
--          rejoin without colliding with the function's RETURNS TABLE columns.
-- Data impact: none. This replaces only the function definition.

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

  SELECT target.*
  INTO target_lobby
  FROM public.lobbies AS target
  WHERE target.join_code = normalized_code
  LIMIT 1
  FOR SHARE;

  IF target_lobby.id IS NULL THEN
    RAISE EXCEPTION 'Lobby not found.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT existing_membership.*
  INTO target_membership
  FROM public.lobby_members AS existing_membership
  WHERE existing_membership.lobby_id = target_lobby.id
    AND existing_membership.user_id = caller_id
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
    UPDATE public.lobby_join_requests AS pending_request
    SET
      status = 'cancelled',
      resolved_at = now(),
      resolved_by = caller_id
    WHERE pending_request.lobby_id = target_lobby.id
      AND pending_request.user_id = caller_id
      AND pending_request.status = 'pending';

    IF target_membership.membership_status = 'left' THEN
      UPDATE public.lobby_members AS membership_to_rejoin
      SET
        membership_status = 'active',
        role = 'member',
        joined_at = now(),
        ended_at = NULL,
        ended_by = NULL
      WHERE membership_to_rejoin.id = target_membership.id;
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
        SELECT concurrent_membership.*
        INTO target_membership
        FROM public.lobby_members AS concurrent_membership
        WHERE concurrent_membership.lobby_id = target_lobby.id
          AND concurrent_membership.user_id = caller_id
        FOR UPDATE;

        IF target_membership.membership_status = 'active' THEN
          result_state := 'already_member';
        ELSIF target_membership.membership_status = 'left' THEN
          UPDATE public.lobby_members AS membership_to_rejoin
          SET
            membership_status = 'active',
            role = 'member',
            joined_at = now(),
            ended_at = NULL,
            ended_by = NULL
          WHERE membership_to_rejoin.id = target_membership.id;
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
    result_lobby.id,
    result_lobby.name,
    result_lobby.owner_id,
    result_lobby.tournament_id,
    result_lobby.short_description,
    result_lobby.long_description,
    CASE
      WHEN result_state IN ('joined', 'rejoined', 'already_member')
        THEN result_lobby.join_code
      ELSE ''
    END,
    result_lobby.visibility,
    result_lobby.created_at,
    result_tournament.name,
    result_lobby.owner_id = caller_id
  FROM public.lobbies AS result_lobby
  JOIN public.tournaments AS result_tournament
    ON result_tournament.id = result_lobby.tournament_id
  WHERE result_lobby.id = target_lobby.id;
END;
$$;

REVOKE ALL ON FUNCTION public.join_lobby_secure(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_lobby_secure(text) FROM anon;
REVOKE ALL ON FUNCTION public.join_lobby_secure(text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.join_lobby_secure(text) TO authenticated;
