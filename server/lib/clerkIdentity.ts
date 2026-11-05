import { createRemoteJWKSet, customFetch, jwtVerify } from "jose";
import type { FetchImplementation } from "jose/jwks/remote";

export type ClerkIdentity = {
  issuer: string;
  subject: string;
  sessionId: string;
};

export class ClerkAuthenticationError extends Error {
  readonly statusCode = 401;

  constructor() {
    super("Přihlášení není platné nebo vypršelo.");
    this.name = "ClerkAuthenticationError";
  }
}

function origin(value: string, httpsOnly: boolean): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Clerk konfigurace musí obsahovat platné origins.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
    (url.protocol !== "https:" && (httpsOnly || url.protocol !== "http:" || !local))
  ) {
    throw new Error("Clerk origin nesmí obsahovat cestu ani přihlašovací údaje; HTTP je povolené jen lokálně.");
  }
  return url.origin;
}

export function readBearerToken(header: string | null | undefined): string | null {
  const match = header?.trim().match(/^Bearer ([^\s]+)$/i);
  return match?.[1] ?? null;
}

/** Configuration and optional transport are trusted server inputs, never request fields. */
export function createClerkIdentityVerifier(
  configuration: { issuerUrl: string; authorizedParties: readonly string[] },
  transport?: { fetch: FetchImplementation },
) {
  const issuer = origin(configuration.issuerUrl, true);
  if (!configuration.authorizedParties.length) {
    throw new Error("CLERK_AUTHORIZED_PARTIES musí obsahovat alespoň jeden povolený origin.");
  }
  const parties = new Set(configuration.authorizedParties.map(value => origin(value, false)));
  // Never select a JWKS endpoint from an unverified token's issuer or header.
  const getKey = createRemoteJWKSet(new URL("/.well-known/jwks.json", issuer), {
    timeoutDuration: 5_000,
    cooldownDuration: 30_000,
    ...(transport ? { [customFetch]: transport.fetch } : {}),
  });

  return async (token: string | null): Promise<ClerkIdentity> => {
    if (!token) throw new ClerkAuthenticationError();
    try {
      const { payload } = await jwtVerify(token, getKey, {
        algorithms: ["RS256"],
        issuer,
        requiredClaims: ["sub", "sid", "azp", "iat", "exp"],
        clockTolerance: 5,
      });
      if (
        typeof payload.sub !== "string" || !/^user_.+/.test(payload.sub) ||
        typeof payload.sid !== "string" || !/^sess_.+/.test(payload.sid) ||
        typeof payload.azp !== "string" || !parties.has(payload.azp) ||
        (payload.sts !== undefined && payload.sts !== "active")
      ) {
        throw new ClerkAuthenticationError();
      }
      return { issuer, subject: payload.sub, sessionId: payload.sid };
    } catch {
      // JWT/transport errors can contain internals; callers receive no token or claim values.
      throw new ClerkAuthenticationError();
    }
  };
}

export function createClerkIdentityVerifierFromEnv(env: Record<string, string | undefined> = process.env) {
  const issuerUrl = env.CLERK_ISSUER_URL?.trim();
  const authorizedParties = env.CLERK_AUTHORIZED_PARTIES?.split(",").map(value => value.trim()).filter(Boolean);
  if (!issuerUrl || !authorizedParties?.length) {
    throw new Error("Není nastavený CLERK_ISSUER_URL nebo CLERK_AUTHORIZED_PARTIES.");
  }
  return createClerkIdentityVerifier({ issuerUrl, authorizedParties });
}
