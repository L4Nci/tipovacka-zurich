-- Rollback-only integration checks for product foundations 015-019.
-- Run only against local or isolated staging after migrations 001-019.

BEGIN;

INSERT INTO public.sports (id, slug, name)
VALUES ('product-test-sport', 'product-test-sport', 'Product Test Sport');

INSERT INTO public.participants (id, sport_id, name, short_name)
VALUES
  ('product-test-home', 'product-test-sport', 'Product Home', 'PTH'),
  ('product-test-away', 'product-test-sport', 'Product Away', 'PTA');

INSERT INTO public.tournaments (
  id, sport_id, slug, name, status, actual_tournament_winner_id
)
VALUES (
  'product-test-tournament',
  'product-test-sport',
  'product-test-tournament',
  'Product Test Tournament',
  'finished',
  'product-test-home'
);

INSERT INTO public.matches (
  id,
  tournament_id,
  home_participant_id,
  away_participant_id,
  start_time_utc,
  lock_time_utc,
  status,
  home_score,
  away_score
)
VALUES (
  'product-test-match',
  'product-test-tournament',
  'product-test-home',
  'product-test-away',
  now() - interval '1 day',
  now() - interval '1 day 5 minutes',
  'finished',
  2,
  1
);

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000801',
    'authenticated',
    'authenticated',
    'product-owner@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Product Owner"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000802',
    'authenticated',
    'authenticated',
    'product-member@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Product Member"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000803',
    'authenticated',
    'authenticated',
    'product-admin@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Product Admin"}'::jsonb,
    now(),
    now()
  );

UPDATE public.profiles
SET role = 'admin'
WHERE id = '00000000-0000-4000-8000-000000000803';

INSERT INTO public.lobbies (
  id,
  name,
  owner_id,
  tournament_id,
  join_code,
  join_policy,
  visibility
)
VALUES (
  'product-test-lobby',
  'Product Test Lobby',
  '00000000-0000-4000-8000-000000000801',
  'product-test-tournament',
  'PRODUCTTESTCODE',
  'open',
  'private'
);

INSERT INTO public.lobby_tournaments (lobby_id, tournament_id, status)
VALUES ('product-test-lobby', 'product-test-tournament', 'active');

INSERT INTO public.lobby_members (
  lobby_id, user_id, role, membership_status
)
VALUES
  (
    'product-test-lobby',
    '00000000-0000-4000-8000-000000000801',
    'member',
    'active'
  ),
  (
    'product-test-lobby',
    '00000000-0000-4000-8000-000000000802',
    'member',
    'active'
  );

-- A completed tournament linked to a newly created lobby is not participation.
INSERT INTO public.lobbies (
  id,
  name,
  owner_id,
  tournament_id,
  join_code,
  join_policy,
  visibility
)
VALUES (
  'product-empty-completed-lobby',
  'Product Empty Completed Lobby',
  '00000000-0000-4000-8000-000000000801',
  'product-test-tournament',
  'PRODUCTEMPTYCODE',
  'open',
  'private'
);

INSERT INTO public.lobby_tournaments (lobby_id, tournament_id, status)
VALUES ('product-empty-completed-lobby', 'product-test-tournament', 'active');

INSERT INTO public.lobby_members (
  lobby_id, user_id, role, membership_status
)
VALUES (
  'product-empty-completed-lobby',
  '00000000-0000-4000-8000-000000000801',
  'member',
  'active'
);

INSERT INTO public.predictions (
  user_id,
  lobby_id,
  match_id,
  predicted_home_score,
  predicted_away_score,
  points_earned
)
VALUES (
  '00000000-0000-4000-8000-000000000801',
  'product-test-lobby',
  'product-test-match',
  2,
  1,
  5
);

-- 015: self update is scoped, public/private behavior is explicit, and a
-- shared private lobby reveals identity but not global statistics.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000801","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000801', true);
SELECT public.update_my_community_profile('Krátké bezpečné bio', 'public');

DO $$
DECLARE
  overview jsonb := public.get_my_profile_overview();
BEGIN
  IF overview #>> '{profile,bio}' <> 'Krátké bezpečné bio'
    OR overview #>> '{stats,predictions_total}' <> '1'
    OR overview #> '{profile,id}' IS NOT NULL
    OR overview::text LIKE '%product-owner@example.invalid%' THEN
    RAISE EXCEPTION 'Community profile overview leaked data or returned inconsistent stats.';
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.update_my_community_profile('https://example.invalid', 'public');
    RAISE EXCEPTION 'Bio RPC accepted a link.';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      NULL;
  END;

  BEGIN
    UPDATE public.profiles
    SET bio = 'Direct client mutation'
    WHERE id = '00000000-0000-4000-8000-000000000801';
    RAISE EXCEPTION 'Direct community profile mutation was allowed.';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000802","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000802', true);
DO $$
DECLARE
  public_profile jsonb := public.get_profile_summary(
    '00000000-0000-4000-8000-000000000801',
    NULL
  );
BEGIN
  IF public_profile #>> '{scope}' <> 'global'
    OR public_profile #>> '{profile,bio}' <> 'Krátké bezpečné bio' THEN
    RAISE EXCEPTION 'Opt-in public profile was not visible.';
  END IF;
END;
$$;
SELECT public.update_my_community_profile('', 'private');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000801","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000801', true);
DO $$
DECLARE
  scoped_profile jsonb := public.get_profile_summary(
    '00000000-0000-4000-8000-000000000802',
    'product-test-lobby'
  );
BEGIN
  IF scoped_profile #>> '{scope}' <> 'lobby'
    OR scoped_profile->'stats' <> 'null'::jsonb
    OR scoped_profile #>> '{profile,bio}' IS NOT NULL THEN
    RAISE EXCEPTION 'Private lobby-scoped profile exposed global data.';
  END IF;
END;
$$;
RESET ROLE;

-- 016: reconciliation is idempotent, award IDs are returned for safe featured
-- selection, and authenticated clients cannot self-award.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000801","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000801', true);
SELECT public.reconcile_my_achievements();
SELECT public.reconcile_my_achievements();

DO $$
DECLARE
  reconciliation jsonb := public.reconcile_my_achievements();
  badge_overview jsonb := public.get_user_badges(
    '00000000-0000-4000-8000-000000000801'
  );
BEGIN
  IF (reconciliation->>'completed_tournaments')::integer <> 1 THEN
    RAISE EXCEPTION 'A linked completed tournament without predictions counted as participation.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(badge_overview->'badges') AS badge
    WHERE badge->>'context_id' = 'product-empty-completed-lobby:product-test-tournament'
  ) THEN
    RAISE EXCEPTION 'A badge was awarded for a completed tournament without participation.';
  END IF;
END;
$$;

DO $$
DECLARE
  badge_result jsonb := public.get_user_badges(
    '00000000-0000-4000-8000-000000000801'
  );
  first_badge uuid;
BEGIN
  IF jsonb_array_length(badge_result->'badges') < 3 THEN
    RAISE EXCEPTION 'Expected first prediction, exact and founder badges.';
  END IF;

  first_badge := ((badge_result->'badges'->0)->>'id')::uuid;
  PERFORM public.set_featured_badges(ARRAY[first_badge]);
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.user_badges (
      user_id, badge_key, context_type, context_id
    )
    VALUES (
      '00000000-0000-4000-8000-000000000801',
      'predictions_100',
      'global',
      ''
    );
    RAISE EXCEPTION 'Direct badge self-award unexpectedly succeeded.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM public.user_badges
    WHERE user_id = '00000000-0000-4000-8000-000000000801'
      AND featured_position = 1
  ) <> 1 THEN
    RAISE EXCEPTION 'Featured badge update did not preserve ownership.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.user_badges
    WHERE user_id = '00000000-0000-4000-8000-000000000801'
      AND badge_key = 'tournament_winner'
  ) <> 1 THEN
    RAISE EXCEPTION 'Contextual tournament winner badge was not awarded.';
  END IF;
END;
$$;

-- 017: owner can update one lobby field and manage existing global
-- tournaments. A regular member cannot use either mutation.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000801","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000801', true);
SELECT public.update_lobby_field_secure(
  'product-test-lobby',
  'short_description',
  'Targeted update'
);
SELECT public.set_lobby_tournament_status_secure(
  'product-test-lobby',
  'product-test-tournament',
  'archived'
);
SELECT public.add_tournament_to_lobby_secure(
  'product-test-lobby',
  'product-test-tournament'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000802","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000802', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.update_lobby_field_secure(
      'product-test-lobby',
      'name',
      'Forged member update'
    );
    RAISE EXCEPTION 'Member lobby update unexpectedly succeeded.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

-- 018: free is the default and clients cannot mint subscriptions.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000802","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000802', true);
DO $$
BEGIN
  IF public.has_entitlement('advanced_stats') THEN
    RAISE EXCEPTION 'Free user unexpectedly received a paid entitlement.';
  END IF;

  BEGIN
    INSERT INTO public.subscriptions (
      user_id, plan_key, status
    )
    VALUES (
      '00000000-0000-4000-8000-000000000802',
      'free',
      'active'
    );
    RAISE EXCEPTION 'Client subscription spoof unexpectedly succeeded.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

-- 019: public flags expose only safe payloads; operations are admin-only.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000802","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000802', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.get_admin_operations_summary();
    RAISE EXCEPTION 'Player unexpectedly accessed admin operations.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000803","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000803', true);
DO $$
DECLARE
  summary jsonb := public.get_admin_operations_summary();
BEGIN
  IF NOT (summary ? 'users')
    OR NOT (summary ? 'orphan_predictions')
    OR summary ? 'emails'
    OR summary ? 'join_codes' THEN
    RAISE EXCEPTION 'Admin operations summary has an invalid contract.';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $$
DECLARE
  flags jsonb := public.get_public_feature_flags();
BEGIN
  IF NOT (flags ? 'public_profiles_enabled')
    OR flags::text LIKE '%updated_by%' THEN
    RAISE EXCEPTION 'Public feature flag contract leaked internal fields.';
  END IF;
END;
$$;
RESET ROLE;

ROLLBACK;
