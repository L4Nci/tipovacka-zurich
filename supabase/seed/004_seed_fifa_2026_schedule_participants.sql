-- =========================================================================
-- ADDITIONAL PARTICIPANTS FOR FIFA WORLD CUP 2026 GROUP PHASE
-- File: supabase/seed/004_seed_fifa_2026_schedule_participants.sql
-- Description: Seeds the remaining 12 teams required for the FIFA World Cup 2026 Group Stage
--              to match the 48-team schedule exactly.
-- Standard Convention: football-<fifa_code_lowercase>
-- =========================================================================

INSERT INTO public.participants (id, sport_id, name, short_name, type, flag_code) VALUES
('football-rsa', 'football', 'South Africa', 'RSA', 'team', '🇿🇦'),
('football-bih', 'football', 'Bosnia and Herzegovina', 'BIH', 'team', '🇧🇦'),
('football-hai', 'football', 'Haiti', 'HAI', 'team', '🇭🇹'),
('football-sco', 'football', 'Scotland', 'SCO', 'team', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'),
('football-cuw', 'football', 'Curaçao', 'CUW', 'team', '🇨🇼'),
('football-civ', 'football', 'Ivory Coast', 'CIV', 'team', '🇨🇮'),
('football-cpv', 'football', 'Cape Verde', 'CPV', 'team', '🇨🇻'),
('football-irq', 'football', 'Iraq', 'IRQ', 'team', '🇮🇶'),
('football-jor', 'football', 'Jordan', 'JOR', 'team', '🇯🇴'),
('football-cod', 'football', 'DR Congo', 'COD', 'team', '🇨🇩'),
('football-pan', 'football', 'Panama', 'PAN', 'team', '🇵🇦'),
('football-uzb', 'football', 'Uzbekistan', 'UZB', 'team', '🇺🇿')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  flag_code = EXCLUDED.flag_code,
  sport_id = EXCLUDED.sport_id;
