import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cookieParser from "cookie-parser";
import cors from "cors";
import "dotenv/config";
import { getSupabaseAdmin } from "./server/lib/supabaseAdmin.ts";
import { calculatePoints } from "./src/lib/scoring.ts";

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

    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) {
      return res.status(400).json({ error: "Skóre musí být nezáporné celé číslo." });
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

      const { data: predictions, error: predsErr } = await supabaseAdmin
        .from("predictions")
        .select("*")
        .eq("match_id", matchId);

      if (predsErr) throw predsErr;

      const previousPoints = new Map<string, number>();
      for (const pred of predictions || []) {
        previousPoints.set(`${pred.user_id}:${pred.lobby_id}`, pred.points_earned || 0);
      }

      const rollbackPredictionPoints = async () => {
        for (const pred of predictions || []) {
          const previous = previousPoints.get(`${pred.user_id}:${pred.lobby_id}`) || 0;
          const { error: rollbackErr } = await supabaseAdmin
            .from("predictions")
            .update({ points_earned: previous })
            .eq("user_id", pred.user_id)
            .eq("lobby_id", pred.lobby_id)
            .eq("match_id", matchId);

          if (rollbackErr) {
            console.error(`Rollback error for prediction user: ${pred.user_id}`, rollbackErr);
          }
        }
      };

      const recalculationFailures: Array<{ user_id: string; lobby_id: string; message: string }> = [];
      let updatedPredictionsCount = 0;

      for (const pred of predictions || []) {
        const points = calculatePoints(
          pred.predicted_home_score,
          pred.predicted_away_score,
          homeScore,
          awayScore,
          sport
        );

        const { data: updatedPredictionRows, error: updatePredErr } = await supabaseAdmin
          .from("predictions")
          .update({ points_earned: points })
          .eq("user_id", pred.user_id)
          .eq("lobby_id", pred.lobby_id)
          .eq("match_id", matchId)
          .select("user_id,lobby_id,match_id,points_earned");

        if (updatePredErr || !updatedPredictionRows || updatedPredictionRows.length !== 1) {
          recalculationFailures.push({
            user_id: pred.user_id,
            lobby_id: pred.lobby_id,
            message: updatePredErr?.message || `Expected 1 updated row, got ${updatedPredictionRows?.length ?? 0}`
          });
        } else {
          updatedPredictionsCount += 1;
        }
      }

      if (recalculationFailures.length > 0) {
        console.error("Prediction recalculation failures:", recalculationFailures);
        await rollbackPredictionPoints();
        return res.status(500).json({
          error: "Nepodařilo se přepočítat všechny tipy, výsledek zápasu nebyl uložen.",
          match_id: matchId,
          updated_predictions_count: updatedPredictionsCount,
          expected_predictions_count: predictions?.length || 0,
          result: {
            home_score: homeScore,
            away_score: awayScore
          },
          status: "not_saved",
          failures: recalculationFailures
        });
      }

      const { data: verifiedPredictions, error: verifyErr } = await supabaseAdmin
        .from("predictions")
        .select("user_id,lobby_id,predicted_home_score,predicted_away_score,points_earned")
        .eq("match_id", matchId);

      if (verifyErr) throw verifyErr;

      const stalePredictions = (verifiedPredictions || []).filter(pred => {
        const expectedPoints = calculatePoints(
          pred.predicted_home_score,
          pred.predicted_away_score,
          homeScore,
          awayScore,
          sport
        );
        return pred.points_earned !== expectedPoints;
      });

      if (stalePredictions.length > 0) {
        console.error("Stale points detected after recalculation:", stalePredictions);
        await rollbackPredictionPoints();
        return res.status(500).json({
          error: "Po přepočtu zůstaly nesedící body u některých tipů, výsledek zápasu nebyl uložen.",
          match_id: matchId,
          updated_predictions_count: updatedPredictionsCount,
          expected_predictions_count: predictions?.length || 0,
          result: {
            home_score: homeScore,
            away_score: awayScore
          },
          status: "not_saved",
          stale_predictions_count: stalePredictions.length,
          stale_predictions: stalePredictions.map(pred => ({
            user_id: pred.user_id,
            lobby_id: pred.lobby_id,
            points_earned: pred.points_earned,
            expected_points: calculatePoints(
              pred.predicted_home_score,
              pred.predicted_away_score,
              homeScore,
              awayScore,
              sport
            )
          }))
        });
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

      if (matchUpdateErr) {
        await rollbackPredictionPoints();
        throw matchUpdateErr;
      }

      res.json({
        success: true,
        match_id: matchId,
        updated_predictions_count: updatedPredictionsCount,
        expected_predictions_count: predictions?.length || 0,
        result: {
          home_score: homeScore,
          away_score: awayScore
        },
        status: "finished"
      });
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
