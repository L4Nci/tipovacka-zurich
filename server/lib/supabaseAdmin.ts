import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseAdminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdminClient) {
    let url = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url) {
      throw new Error("VITE_SUPABASE_URL environment variable is required for Supabase Admin");
    }
    if (!serviceKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is required for Supabase Admin");
    }

    if (!url.startsWith("http")) {
      if (url.includes(".supabase.co")) {
        url = `https://${url}`;
      } else {
        url = `https://${url}.supabase.co`;
      }
    }

    try {
      url = new URL(url).origin;
    } catch (e) {
      // Ignore validation error here
    }

    supabaseAdminClient = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseAdminClient;
}
