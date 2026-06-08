/// <reference types="vite/client" />
import { createClient } from "@supabase/supabase-js";

let supabaseUrl = (typeof import.meta !== "undefined" && import.meta.env ? import.meta.env.VITE_SUPABASE_URL : undefined) || process.env.VITE_SUPABASE_URL || "https://placeholder-url.supabase.co";
const supabaseAnonKey = (typeof import.meta !== "undefined" && import.meta.env ? import.meta.env.VITE_SUPABASE_ANON_KEY : undefined) || process.env.VITE_SUPABASE_ANON_KEY || "placeholder-anon-key";

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
