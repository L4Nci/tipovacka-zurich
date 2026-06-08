-- =========================================================================
-- Supabase Migration: 002_tournament_participants.sql
-- Description: Creates the 'tournament_participants' table linking teams to 
--              specific tournaments with their group designations (A-L), 
--              avoiding polluting the global 'participants' team directory.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.tournament_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id TEXT NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    participant_id TEXT NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
    group_code TEXT CHECK (group_code IN ('A','B','C','D','E','F','G','H','I','J','K','L')), -- Allowing groups A-L, NULL for playoff stage if not assigned
    seed_position INTEGER, -- Optional position within the group (e.g. 1, 2, 3, 4)
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'qualified', 'eliminated')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure a team cannot be added to the same tournament multiple times
    CONSTRAINT unique_tournament_participant UNIQUE (tournament_id, participant_id),
    
    -- Ensure each seed position in a specific group is unique within a tournament
    CONSTRAINT unique_tournament_group_seed UNIQUE (tournament_id, group_code, seed_position)
);

-- =========================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

-- Enable RLS on the new table
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;

-- Select Policy: All authenticated users can read tournament participants info (needed for dashboards and layouts)
CREATE POLICY "Tournament participants select policy" ON public.tournament_participants
    FOR SELECT TO authenticated USING (TRUE);

-- Write/Modify Policy: Restrict modifications strictly to platform administrators
CREATE POLICY "Tournament participants admin write policy" ON public.tournament_participants
    FOR ALL TO authenticated USING (public.is_admin());
