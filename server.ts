import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cookieParser from "cookie-parser";
import cors from "cors";
import "dotenv/config";
import { getSupabaseAdmin } from "./server/lib/supabaseAdmin.ts";

const calculatePoints = (ph: number, pa: number, mh: number, ma: number, sport: 'football' | 'hockey' = 'football'): number => {
  if (ph === mh && pa === ma) return 5;
  if (sport === 'football') {
    const isActualDraw = mh === ma;
    const isPredictedDraw = ph === pa;
    if (isActualDraw) {
      if (isPredictedDraw) return 2;
    } else {
      const correctWinner = (ph > pa && mh > ma) || (pa > ph && ma > mh);
      if (correctWinner) {
        if (ph - pa === mh - ma) return 3;
        return 2;
      }
    }
  } else {
    if ((ph > pa && mh > ma) || (pa > ph && ma > mh) || (ph === pa && mh === ma)) return 2;
  }
  return 0;
};

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(cors());

  app.post("/api/admin/set-tournament-winner", async (req, res) => {
    const { userId, teamId, tournamentId = "fifa-world-cup-2026" } = req.body;

    if (!userId || !teamId) {
      return res.status(400).json({ error: "Chybějící parametry." });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();

      const { data: profile, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

      if (pErr || profile?.role !== 'admin') {
        return res.status(403).json({ error: "Pouze administrátor může vyhlásit celkového vítěze." });
      }

      const { error: tErr } = await supabaseAdmin
        .from("tournaments")
        .update({ actual_tournament_winner_id: teamId })
        .eq("id", tournamentId);

      if (tErr) throw tErr;

      const { data: predictions, error: predsErr } = await supabaseAdmin
        .from("longterm_predictions")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("prediction_type", "tournament_winner");

      if (predsErr) throw predsErr;

      for (const pred of predictions || []) {
        const points = pred.predicted_participant_id === teamId ? 10 : 0;
        const { error: scoreErr } = await supabaseAdmin
          .from("longterm_predictions")
          .update({ points_earned: points })
          .eq("id", pred.id);

        if (scoreErr) {
          console.error(`Error scoring longterm prediction ${pred.id}:`, scoreErr);
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Set tournament winner admin error:", err);
      res.status(500).json({ error: "Chyba při nastavení vítěze turnaje: " + err.message });
    }
  });

  app.post("/api/admin/match-result", async (req, res) => {
    const { userId, matchId, homeScore, awayScore } = req.body;
    
    if (!userId || !matchId) {
      return res.status(400).json({ error: "Chybějící parametry." });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();

      const { data: profile, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

      if (pErr || profile?.role !== 'admin') {
        return res.status(403).json({ error: "Pouze administrátor může vkládat výsledky a spouštět vyhodnocení." });
      }

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

      const { data: predictions, error: predsErr } = await supabaseAdmin
        .from("predictions")
        .select("*")
        .eq("match_id", matchId);

      if (predsErr) throw predsErr;

      for (const pred of predictions || []) {
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

      res.json({ success: true });
    } catch (err: any) {
      console.error("Match result admin error:", err);
      res.status(500).json({ error: "Chyba při ukládání výsledků: " + err.message });
    }
  });

  app.post("/api/lobby/update-name", async (req, res) => {
    const { userId, lobbyId, newName, shortDescription, longDescription } = req.body;
    
    if (!userId || !lobbyId || !newName) {
      return res.status(400).json({ error: "Chybějí povinné parametry." });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();

      const { data: lobby, error: lobbyErr } = await supabaseAdmin
        .from("lobbies")
        .select("owner_id")
        .eq("id", lobbyId)
        .single();
      
      if (lobbyErr || !lobby) {
        return res.status(404).json({ error: "Lobby nenalezena." });
      }

      if (lobby.owner_id !== userId) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .single();

        if (profile?.role !== 'admin') {
          return res.status(403).json({ error: "Pouze zakladatel lobby může měnit její název." });
        }
      }

      const updatePayload: Record<string, string | null> = {
        name: String(newName).trim()
      };

      if ("shortDescription" in req.body) {
        updatePayload.short_description = String(shortDescription || "").trim() || null;
      }
      if ("longDescription" in req.body) {
        updatePayload.long_description = String(longDescription || "").trim() || null;
      }

      const { error: updateErr } = await supabaseAdmin
        .from("lobbies")
        .update(updatePayload)
        .eq("id", lobbyId);

      if (updateErr) throw updateErr;

      res.json({ success: true });
    } catch (err: any) {
      console.error("/api/lobby/update-name err:", err);
      res.status(500).json({ error: err.message });
    }
  });

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

  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
