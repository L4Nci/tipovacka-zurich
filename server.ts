import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cookieParser from "cookie-parser";
import cors from "cors";
import "dotenv/config";
import { registerBillingTestRoutes, registerBillingLiveRoutes } from "./server/lib/billingTestRoutes.ts";
import { handleFootballDataSyncRequest } from "./server/lib/footballDataSync.ts";
import { getSupabaseAdmin } from "./server/lib/supabaseAdmin.ts";
import {
  applyMatchResult,
  buildTheSportsDbDryRunResponse,
  executeTheSportsDbWriteSync
} from "./server/lib/resultSync.ts";
import {
  buildTheSportsDbFixtureDryRunResponse,
  executeTheSportsDbFixtureWriteSync
} from "./server/lib/fixtureSync.ts";
import {
  executeTournamentWinnerConfirmation,
  tournamentWinnerErrorResponse
} from "./server/lib/tournamentWinner.ts";
import { isAuthoritativePlatformAdmin } from "./server/lib/platformAuthorization.ts";
import { readBearerToken } from "./server/lib/clerkIdentity.ts";
import {
  authorizeClerkPlatformAdmin,
  clerkAuthorizationErrorResponse,
  resolveClerkPlayerId
} from "./server/lib/clerkAuthorization.ts";

type SyncAuthResult =
  | { ok: true }
  | { ok: false; statusCode: number; body: Record<string, unknown> };

const bearerTokenFromHeader = (authorizationHeader?: string | null) => {
  const header = authorizationHeader || "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;
};

const authorizeSyncRequest = (req: express.Request, label: string): SyncAuthResult => {
  const bearerToken = bearerTokenFromHeader(req.header("authorization"));
  const providedSecret = bearerToken || req.header("x-result-sync-secret") || req.body?.secret;
  const expectedSecret = process.env.RESULT_SYNC_SECRET;

  if (!expectedSecret) {
    return { ok: false, statusCode: 503, body: { error: "RESULT_SYNC_SECRET is not configured." } };
  }

  if (!providedSecret || providedSecret !== expectedSecret) {
    return { ok: false, statusCode: 401, body: { error: `Unauthorized ${label} request.` } };
  }

  return { ok: true };
};

const isValidScore = (score: unknown): score is number =>
  Number.isInteger(score) && Number(score) >= 0;

async function startServer() {
  const app = express();
  registerBillingTestRoutes(app);
  registerBillingLiveRoutes(app);
  app.use(express.json());
  app.use(cookieParser());
  app.use(cors());

  app.all("/api/admin/sync-football-data", async (req, res) => {
    const result = await handleFootballDataSyncRequest({
      httpMethod: req.method, headers: { authorization: req.header("authorization") },
      body: JSON.stringify(req.body || {}),
    });
    res.set(result.headers).status(result.statusCode).send(result.body);
  });

  app.post("/api/admin/sync-results-dry-run", async (req, res) => {
    const auth = authorizeSyncRequest(req, "dry-run");
    if (auth.ok === false) return res.status(auth.statusCode).json(auth.body);

    try {
      const provider = String(req.query.provider || req.body?.provider || "");
      if (provider !== "thesportsdb") {
        return res.status(400).json({ error: `Unsupported dry-run provider: ${provider || "missing"}` });
      }

      const result = await buildTheSportsDbDryRunResponse(getSupabaseAdmin(), {
        provider,
        from: req.body?.from ? String(req.body.from) : null,
        to: req.body?.to ? String(req.body.to) : null,
        tournamentId: req.body?.tournamentId ? String(req.body.tournamentId) : null
      });

      return res.status(result.statusCode).json(result.body);
    } catch (err: any) {
      console.error("TheSportsDB dry-run error:", err);
      return res.status(500).json({
        error: "Chyba při TheSportsDB dry-runu: " + err.message,
        dry_run: true,
        wrote_to_db: false
      });
    }
  });

  app.post("/api/admin/sync-results", async (req, res) => {
    const auth = authorizeSyncRequest(req, "result sync");
    if (auth.ok === false) return res.status(auth.statusCode).json(auth.body);

    try {
      const provider = String(req.query.provider || req.body?.provider || "");
      if (provider !== "thesportsdb") {
        return res.status(400).json({ error: `Unsupported write provider: ${provider || "missing"}` });
      }

      const result = await executeTheSportsDbWriteSync(getSupabaseAdmin(), {
        provider,
        from: req.body?.from ? String(req.body.from) : null,
        to: req.body?.to ? String(req.body.to) : null,
        tournamentId: req.body?.tournamentId ? String(req.body.tournamentId) : null
      });

      return res.status(result.statusCode).json(result.body);
    } catch (err: any) {
      console.error("TheSportsDB result sync error:", err);
      return res.status(500).json({
        error: "Chyba při TheSportsDB result syncu: " + err.message,
        mode: "write",
        provider: "thesportsdb",
        wrote_to_db: false
      });
    }
  });

  app.post("/api/admin/sync-fixtures-dry-run", async (req, res) => {
    const auth = authorizeSyncRequest(req, "fixture dry-run");
    if (auth.ok === false) return res.status(auth.statusCode).json(auth.body);

    try {
      const provider = String(req.query.provider || req.body?.provider || "");
      if (provider !== "thesportsdb") {
        return res.status(400).json({ error: `Unsupported fixture dry-run provider: ${provider || "missing"}` });
      }

      const result = await buildTheSportsDbFixtureDryRunResponse(getSupabaseAdmin(), {
        provider,
        tournamentId: req.body?.tournamentId ? String(req.body.tournamentId) : null
      });

      return res.status(result.statusCode).json(result.body);
    } catch (err: any) {
      console.error("TheSportsDB fixture dry-run error:", err);
      return res.status(500).json({
        error: "Chyba při TheSportsDB fixture dry-runu: " + err.message,
        mode: "dry_run",
        provider: "thesportsdb",
        dry_run: true,
        wrote_to_db: false
      });
    }
  });

  app.post("/api/admin/sync-fixtures", async (req, res) => {
    const auth = authorizeSyncRequest(req, "fixture sync");
    if (auth.ok === false) return res.status(auth.statusCode).json(auth.body);

    try {
      const provider = String(req.query.provider || req.body?.provider || "");
      if (provider !== "thesportsdb") {
        return res.status(400).json({ error: `Unsupported fixture write provider: ${provider || "missing"}` });
      }

      const result = await executeTheSportsDbFixtureWriteSync(getSupabaseAdmin(), {
        provider,
        tournamentId: req.body?.tournamentId ? String(req.body.tournamentId) : null
      });

      return res.status(result.statusCode).json(result.body);
    } catch (err: any) {
      console.error("TheSportsDB fixture sync error:", err);
      return res.status(500).json({
        error: "Chyba při TheSportsDB fixture syncu: " + err.message,
        mode: "write",
        provider: "thesportsdb",
        wrote_to_db: false
      });
    }
  });

  app.post("/api/admin/set-tournament-winner", async (req, res) => {
    try {
      const result = await executeTournamentWinnerConfirmation(getSupabaseAdmin(), {
        teamId: req.body.teamId,
        tournamentId: req.body.tournamentId,
        confirm: req.body.confirm === true,
        previewOnly: req.body.previewOnly === true,
        authorizationHeader: req.headers.authorization
      });

      return res.status(result.statusCode).json(result.body);
    } catch (err: any) {
      const result = tournamentWinnerErrorResponse(err);
      if (result.statusCode >= 500) {
        console.error("Set tournament winner admin error:", err);
      }
      return res.status(result.statusCode).json(result.body);
    }
  });

  app.post("/api/admin/match-result", async (req, res) => {
    const matchId = typeof req.body?.matchId === "string" ? req.body.matchId.trim() : "";
    const homeScore = req.body?.homeScore;
    const awayScore = req.body?.awayScore;

    if (!matchId) {
      return res.status(400).json({ error: "Chybějící parametry." });
    }

    if (!isValidScore(homeScore) || !isValidScore(awayScore)) {
      return res.status(400).json({ error: "Skóre musí být nezáporné celé číslo." });
    }

    if (!readBearerToken(req.headers.authorization)) {
      return res.status(401).json({ error: "Chybí přihlášení administrátora." });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();
      const adminUserId = await authorizeClerkPlatformAdmin(
        supabaseAdmin,
        req.headers.authorization,
        "Pouze administrátor může vkládat výsledky a spouštět vyhodnocení.",
      );

      const result = await applyMatchResult({
        supabaseAdmin,
        matchId,
        homeScore,
        awayScore,
        source: "manual-admin",
        actor: adminUserId
      });

      return res.status(result.statusCode).json(result.body);
    } catch (err: any) {
      const authError = clerkAuthorizationErrorResponse(err);
      if (authError) return res.status(authError.statusCode).json({ error: authError.error });
      console.error("Match result admin error.");
      return res.status(500).json({ error: "Chyba při ukládání výsledků." });
    }
  });

  app.post("/api/lobby/update-name", async (req, res) => {
    const { lobbyId, newName, shortDescription, longDescription } = req.body;

    if (!lobbyId || !newName) {
      return res.status(400).json({ error: "Chybějí povinné parametry." });
    }

    if (!readBearerToken(req.headers.authorization)) {
      return res.status(401).json({ error: "Chybí přihlášení uživatele." });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();
      const userId = await resolveClerkPlayerId(supabaseAdmin, req.headers.authorization);

      const { data: lobby, error: lobbyErr } = await supabaseAdmin
        .from("lobbies")
        .select("owner_id")
        .eq("id", lobbyId)
        .single();

      if (lobbyErr || !lobby) {
        return res.status(404).json({ error: "Lobby nenalezena." });
      }

      if (lobby.owner_id !== userId) {
        if (!await isAuthoritativePlatformAdmin(supabaseAdmin, userId)) {
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

      return res.json({ success: true });
    } catch (err: any) {
      const authError = clerkAuthorizationErrorResponse(err);
      if (authError) return res.status(authError.statusCode).json({ error: authError.error });
      console.error("/api/lobby/update-name error.");
      return res.status(500).json({ error: "Chyba při úpravě lobby." });
    }
  });

  app.use("/api", (_req, res) => {
    return res.status(404).json({ error: "API endpoint not found." });
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
