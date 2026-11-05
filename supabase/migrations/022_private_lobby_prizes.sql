-- Optional prizes declared by a private lobby manager.
-- Tipovacka does not hold, verify, or fulfil these prizes.

ALTER TABLE public.lobbies
  ADD COLUMN IF NOT EXISTS prizes_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prize_entries jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.lobbies
  DROP CONSTRAINT IF EXISTS lobbies_prize_entries_array_check;
ALTER TABLE public.lobbies
  ADD CONSTRAINT lobbies_prize_entries_array_check
  CHECK (jsonb_typeof(prize_entries) = 'array');

CREATE OR REPLACE FUNCTION public.guard_lobby_prize_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.prizes_enabled OR NEW.prize_entries <> '[]'::jsonb THEN
      RAISE EXCEPTION 'Lobby prizes must be managed through the secure function.'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.prizes_enabled IS DISTINCT FROM OLD.prizes_enabled
    OR NEW.prize_entries IS DISTINCT FROM OLD.prize_entries THEN
    RAISE EXCEPTION 'Lobby prizes must be managed through the secure function.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_lobby_prize_columns_trigger ON public.lobbies;
CREATE TRIGGER guard_lobby_prize_columns_trigger
BEFORE INSERT OR UPDATE ON public.lobbies
FOR EACH ROW EXECUTE FUNCTION public.guard_lobby_prize_columns();

REVOKE ALL ON FUNCTION public.guard_lobby_prize_columns()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_lobby_prizes_secure(
  lobby_id_param text,
  enabled_param boolean,
  entries_param jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  normalized_entries jsonb := COALESCE(entries_param, '[]'::jsonb);
  entry_count integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  -- v1 deliberately keeps prize promises with the lobby owner. Lobby admins
  -- can be added later without changing the stored contract.
  IF NOT public.is_lobby_owner(lobby_id_param) THEN
    RAISE EXCEPTION 'Only the lobby owner can manage prizes.'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(normalized_entries) <> 'array' THEN
    RAISE EXCEPTION 'Prize entries must be an array.' USING ERRCODE = '22023';
  END IF;

  entry_count := jsonb_array_length(normalized_entries);
  IF COALESCE(enabled_param, false) AND entry_count NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'Enabled prizes require 1 to 10 entries.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT COALESCE(enabled_param, false) THEN
    normalized_entries := '[]'::jsonb;
    entry_count := 0;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(normalized_entries) WITH ORDINALITY AS entry(value, position)
    WHERE jsonb_typeof(entry.value) <> 'object'
      OR NOT entry.value ? 'position'
      OR NOT entry.value ? 'label'
      OR jsonb_typeof(entry.value -> 'position') <> 'number'
      OR jsonb_typeof(entry.value -> 'label') <> 'string'
      OR COALESCE(entry.value ->> 'position', '') !~ '^[1-9][0-9]*$'
      OR CASE
        WHEN COALESCE(entry.value ->> 'position', '') ~ '^[1-9][0-9]*$'
          THEN (entry.value ->> 'position')::integer <> entry.position
        ELSE true
      END
      OR char_length(btrim(entry.value ->> 'label')) NOT BETWEEN 1 AND 120
      OR (entry.value ->> 'label') ~ '[<>]'
      OR EXISTS (
        SELECT 1
        FROM generate_series(1, 31) AS control(code)
        WHERE strpos(entry.value ->> 'label', chr(control.code)) > 0
      )
      OR strpos(entry.value ->> 'label', chr(127)) > 0
      OR (entry.value - 'position' - 'label') <> '{}'::jsonb
  ) THEN
    RAISE EXCEPTION 'Invalid prize entry.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.lobbies
  SET
    prizes_enabled = COALESCE(enabled_param, false),
    prize_entries = normalized_entries
  WHERE id = lobby_id_param;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lobby not found.' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'enabled', COALESCE(enabled_param, false),
    'entries', normalized_entries
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_lobby_prizes_secure(text, boolean, jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_lobby_prizes_secure(text, boolean, jsonb)
  TO authenticated;

-- Keep the deployed create_lobby_secure() contract unchanged. The prize-aware
-- variant composes it inside the same transaction, so a prize validation error
-- rolls back the lobby, owner membership, and tournament relation together.
CREATE OR REPLACE FUNCTION public.create_lobby_with_prizes_secure(
  lobby_name_param text,
  tournament_id_param text,
  visibility_param text,
  short_description_param text,
  long_description_param text,
  join_policy_param text,
  prizes_enabled_param boolean,
  prize_entries_param jsonb
)
RETURNS TABLE (
  id text,
  name text,
  owner_id uuid,
  tournament_id text,
  short_description text,
  long_description text,
  join_code text,
  join_policy text,
  visibility text,
  prizes_enabled boolean,
  prize_entries jsonb,
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
  created_lobby record;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO STRICT created_lobby
  FROM public.create_lobby_secure(
    lobby_name_param,
    tournament_id_param,
    visibility_param,
    short_description_param,
    long_description_param,
    join_policy_param
  );

  PERFORM public.set_lobby_prizes_secure(
    created_lobby.id,
    COALESCE(prizes_enabled_param, false),
    COALESCE(prize_entries_param, '[]'::jsonb)
  );

  RETURN QUERY
  SELECT
    lobby.id,
    lobby.name,
    lobby.owner_id,
    lobby.tournament_id,
    lobby.short_description,
    lobby.long_description,
    lobby.join_code,
    lobby.join_policy,
    lobby.visibility,
    lobby.prizes_enabled,
    lobby.prize_entries,
    lobby.created_at,
    tournament.name,
    lobby.owner_id = caller_id
  FROM public.lobbies AS lobby
  JOIN public.tournaments AS tournament
    ON tournament.id = lobby.tournament_id
  WHERE lobby.id = created_lobby.id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_lobby_with_prizes_secure(
  text, text, text, text, text, text, boolean, jsonb
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_lobby_with_prizes_secure(
  text, text, text, text, text, text, boolean, jsonb
) TO authenticated;

INSERT INTO public.app_feature_flags (key, enabled, is_public)
VALUES ('private_lobby_prizes_enabled', false, true)
ON CONFLICT (key) DO UPDATE
SET
  enabled = false,
  is_public = EXCLUDED.is_public,
  updated_at = now();
