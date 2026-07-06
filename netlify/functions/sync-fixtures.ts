import { getSupabaseAdmin } from "../../server/lib/supabaseAdmin.ts";
import { executeTheSportsDbFixtureWriteSync } from "../../server/lib/fixtureSync.ts";

type NetlifyEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
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

const authorize = (event: NetlifyEvent, body: Record<string, any>) => {
  const authHeader = headerValue(event.headers, "authorization");
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  const providedSecret = bearerToken || headerValue(event.headers, "x-result-sync-secret") || body.secret;
  const expectedSecret = process.env.RESULT_SYNC_SECRET;

  if (!expectedSecret) {
    return { ok: false, statusCode: 503, body: { error: "RESULT_SYNC_SECRET is not configured." } };
  }

  if (!providedSecret || providedSecret !== expectedSecret) {
    return { ok: false, statusCode: 401, body: { error: "Unauthorized fixture sync request." } };
  }

  return { ok: true };
};

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const body = parseBody(event);
  const auth = authorize(event, body);
  if (!auth.ok) return jsonResponse(auth.statusCode!, auth.body!);

  try {
    const provider = String(event.queryStringParameters?.provider || body.provider || "");
    if (provider !== "thesportsdb") {
      return jsonResponse(400, { error: `Unsupported fixture write provider: ${provider || "missing"}` });
    }

    const result = await executeTheSportsDbFixtureWriteSync(getSupabaseAdmin(), {
      provider,
      tournamentId: body.tournamentId ? String(body.tournamentId) : null
    });

    return jsonResponse(result.statusCode, result.body);
  } catch (err: any) {
    console.error("TheSportsDB fixture sync function error:", err);
    return jsonResponse(500, {
      error: "Chyba pri TheSportsDB fixture syncu: " + err.message,
      mode: "write",
      provider: "thesportsdb",
      wrote_to_db: false
    });
  }
};
