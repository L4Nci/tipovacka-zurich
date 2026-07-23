import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorizeTournamentWinnerAdmin } from "./tournamentWinner.ts";

const mockSupabase = ({
  authUserId,
  authError = null,
  profileRole = "admin",
  profileError = null
}: {
  authUserId?: string;
  authError?: Error | null;
  profileRole?: string;
  profileError?: Error | null;
}) => ({
  auth: {
    getUser: async () => ({
      data: { user: authUserId ? { id: authUserId } : null },
      error: authError
    })
  },
  from: (table: string) => {
    assert.equal(table, "profiles");
    return {
      select: (columns: string) => {
        assert.equal(columns, "role");
        return {
          eq: (column: string, value: string) => {
            assert.equal(column, "id");
            assert.equal(value, authUserId);
            return {
              single: async () => ({
                data: profileError ? null : { role: profileRole },
                error: profileError
              })
            };
          }
        };
      }
    };
  }
}) as unknown as SupabaseClient;

await assert.rejects(
  authorizeTournamentWinnerAdmin(mockSupabase({}), null),
  (error: any) => error?.statusCode === 401 && error?.message === "Chybí přihlášení administrátora."
);

await assert.rejects(
  authorizeTournamentWinnerAdmin(
    mockSupabase({ authError: new Error("invalid token") }),
    "Bearer invalid-token"
  ),
  (error: any) => error?.statusCode === 401 && error?.message === "Neplatné přihlášení administrátora."
);

await assert.rejects(
  authorizeTournamentWinnerAdmin(
    mockSupabase({ authUserId: "player-id", profileRole: "player" }),
    "Bearer valid-player-token"
  ),
  (error: any) => error?.statusCode === 403 && error?.message === "Pouze administrátor může vyhlásit celkového vítěze."
);

assert.equal(
  await authorizeTournamentWinnerAdmin(
    mockSupabase({ authUserId: "admin-id", profileRole: "admin" }),
    "Bearer valid-admin-token"
  ),
  "admin-id"
);

console.log("Tournament winner authorization scenarios passed.");
