-- 005_profile_avatar_lobby_descriptions.sql
-- Adds lightweight profile avatars and owner-editable lobby descriptions.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_emoji TEXT NOT NULL DEFAULT '😀',
  ADD COLUMN IF NOT EXISTS avatar_bg TEXT NOT NULL DEFAULT '#fee2e2';

ALTER TABLE public.lobbies
  ADD COLUMN IF NOT EXISTS short_description TEXT,
  ADD COLUMN IF NOT EXISTS long_description TEXT;
