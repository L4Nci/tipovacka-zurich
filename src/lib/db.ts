/// <reference types="vite/client" />
import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import { Player, Team, Match, Prediction } from "../types.ts";

const url = import.meta.env.VITE_TURSO_DATABASE_URL;
const authToken = import.meta.env.VITE_TURSO_AUTH_TOKEN;

// Fallback for local development if not set
const db = createClient({
  url: url || "libsql://local.db",
  authToken: authToken,
});

export const fetchAllData = async (userId: string) => {
  const [matchesRes, teamsRes, lbRes] = await Promise.all([
    db.execute({
      sql: `
        SELECT m.*, 
               t1.name as home_name, t1.flag_code as home_flag, 
               t2.name as away_name, t2.flag_code as away_flag,
               p.predicted_home_score, 
               p.predicted_away_score,
               (SELECT COUNT(*) FROM predictions WHERE match_id = m.id) as total_predictions
        FROM matches m
        JOIN teams t1 ON m.home_team_id = t1.id
        JOIN teams t2 ON m.away_team_id = t2.id
        LEFT JOIN predictions p ON m.id = p.match_id AND p.player_id = ?
        ORDER BY m.start_time_utc ASC
      `,
      args: [userId]
    }),
    db.execute("SELECT * FROM teams ORDER BY name ASC"),
    db.execute(`
      SELECT p.id, p.username, p.role, p.tournament_winner_id,
             COALESCE(SUM(
               CASE 
                 WHEN pr.predicted_home_score = m.home_score AND pr.predicted_away_score = m.away_score THEN 5
                 WHEN (pr.predicted_home_score > pr.predicted_away_score AND m.home_score > m.away_score) OR 
                      (pr.predicted_away_score > pr.predicted_home_score AND m.away_score > m.home_score) THEN 2
                 ELSE 0
               END
             ), 0) + 
             CASE WHEN p.tournament_winner_id = (SELECT id FROM teams WHERE is_final_winner = 1 LIMIT 1) THEN 10 ELSE 0 END as total_points
      FROM players p
      LEFT JOIN predictions pr ON p.id = pr.player_id
      LEFT JOIN matches m ON pr.match_id = m.id AND m.status = 'finished'
      GROUP BY p.id
      ORDER BY total_points DESC, p.username ASC
    `)
  ]);

  return {
    matches: matchesRes.rows as unknown as Match[],
    teams: teamsRes.rows as unknown as Team[],
    leaderboard: lbRes.rows as unknown as Player[]
  };
};

export const loginUser = async (username: string, pass: string) => {
  const result = await db.execute({
    sql: "SELECT * FROM players WHERE username = ?",
    args: [username]
  });

  if (result.rows.length === 0) throw new Error("Uživatel nenalezen.");
  const user = result.rows[0] as unknown as any;
  
  const match = await bcrypt.compare(pass, user.password_hash);
  if (!match) throw new Error("Nesprávné heslo.");

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    tournament_winner_id: user.tournament_winner_id
  } as Player;
};

export const registerUser = async (username: string, pass: string, adminId?: string) => {
  if (adminId) {
     const adminCheck = await db.execute({
       sql: "SELECT role FROM players WHERE id = ?",
       args: [adminId]
     });
     if (adminCheck.rows[0]?.role !== 'admin') {
       throw new Error("Pouze administrátor může vytvářet nové hráče.");
     }
  }

  const id = "u-" + Math.random().toString(36).substring(2, 9);
  const hash = await bcrypt.hash(pass, 10);
  
  await db.execute({
    sql: "INSERT INTO players (id, username, password_hash, role) VALUES (?, ?, ?, 'player')",
    args: [id, username, hash]
  });

  return { id, username, role: 'player', tournament_winner_id: null } as Player;
};

export const savePrediction = async (userId: string, matchId: string, home: number, away: number) => {
  const matchRes = await db.execute({
    sql: "SELECT start_time_utc FROM matches WHERE id = ?",
    args: [matchId]
  });
  
  if (matchRes.rows.length === 0) throw new Error("Zápas nenalezen.");
  if (home === away) throw new Error("Remíza není povolena. Vyberte vítěze!");
  const startTime = new Date(matchRes.rows[0].start_time_utc as string).getTime();
  if (Date.now() > startTime - (5 * 60 * 1000)) throw new Error("Zápas je již uzamčen.");

  await db.execute({
    sql: "INSERT OR REPLACE INTO predictions (player_id, match_id, predicted_home_score, predicted_away_score) VALUES (?, ?, ?, ?)",
    args: [userId, matchId, home, away]
  });
};

export const fetchMatchPredictions = async (matchId: string) => {
  const res = await db.execute({
    sql: `
      SELECT p.*, pl.username, t.flag_code as winner_flag
      FROM predictions p
      JOIN players pl ON p.player_id = pl.id
      LEFT JOIN teams t ON pl.tournament_winner_id = t.id
      WHERE p.match_id = ?
    `,
    args: [matchId]
  });
  return res.rows as unknown as Prediction[];
};

export const updateMatchResult = async (userId: string, matchId: string, home: number, away: number) => {
  const adminCheck = await db.execute({
    sql: "SELECT role FROM players WHERE id = ?",
    args: [userId]
  });
  if (adminCheck.rows[0]?.role !== 'admin') throw new Error("Access denied");

  await db.execute({
    sql: "UPDATE matches SET home_score = ?, away_score = ?, status = 'finished' WHERE id = ?",
    args: [home, away, matchId]
  });
};

export const setTournamentWinner = async (userId: string, teamId: string) => {
  const adminCheck = await db.execute({
    sql: "SELECT role FROM players WHERE id = ?",
    args: [userId]
  });
  if (adminCheck.rows[0]?.role !== 'admin') throw new Error("Access denied");

  await db.execute("UPDATE teams SET is_final_winner = 0");
  await db.execute({
    sql: "UPDATE teams SET is_final_winner = 1 WHERE id = ?",
    args: [teamId]
  });
};

export const pickTournamentWinner = async (userId: string, teamId: string) => {
  const firstMatch = await db.execute("SELECT MIN(start_time_utc) as start FROM matches");
  const firstTime = new Date(firstMatch.rows[0]?.start as string).getTime();
  if (Date.now() > firstTime - (4 * 60 * 60 * 1000)) throw new Error("Výběr vítěze je již uzamčen.");

  await db.execute({
    sql: "UPDATE players SET tournament_winner_id = ? WHERE id = ?",
    args: [teamId, userId]
  });
};
