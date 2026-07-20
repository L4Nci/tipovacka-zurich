import { getSupabaseAdmin } from "../../server/lib/supabaseAdmin.ts";
import {
  executeTournamentWinnerConfirmation,
  tournamentWinnerErrorResponse
} from "../../server/lib/tournamentWinner.ts";

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

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const body = parseBody(event);

  try {
    const result = await executeTournamentWinnerConfirmation(getSupabaseAdmin(), {
      userId: body.userId ? String(body.userId) : null,
      teamId: body.teamId ? String(body.teamId) : null,
      tournamentId: body.tournamentId ? String(body.tournamentId) : null,
      confirm: body.confirm === true,
      previewOnly: body.previewOnly === true,
      authorizationHeader: headerValue(event.headers, "authorization")
    });

    return jsonResponse(result.statusCode, result.body);
  } catch (err: any) {
    console.error("Set tournament winner function error:", err);
    const result = tournamentWinnerErrorResponse(err);
    return jsonResponse(result.statusCode, result.body);
  }
};
