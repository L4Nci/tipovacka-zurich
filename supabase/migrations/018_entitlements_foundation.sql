-- Entitlements are capabilities, never profile or membership roles. No paid
-- subscription is created and no existing free feature is gated here.

CREATE TABLE IF NOT EXISTS public.plans (
  key text PRIMARY KEY,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.entitlements (
  key text PRIMARY KEY,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plan_entitlements (
  plan_key text NOT NULL REFERENCES public.plans(key) ON DELETE CASCADE,
  entitlement_key text NOT NULL REFERENCES public.entitlements(key) ON DELETE CASCADE,
  PRIMARY KEY (plan_key, entitlement_key)
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_key text NOT NULL REFERENCES public.plans(key) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled', 'expired')),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  provider text,
  provider_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_reference_idx
  ON public.subscriptions(provider, provider_reference)
  WHERE provider_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscriptions_active_user_idx
  ON public.subscriptions(user_id, valid_until)
  WHERE status IN ('trialing', 'active');

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.plans FROM anon, authenticated;
REVOKE ALL ON TABLE public.entitlements FROM anon, authenticated;
REVOKE ALL ON TABLE public.plan_entitlements FROM anon, authenticated;
REVOKE ALL ON TABLE public.subscriptions FROM anon, authenticated;

INSERT INTO public.plans (key, name)
VALUES ('free', 'Free')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.entitlements (key, description)
VALUES
  ('custom_lobby_branding', 'Custom visual identity for a lobby.'),
  ('advanced_stats', 'Extended personal and lobby statistics.'),
  ('extended_history', 'Extended historical views.'),
  ('premium_share_cards', 'Additional share card styles.'),
  ('larger_lobbies', 'Higher future lobby member limits.'),
  ('private_custom_tournaments', 'Future private custom tournaments.'),
  ('admin_analytics', 'Extended owner analytics.'),
  ('ad_free', 'Future ad-free experience.'),
  ('extra_badge_showcase_slots', 'Additional featured badge slots.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_entitlement(entitlement_key_param text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.subscriptions AS subscription
      JOIN public.plan_entitlements AS plan_entitlement
        ON plan_entitlement.plan_key = subscription.plan_key
      WHERE subscription.user_id = (SELECT auth.uid())
        AND subscription.status IN ('trialing', 'active')
        AND subscription.valid_from <= now()
        AND (
          subscription.valid_until IS NULL
          OR subscription.valid_until > now()
        )
        AND plan_entitlement.entitlement_key = entitlement_key_param
    );
$$;

CREATE OR REPLACE FUNCTION public.get_my_entitlements()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT plan_entitlement.entitlement_key
  FROM public.subscriptions AS subscription
  JOIN public.plan_entitlements AS plan_entitlement
    ON plan_entitlement.plan_key = subscription.plan_key
  WHERE subscription.user_id = (SELECT auth.uid())
    AND subscription.status IN ('trialing', 'active')
    AND subscription.valid_from <= now()
    AND (
      subscription.valid_until IS NULL
      OR subscription.valid_until > now()
    )
  ORDER BY plan_entitlement.entitlement_key;
$$;

REVOKE ALL ON FUNCTION public.has_entitlement(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_entitlement(text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_entitlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_entitlements() TO authenticated;
