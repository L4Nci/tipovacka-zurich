import { createClient } from "@supabase/supabase-js";

export type ClerkAccessTokenGetter = () => Promise<string | null>;
let activeTokenGetter: ClerkAccessTokenGetter | null = null;

/** The bridge is installed before account bootstrap; tokens are read anew for each request. */
export function bindClerkAccessTokenGetter(getter: ClerkAccessTokenGetter) {
  activeTokenGetter = getter;
  return () => {
    if (activeTokenGetter === getter) activeTokenGetter = null;
  };
}

export async function getClerkAccessToken() {
  if (!activeTokenGetter) throw new Error("Přihlášení ještě není připravené. Zkus to znovu.");
  return activeTokenGetter();
}

/** Native third-party auth: Clerk supplies the token; no Supabase Auth session is stored. */
export function createClerkSupabaseClient(
  url: string,
  publishableKey: string,
  getAccessToken: ClerkAccessTokenGetter,
) {
  if (!url || !publishableKey) throw new Error("Chybí konfigurace Supabase pro Clerk.");
  return createClient(url, publishableKey, {
    accessToken: getAccessToken,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
