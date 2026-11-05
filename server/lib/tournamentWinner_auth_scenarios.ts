import assert from "node:assert/strict";
import { mock } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { authorizeTournamentWinnerAdmin, tournamentWinnerErrorResponse } from "./tournamentWinner.ts";

const issuer = "https://tournament-clerk.example";
const party = "http://localhost:3000";
const playerId = "22222222-2222-4222-8222-222222222222";
const keys = await generateKeyPair("RS256");
const jwk = { ...await exportJWK(keys.publicKey), kid: "tournament-test", alg: "RS256", use: "sig" };

// Only synthetic configuration is used; this standalone runner never loads an env file.
process.env.CLERK_ISSUER_URL = issuer;
process.env.CLERK_AUTHORIZED_PARTIES = party;
mock.method(globalThis, "fetch", async (url: string) => {
  assert.equal(url, `${issuer}/.well-known/jwks.json`);
  return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json" } });
});

const now = Math.floor(Date.now() / 1000);
const token = await new SignJWT({
  iss: issuer, sub: "user_tournament", sid: "sess_tournament", azp: party, iat: now, exp: now + 300,
  role: "admin", userId: "client-supplied-id",
}).setProtectedHeader({ alg: "RS256", kid: jwk.kid }).sign(keys.privateKey);
const header = `Bearer ${token}`;

const mockSupabase = ({
  mapping = playerId,
  profileRole = "admin",
  profileError = null
}: {
  mapping?: string | null;
  profileRole?: string;
  profileError?: Error | null;
} = {}) => ({
  auth: { getUser: () => assert.fail("Supabase Auth fallback is forbidden") },
  rpc: async (name: string, args: unknown) => {
    assert.equal(name, "resolve_clerk_player_identity");
    assert.deepEqual(args, { p_issuer: issuer, p_subject: "user_tournament" });
    return { data: mapping, error: null };
  },
  from: (table: string) => {
    assert.equal(table, "profiles");
    return {
      select: (columns: string) => {
        assert.equal(columns, "role");
        return {
          eq: (column: string, value: string) => {
            assert.equal(column, "id");
            assert.equal(value, playerId);
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

const hasStatus = (status: number) => (error: any) => tournamentWinnerErrorResponse(error).statusCode === status;
await assert.rejects(authorizeTournamentWinnerAdmin(mockSupabase(), null), hasStatus(401));
await assert.rejects(authorizeTournamentWinnerAdmin(mockSupabase(), "Bearer invalid-token"), hasStatus(401));
await assert.rejects(authorizeTournamentWinnerAdmin(mockSupabase({ mapping: null }), header), hasStatus(401));
await assert.rejects(authorizeTournamentWinnerAdmin(mockSupabase({ profileRole: "player" }), header), error => {
  const response = tournamentWinnerErrorResponse(error);
  return response.statusCode === 403 && response.body.error === "Pouze administrátor může vyhlásit celkového vítěze.";
});
await assert.rejects(authorizeTournamentWinnerAdmin(mockSupabase({ profileError: new Error("private detail") }), header), error => {
  const response = tournamentWinnerErrorResponse(error);
  assert.equal(response.statusCode, 503);
  assert.doesNotMatch(response.body.error, /private detail/);
  return true;
});
assert.equal(await authorizeTournamentWinnerAdmin(mockSupabase(), header), playerId);
assert.equal(tournamentWinnerErrorResponse(new Error("private database detail")).statusCode, 500);
assert.doesNotMatch(tournamentWinnerErrorResponse(new Error("private database detail")).body.error, /private database detail/);

mock.restoreAll();
console.log("Tournament winner Clerk authorization scenarios passed.");
