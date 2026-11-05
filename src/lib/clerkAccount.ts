import type { Player } from "../types.ts";

export type AccountProfile = Player & { needs_profile_completion: boolean };

export const normalizeAccountProfile = (value: unknown): AccountProfile => {
  const profile = value as Record<string, unknown> | null;
  if (!profile || typeof profile.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profile.id) ||
      typeof profile.username !== "string" ||
      !["player", "admin"].includes(String(profile.role)) ||
      typeof profile.needs_profile_completion !== "boolean") {
    throw new Error("Účet se nepodařilo načíst. Zkus to prosím znovu.");
  }
  const displayName = typeof profile.display_name === "string" ? profile.display_name : null;
  return {
    id: profile.id,
    username: displayName || profile.username,
    display_name: displayName,
    role: profile.role as Player["role"],
    avatar_emoji: typeof profile.avatar_emoji === "string" ? profile.avatar_emoji : "😀",
    avatar_bg: typeof profile.avatar_bg === "string" ? profile.avatar_bg : "#fee2e2",
    locale: profile.locale === "en" ? "en" : "cs",
    needs_profile_completion: profile.needs_profile_completion,
  };
};
