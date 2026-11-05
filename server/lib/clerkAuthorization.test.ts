import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createClerkIdentityVerifier } from "./clerkIdentity.ts";
import {
  clerkAuthorizationErrorResponse,
  createClerkAuthorization,
  createClerkAuthorizationFromEnv,
} from "./clerkAuthorization.ts";

const issuer = "https://authorization-clerk.example";
const party = "http://localhost:3000";
const playerId = "11111111-1111-4111-8111-111111111111";
const keys = await generateKeyPair("RS256");
const jwk = { ...await exportJWK(keys.publicKey), kid: "authorization-test", alg: "RS256", use: "sig" };
const authorization = createClerkAuthorization(createClerkIdentityVerifier({ issuerUrl: issuer, authorizedParties: [party] }, {
  fetch: async () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json" } }),
}));

async function session(claims: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return "Bearer " + await new SignJWT({
    iss: issuer, sub: "user_fixture", sid: "sess_fixture", azp: party, iat: now, exp: now + 300, ...claims,
  }).setProtectedHeader({ alg: "RS256", kid: jwk.kid }).sign(keys.privateKey);
}

function database(options: {
  mapping?: unknown;
  rpcError?: unknown;
  rpcThrows?: boolean;
  role?: string;
  profileError?: unknown;
} = {}) {
  const calls = { rpc: 0, profiles: 0 };
  const client = {
    auth: { getUser: () => assert.fail("Supabase Auth must never be used as a fallback") },
    rpc: async (name: string, args: unknown) => {
      calls.rpc++;
      assert.equal(name, "resolve_clerk_player_identity");
      assert.deepEqual(args, { p_issuer: issuer, p_subject: "user_fixture" });
      if (options.rpcThrows) throw new Error("private database credentials");
      return { data: "mapping" in options ? options.mapping : playerId, error: options.rpcError ?? null };
    },
    from: (table: string) => {
      calls.profiles++;
      assert.equal(table, "profiles");
      return {
        select: (columns: string) => {
          assert.equal(columns, "role");
          return {
            eq: (column: string, value: string) => {
              assert.equal(column, "id");
              assert.equal(value, playerId);
              return { single: async () => ({ data: { role: options.role ?? "player" }, error: options.profileError ?? null }) };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const hasStatus = (status: number) => (error: unknown) => clerkAuthorizationErrorResponse(error)?.statusCode === status;

test("resolves only a verified issuer/subject to an internal UUID without Supabase Auth", async () => {
  const { client, calls } = database();
  assert.equal(await authorization.resolvePlayerId(client, await session()), playerId);
  assert.deepEqual(calls, { rpc: 1, profiles: 0 });
});

test("invalid, expired and foreign credentials never reach the database", async () => {
  const { client, calls } = database({ role: "admin" });
  for (const header of [undefined, "Basic a", "Bearer invalid", await session({ exp: 1 }), await session({ azp: "https://foreign.example" })]) {
    await assert.rejects(authorization.requirePlatformAdmin(client, header), hasStatus(401));
  }
  assert.deepEqual(calls, { rpc: 0, profiles: 0 });
});

test("missing or disabled mapping and non-UUID resolver results fail closed", async () => {
  const header = await session();
  // The protected RPC returns null for both an unknown and a disabled identity/issuer.
  for (const mapping of [null, "user_fixture", "", [playerId], { player_id: playerId }]) {
    const { client, calls } = database({ mapping, role: "admin" });
    await assert.rejects(authorization.requirePlatformAdmin(client, header), hasStatus(401));
    assert.deepEqual(calls, { rpc: 1, profiles: 0 });
  }
});

test("signed admin claims cannot override the authoritative player profile role", async () => {
  const { client, calls } = database({ role: "player" });
  await assert.rejects(authorization.requirePlatformAdmin(client, await session({
    role: "admin", userId: playerId, public_metadata: { role: "admin" },
  })), hasStatus(403));
  assert.deepEqual(calls, { rpc: 1, profiles: 1 });
});

test("an authoritative admin is returned as its mapped UUID", async () => {
  const { client, calls } = database({ role: "admin" });
  assert.equal(await authorization.requirePlatformAdmin(client, await session({ role: "player" })), playerId);
  assert.deepEqual(calls, { rpc: 1, profiles: 1 });
});

test("resolver and profile failures return a generic 503 without internal details", async () => {
  for (const options of [
    { rpcError: { message: "private database credentials" } },
    { rpcThrows: true },
    { profileError: new Error("private database credentials") },
  ]) {
    const { client } = database(options);
    await assert.rejects(authorization.requirePlatformAdmin(client, await session()), error => {
      const response = clerkAuthorizationErrorResponse(error);
      assert.equal(response?.statusCode, 503);
      assert.doesNotMatch(response?.error ?? "", /private|credentials|user_fixture/);
      return true;
    });
  }
});

test("missing or invalid trusted configuration returns a generic 503", () => {
  for (const env of [{}, { CLERK_ISSUER_URL: "http://foreign.example", CLERK_AUTHORIZED_PARTIES: party }]) {
    assert.throws(() => createClerkAuthorizationFromEnv(env), hasStatus(503));
  }
  assert.equal(clerkAuthorizationErrorResponse({ statusCode: 401, message: "untrusted error" }), null);
});
