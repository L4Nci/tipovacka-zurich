-- Supabase Migration: 001_initial_schema.sql
-- Description: Base database schema for Tipovačka 2.0 with Profiles, Sports, Participants, Tournaments, Lobbies, Members, Matches and Predictions.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. PROFILES & AUTH SYNCHRONIZATION
-- ==========================================

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
    tournament_winner_id TEXT, -- Temp or structural reference
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger function to synchronize profiles automatically when a new user registers via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role, created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'uzivatel_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_app_meta_data->>'role', 'player'),
    NEW.created_at
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- 2. SPORTS
-- ==========================================

CREATE TABLE public.sports (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    icon TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 3. PARTICIPANTS
-- ==========================================

CREATE TABLE public.participants (
    id TEXT PRIMARY KEY,
    sport_id TEXT NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    short_name TEXT,
    type TEXT NOT NULL DEFAULT 'team' CHECK (type IN ('team', 'individual', 'driver')),
    flag_code TEXT,
    logo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 4. TOURNAMENTS
-- ==========================================

CREATE TABLE public.tournaments (
    id TEXT PRIMARY KEY,
    sport_id TEXT NOT NULL REFERENCES public.sports(id) ON DELETE RESTRICT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'hidden')),
    external_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 5. LOBBIES
-- ==========================================

CREATE TABLE public.lobbies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    tournament_id TEXT NOT NULL REFERENCES public.tournaments(id) ON DELETE RESTRICT,
    join_code TEXT UNIQUE NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 6. LOBBY_MEMBERS
-- ==========================================

CREATE TABLE public.lobby_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lobby_id TEXT NOT NULL REFERENCES public.lobbies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_lobby_member UNIQUE (lobby_id, user_id)
);

-- ==========================================
-- 7. MATCHES (Production equivalent of matches_v2)
-- ==========================================

CREATE TABLE public.matches (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    home_participant_id TEXT NOT NULL REFERENCES public.participants(id) ON DELETE RESTRICT,
    away_participant_id TEXT NOT NULL REFERENCES public.participants(id) ON DELETE RESTRICT,
    start_time_utc TIMESTAMPTZ NOT NULL,
    lock_time_utc TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'finished')),
    stage TEXT,
    home_score INTEGER,
    away_score INTEGER,
    provider_name TEXT,
    provider_match_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create unique index for api synchronization
CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_provider_pg 
ON public.matches(provider_name, provider_match_id) 
WHERE provider_name IS NOT NULL AND provider_match_id IS NOT NULL;

-- ==========================================
-- 8. PREDICTIONS (Production equivalent of predictions_v2)
-- ==========================================

CREATE TABLE public.predictions (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    lobby_id TEXT NOT NULL REFERENCES public.lobbies(id) ON DELETE CASCADE,
    match_id TEXT NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    predicted_home_score INTEGER NOT NULL,
    predicted_away_score INTEGER NOT NULL,
    points_earned INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, lobby_id, match_id)
);

-- ==========================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable Row Level Security on all public tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lobbies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lobby_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

-- Security helper functions
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_lobby_member(lobby_id_val TEXT)
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.lobby_members
    WHERE lobby_id = lobby_id_val AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql;

-- 9a. PROFILES policies
CREATE POLICY "Profiles select policy" ON public.profiles
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Profiles update policy" ON public.profiles
    FOR UPDATE TO authenticated USING (auth.uid() = id);

-- 9b. SPORTS policies
CREATE POLICY "Sports select policy" ON public.sports
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Sports admin write policy" ON public.sports
    FOR ALL TO authenticated USING (is_admin());

-- 9c. PARTICIPANTS policies
CREATE POLICY "Participants select policy" ON public.participants
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Participants admin write policy" ON public.participants
    FOR ALL TO authenticated USING (is_admin());

-- 9d. TOURNAMENTS policies
CREATE POLICY "Tournaments select policy" ON public.tournaments
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Tournaments admin write policy" ON public.tournaments
    FOR ALL TO authenticated USING (is_admin());

-- 9e. LOBBIES policies
CREATE POLICY "Lobbies select policy" ON public.lobbies
    FOR SELECT TO authenticated USING (
        visibility = 'public' OR is_lobby_member(id) OR is_admin()
    );

CREATE POLICY "Lobbies insert policy" ON public.lobbies
    FOR INSERT TO authenticated WITH CHECK (
        owner_id = auth.uid() OR is_admin()
    );

CREATE POLICY "Lobbies update own policy" ON public.lobbies
    FOR UPDATE TO authenticated USING (
        owner_id = auth.uid() OR is_admin()
    );

CREATE POLICY "Lobbies delete own policy" ON public.lobbies
    FOR DELETE TO authenticated USING (
        owner_id = auth.uid() OR is_admin()
    );

-- 9f. LOBBY_MEMBERS policies
CREATE POLICY "Lobby members select policy" ON public.lobby_members
    FOR SELECT TO authenticated USING (
        is_lobby_member(lobby_id) OR is_admin()
    );

CREATE POLICY "Lobby members insert membership policy" ON public.lobby_members
    FOR INSERT TO authenticated WITH CHECK (
        user_id = auth.uid() OR
        EXISTS(SELECT 1 FROM public.lobbies WHERE id = lobby_id AND owner_id = auth.uid()) OR
        is_admin()
    );

CREATE POLICY "Lobby members delete membership policy" ON public.lobby_members
    FOR DELETE TO authenticated USING (
        user_id = auth.uid() OR
        EXISTS(SELECT 1 FROM public.lobbies WHERE id = lobby_id AND owner_id = auth.uid()) OR
        is_admin()
    );

-- 9g. MATCHES policies
CREATE POLICY "Matches select policy" ON public.matches
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Matches admin write policy" ON public.matches
    FOR ALL TO authenticated USING (is_admin());

-- 9h. PREDICTIONS policies
CREATE POLICY "Predictions select policy" ON public.predictions
    FOR SELECT TO authenticated USING (
        is_lobby_member(lobby_id) OR is_admin()
    );

CREATE POLICY "Predictions write own policy" ON public.predictions
    FOR INSERT TO authenticated WITH CHECK (
        user_id = auth.uid() AND
        EXISTS(SELECT 1 FROM public.matches WHERE id = match_id AND NOW() < lock_time_utc)
    );

CREATE POLICY "Predictions update own policy" ON public.predictions
    FOR UPDATE TO authenticated USING (
        user_id = auth.uid() AND
        EXISTS(SELECT 1 FROM public.matches WHERE id = match_id AND NOW() < lock_time_utc)
    );
