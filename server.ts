import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import "dotenv/config";
import { getSupabaseAdmin } from "./server/lib/supabaseAdmin.ts";

const dbUrl = process.env.TURSO_DATABASE_URL || `file:///${path.join(process.cwd(), "local.db")}`;
const dbAuthToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient({
  url: dbUrl,
  authToken: dbAuthToken,
});

async function initDb() {
  console.log("Initializing Database...");
  console.log("DB URL protocol:", dbUrl.split(':')[0]);

  // Create sports table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sports (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      icon TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed sports
  const sportsToSeed = [
    { id: 'hockey', slug: 'hockey', name: 'Hokej', icon: '🏒' },
    { id: 'football', slug: 'football', name: 'Fotbal', icon: '⚽' },
    { id: 'tennis', slug: 'tennis', name: 'Tenis', icon: '🎾' },
    { id: 'mma', slug: 'mma', name: 'MMA', icon: '🥊' },
    { id: 'formula1', slug: 'formula1', name: 'Formule 1', icon: '🏎️' }
  ];

  for (const s of sportsToSeed) {
    await db.execute({
      sql: "INSERT OR IGNORE INTO sports (id, slug, name, icon) VALUES (?, ?, ?, ?)",
      args: [s.id, s.slug, s.name, s.icon]
    });
  }
  console.log("Sports seeded.");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      flag_code TEXT NOT NULL,
      group_name TEXT,
      is_final_winner INTEGER DEFAULT 0
    )
  `);

  // Ensure is_final_winner column exists
  try {
    await db.execute("ALTER TABLE teams ADD COLUMN is_final_winner INTEGER DEFAULT 0");
  } catch (e) {}

  await db.execute(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'player',
      tournament_winner_id TEXT,
      FOREIGN KEY (tournament_winner_id) REFERENCES teams (id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      home_team_id TEXT NOT NULL,
      away_team_id TEXT NOT NULL,
      start_time_utc TEXT NOT NULL,
      home_score INTEGER,
      away_score INTEGER,
      status TEXT DEFAULT 'scheduled',
      stage TEXT,
      FOREIGN KEY (home_team_id) REFERENCES teams (id),
      FOREIGN KEY (away_team_id) REFERENCES teams (id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS predictions (
      player_id TEXT NOT NULL,
      match_id TEXT NOT NULL,
      predicted_home_score INTEGER NOT NULL,
      predicted_away_score INTEGER NOT NULL,
      points_earned INTEGER DEFAULT 0,
      PRIMARY KEY (player_id, match_id),
      FOREIGN KEY (player_id) REFERENCES players (id),
      FOREIGN KEY (match_id) REFERENCES matches (id)
    )
  `);

  // Admin seeding
  const playersCheck = await db.execute("SELECT COUNT(*) as count FROM players WHERE role = 'admin'");
  if (Number(playersCheck.rows[0].count) === 0 || (await db.execute("SELECT id FROM players WHERE id = 'admin-1'")).rows.length > 0) {
    // Delete legacy admin if exists
    await db.execute("DELETE FROM players WHERE id = 'admin-1'");

    const usersToSeed = [
      { id: 'u-viktor', user: 'Viktor', pass: 'viktorviktor', role: 'admin' },
      { id: 'u-hana', user: 'Hana', pass: 'HanKa123', role: 'admin' }
    ];

    for (const u of usersToSeed) {
      const hash = await bcrypt.hash(u.pass, 10);
      await db.execute({
        sql: "INSERT OR IGNORE INTO players (id, username, password_hash, role) VALUES (?, ?, ?, ?)",
        args: [u.id, u.user, hash, u.role]
      });
    }
    console.log("New admins seeded.");
  }

  // Teams seeding
  const teamsCheck = await db.execute("SELECT COUNT(*) as count FROM teams");
  if (Number(teamsCheck.rows[0].count) < 16) {
    const teams = [
      ['tba', 'TBA', '🏒', null],
      ['usa', 'USA', '🇺🇸', 'A'],
      ['sui', 'Switzerland', '🇨🇭', 'A'],
      ['fin', 'Finland', '🇫🇮', 'A'],
      ['ger', 'Germany', '🇩🇪', 'A'],
      ['lat', 'Latvia', '🇱🇻', 'A'],
      ['aut', 'Austria', '🇦🇹', 'A'],
      ['hun', 'Hungary', '🇭🇺', 'A'],
      ['gbr', 'Great Britain', '🇬🇧', 'A'],
      ['can', 'Canada', '🇨🇦', 'B'],
      ['swe', 'Sweden', '🇸🇪', 'B'],
      ['cze', 'Czechia', '🇨🇿', 'B'],
      ['den', 'Denmark', '🇩🇰', 'B'],
      ['svk', 'Slovakia', '🇸🇰', 'B'],
      ['nor', 'Norway', '🇳🇴', 'B'],
      ['slo', 'Slovenia', '🇸🇮', 'B'],
      ['ita', 'Italy', '🇮🇹', 'B'],
    ];
    for (const t of teams) {
      await db.execute({
        sql: "INSERT OR IGNORE INTO teams (id, name, flag_code, group_name) VALUES (?, ?, ?, ?)",
        args: t
      });
    }
    console.log("Teams seeded.");
  }

  // Create participants table and sync from teams
  await db.execute(`
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      sport_id TEXT NOT NULL,
      name TEXT NOT NULL,
      short_name TEXT,
      type TEXT NOT NULL DEFAULT 'team',
      flag_code TEXT,
      logo_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sport_id) REFERENCES sports (id)
    )
  `);

  // Migrate existing teams to participants (idempotent INSERT OR IGNORE)
  await db.execute(`
    INSERT OR IGNORE INTO participants (id, sport_id, name, short_name, type, flag_code, created_at)
    SELECT id, 'hockey', name, UPPER(id), 'team', flag_code, CURRENT_TIMESTAMP FROM teams
  `);
  console.log("Participants synced from teams.");

  // Create tournaments table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      sport_id TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      external_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sport_id) REFERENCES sports (id)
    )
  `);

  // Seed tournaments
  const tournamentsToSeed = [
    { id: 'ms-hockey-2026', sport_id: 'hockey', slug: 'ms-hockey-2026', name: 'Mistrovství světa v hokeji 2026' },
    { id: 'fifa-world-cup-2026', sport_id: 'football', slug: 'fifa-world-cup-2026', name: 'FIFA World Cup 2026' },
    { id: 'premier-league', sport_id: 'football', slug: 'premier-league', name: 'Premier League' },
    { id: 'champions-league', sport_id: 'football', slug: 'champions-league', name: 'UEFA Champions League' }
  ];

  for (const t of tournamentsToSeed) {
    await db.execute({
      sql: "INSERT OR IGNORE INTO tournaments (id, sport_id, slug, name, status) VALUES (?, ?, ?, ?, 'active')",
      args: [t.id, t.sport_id, t.slug, t.name]
    });
  }
  console.log("Tournaments seeded.");

  // Create lobbies table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS lobbies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT,
      tournament_id TEXT NOT NULL,
      join_code TEXT UNIQUE NOT NULL,
      visibility TEXT DEFAULT 'private',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
      FOREIGN KEY (owner_id) REFERENCES players(id)
    )
  `);

  // Seed default hockey lobby
  const firstAdminRes = await db.execute("SELECT id FROM players WHERE role = 'admin' LIMIT 1");
  const defaultOwnerId = firstAdminRes.rows.length > 0 ? String(firstAdminRes.rows[0].id) : null;

  await db.execute({
    sql: "INSERT OR IGNORE INTO lobbies (id, name, owner_id, tournament_id, join_code, visibility) VALUES (?, ?, ?, ?, ?, ?)",
    args: ['global-hockey-lobby', 'Hlavní hokejová tipovačka', defaultOwnerId, 'ms-hockey-2026', 'HOCKEY2026', 'public']
  });
  console.log("Lobbies seeded.");

  // Create lobby_tournaments table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS lobby_tournaments (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-a' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
      lobby_id TEXT NOT NULL,
      tournament_id TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lobby_id) REFERENCES lobbies(id) ON DELETE CASCADE,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      CONSTRAINT unique_lobby_tournament UNIQUE (lobby_id, tournament_id)
    )
  `);

  // Backfill existing lobby_tournaments
  await db.execute(`
    INSERT OR IGNORE INTO lobby_tournaments (lobby_id, tournament_id, status)
    SELECT id, tournament_id, 'active'
    FROM lobbies
    WHERE tournament_id IS NOT NULL
  `);

  // Create lobby_members table and sync from players
  await db.execute(`
    CREATE TABLE IF NOT EXISTS lobby_members (
      id TEXT PRIMARY KEY,
      lobby_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lobby_id) REFERENCES lobbies(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES players(id) ON DELETE CASCADE,
      CONSTRAINT unique_lobby_member UNIQUE (lobby_id, user_id)
    )
  `);

  // Migrate existing players to lobby_members
  const playersRes = await db.execute("SELECT id, role FROM players");
  console.log(`Syncing ${playersRes.rows.length} players to lobby_members...`);

  const LOBBY_MEMBERS_BATCH_SIZE = 50;
  for (let i = 0; i < playersRes.rows.length; i += LOBBY_MEMBERS_BATCH_SIZE) {
    const chunk = playersRes.rows.slice(i, i + LOBBY_MEMBERS_BATCH_SIZE);
    const statements = chunk.map(player => {
      const playerId = String(player.id);
      const playerRole = String(player.role);

      let lobbyRole = 'member';
      if (playerId === defaultOwnerId) {
        lobbyRole = 'owner';
      } else if (playerRole === 'admin') {
        lobbyRole = 'admin';
      }

      return {
        sql: `
          INSERT OR IGNORE INTO lobby_members (id, lobby_id, user_id, role)
          VALUES (?, ?, ?, ?)
        `,
        args: [`lm-global-hockey-lobby-${playerId}`, 'global-hockey-lobby', playerId, lobbyRole]
      };
    });
    await db.batch(statements, "write");
  }

  // Audit results logic
  const lobbyMembersCountRes = await db.execute("SELECT COUNT(*) as count FROM lobby_members WHERE lobby_id = 'global-hockey-lobby'");
  const lobbyOwnersCountRes = await db.execute("SELECT COUNT(*) as count FROM lobby_members WHERE lobby_id = 'global-hockey-lobby' AND role = 'owner'");
  const lobbyAdminsCountRes = await db.execute("SELECT COUNT(*) as count FROM lobby_members WHERE lobby_id = 'global-hockey-lobby' AND role = 'admin'");
  const lobbyMembersOnlyCountRes = await db.execute("SELECT COUNT(*) as count FROM lobby_members WHERE lobby_id = 'global-hockey-lobby' AND role = 'member'");

  console.log("=== Auditing Lobby Members ===");
  console.log(`Total players in database: ${playersRes.rows.length}`);
  console.log(`Total members in global-hockey-lobby: ${lobbyMembersCountRes.rows[0].count}`);
  console.log(`Owners count: ${lobbyOwnersCountRes.rows[0].count}`);
  console.log(`Admins count: ${lobbyAdminsCountRes.rows[0].count}`);
  console.log(`Regular members count: ${lobbyMembersOnlyCountRes.rows[0].count}`);
  console.log("===============================");

  // Matches seeding
  const matchesCheck = await db.execute("SELECT COUNT(*) as count FROM matches");
  if (Number(matchesCheck.rows[0].count) === 0) {
    const matches = [
      ['m001', 'fin', 'ger', '2026-05-15T14:20:00Z', 'Group A'],
      ['m002', 'can', 'swe', '2026-05-15T14:20:00Z', 'Group B'],
      ['m003', 'usa', 'sui', '2026-05-15T18:20:00Z', 'Group A'],
      ['m004', 'cze', 'den', '2026-05-15T18:20:00Z', 'Group B'],
      ['m005', 'gbr', 'aut', '2026-05-16T10:20:00Z', 'Group A'],
      ['m006', 'svk', 'nor', '2026-05-16T10:20:00Z', 'Group B'],
      ['m007', 'hun', 'fin', '2026-05-16T14:20:00Z', 'Group A'],
      ['m008', 'ita', 'can', '2026-05-16T14:20:00Z', 'Group B'],
      ['m009', 'sui', 'lat', '2026-05-16T18:20:00Z', 'Group A'],
      ['m010', 'slo', 'cze', '2026-05-16T18:20:00Z', 'Group B'],
      ['m011', 'gbr', 'usa', '2026-05-17T10:20:00Z', 'Group A'],
      ['m012', 'ita', 'svk', '2026-05-17T10:20:00Z', 'Group B'],
      ['m013', 'aut', 'hun', '2026-05-17T14:20:00Z', 'Group A'],
      ['m014', 'den', 'swe', '2026-05-17T14:20:00Z', 'Group B'],
      ['m015', 'ger', 'lat', '2026-05-17T18:20:00Z', 'Group A'],
      ['m016', 'nor', 'slo', '2026-05-17T18:20:00Z', 'Group B'],
      ['m017', 'fin', 'usa', '2026-05-18T14:20:00Z', 'Group A'],
      ['m018', 'can', 'den', '2026-05-18T14:20:00Z', 'Group B'],
      ['m019', 'ger', 'sui', '2026-05-18T18:20:00Z', 'Group A'],
      ['m020', 'swe', 'cze', '2026-05-18T18:20:00Z', 'Group B'],
      ['m021', 'lat', 'aut', '2026-05-19T14:20:00Z', 'Group A'],
      ['m022', 'ita', 'nor', '2026-05-19T14:20:00Z', 'Group B'],
      ['m023', 'hun', 'gbr', '2026-05-19T18:20:00Z', 'Group A'],
      ['m024', 'slo', 'svk', '2026-05-19T18:20:00Z', 'Group B'],
      ['m025', 'aut', 'sui', '2026-05-20T14:20:00Z', 'Group A'],
      ['m026', 'cze', 'ita', '2026-05-20T14:20:00Z', 'Group B'],
      ['m027', 'usa', 'ger', '2026-05-20T18:20:00Z', 'Group A'],
      ['m028', 'swe', 'slo', '2026-05-20T18:20:00Z', 'Group B'],
      ['m029', 'lat', 'fin', '2026-05-21T14:20:00Z', 'Group A'],
      ['m030', 'can', 'nor', '2026-05-21T14:20:00Z', 'Group B'],
      ['m031', 'sui', 'gbr', '2026-05-21T18:20:00Z', 'Group A'],
      ['m032', 'den', 'svk', '2026-05-21T18:20:00Z', 'Group B'],
      ['m033', 'ger', 'hun', '2026-05-22T14:20:00Z', 'Group A'],
      ['m034', 'can', 'slo', '2026-05-22T14:20:00Z', 'Group B'],
      ['m035', 'fin', 'gbr', '2026-05-22T18:20:00Z', 'Group A'],
      ['m036', 'swe', 'ita', '2026-05-22T18:20:00Z', 'Group B'],
      ['m037', 'lat', 'usa', '2026-05-23T10:20:00Z', 'Group A'],
      ['m038', 'den', 'slo', '2026-05-23T10:20:00Z', 'Group B'],
      ['m039', 'sui', 'hun', '2026-05-23T14:20:00Z', 'Group A'],
      ['m040', 'svk', 'cze', '2026-05-23T14:20:00Z', 'Group B'],
      ['m041', 'aut', 'ger', '2026-05-23T18:20:00Z', 'Group A'],
      ['m042', 'nor', 'swe', '2026-05-23T18:20:00Z', 'Group B'],
      ['m043', 'gbr', 'lat', '2026-05-24T14:20:00Z', 'Group A'],
      ['m044', 'den', 'ita', '2026-05-24T14:20:00Z', 'Group B'],
      ['m045', 'fin', 'aut', '2026-05-24T18:20:00Z', 'Group A'],
      ['m046', 'svk', 'can', '2026-05-24T18:20:00Z', 'Group B'],
      ['m047', 'usa', 'hun', '2026-05-25T14:20:00Z', 'Group A'],
      ['m048', 'cze', 'nor', '2026-05-25T14:20:00Z', 'Group B'],
      ['m049', 'ger', 'gbr', '2026-05-25T18:20:00Z', 'Group A'],
      ['m050', 'slo', 'ita', '2026-05-25T18:20:00Z', 'Group B'],
      ['m051', 'hun', 'lat', '2026-05-26T10:20:00Z', 'Group A'],
      ['m052', 'nor', 'den', '2026-05-26T10:20:00Z', 'Group B'],
      ['m053', 'usa', 'aut', '2026-05-26T14:20:00Z', 'Group A'],
      ['m054', 'swe', 'svk', '2026-05-26T14:20:00Z', 'Group B'],
      ['m055', 'sui', 'fin', '2026-05-26T18:20:00Z', 'Group A'],
      ['m056', 'cze', 'can', '2026-05-26T18:20:00Z', 'Group B'],
      ['qf1', 'tba', 'tba', '2026-05-28T14:20:00Z', 'Quarterfinal'],
      ['qf2', 'tba', 'tba', '2026-05-28T14:20:00Z', 'Quarterfinal'],
      ['qf3', 'tba', 'tba', '2026-05-28T18:20:00Z', 'Quarterfinal'],
      ['qf4', 'tba', 'tba', '2026-05-28T18:20:00Z', 'Quarterfinal'],
      ['sf1', 'tba', 'tba', '2026-05-30T13:20:00Z', 'Semifinal'],
      ['sf2', 'tba', 'tba', '2026-05-30T18:00:00Z', 'Semifinal'],
      ['bronze', 'tba', 'tba', '2026-05-31T13:30:00Z', 'Bronze Medal Game'],
      ['final', 'tba', 'tba', '2026-05-31T18:20:00Z', 'Gold Medal Game'],
    ];
    const MATCH_SEED_BATCH_SIZE = 50;
    for (let i = 0; i < matches.length; i += MATCH_SEED_BATCH_SIZE) {
      const chunk = matches.slice(i, i + MATCH_SEED_BATCH_SIZE);
      const statements = chunk.map(m => ({
        sql: "INSERT OR IGNORE INTO matches (id, home_team_id, away_team_id, start_time_utc, stage) VALUES (?, ?, ?, ?, ?)",
        args: m
      }));
      await db.batch(statements, "write");
    }
    console.log("Matches seeded.");
  }

  // Create matches_v2 table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS matches_v2 (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      home_participant_id TEXT NOT NULL,
      away_participant_id TEXT NOT NULL,
      start_time_utc TEXT NOT NULL,
      lock_time_utc TEXT NOT NULL,
      status TEXT DEFAULT 'scheduled',
      stage TEXT,
      home_score INTEGER,
      away_score INTEGER,
      provider_name TEXT,
      provider_match_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tournament_id) REFERENCES tournaments (id),
      FOREIGN KEY (home_participant_id) REFERENCES participants (id),
      FOREIGN KEY (away_participant_id) REFERENCES participants (id)
    )
  `);

  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_v2_provider ON matches_v2(provider_name, provider_match_id) 
    WHERE provider_name IS NOT NULL AND provider_match_id IS NOT NULL;
  `);

  // Migrate legacy matches to matches_v2 (idempotent mapping)
  const legacyMatchesRes = await db.execute("SELECT * FROM matches");
  console.log(`Syncing ${legacyMatchesRes.rows.length} legacy matches to matches_v2...`);

  const MATCHES_BATCH_SIZE = 50;
  for (let i = 0; i < legacyMatchesRes.rows.length; i += MATCHES_BATCH_SIZE) {
    const chunk = legacyMatchesRes.rows.slice(i, i + MATCHES_BATCH_SIZE);
    const statements = chunk.map(m => {
      const id = String(m.id);
      const homeTeamId = String(m.home_team_id);
      const awayTeamId = String(m.away_team_id);
      const startTimeUtc = String(m.start_time_utc);
      const status = String(m.status || 'scheduled');
      const stage = m.stage ? String(m.stage) : null;
      const homeScore = m.home_score !== null && m.home_score !== undefined ? Number(m.home_score) : null;
      const awayScore = m.away_score !== null && m.away_score !== undefined ? Number(m.away_score) : null;

      let lockTimeUtc = startTimeUtc;
      try {
        const date = new Date(startTimeUtc);
        if (!isNaN(date.getTime())) {
          const lockDate = new Date(date.getTime() - 5 * 60 * 1000);
          lockTimeUtc = lockDate.toISOString();
        }
      } catch (e) {
        console.error(`Chyba při parsování start_time_utc pro zápas ${id}:`, e);
      }

      return {
        sql: `
          INSERT OR IGNORE INTO matches_v2 (
            id, tournament_id, home_participant_id, away_participant_id,
            start_time_utc, lock_time_utc, status, stage,
            home_score, away_score
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [id, 'ms-hockey-2026', homeTeamId, awayTeamId, startTimeUtc, lockTimeUtc, status, stage, homeScore, awayScore]
      };
    });
    await db.batch(statements, "write");
  }

  // Auditing results logic for matches_v2
  const legacyMatchesCountRes = await db.execute("SELECT COUNT(*) as count FROM matches");
  const matchesV2CountRes = await db.execute("SELECT COUNT(*) as count FROM matches_v2");
  const participantsCountRes = await db.execute("SELECT COUNT(*) as count FROM participants");
  const inconsistenciesRes = await db.execute(`
    SELECT COUNT(*) as count FROM matches_v2 
    WHERE home_participant_id NOT IN (SELECT id FROM participants) 
       OR away_participant_id NOT IN (SELECT id FROM participants)
  `);

  console.log("=== Auditing Matches V2 ===");
  console.log(`Počet legacy zápasů v matches: ${legacyMatchesCountRes.rows[0].count}`);
  console.log(`Počet nových zápasů v matches_v2: ${matchesV2CountRes.rows[0].count}`);
  console.log(`Počet unikátních participantů v databázi: ${participantsCountRes.rows[0].count}`);
  console.log(`Počet nekonzistentních referencí na participanty: ${inconsistenciesRes.rows[0].count}`);
  console.log("===========================");

  // Create predictions_v2 table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS predictions_v2 (
      id TEXT PRIMARY KEY,
      lobby_id TEXT NOT NULL,
      match_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      predicted_home_score INTEGER NOT NULL,
      predicted_away_score INTEGER NOT NULL,
      points_earned INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lobby_id) REFERENCES lobbies (id),
      FOREIGN KEY (match_id) REFERENCES matches_v2 (id),
      FOREIGN KEY (user_id) REFERENCES players (id),
      CONSTRAINT unique_lobby_match_user UNIQUE (lobby_id, match_id, user_id)
    )
  `);

  // Migrate existing predictions to predictions_v2 (idempotent mapping)
  const legacyPredictionsRes = await db.execute("SELECT * FROM predictions");
  console.log(`Syncing ${legacyPredictionsRes.rows.length} legacy predictions to predictions_v2...`);

  const BATCH_SIZE = 50;
  for (let i = 0; i < legacyPredictionsRes.rows.length; i += BATCH_SIZE) {
    const chunk = legacyPredictionsRes.rows.slice(i, i + BATCH_SIZE);
    const statements = chunk.map(p => {
      const playerId = String(p.player_id);
      const matchId = String(p.match_id);
      const predHome = Number(p.predicted_home_score);
      const predAway = Number(p.predicted_away_score);
      const pts = p.points_earned !== null && p.points_earned !== undefined ? Number(p.points_earned) : 0;
      const id = `p2-global-hockey-lobby-${matchId}-${playerId}`;
      return {
        sql: `
          INSERT OR IGNORE INTO predictions_v2 (
            id, lobby_id, match_id, user_id, 
            predicted_home_score, predicted_away_score, points_earned
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        args: [id, 'global-hockey-lobby', matchId, playerId, predHome, predAway, pts]
      };
    });
    await db.batch(statements, "write");
  }

  // Audit predictions_v2
  const oldPredsCount = await db.execute("SELECT COUNT(*) as count FROM predictions");
  const newPredsCount = await db.execute("SELECT COUNT(*) as count FROM predictions_v2");
  
  const dupCheck = await db.execute(`
    SELECT COUNT(*) as count FROM (
      SELECT lobby_id, match_id, user_id 
      FROM predictions_v2 
      GROUP BY lobby_id, match_id, user_id 
      HAVING COUNT(*) > 1
    )
  `);
  const dupCount = Number(dupCheck.rows[0].count);

  const orphanMatchesCheck = await db.execute(`
    SELECT COUNT(*) as count FROM predictions_v2
    WHERE match_id NOT IN (SELECT id FROM matches_v2)
  `);
  const orphanMatchesCount = Number(orphanMatchesCheck.rows[0].count);

  const orphanUsersCheck = await db.execute(`
    SELECT COUNT(*) as count FROM predictions_v2
    WHERE user_id NOT IN (SELECT id FROM players)
  `);
  const orphanUsersCount = Number(orphanUsersCheck.rows[0].count);

  console.log("=== Auditing Predictions V2 ===");
  console.log(`Počet legacy předpovědí v predictions: ${oldPredsCount.rows[0].count}`);
  console.log(`Počet nových předpovědí v predictions_v2: ${newPredsCount.rows[0].count}`);
  console.log(`Počet duplicitních kombinací (lobby, match, user): ${dupCount}`);
  console.log(`Počet odkazů na neexistující zápasy v matches_v2: ${orphanMatchesCount}`);
  console.log(`Počet odkazů na neexistující hráče v players: ${orphanUsersCount}`);
  console.log("===============================");
}

const calculatePoints = (ph: number, pa: number, mh: number, ma: number, sport: 'football' | 'hockey' = 'football'): number => {
  if (ph === mh && pa === ma) return 5;
  if (sport === 'football') {
    const isActualDraw = mh === ma;
    const isPredictedDraw = ph === pa;
    if (isActualDraw) {
      if (isPredictedDraw) return 2; // Correctly predicted draw, not exact
    } else {
      const correctWinner = (ph > pa && mh > ma) || (pa > ph && ma > mh);
      if (correctWinner) {
        if (ph - pa === mh - ma) return 3; // Correct winner + correct goal difference
        return 2; // Correct winner without correct goal difference
      }
    }
  } else {
    // Hockey
    if ((ph > pa && mh > ma) || (pa > ph && ma > mh) || (ph === pa && mh === ma)) return 2;
  }
  return 0;
};

async function startServer() {
  await initDb();

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(cors());

  // --- API Routes ---

  // Auth
  app.post("/api/auth/register", async (req, res) => {
    const { username, password, adminId } = req.body;
    try {
      // Check if requester is admin
      const adminCheck = await db.execute({
        sql: "SELECT role FROM players WHERE id = ?",
        args: [adminId || '']
      });
      
      if (adminCheck.rows[0]?.role !== 'admin') {
        return res.status(403).json({ error: "Registraci může provádět pouze administrátor." });
      }

      const id = "u-" + Math.random().toString(36).substring(2, 9);
      const hash = await bcrypt.hash(password, 10);
      await db.execute({
        sql: "INSERT INTO players (id, username, password_hash) VALUES (?, ?, ?)",
        args: [id, username, hash]
      });
      res.json({ id, username, role: 'player', tournament_winner_id: null });
    } catch (err: any) {
      if (err.message?.includes("UNIQUE")) {
        return res.status(400).json({ error: "Uživatelské jméno již existuje." });
      }
      res.status(500).json({ error: "Chyba při registraci: " + err.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    try {
      const result = await db.execute({
        sql: "SELECT * FROM players WHERE username = ?",
        args: [username]
      });
      const player = result.rows[0];

      if (!player || !(await bcrypt.compare(password, player.password_hash as string))) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      res.json({
        id: player.id,
        username: player.username,
        role: player.role,
        tournament_winner_id: player.tournament_winner_id
      });
    } catch (err: any) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Database error: " + err.message });
    }
  });

  // Teams
  app.get("/api/teams", async (req, res) => {
    const result = await db.execute("SELECT * FROM teams");
    res.json(result.rows);
  });

  // Matches & Predictions
  app.get("/api/matches", async (req, res) => {
    const userId = req.query.userId as string;
    const result = await db.execute(`
      SELECT m.*, 
        h.name as home_name, h.flag_code as home_flag,
        a.name as away_name, a.flag_code as away_flag,
        p.predicted_home_score, p.predicted_away_score,
        (SELECT COUNT(*) FROM predictions WHERE match_id = m.id) as total_predictions
      FROM matches m
      JOIN teams h ON m.home_team_id = h.id
      JOIN teams a ON m.away_team_id = a.id
      LEFT JOIN predictions p ON m.id = p.match_id AND p.player_id = ?
      ORDER BY m.start_time_utc ASC
    `, [userId || '']);
    res.json(result.rows);
  });

  // All predictions for a match (for others to see)
  app.get("/api/matches/:id/predictions", async (req, res) => {
    const matchId = req.params.id;
    const result = await db.execute(`
      SELECT p.*, pl.username, t.flag_code as winner_flag
      FROM predictions p
      JOIN players pl ON p.player_id = pl.id
      LEFT JOIN teams t ON pl.tournament_winner_id = t.id
      WHERE p.match_id = ?
    `, [matchId]);
    res.json(result.rows);
  });

  // Save prediction
  app.post("/api/predictions", async (req, res) => {
    const { userId, matchId, homeScore, awayScore } = req.body;
    console.log("Saving prediction:", { userId, matchId, homeScore, awayScore });
    
    if (!userId) return res.status(401).json({ error: "User ID missing" });

    try {
      // Check lock time
      const matchResult = await db.execute({
        sql: "SELECT start_time_utc FROM matches WHERE id = ?",
        args: [matchId]
      });
      const match = matchResult.rows[0];
      if (!match) {
        console.error("Match not found for ID:", matchId);
        return res.status(404).json({ error: "Match not found" });
      }

      const startTime = new Date(match.start_time_utc as string).getTime();
      const now = Date.now();
      const lockTime = startTime - (5 * 60 * 1000); // 5 minutes before

      if (now > lockTime) {
        return res.status(403).json({ error: "Prediction is locked (5m before start)" });
      }

      if (homeScore === awayScore) {
        return res.status(400).json({ error: "Draws are not allowed in hockey tournament predictor" });
      }

      await db.execute({
        sql: `INSERT OR REPLACE INTO predictions 
              (player_id, match_id, predicted_home_score, predicted_away_score) 
              VALUES (?, ?, ?, ?)`,
        args: [userId, matchId, homeScore, awayScore]
      });

      res.json({ success: true });
    } catch (err: any) {
      console.error("Prediction error:", err);
      res.status(500).json({ error: "Failed to save prediction: " + err.message });
    }
  });

  // Leaderboard
  app.get("/api/leaderboard", async (req, res) => {
    const winnerResult = await db.execute("SELECT id FROM teams WHERE is_final_winner = 1");
    const winnerId = winnerResult.rows[0]?.id;

    const result = await db.execute(`
      SELECT 
        p.id, p.username,
        t.flag_code as winner_flag,
        t.id as tournament_winner_id,
        COALESCE(SUM(pr.points_earned), 0) as prediction_points,
        COUNT(CASE WHEN pr.points_earned = 5 THEN 1 END) as exact_scores,
        COUNT(CASE WHEN pr.points_earned = 2 THEN 1 END) as correct_winners
      FROM players p
      LEFT JOIN teams t ON p.tournament_winner_id = t.id
      LEFT JOIN predictions pr ON p.id = pr.player_id
      GROUP BY p.id
    `);

    const leaderboard = result.rows.map((row: any) => {
      let totalPoints = Number(row.prediction_points);
      if (winnerId && row.tournament_winner_id === winnerId) {
        totalPoints += 10;
      }
      return {
        ...row,
        total_points: totalPoints
      };
    });

    leaderboard.sort((a: any, b: any) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points;
      if (b.exact_scores !== a.exact_scores) return b.exact_scores - a.exact_scores;
      return b.correct_winners - a.correct_winners;
    });

    res.json(leaderboard);
  });

  // Admin: Set Tournament Winner
  app.post("/api/admin/set-tournament-winner", async (req, res) => {
    const { userId, teamId } = req.body;
    const tournamentId = "fifa-world-cup-2026"; // Standard tournament ID for FIFA WC 2026

    if (!userId || !teamId) {
      return res.status(400).json({ error: "Chybějící parametry." });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();

      // 1. Verify admin role in Supabase
      const { data: profile, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

      if (pErr || profile?.role !== 'admin') {
        return res.status(403).json({ error: "Pouze administrátor může vyhlásit celkového vítěze." });
      }

      // 2. Update tournaments table in Supabase
      const { error: tErr } = await supabaseAdmin
        .from("tournaments")
        .update({ actual_tournament_winner_id: teamId })
        .eq("id", tournamentId);

      if (tErr) throw tErr;

      // 3. Score predictions: matching predictions get 10 points, others 0 points in Supabase
      const { data: predictions, error: predsErr } = await supabaseAdmin
        .from("longterm_predictions")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("prediction_type", "tournament_winner");

      if (predsErr) throw predsErr;

      if (predictions && predictions.length > 0) {
        for (const pred of predictions) {
          const points = pred.predicted_participant_id === teamId ? 10 : 0;
          const { error: scoreErr } = await supabaseAdmin
            .from("longterm_predictions")
            .update({ points_earned: points })
            .eq("id", pred.id);

          if (scoreErr) {
            console.error(`Error scoring longterm prediction ${pred.id}:`, scoreErr);
          }
        }
      }

      // Also update local SQLite copy for backward compatibility
      try {
        await db.execute("UPDATE teams SET is_final_winner = 0");
        await db.execute({
          sql: "UPDATE teams SET is_final_winner = 1 WHERE id = ?",
          args: [teamId]
        });
      } catch (sqle) {
        console.warn("Local SQLite sync skipped (safe to ignore):", sqle);
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Set tournament winner admin error:", err);
      res.status(500).json({ error: "Chyba při nastavení vítěze turnaje: " + err.message });
    }
  });

  // Profile (Tournament Winner Pick for legacy SQLite fallback)
  app.post("/api/profile/tournament-winner", async (req, res) => {
    const { userId, teamId } = req.body;
    
    // Check first match time
    const firstMatchResult = await db.execute("SELECT MIN(start_time_utc) as min_time FROM matches");
    const firstMatchTime = new Date(firstMatchResult.rows[0].min_time as string).getTime();
    const now = Date.now();
    const lockTime = firstMatchTime - (4 * 60 * 60 * 1000); // 4 hours before

    if (now > lockTime) {
      return res.status(403).json({ error: "Tournament winner selection is locked" });
    }

    await db.execute({
      sql: "UPDATE players SET tournament_winner_id = ? WHERE id = ?",
      args: [teamId, userId]
    });

    res.json({ success: true });
  });

  // Admin: Update Match Result (Secure Server-Side Supabase implementation to bypass client-side RLS)
  app.post("/api/admin/match-result", async (req, res) => {
    const { userId, matchId, homeScore, awayScore } = req.body;
    
    if (!userId || !matchId) {
      return res.status(400).json({ error: "Chybějící parametry." });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();

      // 1. Check if user is admin in Supabase profiles
      const { data: profile, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

      if (pErr || profile?.role !== 'admin') {
        return res.status(403).json({ error: "Pouze administrátor může vkládat výsledky a spouštět vyhodnocení." });
      }

      // 2. Fetch match from Supabase
      const { data: match, error: mErr } = await supabaseAdmin
        .from("matches")
        .select("tournament_id")
        .eq("id", matchId)
        .single();

      if (mErr || !match) {
        return res.status(404).json({ error: "Zápas nenalezen v Supabase." });
      }

      const sport = match.tournament_id === "ms-hockey-2026" ? "hockey" : "football";

      if (sport === "hockey" && homeScore === awayScore) {
        return res.status(400).json({ error: "V hokeji není remíza povolena. Výsledek po prodloužení nebo nájezdech musí určit vítěze!" });
      }

      // 3. Update match in Supabase
      const { error: matchUpdateErr } = await supabaseAdmin
        .from("matches")
        .update({
          home_score: homeScore,
          away_score: awayScore,
          status: "finished",
          updated_at: new Date().toISOString()
        })
        .eq("id", matchId);

      if (matchUpdateErr) throw matchUpdateErr;

      // 4. Fetch predictions for this match from Supabase
      const { data: predictions, error: predsErr } = await supabaseAdmin
        .from("predictions")
        .select("*")
        .eq("match_id", matchId);

      if (predsErr) throw predsErr;

      if (predictions && predictions.length > 0) {
        for (const pred of predictions) {
          const points = calculatePoints(
            pred.predicted_home_score,
            pred.predicted_away_score,
            homeScore,
            awayScore,
            sport
          );

          const { error: updatePredErr } = await supabaseAdmin
            .from("predictions")
            .update({ points_earned: points })
            .eq("user_id", pred.user_id)
            .eq("lobby_id", pred.lobby_id)
            .eq("match_id", matchId);

          if (updatePredErr) {
            console.error(`Recalculate error for prediction user: ${pred.user_id}`, updatePredErr);
          }
        }
      }

      // Also update local SQLite copy for backward compatibility
      try {
        await db.execute({
          sql: "UPDATE matches SET home_score = ?, away_score = ?, status = 'finished' WHERE id = ?",
          args: [homeScore, awayScore, matchId]
        });
        await db.execute({
          sql: "DELETE FROM predictions WHERE match_id = ?",
          args: [matchId]
        });
        for (const pred of (predictions || [])) {
          const points = calculatePoints(pred.predicted_home_score, pred.predicted_away_score, homeScore, awayScore, sport);
          await db.execute({
            sql: "INSERT OR REPLACE INTO predictions (player_id, match_id, predicted_home_score, predicted_away_score, points_earned) VALUES (?, ?, ?, ?, ?)",
            args: [pred.user_id, matchId, pred.predicted_home_score, pred.predicted_away_score, points]
          });
        }
      } catch (sqle) {
        console.warn("Local SQLite sync skipped or failed (safe to ignore):", sqle);
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Match result admin error:", err);
      res.status(500).json({ error: "Chyba při ukládání výsledků: " + err.message });
    }
  });

  // Owner Update Lobby Name
  app.post("/api/lobby/update-name", async (req, res) => {
    const { userId, lobbyId, newName } = req.body;
    
    if (!userId || !lobbyId || !newName) {
      return res.status(400).json({ error: "Chybějí povinné parametry." });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();

      // Verify that user is owner
      const { data: lobby, error: lobbyErr } = await supabaseAdmin
        .from("lobbies")
        .select("owner_id")
        .eq("id", lobbyId)
        .single();
      
      if (lobbyErr || !lobby) {
         return res.status(404).json({ error: "Lobby nenalezena." });
      }

      if (lobby.owner_id !== userId) {
         // Maybe user is global admin? Check profiles
         const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", userId).single();
         if (profile?.role !== 'admin') {
           return res.status(403).json({ error: "Pouze zakladatel lobby může měnit její název." });
         }
      }

      const { error: updateErr } = await supabaseAdmin
        .from("lobbies")
        .update({ name: newName })
        .eq("id", lobbyId);

      if (updateErr) throw updateErr;

      res.json({ success: true });
    } catch (err: any) {
      console.error("/api/lobby/update-name err:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- Vite Setup ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
