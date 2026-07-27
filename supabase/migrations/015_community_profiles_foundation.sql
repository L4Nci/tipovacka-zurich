-- Community profiles are opt-in. Existing profile identity remains unchanged,
-- while bio and global statistics are exposed only through a scoped RPC.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS profile_visibility text NOT NULL DEFAULT 'private';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_bio_length_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_bio_length_check
  CHECK (bio IS NULL OR char_length(bio) <= 240);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_bio_plain_text_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_bio_plain_text_check
  CHECK (
    bio IS NULL
    OR (
      bio !~* '(https?://|www[.])'
      AND bio !~ '<[^>]+>'
    )
  );

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_profile_visibility_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_profile_visibility_check
  CHECK (profile_visibility IN ('private', 'public'));

CREATE INDEX IF NOT EXISTS longterm_predictions_user_id_idx
  ON public.longterm_predictions(user_id);
CREATE INDEX IF NOT EXISTS lobbies_owner_id_idx
  ON public.lobbies(owner_id);

-- New private community fields must not become readable through the broad
-- historical profile SELECT policy. Existing app identity columns stay
-- readable for lobby-scoped leaderboards and prediction cards.
REVOKE SELECT ON TABLE public.profiles FROM authenticated;
GRANT SELECT (
  id,
  username,
  role,
  tournament_winner_id,
  created_at,
  avatar_emoji,
  avatar_bg
) ON TABLE public.profiles TO authenticated;

-- Existing identity editing remains available, while the new community fields
-- can only be changed through update_my_community_profile().
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (
  username,
  avatar_emoji,
  avatar_bg
) ON TABLE public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.update_my_community_profile(
  bio_param text,
  visibility_param text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  normalized_bio text := NULLIF(btrim(COALESCE(bio_param, '')), '');
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  IF visibility_param NOT IN ('private', 'public') THEN
    RAISE EXCEPTION 'Invalid profile visibility.'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(COALESCE(normalized_bio, '')) > 240 THEN
    RAISE EXCEPTION 'Bio must contain at most 240 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_bio ~* '(https?://|www[.])'
    OR normalized_bio ~ '<[^>]+>' THEN
    RAISE EXCEPTION 'Bio must be plain text without links.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET
    bio = normalized_bio,
    profile_visibility = visibility_param
  WHERE id = caller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found.'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'bio', normalized_bio,
    'profile_visibility', visibility_param
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_profile_summary(
  target_user_id uuid,
  lobby_id_param text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  target_profile public.profiles%ROWTYPE;
  is_self boolean;
  shares_lobby boolean := false;
  can_view_identity boolean;
  can_view_global boolean;
  stats jsonb;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  SELECT profile.*
  INTO target_profile
  FROM public.profiles AS profile
  WHERE profile.id = target_user_id;

  IF target_profile.id IS NULL THEN
    RETURN jsonb_build_object('visible', false);
  END IF;

  is_self := caller_id = target_user_id;

  IF lobby_id_param IS NOT NULL THEN
    SELECT
      public.is_lobby_member(lobby_id_param)
      AND EXISTS (
        SELECT 1
        FROM public.lobby_members AS membership
        WHERE membership.lobby_id = lobby_id_param
          AND membership.user_id = target_user_id
          AND membership.membership_status = 'active'
      )
    INTO shares_lobby;
  END IF;

  can_view_global := is_self OR target_profile.profile_visibility = 'public';
  can_view_identity := can_view_global OR shares_lobby;

  IF NOT can_view_identity THEN
    RETURN jsonb_build_object('visible', false);
  END IF;

  IF can_view_global THEN
    SELECT jsonb_build_object(
      'predictions_total', COUNT(*),
      'evaluated_predictions', COUNT(*) FILTER (
        WHERE match.status = 'finished'
          AND match.home_score IS NOT NULL
          AND match.away_score IS NOT NULL
      ),
      'exact_predictions', COUNT(*) FILTER (
        WHERE match.status = 'finished'
          AND prediction.predicted_home_score = match.home_score
          AND prediction.predicted_away_score = match.away_score
      ),
      'match_points', COALESCE(SUM(prediction.points_earned), 0)
    )
    INTO stats
    FROM public.predictions AS prediction
    JOIN public.matches AS match ON match.id = prediction.match_id
    WHERE prediction.user_id = target_user_id;

    stats := COALESCE(stats, '{}'::jsonb) || jsonb_build_object(
      'longterm_predictions', (
        SELECT COUNT(*)
        FROM public.longterm_predictions AS longterm
        WHERE longterm.user_id = target_user_id
      ),
      'longterm_points', (
        SELECT COALESCE(SUM(longterm.points_earned), 0)
        FROM public.longterm_predictions AS longterm
        WHERE longterm.user_id = target_user_id
      ),
      'completed_tournaments', (
        SELECT COUNT(*)
        FROM (
          SELECT DISTINCT prediction.lobby_id, match.tournament_id
          FROM public.predictions AS prediction
          JOIN public.matches AS match ON match.id = prediction.match_id
          JOIN public.tournaments AS tournament ON tournament.id = match.tournament_id
          WHERE prediction.user_id = target_user_id
            AND tournament.status <> 'hidden'
            AND tournament.actual_tournament_winner_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.matches AS tournament_match
              WHERE tournament_match.tournament_id = tournament.id
            )
            AND NOT EXISTS (
              SELECT 1
              FROM public.matches AS tournament_match
              WHERE tournament_match.tournament_id = tournament.id
                AND (
                  tournament_match.status <> 'finished'
                  OR tournament_match.home_score IS NULL
                  OR tournament_match.away_score IS NULL
                )
            )
        ) AS completed_contexts
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'visible', true,
    'is_self', is_self,
    'is_public', target_profile.profile_visibility = 'public',
    'scope', CASE WHEN can_view_global THEN 'global' ELSE 'lobby' END,
    'profile', jsonb_build_object(
      'username', target_profile.username,
      'avatar_emoji', target_profile.avatar_emoji,
      'avatar_bg', target_profile.avatar_bg,
      'bio', CASE WHEN can_view_global THEN target_profile.bio ELSE NULL END
    ),
    'stats', CASE WHEN can_view_global THEN stats ELSE NULL END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_profile_overview()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT public.get_profile_summary((SELECT auth.uid()), NULL);
$$;

REVOKE ALL ON FUNCTION public.update_my_community_profile(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_community_profile(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_my_community_profile(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_profile_summary(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_profile_summary(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_profile_summary(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_profile_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_profile_overview() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile_overview() TO authenticated;
