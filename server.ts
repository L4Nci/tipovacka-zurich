import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbUrl = process.env.TURSO_DATABASE_URL || `file:///${path.join(process.cwd(), "local.db")}`;
const dbAuthToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient({
  url: dbUrl,
  authToken: dbAuthToken,
});

async function initDb() {
  console.log("Initializing Database...");
  console.log("DB URL protocol:", dbUrl.split(':')[0]);

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
    for (const m of matches) {
      await db.execute({
        sql: "INSERT OR IGNORE INTO matches (id, home_team_id, away_team_id, start_time_utc, stage) VALUES (?, ?, ?, ?, ?)",
        args: m
      });
    }
    console.log("Matches seeded.");
  }
}

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
    
    const userResult = await db.execute({
      sql: "SELECT role FROM players WHERE id = ?",
      args: [userId]
    });
    if (userResult.rows[0]?.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can perform this action" });
    }

    await db.execute("UPDATE teams SET is_final_winner = 0");
    await db.execute({
      sql: "UPDATE teams SET is_final_winner = 1 WHERE id = ?",
      args: [teamId]
    });

    res.json({ success: true });
  });

  // Profile (Tournament Winner Pick)
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

  // Admin: Update Match Result
  app.post("/api/admin/match-result", async (req, res) => {
    const { userId, matchId, homeScore, awayScore } = req.body;
    
    // Check if user is admin
    const userResult = await db.execute({
      sql: "SELECT role FROM players WHERE id = ?",
      args: [userId]
    });
    if (userResult.rows[0]?.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can perform this action" });
    }

    await db.execute({
      sql: "UPDATE matches SET home_score = ?, away_score = ?, status = 'finished' WHERE id = ?",
      args: [homeScore, awayScore, matchId]
    });

    // Recalculate points for all predictions of this match
    const preds = await db.execute({
      sql: "SELECT * FROM predictions WHERE match_id = ?",
      args: [matchId]
    });

    for (const p of preds.rows) {
      let points = 0;
      const ph = Number(p.predicted_home_score);
      const pa = Number(p.predicted_away_score);
      const mh = Number(homeScore);
      const ma = Number(awayScore);

      if (ph === mh && pa === ma) {
        points = 5;
      } else if ((ph > pa && mh > ma) || (pa > ph && ma > mh)) {
        points = 2;
      }

      await db.execute({
        sql: "UPDATE predictions SET points_earned = ? WHERE player_id = ? AND match_id = ?",
        args: [points, p.player_id, matchId]
      });
    }

    res.json({ success: true });
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
