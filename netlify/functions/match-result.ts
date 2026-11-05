import { getSupabaseAdmin } from "../../server/lib/supabaseAdmin.ts";
import { applyMatchResult } from "../../server/lib/resultSync.ts";
import { authorizeClerkPlatformAdmin, clerkAuthorizationErrorResponse } from "../../server/lib/clerkAuthorization.ts";
import { readBearerToken } from "../../server/lib/clerkIdentity.ts";

type NetlifyEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

const jsonResponse = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    "content-type": "application/json"
  },
  body: JSON.stringify(body)
});

const parseBody = (event: NetlifyEvent) => {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    return {};
  }
};

const headerValue = (headers: NetlifyEvent["headers"], name: string) => {
  const lowerName = name.toLowerCase();
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === lowerName);
  return entry?.[1] || "";
};

const isValidScore = (score: unknown): score is number =>
  Number.isInteger(score) && Number(score) >= 0;

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const body = parseBody(event);
  const matchId = typeof body.matchId === "string" ? body.matchId.trim() : "";
  const homeScore = body.homeScore;
  const awayScore = body.awayScore;

  if (!matchId) {
    return jsonResponse(400, { error: "Chybějící parametry." });
  }

  if (!isValidScore(homeScore) || !isValidScore(awayScore)) {
    return jsonResponse(400, { error: "Skóre musí být nezáporné celé číslo." });
  }

  if (!readBearerToken(headerValue(event.headers, "authorization"))) {
    return jsonResponse(401, { error: "Chybí přihlášení administrátora." });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const adminUserId = await authorizeClerkPlatformAdmin(
      supabaseAdmin,
      headerValue(event.headers, "authorization"),
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

    return jsonResponse(result.statusCode, result.body);
  } catch (err: any) {
    const authError = clerkAuthorizationErrorResponse(err);
    if (authError) return jsonResponse(authError.statusCode, { error: authError.error });
    console.error("Match result function error.");
    return jsonResponse(500, { error: "Chyba při ukládání výsledků." });
  }
};
