import type { SupabaseClient } from "@supabase/supabase-js";

export const isAuthoritativePlatformAdmin = async (
  supabaseAdmin: SupabaseClient,
  userId: string
) => {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profileError) throw profileError;
  return profile?.role === "admin";
};
