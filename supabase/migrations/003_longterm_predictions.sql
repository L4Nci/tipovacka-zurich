-- =========================================================================
-- Supabase Migration: 003_longterm_predictions.sql
-- Description: Adds 'actual_tournament_winner_id' to select the tournament-wide 
--              winner, and defines the 'longterm_predictions' table for lobby-specific 
--              user predictions with a strict UNIQUE constraint for MVP scoring.
-- =========================================================================

-- 1. Extend tournaments table to store actual champion
ALTER TABLE public.tournaments 
ADD COLUMN IF NOT EXISTS actual_tournament_winner_id TEXT REFERENCES public.participants(id) ON DELETE SET NULL;

-- 2. Create longterm_predictions table
CREATE TABLE IF NOT EXISTS public.longterm_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lobby_id TEXT NOT NULL REFERENCES public.lobbies(id) ON DELETE CASCADE,
    tournament_id TEXT NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    prediction_type TEXT NOT NULL CHECK (prediction_type = 'tournament_winner'),
    predicted_participant_id TEXT NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
    points_earned INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure exactly one tournament winner prediction per user per lobby per tournament
    CONSTRAINT unique_lobby_tournament_user_prediction UNIQUE (lobby_id, tournament_id, user_id, prediction_type)
);

-- =========================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

-- Enable RLS
ALTER TABLE public.longterm_predictions ENABLE ROW LEVEL SECURITY;

-- Select Policy: All lobby members can read longterm predictions of their lobby
CREATE POLICY "Longterm predictions select policy" ON public.longterm_predictions
    FOR SELECT TO authenticated USING (
        public.is_lobby_member(lobby_id) OR public.is_admin()
    );

-- Insert/Upsert Policy: Members can only write/update their own predictions
CREATE POLICY "Longterm predictions insert policy" ON public.longterm_predictions
    FOR INSERT TO authenticated WITH CHECK (
        user_id = auth.uid() AND public.is_lobby_member(lobby_id)
    );

CREATE POLICY "Longterm predictions update policy" ON public.longterm_predictions
    FOR UPDATE TO authenticated USING (
        user_id = auth.uid() AND public.is_lobby_member(lobby_id)
    );

CREATE POLICY "Longterm predictions delete policy" ON public.longterm_predictions
    FOR DELETE TO authenticated USING (
        user_id = auth.uid() AND public.is_lobby_member(lobby_id)
    );
