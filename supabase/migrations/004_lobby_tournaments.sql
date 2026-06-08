-- 004_lobby_tournaments.sql

CREATE TABLE IF NOT EXISTS lobby_tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id TEXT REFERENCES lobbies(id) ON DELETE CASCADE,
  tournament_id TEXT REFERENCES tournaments(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lobby_id, tournament_id)
);

-- Backfill existing data
INSERT INTO lobby_tournaments (lobby_id, tournament_id, status)
SELECT id, tournament_id, 'active'
FROM lobbies
WHERE tournament_id IS NOT NULL
ON CONFLICT (lobby_id, tournament_id) DO NOTHING;

-- RLS Policies
ALTER TABLE lobby_tournaments ENABLE ROW LEVEL SECURITY;

-- 1. Members can read tournaments in their lobbies
CREATE POLICY "Members can read lobby tournaments"
ON lobby_tournaments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM lobby_members
    WHERE lobby_members.lobby_id = lobby_tournaments.lobby_id
      AND lobby_members.user_id = auth.uid()
  )
);

-- 2. Owner can manage lobby tournaments
CREATE POLICY "Owners can manage lobby tournaments"
ON lobby_tournaments FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM lobbies
    WHERE lobbies.id = lobby_tournaments.lobby_id
      AND lobbies.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM lobbies
    WHERE lobbies.id = lobby_tournaments.lobby_id
      AND lobbies.owner_id = auth.uid()
  )
);
