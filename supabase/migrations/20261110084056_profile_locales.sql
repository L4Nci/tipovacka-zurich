-- Extend the existing profile preference only. Identity, profile validation,
-- avatar choices, timestamps, game locks and scoring remain unchanged.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';

ALTER TABLE public.profiles DROP CONSTRAINT profiles_locale_supported;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_locale_supported
  CHECK (locale IN ('cs','en','de','pl','sk'));

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
     OR p_locale IS NULL OR p_locale NOT IN ('cs','en','de','pl','sk') THEN
    RAISE EXCEPTION 'Invalid profile settings.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.profiles SET username=v_name, display_name=v_name,
    avatar_emoji=btrim(p_avatar_emoji), avatar_bg=p_avatar_bg, locale=p_locale WHERE id=v_player;
  RETURN tipovacka_private.account_payload(v_player);
END;
$$;
REVOKE ALL ON FUNCTION public.complete_my_profile(text,text,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.complete_my_profile(text,text,text,text) TO authenticated;
