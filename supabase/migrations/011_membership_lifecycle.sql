-- =========================================================================
-- Supabase Migration: 011_membership_lifecycle.sql
-- Description: Add non-destructive membership lifecycle states and narrowly
--              scoped leave/remove/restore operations.
--
-- Existing memberships are backfilled as active. Predictions, points, matches,
-- and leaderboard data are not rewritten or deleted.
-- =========================================================================

ALTER TABLE public.lobby_members
  ADD COLUMN IF NOT EXISTS membership_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.lobby_members
  DROP CONSTRAINT IF EXISTS lobby_members_membership_status_check;
ALTER TABLE public.lobby_members
  ADD CONSTRAINT lobby_members_membership_status_check
  CHECK (membership_status IN ('pending', 'active', 'removed', 'left'));

ALTER TABLE public.lobby_members
  DROP CONSTRAINT IF EXISTS lobby_members_membership_end_check;
ALTER TABLE public.lobby_members
  ADD CONSTRAINT lobby_members_membership_end_check
  CHECK (
    (
      membership_status IN ('pending', 'active')
      AND ended_at IS NULL
    )
    OR (
      membership_status IN ('removed', 'left')
      AND ended_at IS NOT NULL
    )
  );

-- Ownership is authoritative only in lobbies.owner_id. The single historical
-- owner-role row is normalized without changing the actual lobby owner.
UPDATE public.lobby_members
SET role = 'member'
WHERE role = 'owner';

ALTER TABLE public.lobby_members
  DROP CONSTRAINT IF EXISTS lobby_members_role_check;
ALTER TABLE public.lobby_members
  DROP CONSTRAINT IF EXISTS lobby_members_new_roles_check;
ALTER TABLE public.lobby_members
  ADD CONSTRAINT lobby_members_role_check
  CHECK (role IN ('admin', 'member'));

CREATE INDEX IF NOT EXISTS lobby_members_active_user_idx
  ON public.lobby_members(user_id, lobby_id)
  WHERE membership_status = 'active';

CREATE INDEX IF NOT EXISTS lobby_members_active_lobby_idx
  ON public.lobby_members(lobby_id)
  WHERE membership_status = 'active';

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
      AND membership_status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_lobby_member(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_lobby_member(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_lobby_member(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_lobby_member(text) TO postgres;
GRANT EXECUTE ON FUNCTION public.is_lobby_member(text) TO service_role;

CREATE OR REPLACE FUNCTION public.create_lobby_secure(
  lobby_name_param text,
  tournament_id_param text,
  visibility_param text DEFAULT 'public',
  short_description_param text DEFAULT NULL,
  long_description_param text DEFAULT NULL
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
  caller_id uuid := (SELECT auth.uid());
  generated_id text;
  generated_code text;
  attempt integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  IF length(btrim(COALESCE(lobby_name_param, ''))) < 2
    OR length(btrim(lobby_name_param)) > 80 THEN
    RAISE EXCEPTION 'Lobby name must contain 2 to 80 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF visibility_param NOT IN ('private', 'public') THEN
    RAISE EXCEPTION 'Invalid lobby visibility.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tournaments
    WHERE tournaments.id = tournament_id_param
  ) THEN
    RAISE EXCEPTION 'Tournament not found.'
      USING ERRCODE = '23503';
  END IF;

  FOR attempt IN 1..10 LOOP
    generated_id := 'lobby-' || encode(extensions.gen_random_bytes(12), 'hex');
    generated_code := upper(encode(extensions.gen_random_bytes(8), 'hex'));

    BEGIN
      INSERT INTO public.lobbies (
        id,
        name,
        owner_id,
        tournament_id,
        short_description,
        long_description,
        join_code,
        visibility
      )
      VALUES (
        generated_id,
        btrim(lobby_name_param),
        caller_id,
        tournament_id_param,
        NULLIF(btrim(short_description_param), ''),
        NULLIF(btrim(long_description_param), ''),
        generated_code,
        visibility_param
      );
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF attempt = 10 THEN
          RAISE;
        END IF;
    END;
  END LOOP;

  INSERT INTO public.lobby_tournaments (lobby_id, tournament_id, status)
  VALUES (generated_id, tournament_id_param, 'active');

  INSERT INTO public.lobby_members (
    lobby_id,
    user_id,
    role,
    membership_status
  )
  VALUES (generated_id, caller_id, 'member', 'active');

  RETURN QUERY
  SELECT
    lobby.id,
    lobby.name,
    lobby.owner_id,
    lobby.tournament_id,
    lobby.short_description,
    lobby.long_description,
    lobby.join_code,
    lobby.visibility,
    lobby.created_at,
    tournament.name,
    true
  FROM public.lobbies AS lobby
  JOIN public.tournaments AS tournament
    ON tournament.id = lobby.tournament_id
  WHERE lobby.id = generated_id;
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
  LIMIT 1;

  IF target_lobby.id IS NULL THEN
    RAISE EXCEPTION 'Lobby not found.'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.lobby_members (
    lobby_id,
    user_id,
    role,
    membership_status
  )
  VALUES (target_lobby.id, caller_id, 'member', 'active')
  ON CONFLICT (lobby_id, user_id) DO NOTHING;

  IF FOUND THEN
    result_state := 'joined';
  ELSE
    SELECT membership.*
    INTO STRICT target_membership
    FROM public.lobby_members AS membership
    WHERE membership.lobby_id = target_lobby.id
      AND membership.user_id = caller_id
    FOR UPDATE;

    CASE target_membership.membership_status
      WHEN 'active' THEN
        result_state := 'already_member';
      WHEN 'left' THEN
        UPDATE public.lobby_members
        SET
          membership_status = 'active',
          role = 'member',
          ended_at = NULL,
          ended_by = NULL
        WHERE lobby_id = target_lobby.id
          AND user_id = caller_id;
        result_state := 'rejoined';
      WHEN 'removed' THEN
        RAISE EXCEPTION 'Access must be restored by the lobby owner.'
          USING ERRCODE = '42501';
      WHEN 'pending' THEN
        RAISE EXCEPTION 'Membership is pending approval.'
          USING ERRCODE = '42501';
      ELSE
        RAISE EXCEPTION 'Unsupported membership state.'
          USING ERRCODE = '22023';
    END CASE;
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
    lobby.join_code,
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

CREATE OR REPLACE FUNCTION public.leave_lobby_secure(lobby_id_param text)
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

  IF EXISTS (
    SELECT 1
    FROM public.lobbies
    WHERE id = lobby_id_param
      AND owner_id = caller_id
  ) THEN
    RAISE EXCEPTION 'The lobby owner cannot leave the lobby.'
      USING ERRCODE = '42501';
  END IF;

  SELECT membership.*
  INTO target_membership
  FROM public.lobby_members AS membership
  WHERE membership.lobby_id = lobby_id_param
    AND membership.user_id = caller_id
  FOR UPDATE;

  IF target_membership.id IS NULL THEN
    RAISE EXCEPTION 'Membership not found.'
      USING ERRCODE = 'P0002';
  END IF;

  IF target_membership.membership_status = 'left' THEN
    RETURN 'already_left';
  END IF;

  IF target_membership.membership_status <> 'active' THEN
    RAISE EXCEPTION 'Only an active membership can be left.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.lobby_members
  SET
    membership_status = 'left',
    role = 'member',
    ended_at = now(),
    ended_by = caller_id
  WHERE id = target_membership.id;

  RETURN 'left';
END;
$$;

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
    RAISE EXCEPTION 'Only the lobby owner can remove a member.'
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
    ended_at = NULL,
    ended_by = NULL
  WHERE id = target_membership.id;

  RETURN 'restored';
END;
$$;

DO $$
DECLARE
  signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.create_lobby_secure(text,text,text,text,text)',
    'public.join_lobby_secure(text)',
    'public.leave_lobby_secure(text)',
    'public.remove_lobby_member_secure(text,uuid)',
    'public.restore_lobby_member_secure(text,uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM service_role', signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', signature);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "Members can read lobby tournaments"
  ON public.lobby_tournaments;
CREATE POLICY "Members can read lobby tournaments"
  ON public.lobby_tournaments
  FOR SELECT TO authenticated
  USING (
    public.is_lobby_member(lobby_tournaments.lobby_id)
    OR public.is_admin()
  );

-- Active membership is the only Home/dashboard access path. Historical
-- membership rows remain available to active lobby viewers for leaderboard and
-- Hall of Fame reconstruction, but do not count as current members.
CREATE OR REPLACE FUNCTION public.get_user_home_dashboard()
RETURNS TABLE (
  lobby_id TEXT,
  lobby_name TEXT,
  lobby_role TEXT,
  member_count BIGINT,
  tournament_id TEXT,
  tournament_name TEXT,
  tournament_status TEXT,
  is_completed BOOLEAN,
  actionable_match_count BIGINT,
  next_actionable_lock_time TIMESTAMPTZ,
  next_missing_lock_time TIMESTAMPTZ,
  all_known_unlocked_predicted BOOLEAN,
  schedule_state TEXT,
  requires_owner_attention BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH request_user AS (
    SELECT auth.uid() AS user_id
  ),
  contexts AS (
    SELECT
      lm.user_id,
      l.id AS lobby_id,
      l.name AS lobby_name,
      CASE
        WHEN l.owner_id = lm.user_id THEN 'owner'
        WHEN lm.role = 'admin' THEN 'admin'
        ELSE 'member'
      END AS lobby_role,
      (
        SELECT count(*)::BIGINT
        FROM public.lobby_members members
        WHERE members.lobby_id = l.id
          AND members.membership_status = 'active'
      ) AS member_count,
      lt.tournament_id,
      t.name AS tournament_name,
      lt.status AS tournament_status,
      t.actual_tournament_winner_id
    FROM request_user ru
    JOIN public.lobby_members lm
      ON lm.user_id = ru.user_id
      AND lm.membership_status = 'active'
    JOIN public.lobbies l ON l.id = lm.lobby_id
    JOIN public.lobby_tournaments lt ON lt.lobby_id = l.id
    JOIN public.tournaments t ON t.id = lt.tournament_id
    WHERE ru.user_id IS NOT NULL
      AND lt.status = 'active'
  ),
  stats AS (
    SELECT
      c.user_id,
      c.lobby_id,
      c.lobby_name,
      c.lobby_role,
      c.member_count,
      c.tournament_id,
      c.tournament_name,
      c.tournament_status,
      c.actual_tournament_winner_id,
      count(m.id)::BIGINT AS total_matches,
      count(m.id) FILTER (
        WHERE m.status <> 'finished' OR m.home_score IS NULL OR m.away_score IS NULL
      )::BIGINT AS unresolved_matches,
      count(m.id) FILTER (
        WHERE m.status = 'scheduled'
          AND m.lock_time_utc > now()
          AND lower(m.home_participant_id) !~ '(^|-)tba($|-)'
          AND lower(m.away_participant_id) !~ '(^|-)tba($|-)'
      )::BIGINT AS known_future_matches,
      count(m.id) FILTER (
        WHERE m.status = 'scheduled'
          AND m.lock_time_utc > now()
          AND lower(m.home_participant_id) !~ '(^|-)tba($|-)'
          AND lower(m.away_participant_id) !~ '(^|-)tba($|-)'
          AND p.match_id IS NULL
      )::BIGINT AS missing_future_matches,
      count(m.id) FILTER (
        WHERE m.status = 'scheduled'
          AND m.lock_time_utc > now()
          AND m.lock_time_utc <= now() + interval '48 hours'
          AND lower(m.home_participant_id) !~ '(^|-)tba($|-)'
          AND lower(m.away_participant_id) !~ '(^|-)tba($|-)'
          AND p.match_id IS NULL
      )::BIGINT AS actionable_matches,
      min(m.lock_time_utc) FILTER (
        WHERE m.status = 'scheduled'
          AND m.lock_time_utc > now()
          AND m.lock_time_utc <= now() + interval '48 hours'
          AND lower(m.home_participant_id) !~ '(^|-)tba($|-)'
          AND lower(m.away_participant_id) !~ '(^|-)tba($|-)'
          AND p.match_id IS NULL
      ) AS next_actionable_lock,
      min(m.lock_time_utc) FILTER (
        WHERE m.status = 'scheduled'
          AND m.lock_time_utc > now()
          AND lower(m.home_participant_id) !~ '(^|-)tba($|-)'
          AND lower(m.away_participant_id) !~ '(^|-)tba($|-)'
          AND p.match_id IS NULL
      ) AS next_missing_lock,
      count(m.id) FILTER (
        WHERE m.status = 'scheduled'
          AND m.lock_time_utc > now()
          AND (
            lower(m.home_participant_id) ~ '(^|-)tba($|-)'
            OR lower(m.away_participant_id) ~ '(^|-)tba($|-)'
          )
      )::BIGINT AS future_tba_matches
    FROM contexts c
    LEFT JOIN public.matches m ON m.tournament_id = c.tournament_id
    LEFT JOIN public.predictions p
      ON p.user_id = c.user_id
      AND p.lobby_id = c.lobby_id
      AND p.match_id = m.id
    GROUP BY
      c.user_id,
      c.lobby_id,
      c.lobby_name,
      c.lobby_role,
      c.member_count,
      c.tournament_id,
      c.tournament_name,
      c.tournament_status,
      c.actual_tournament_winner_id
  ),
  classified AS (
    SELECT
      stats.*,
      (
        actual_tournament_winner_id IS NOT NULL
        AND total_matches > 0
        AND unresolved_matches = 0
      ) AS completed,
      CASE
        WHEN actual_tournament_winner_id IS NOT NULL
          AND total_matches > 0
          AND unresolved_matches = 0 THEN 'completed'
        WHEN known_future_matches > 0 THEN 'ready'
        WHEN total_matches = 0 OR future_tba_matches > 0 THEN 'schedule_pending'
        WHEN unresolved_matches > 0 THEN 'waiting_results'
        ELSE 'completion_pending'
      END AS derived_schedule_state
    FROM stats
  )
  SELECT
    lobby_id,
    lobby_name,
    lobby_role,
    member_count,
    tournament_id,
    tournament_name,
    tournament_status,
    completed AS is_completed,
    actionable_matches AS actionable_match_count,
    next_actionable_lock AS next_actionable_lock_time,
    next_missing_lock AS next_missing_lock_time,
    (known_future_matches > 0 AND missing_future_matches = 0) AS all_known_unlocked_predicted,
    derived_schedule_state AS schedule_state,
    (
      lobby_role IN ('owner', 'admin')
      AND derived_schedule_state IN ('schedule_pending', 'completion_pending')
    ) AS requires_owner_attention
  FROM classified
  ORDER BY lobby_name, tournament_name, lobby_id, tournament_id;
$$;

REVOKE ALL ON FUNCTION public.get_user_home_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_home_dashboard() FROM anon;
REVOKE ALL ON FUNCTION public.get_user_home_dashboard() FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_user_home_dashboard() TO authenticated;
