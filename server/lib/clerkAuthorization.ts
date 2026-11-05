import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ClerkAuthenticationError,
  createClerkIdentityVerifierFromEnv,
  readBearerToken,
  type ClerkIdentity,
} from "./clerkIdentity.ts";
import { isAuthoritativePlatformAdmin } from "./platformAuthorization.ts";

class ClerkAuthorizationError extends Error {
  constructor(message: string, readonly statusCode: 403 | 503) {
    super(message);
    this.name = "ClerkAuthorizationError";
  }
}

const unavailable = () => new ClerkAuthorizationError("Ověření přihlášení není dočasně dostupné.", 503);
const isPlayerId = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** The verifier is a trusted server dependency, never supplied by an HTTP request. */
export function createClerkAuthorization(verifyIdentity: (token: string | null) => Promise<ClerkIdentity>) {
  const resolvePlayerId = async (
    supabaseAdmin: SupabaseClient,
    authorizationHeader?: string | null,
  ): Promise<string> => {
    const token = readBearerToken(authorizationHeader);
    if (!token) throw new ClerkAuthenticationError();
    const identity = await verifyIdentity(token);

    let playerId: unknown;
    try {
      // This service-role-only RPC excludes disabled identities and disabled issuers.
      const { data, error } = await supabaseAdmin.rpc("resolve_clerk_player_identity", {
        p_issuer: identity.issuer,
        p_subject: identity.subject,
      });
      if (error) throw unavailable();
      playerId = data;
    } catch {
      // Do not expose database errors, token claims, or credentials to callers/logs.
      throw unavailable();
    }
    if (!isPlayerId(playerId)) throw new ClerkAuthenticationError();
    return playerId;
  };

  const requirePlatformAdmin = async (
    supabaseAdmin: SupabaseClient,
    authorizationHeader?: string | null,
    forbiddenMessage = "Pouze administrátor může provést tuto akci.",
  ): Promise<string> => {
    const playerId = await resolvePlayerId(supabaseAdmin, authorizationHeader);
    let isAdmin: boolean;
    try {
      isAdmin = await isAuthoritativePlatformAdmin(supabaseAdmin, playerId);
    } catch {
      throw unavailable();
    }
    if (!isAdmin) throw new ClerkAuthorizationError(forbiddenMessage, 403);
    return playerId;
  };

  return { resolvePlayerId, requirePlatformAdmin };
}

export function createClerkAuthorizationFromEnv(env: Record<string, string | undefined> = process.env) {
  try {
    return createClerkAuthorization(createClerkIdentityVerifierFromEnv(env));
  } catch {
    throw unavailable();
  }
}

let authorization: ReturnType<typeof createClerkAuthorization> | undefined;
const getAuthorization = () => authorization ??= createClerkAuthorizationFromEnv();

export async function resolveClerkPlayerId(supabaseAdmin: SupabaseClient, authorizationHeader?: string | null) {
  if (!readBearerToken(authorizationHeader)) throw new ClerkAuthenticationError();
  return getAuthorization().resolvePlayerId(supabaseAdmin, authorizationHeader);
}

export async function authorizeClerkPlatformAdmin(
  supabaseAdmin: SupabaseClient,
  authorizationHeader?: string | null,
  forbiddenMessage?: string,
) {
  if (!readBearerToken(authorizationHeader)) throw new ClerkAuthenticationError();
  return getAuthorization().requirePlatformAdmin(supabaseAdmin, authorizationHeader, forbiddenMessage);
}

export function clerkAuthorizationErrorResponse(error: unknown) {
  if (error instanceof ClerkAuthenticationError || error instanceof ClerkAuthorizationError) {
    return { statusCode: error.statusCode, error: error.message };
  }
  return null;
}
