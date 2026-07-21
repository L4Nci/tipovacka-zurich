import { getSupabaseAdmin } from "../../server/lib/supabaseAdmin.ts";
import { applyMatchResult } from "../../server/lib/resultSync.ts";

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

const bearerTokenFromHeader = (headers: NetlifyEvent["headers"]) => {
  const authHeader = headerValue(headers, "authorization");
  return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
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

  const bearerToken = bearerTokenFromHeader(event.headers);
  if (!bearerToken) {
    return jsonResponse(401, { error: "Chybí přihlášení administrátora." });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(bearerToken);

    if (authError || !authData.user?.id) {
      return jsonResponse(401, { error: "Neplatné přihlášení administrátora." });
    }

    const adminUserId = authData.user.id;
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", adminUserId)
      .single();

    if (profileError || profile?.role !== "admin") {
      return jsonResponse(403, { error: "Pouze administrátor může vkládat výsledky a spouštět vyhodnocení." });
    }

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
    console.error("Match result function error:", err);
    return jsonResponse(500, { error: "Chyba při ukládání výsledků: " + err.message });
  }
};
