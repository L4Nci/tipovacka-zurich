-- Supabase Seeding script: 001_seed_base_data.sql
-- Description: Idempotent seeding script for fundamental sports, tournaments, and basic participants (FIFA World Cup 2026).
-- This file contains NO direct auth.users writes or lobbies creations, abiding by the physical DB constraints.

-- ==========================================
-- 1. SPORTS
-- ==========================================

INSERT INTO public.sports (id, slug, name, icon, is_active) VALUES
('football', 'football', 'Football', '⚽', TRUE),
('hockey', 'hockey', 'Ice Hockey', '🏒', TRUE)
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name, slug = EXCLUDED.slug, icon = EXCLUDED.icon, is_active = EXCLUDED.is_active;

-- ==========================================
-- 2. TOURNAMENTS
-- ==========================================

INSERT INTO public.tournaments (id, sport_id, slug, name, status) VALUES
('fifa-world-cup-2026', 'football', 'fifa-world-cup-2026', 'FIFA World Cup 2026', 'active')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  status = EXCLUDED.status,
  sport_id = EXCLUDED.sport_id;

-- ==========================================
-- 3. PARTICIPANTS (FIFA World Cup 2026 Core/Host & Prominent Nations)
-- ==========================================

INSERT INTO public.participants (id, sport_id, name, short_name, type, flag_code) VALUES
('football-tba', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-usa', 'football', 'United States', 'USA', 'team', '🇺🇸'),
('football-mex', 'football', 'Mexico', 'MEX', 'team', '🇲🇽'),
('football-can', 'football', 'Canada', 'CAN', 'team', '🇨🇦'),
('football-arg', 'football', 'Argentina', 'ARG', 'team', '🇦🇷'),
('football-bra', 'football', 'Brazil', 'BRA', 'team', '🇧🇷'),
('football-fra', 'football', 'France', 'FRA', 'team', '🇫🇷'),
('football-eng', 'football', 'England', 'ENG', 'team', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'),
('football-ger', 'football', 'Germany', 'GER', 'team', '🇩🇪'),
('football-esp', 'football', 'Spain', 'ESP', 'team', '🇪🇸'),
('football-por', 'football', 'Portugal', 'POR', 'team', '🇵🇹'),
('football-ita', 'football', 'Italy', 'ITA', 'team', '🇮🇹'),
('football-mar', 'football', 'Morocco', 'MAR', 'team', '🇲🇦'),
('football-sen', 'football', 'Senegal', 'SEN', 'team', '🇸🇳'),
('football-jpn', 'football', 'Japan', 'JPN', 'team', '🇯🇵')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  flag_code = EXCLUDED.flag_code,
  sport_id = EXCLUDED.sport_id;

-- ==========================================
-- 4. MATCHES
-- ==========================================

INSERT INTO public.matches (id, tournament_id, home_participant_id, away_participant_id, start_time_utc, lock_time_utc, status, stage) VALUES
('m001', 'fifa-world-cup-2026', 'football-usa', 'football-mex', '2026-06-11T20:00:00Z', '2026-06-11T19:55:00Z', 'scheduled', 'Group Stage'),
('m002', 'fifa-world-cup-2026', 'football-can', 'football-arg', '2026-06-12T18:00:00Z', '2026-06-12T17:55:00Z', 'scheduled', 'Group Stage'),
('m003', 'fifa-world-cup-2026', 'football-fra', 'football-eng', '2026-06-12T21:00:00Z', '2026-06-12T20:55:00Z', 'scheduled', 'Group Stage'),
('m004', 'fifa-world-cup-2026', 'football-ger', 'football-esp', '2026-06-13T17:00:00Z', '2026-06-13T16:55:00Z', 'scheduled', 'Group Stage'),
('m005', 'fifa-world-cup-2026', 'football-bra', 'football-jpn', '2026-06-13T20:00:00Z', '2026-06-13T19:55:00Z', 'scheduled', 'Group Stage')
ON CONFLICT (id) DO UPDATE SET
  tournament_id = EXCLUDED.tournament_id,
  home_participant_id = EXCLUDED.home_participant_id,
  away_participant_id = EXCLUDED.away_participant_id,
  start_time_utc = EXCLUDED.start_time_utc,
  lock_time_utc = EXCLUDED.lock_time_utc,
  status = EXCLUDED.status,
  stage = EXCLUDED.stage;

