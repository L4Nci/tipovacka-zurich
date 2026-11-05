import assert from "node:assert/strict";
import test from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  ClerkAuthenticationError,
  createClerkIdentityVerifier,
  createClerkIdentityVerifierFromEnv,
  readBearerToken,
} from "./clerkIdentity.ts";

const issuer = "https://test-clerk.example";
const party = "http://localhost:3000";
const keys = await generateKeyPair("RS256");
const jwk = { ...await exportJWK(keys.publicKey), kid: "test-key", alg: "RS256", use: "sig" };
const fetchedUrls: string[] = [];
const verify = createClerkIdentityVerifier({ issuerUrl: issuer, authorizedParties: [party] }, {
  fetch: async url => {
    fetchedUrls.push(url);
    return new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { "content-type": "application/json" } });
  },
});

async function token(overrides: Record<string, unknown> = {}, signingKey = keys.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ iss: issuer, sub: "user_example", sid: "sess_example", azp: party, iat: now, exp: now + 300, ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" }).sign(signingKey);
}

test("accepts a signed session and returns only verified identity fields", async () => {
  assert.deepEqual(await verify(await token()), { issuer, subject: "user_example", sessionId: "sess_example" });
  assert.deepEqual(fetchedUrls, [`${issuer}/.well-known/jwks.json`]);
});

test("rejects a different issuer and never fetches keys from token-controlled URLs", async () => {
  await assert.rejects(verify(await token({ iss: "https://attacker.example" })), ClerkAuthenticationError);
  assert.equal(fetchedUrls.every(url => url === `${issuer}/.well-known/jwks.json`), true);
});

test("rejects expired, future and foreign-origin sessions", async () => {
  const now = Math.floor(Date.now() / 1000);
  for (const claims of [{ exp: now - 60 }, { nbf: now + 60 }, { azp: "https://foreign.example" }]) {
    await assert.rejects(verify(await token(claims)), ClerkAuthenticationError);
  }
});

test("rejects missing session, missing expiry, pending session and invalid subject", async () => {
  for (const claims of [{ sid: undefined }, { exp: undefined }, { sts: "pending" }, { sub: "arbitrary-client-id" }]) {
    await assert.rejects(verify(await token(claims)), ClerkAuthenticationError);
  }
});

test("rejects an invalid signature, missing token and non-RS256 token", async () => {
  const foreign = await generateKeyPair("RS256");
  await assert.rejects(verify(await token({}, foreign.privateKey)), ClerkAuthenticationError);
  await assert.rejects(verify(null), ClerkAuthenticationError);
  const hs = await new SignJWT({ sub: "user_example" }).setProtectedHeader({ alg: "HS256" }).sign(new Uint8Array(32));
  await assert.rejects(verify(hs), ClerkAuthenticationError);
});

test("invalid server configuration fails closed", () => {
  for (const issuerUrl of ["http://remote.example", `${issuer}/path`, `https://name:password@test-clerk.example`]) {
    assert.throws(() => createClerkIdentityVerifier({ issuerUrl, authorizedParties: [party] }));
  }
  assert.throws(() => createClerkIdentityVerifier({ issuerUrl: issuer, authorizedParties: [] }));
  assert.throws(() => createClerkIdentityVerifierFromEnv({}));
});

test("only an Authorization Bearer header supplies a token", () => {
  assert.equal(readBearerToken("Bearer signed.token.value"), "signed.token.value");
  assert.equal(readBearerToken("Basic abc"), null);
  assert.equal(readBearerToken("Bearer one two"), null);
  assert.equal(readBearerToken(undefined), null);
});
