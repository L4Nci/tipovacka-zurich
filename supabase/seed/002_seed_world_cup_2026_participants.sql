-- =========================================================================
-- ADDITIONAL PARTICIPANTS & PLACEHOLDERS FOR FIFA WORLD CUP 2026 (48-TEAM SEED)
-- File: supabase/seed/002_seed_world_cup_2026_participants.sql
-- Description: Extends the existing 14 core teams with 34 major global nations
--              and adds 48 standard TBA wildcard placeholds to streamline
--              any flexible layout, group-stage setup or delayed qualifications.
-- Standard Convention: football-<fifa_code_lowercase>
-- =========================================================================

INSERT INTO public.participants (id, sport_id, name, short_name, type, flag_code) VALUES
-- UEFA (Europe) - Adding remaining elite contenders (6 existing: FRA, ENG, GER, ESP, POR, ITA)
('football-bel', 'football', 'Belgium', 'BEL', 'team', '🇧🇪'),
('football-cro', 'football', 'Croatia', 'CRO', 'team', '🇭🇷'),
('football-ned', 'football', 'Netherlands', 'NED', 'team', '🇳🇱'),
('football-sui', 'football', 'Switzerland', 'SUI', 'team', '🇨🇭'),
('football-den', 'football', 'Denmark', 'DEN', 'team', '🇩🇰'),
('football-swe', 'football', 'Sweden', 'SWE', 'team', '🇸🇪'),
('football-nor', 'football', 'Norway', 'NOR', 'team', '🇳🇴'),
('football-pol', 'football', 'Poland', 'POL', 'team', '🇵🇱'),
('football-ukr', 'football', 'Ukraine', 'UKR', 'team', '🇺🇦'),
('football-tur', 'football', 'Turkey', 'TUR', 'team', '🇹🇷'),
('football-aut', 'football', 'Austria', 'AUT', 'team', '🇦🇹'),
('football-hun', 'football', 'Hungary', 'HUN', 'team', '🇭🇺'),
('football-cze', 'football', 'Czech Republic', 'CZE', 'team', '🇨🇿'),
('football-svk', 'football', 'Slovakia', 'SVK', 'team', '🇸🇰'),

-- CONMEBOL (South America) - Adding major contestants (2 existing: ARG, BRA)
('football-uru', 'football', 'Uruguay', 'URU', 'team', '🇺🇾'),
('football-col', 'football', 'Colombia', 'COL', 'team', '🇨🇴'),
('football-chi', 'football', 'Chile', 'CHI', 'team', '🇨🇱'),
('football-ecu', 'football', 'Ecuador', 'ECU', 'team', '🇪🇨'),
('football-per', 'football', 'Peru', 'PER', 'team', '🇵🇪'),
('football-par', 'football', 'Paraguay', 'PAR', 'team', '🇵🇾'),
('football-ven', 'football', 'Venezuela', 'VEN', 'team', '🇻🇪'),

-- CONCACAF (North/Central America & Caribbean) - (3 Host existing: USA, MEX, CAN)
('football-jam', 'football', 'Jamaica', 'JAM', 'team', '🇯🇲'),

-- CAF (Africa) - Adding prominent football forces (2 existing: MAR, SEN)
('football-egy', 'football', 'Egypt', 'EGY', 'team', '🇪🇬'),
('football-nga', 'football', 'Nigeria', 'NGA', 'team', '🇳🇬'),
('football-cmr', 'football', 'Cameroon', 'CMR', 'team', '🇨🇲'),
('football-gha', 'football', 'Ghana', 'GHA', 'team', '🇬🇭'),
('football-tun', 'football', 'Tunisia', 'TUN', 'team', '🇹🇳'),
('football-alg', 'football', 'Algeria', 'ALG', 'team', '🇩🇿'),

-- AFC (Asia) - Adding Asian powerhouses (1 existing: JPN)
('football-kor', 'football', 'South Korea', 'KOR', 'team', '🇰🇷'),
('football-aus', 'football', 'Australia', 'AUS', 'team', '🇦🇺'),
('football-ksa', 'football', 'Saudi Arabia', 'KSA', 'team', '🇸🇦'),
('football-irn', 'football', 'Iran', 'IRN', 'team', '🇮🇷'),
('football-qat', 'football', 'Qatar', 'QAT', 'team', '🇶🇦'),

-- OFC (Oceania) - Champion contender
('football-nzl', 'football', 'New Zealand', 'NZL', 'team', '🇳🇿'),

-- 48 STAGE / GROUP PLACEHOLDERS FOR UNKNOWN OR TBD ENTRIES
('football-tba-01', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-02', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-03', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-04', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-05', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-06', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-07', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-08', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-09', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-10', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-11', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-12', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-13', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-14', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-15', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-16', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-17', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-18', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-19', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-20', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-21', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-22', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-23', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-24', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-25', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-26', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-27', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-28', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-29', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-30', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-31', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-32', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-33', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-34', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-35', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-36', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-37', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-38', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-39', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-40', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-41', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-42', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-43', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-44', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-45', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-46', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-47', 'football', 'TBA', 'TBA', 'team', '⚽'),
('football-tba-48', 'football', 'TBA', 'TBA', 'team', '⚽')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  flag_code = EXCLUDED.flag_code,
  sport_id = EXCLUDED.sport_id;
