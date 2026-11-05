/// <reference types="vite/client" />
import { createClerkSupabaseClient, getClerkAccessToken } from "./clerkSupabase.ts";

let supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase environment variables");
  throw new Error("Missing Supabase environment variables");
}

if (supabaseUrl && !supabaseUrl.startsWith("http")) {
  if (supabaseUrl.includes(".supabase.co")) {
    supabaseUrl = `https://${supabaseUrl}`;
  } else {
    supabaseUrl = `https://${supabaseUrl}.supabase.co`;
  }
}

try {
  supabaseUrl = new URL(supabaseUrl).origin;
} catch (e) {
  // Ignore
}

// Data modules share one client; stored Supabase Auth sessions are never a fallback.
export const supabase = createClerkSupabaseClient(supabaseUrl, supabaseAnonKey, getClerkAccessToken);
