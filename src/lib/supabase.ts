/// <reference types="vite/client" />
import { createClient } from "@supabase/supabase-js";

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
