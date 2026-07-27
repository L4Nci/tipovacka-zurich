-- Safe operational summaries and server-managed public feature flags.

CREATE TABLE IF NOT EXISTS public.app_feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  is_public boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.app_feature_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_feature_flags FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS predictions_created_at_idx
  ON public.predictions(created_at);
CREATE INDEX IF NOT EXISTS matches_status_lock_time_idx
  ON public.matches(status, lock_time_utc);

INSERT INTO public.app_feature_flags (key, enabled, is_public)
VALUES
  ('public_profiles_enabled', false, true),
  ('share_cards_enabled', false, true),
  ('referral_enabled', false, true),
  ('badges_enabled', false, true),
  ('tournament_management_enabled', false, true),
  ('admin_operations_enabled', false, true),
  ('maintenance_banner_enabled', false, true)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_public_feature_flags()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    jsonb_object_agg(
      flag.key,
      jsonb_build_object(
        'enabled', flag.enabled,
        'payload', flag.payload
      )
    ),
    '{}'::jsonb
  )
  FROM public.app_feature_flags AS flag
  WHERE flag.is_public;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_operations_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Platform admin access required.'
      USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'users', (SELECT COUNT(*) FROM auth.users),
    'profiles', (SELECT COUNT(*) FROM public.profiles),
    'lobbies', (SELECT COUNT(*) FROM public.lobbies),
    'active_memberships', (
      SELECT COUNT(*) FROM public.lobby_members
      WHERE membership_status = 'active'
    ),
    'registrations_7d', (
      SELECT COUNT(*) FROM auth.users
      WHERE created_at >= now() - interval '7 days'
    ),
    'registrations_30d', (
      SELECT COUNT(*) FROM auth.users
      WHERE created_at >= now() - interval '30 days'
    ),
    'active_tournaments', (
      SELECT COUNT(*) FROM public.tournaments
      WHERE status = 'active'
    ),
    'predictions_24h', (
      SELECT COUNT(*) FROM public.predictions
      WHERE created_at >= now() - interval '24 hours'
    ),
    'predictions_7d', (
      SELECT COUNT(*) FROM public.predictions
      WHERE created_at >= now() - interval '7 days'
    ),
    'pending_join_requests', (
      SELECT COUNT(*) FROM public.lobby_join_requests
      WHERE status = 'pending'
    ),
    'unresolved_matches', (
      SELECT COUNT(*) FROM public.matches
      WHERE status = 'finished'
        AND (home_score IS NULL OR away_score IS NULL)
    ),
    'matches_without_participants', (
      SELECT COUNT(*) FROM public.matches
      WHERE lower(home_participant_id) ~ '(^|-)tba($|-)'
         OR lower(away_participant_id) ~ '(^|-)tba($|-)'
    ),
    'locked_without_result', (
      SELECT COUNT(*) FROM public.matches
      WHERE lock_time_utc <= now()
        AND status <> 'finished'
    ),
    'orphan_memberships', (
      SELECT COUNT(*)
      FROM public.lobby_members AS membership
      LEFT JOIN public.lobbies AS lobby ON lobby.id = membership.lobby_id
      LEFT JOIN public.profiles AS profile ON profile.id = membership.user_id
      WHERE lobby.id IS NULL OR profile.id IS NULL
    ),
    'orphan_predictions', (
      SELECT COUNT(*)
      FROM public.predictions AS prediction
      LEFT JOIN public.lobbies AS lobby ON lobby.id = prediction.lobby_id
      LEFT JOIN public.matches AS match ON match.id = prediction.match_id
      LEFT JOIN public.profiles AS profile ON profile.id = prediction.user_id
      WHERE lobby.id IS NULL OR match.id IS NULL OR profile.id IS NULL
    ),
    'duplicate_memberships', (
      SELECT COUNT(*)
      FROM (
        SELECT lobby_id, user_id
        FROM public.lobby_members
        GROUP BY lobby_id, user_id
        HAVING COUNT(*) > 1
      ) AS duplicates
    ),
    'last_match_update', (SELECT MAX(updated_at) FROM public.matches)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_feature_flags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_feature_flags() TO anon, authenticated;
REVOKE ALL ON FUNCTION public.get_admin_operations_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_operations_summary() TO authenticated;
