import { supabase } from "./supabase.ts";
import type { User } from "@supabase/supabase-js";
import { calculatePoints } from "./scoring.ts";
import { isDrawPrediction, isFootballKnockoutStage } from "./matchRules.ts";
import { Player, Team, Match, Prediction, Lobby, LobbyMember } from "../types.ts";
import { getAuthRedirectUrl } from "./auth.ts";
import { getSignupOutcome } from "./authLifecycle.ts";
import {
  summarizeHomeDashboardContext,
  type HomeDashboardContextInput,
  type HomeDashboardMatchInput,
  type HomeDashboardSummary
} from "./homeDashboard.ts";

const SUPABASE_PAGE_SIZE = 1000;
const SUPABASE_MAX_PAGES = 20;
let warnedMissingPredictionCountRpc = false;
let warnedMissingHomeDashboardRpc = false;

const fetchAllSupabaseRows = async <T>(query: any, label: string): Promise<T[]> => {
  const rows: T[] = [];

  for (let page = 0; page < SUPABASE_MAX_PAGES; page++) {
    const from = page * SUPABASE_PAGE_SIZE;
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await query.range(from, to);

    if (error) throw error;

    const pageRows = (data || []) as T[];
    rows.push(...pageRows);

    if (pageRows.length < SUPABASE_PAGE_SIZE) {
      return rows;
    }
  }

  throw new Error(`${label} exceeded safe pagination limit (${SUPABASE_MAX_PAGES * SUPABASE_PAGE_SIZE} rows).`);
};

const isMissingPredictionCountRpcError = (error: any) => {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "PGRST202" ||
    message.includes("get_lobby_tournament_prediction_counts") &&
    (message.includes("not find") || message.includes("not found") || message.includes("missing"));
};

const isMissingHomeDashboardRpcError = (error: any) => {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "PGRST202" ||
    message.includes("get_user_home_dashboard") &&
    (message.includes("not find") || message.includes("not found") || message.includes("missing"));
};

const fetchPredictionCountsByMatchId = async (
  lobbyId: string,
  tournamentId: string | undefined,
  matchIds: string[]
) => {
  const statsMap = new Map<string, number>();
  if (matchIds.length === 0) return statsMap;

  const { data: groupedCounts, error: groupedCountsError } = await supabase
    .rpc("get_lobby_tournament_prediction_counts", {
      lobby_id_param: lobbyId,
      tournament_id_param: tournamentId || null
    });

  if (!groupedCountsError && groupedCounts) {
    groupedCounts.forEach((row: any) => {
      statsMap.set(row.match_id, Number(row.prediction_count) || 0);
    });
    return statsMap;
  }

  if (groupedCountsError && !isMissingPredictionCountRpcError(groupedCountsError)) {
    throw groupedCountsError;
  }

  if (groupedCountsError && !warnedMissingPredictionCountRpc) {
    warnedMissingPredictionCountRpc = true;
    console.warn("Prediction count RPC is unavailable; falling back to client-side grouped counts.");
  }

  let countQuery = supabase
    .from("predictions")
    .select("match_id")
    .eq("lobby_id", lobbyId)
    .in("match_id", matchIds)
    .order("match_id", { ascending: true });

  const countRows = await fetchAllSupabaseRows<{ match_id: string }>(
    countQuery,
    "fetchPredictionCountsByMatchId fallback"
  );

  countRows.forEach(pred => {
    statsMap.set(pred.match_id, (statsMap.get(pred.match_id) || 0) + 1);
  });

  return statsMap;
};

export const loadPlayerFromAuthUser = async (authUser: User): Promise<Player> => {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username, role, tournament_winner_id, avatar_emoji, avatar_bg")
    .eq("id", authUser.id)
    .maybeSingle();

  if (error) throw error;
  if (!profile) {
    throw new Error("Přihlášení proběhlo, ale profil zatím není připravený. Zkus to prosím znovu.");
  }

  return {
    id: profile.id,
    email: authUser.email || null,
    username: profile.username,
    role: profile.role || "player",
    tournament_winner_id: profile.tournament_winner_id,
    avatar_emoji: profile.avatar_emoji || "😀",
    avatar_bg: profile.avatar_bg || "#fee2e2"
  } as Player;
};

/**
 * Direct session check kept for small callers outside App auth orchestration.
 */
export const checkSession = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.user) return null;
  return loadPlayerFromAuthUser(session.user);
};

/**
 * Sign In
 */
export const loginUser = async (email: string, pass: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes("@")) {
    throw new Error("Přihlašování uživatelským jménem není bezpečně dostupné. Použij e-mail.");
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password: pass
  });

  if (error) throw error;
  if (!data.user || !data.session) throw new Error("Chyba při přihlašování.");
  return data;
};

/**
 * Sign Up / Registration
 */
export const registerUser = async (username: string, pass: string, emailParam: string) => {
  const email = emailParam.trim().toLowerCase();
  const trimmedUsername = username.trim();
  if (!email.includes("@")) throw new Error("Zadej platnou e-mailovou adresu.");
  if (trimmedUsername.length < 2) throw new Error("Zobrazované jméno musí mít alespoň 2 znaky.");
  if (pass.length < 8) throw new Error("Heslo musí mít alespoň 8 znaků.");

  const { data, error } = await supabase.auth.signUp({
    email,
    password: pass,
    options: {
      data: {
        username: trimmedUsername
      },
      emailRedirectTo: getAuthRedirectUrl()
    }
  });

  if (error) throw error;
  if (!data.user) throw new Error("Registrace se nezdařila.");

  if (getSignupOutcome(Boolean(data.session)) === "email_confirmation_pending") {
    return {
      status: "email_confirmation_pending" as const,
      email
    };
  }

  return {
    status: "authenticated" as const
  };
};

/**
 * Sign Out
 */
export const logoutUser = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export { calculatePoints };

/**
 * Fetch list of tournaments
 */
export const fetchTournaments = async () => {
  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data;
};

/**
 * Fetch participants of a sport
 */
export const fetchParticipants = async (sportId: string = "football") => {
  const { data, error } = await supabase
    .from("participants")
    .select("*")
    .eq("sport_id", sportId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data;
};

/**
 * Fetch all lobbies that user belongs to (FÁZE S7 & S8)
 */
export const fetchUserLobbies = async (userId: string) => {
  let data: any = null;

  try {
    const res = await supabase
      .from("lobby_members")
      .select(`
        lobby_id,
        role,
        joined_at,
        lobby:lobbies (
          id,
          name,
          owner_id,
          tournament_id,
          short_description,
          long_description,
          join_code,
          visibility,
          tournament:tournaments (
            name
          ),
          lobby_tournaments (
            id,
            tournament_id,
            status,
            tournament:tournaments (
              name,
              sport_id,
              status
            )
          )
        )
      `)
      .eq("user_id", userId)
      .eq("membership_status", "active");

    if (res.error) throw res.error;
    data = res.data;
  } catch (err: any) {
    console.warn("fetchUserLobbies original query failed. Attempting fallback without lobby_tournaments.", err);
    const res = await supabase
      .from("lobby_members")
      .select(`
        lobby_id,
        role,
        joined_at,
        lobby:lobbies (
          id,
          name,
          owner_id,
          tournament_id,
          short_description,
          long_description,
          join_code,
          visibility,
          tournament:tournaments (
            name
          )
        )
      `)
      .eq("user_id", userId)
      .eq("membership_status", "active");
    if (res.error) throw res.error;
    data = res.data;
  }

  const formatted: Lobby[] = [];
  data?.forEach(item => {
    if (item.lobby) {
      const lob = item.lobby as any;
      
      // Fallback: if lobby_tournaments is missing or empty, build one from the legacy tournament_id
      let tournaments = lob.lobby_tournaments || [];
      if (tournaments.length === 0 && lob.tournament_id) {
        tournaments = [{
          lobby_id: lob.id,
          tournament_id: lob.tournament_id,
          status: 'active',
          tournament: lob.tournament
        }];
      }

      formatted.push({
        id: lob.id,
        name: lob.name,
        owner_id: lob.owner_id,
        tournament_id: lob.tournament_id, // legacy fallback 
        short_description: lob.short_description || null,
        long_description: lob.long_description || null,
        join_code: lob.join_code,
        visibility: lob.visibility,
        tournament_name: lob.tournament?.name || "FIFA World Cup 2026",
        is_owner: lob.owner_id === userId,
        lobby_role: lob.owner_id === userId ? 'owner' : (item.role || 'member'),
        tournaments
      });
    }
  });

  const lobbyIds = formatted.map(lobby => lobby.id);
  if (lobbyIds.length > 0) {
    const { data: memberRows, error: memberCountErr } = await supabase
      .from("lobby_members")
      .select("lobby_id")
      .in("lobby_id", lobbyIds)
      .eq("membership_status", "active");

    if (memberCountErr) {
      console.warn("Could not fetch lobby member counts.", memberCountErr);
    } else {
      const countsByLobby = new Map<string, number>();
      memberRows?.forEach(row => {
        countsByLobby.set(row.lobby_id, (countsByLobby.get(row.lobby_id) || 0) + 1);
      });
      formatted.forEach(lobby => {
        lobby.member_count = countsByLobby.get(lobby.id) ?? 0;
      });
    }
  }

  return formatted;
};

const normalizeHomeDashboardSummary = (row: any): HomeDashboardSummary => ({
  lobby_id: String(row.lobby_id),
  lobby_name: String(row.lobby_name),
  lobby_role: row.lobby_role === 'owner' || row.lobby_role === 'admin' ? row.lobby_role : 'member',
  member_count: Number(row.member_count) || 0,
  tournament_id: String(row.tournament_id),
  tournament_name: String(row.tournament_name),
  tournament_status: row.tournament_status === 'archived' ? 'archived' : 'active',
  is_completed: Boolean(row.is_completed),
  actionable_match_count: Number(row.actionable_match_count) || 0,
  next_actionable_lock_time: row.next_actionable_lock_time || null,
  next_missing_lock_time: row.next_missing_lock_time || null,
  all_known_unlocked_predicted: Boolean(row.all_known_unlocked_predicted),
  schedule_state: row.schedule_state,
  requires_owner_attention: Boolean(row.requires_owner_attention)
});

const fetchHomeDashboardBatchedFallback = async (
  userId: string,
  lobbies: Lobby[]
): Promise<HomeDashboardSummary[]> => {
  const contexts: HomeDashboardContextInput[] = lobbies.flatMap(lobby => {
    const relations = lobby.tournaments?.length
      ? lobby.tournaments
      : lobby.tournament_id
        ? [{ lobby_id: lobby.id, tournament_id: lobby.tournament_id, status: 'active' as const }]
        : [];

    return relations
      .filter(relation => relation.status === 'active')
      .map(relation => ({
        lobby_id: lobby.id,
        lobby_name: lobby.name,
        lobby_role: lobby.lobby_role || (lobby.is_owner ? 'owner' : 'member'),
        member_count: lobby.member_count || 0,
        tournament_id: relation.tournament_id,
        tournament_name: relation.tournament?.name || lobby.tournament_name || relation.tournament_id,
        tournament_status: relation.status,
        actual_tournament_winner_id: null
      }));
  });

  const tournamentIds = Array.from(new Set(contexts.map(context => context.tournament_id)));
  if (tournamentIds.length === 0) return [];

  const [{ data: tournamentRows, error: tournamentsError }, { data: matchRows, error: matchesError }] = await Promise.all([
    supabase
      .from('tournaments')
      .select('id, name, actual_tournament_winner_id')
      .in('id', tournamentIds),
    supabase
      .from('matches')
      .select('id, tournament_id, home_participant_id, away_participant_id, lock_time_utc, status, home_score, away_score')
      .in('tournament_id', tournamentIds)
      .order('lock_time_utc', { ascending: true })
  ]);

  if (tournamentsError) throw tournamentsError;
  if (matchesError) throw matchesError;

  const matches = (matchRows || []) as HomeDashboardMatchInput[];
  const matchIds = matches.map(match => match.id);
  const lobbyIds = Array.from(new Set(contexts.map(context => context.lobby_id)));
  let predictionRows: Array<{ lobby_id: string; match_id: string }> = [];

  if (matchIds.length > 0 && lobbyIds.length > 0) {
    const predictionsQuery = supabase
      .from('predictions')
      .select('lobby_id, match_id')
      .eq('user_id', userId)
      .in('lobby_id', lobbyIds)
      .in('match_id', matchIds)
      .order('lobby_id', { ascending: true })
      .order('match_id', { ascending: true });
    predictionRows = await fetchAllSupabaseRows(predictionsQuery, 'fetchHomeDashboard fallback predictions');
  }

  const tournamentsById = new Map((tournamentRows || []).map(row => [row.id, row]));
  const predictionsByLobby = new Map<string, Set<string>>();
  predictionRows.forEach(row => {
    const current = predictionsByLobby.get(row.lobby_id) || new Set<string>();
    current.add(row.match_id);
    predictionsByLobby.set(row.lobby_id, current);
  });

  return contexts.map(context => {
    const tournament = tournamentsById.get(context.tournament_id);
    return summarizeHomeDashboardContext(
      {
        ...context,
        tournament_name: tournament?.name || context.tournament_name,
        actual_tournament_winner_id: tournament?.actual_tournament_winner_id || null
      },
      matches,
      predictionsByLobby.get(context.lobby_id) || new Set<string>()
    );
  });
};

export const fetchHomeDashboard = async (userId: string, lobbies: Lobby[]) => {
  const { data, error } = await supabase.rpc('get_user_home_dashboard');

  if (!error && data) {
    return {
      summaries: data.map(normalizeHomeDashboardSummary),
      source: 'rpc' as const
    };
  }

  if (error && !isMissingHomeDashboardRpcError(error)) throw error;

  if (error && !warnedMissingHomeDashboardRpc) {
    warnedMissingHomeDashboardRpc = true;
    console.warn('Home dashboard RPC is unavailable; using the batched read-only fallback.');
  }

  return {
    summaries: await fetchHomeDashboardBatchedFallback(userId, lobbies),
    source: 'batched-fallback' as const
  };
};

type LobbyRpcRow = {
  id: string;
  name: string;
  owner_id: string;
  tournament_id: string;
  short_description?: string | null;
  long_description?: string | null;
  join_code: string;
  visibility: 'private' | 'public';
  created_at?: string;
  tournament_name?: string;
  is_owner?: boolean;
};

const firstLobbyRpcRow = (data: LobbyRpcRow[] | LobbyRpcRow | null): LobbyRpcRow => {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Databáze nevrátila lobby.");
  return row;
};

const lobbyFromRpcRow = (row: LobbyRpcRow): Lobby => ({
  id: row.id,
  name: row.name,
  owner_id: row.owner_id,
  tournament_id: row.tournament_id,
  short_description: row.short_description ?? null,
  long_description: row.long_description ?? null,
  join_code: row.join_code,
  visibility: row.visibility,
  created_at: row.created_at,
  tournament_name: row.tournament_name || "",
  is_owner: Boolean(row.is_owner),
  lobby_role: row.is_owner ? 'owner' : 'member'
});

/**
 * Create a lobby atomically. Caller identity and ownership are derived in SQL.
 */
export const createLobby = async (
  name: string,
  tournamentId: string,
  visibility: 'private' | 'public' = 'public',
  shortDescription = "",
  longDescription = ""
) => {
  const { data, error } = await supabase.rpc("create_lobby_secure", {
    lobby_name_param: name,
    tournament_id_param: tournamentId,
    visibility_param: visibility,
    short_description_param: shortDescription,
    long_description_param: longDescription
  });

  if (error) throw error;
  return lobbyFromRpcRow(firstLobbyRpcRow(data as LobbyRpcRow[] | null));
};

/**
 * Add a new tournament to an existing lobby.
 */
export const addTournamentToLobby = async (lobbyId: string, tournamentId: string) => {
  // We use the authenticated Supabase client, which will be protected by RLS
  // Only owners/admins can insert into lobby_tournaments (Policy "Owners can manage lobby tournaments")
  
  const { error } = await supabase
    .from("lobby_tournaments")
    .insert({
      lobby_id: lobbyId,
      tournament_id: tournamentId,
      status: 'active'
    });

  if (error) {
    if (error.code === '23505') return { success: true }; // UNIQUE constraint violation, already added
    console.error("Error adding tournament to lobby:", error);
    throw error;
  }
  
  return { success: true };
};

/**
 * Join a lobby atomically. The RPC accepts only the invitation code and derives
 * the caller identity and member role from auth.uid().
 */
export const joinLobbyByCode = async (joinCode: string) => {
  const { data, error } = await supabase.rpc("join_lobby_secure", {
    join_code_param: joinCode.trim().toUpperCase()
  });

  if (error) {
    if (error.code === "P0002") {
      throw new Error("Žádná lobby s tímto kódem neexistuje.");
    }
    if (error.code === "42501" && error.message?.includes("restored")) {
      throw new Error("Přístup do této lobby ti musí obnovit její majitel.");
    }
    if (error.code === "42501" && error.message?.includes("pending")) {
      throw new Error("Tvoje žádost o vstup čeká na schválení.");
    }
    throw error;
  }

  return lobbyFromRpcRow(firstLobbyRpcRow(data as LobbyRpcRow[] | null));
};

export const fetchLobbyMembers = async (lobbyId: string): Promise<LobbyMember[]> => {
  const { data, error } = await supabase
    .from("lobby_members")
    .select(`
      id,
      lobby_id,
      user_id,
      role,
      membership_status,
      joined_at,
      ended_at,
      ended_by,
      profile:profiles (
        username,
        role,
        avatar_emoji,
        avatar_bg,
        tournament_winner_id
      ),
      lobby:lobbies (
        owner_id
      )
    `)
    .eq("lobby_id", lobbyId);

  if (error) throw error;

  const statusOrder = { active: 0, pending: 1, removed: 2, left: 3 };
  return (data || [])
    .map((row: any) => {
      const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
      const lobby = Array.isArray(row.lobby) ? row.lobby[0] : row.lobby;
      const membershipStatus = (
        row.membership_status === "pending" ||
        row.membership_status === "removed" ||
        row.membership_status === "left"
      ) ? row.membership_status : "active";

      return {
        id: row.id,
        user_id: row.user_id,
        username: profile?.username || "Tipující",
        role: profile?.role === "admin" ? "admin" : "player",
        lobby_role: lobby?.owner_id === row.user_id
          ? "owner"
          : (row.role === "admin" ? "admin" : "member"),
        membership_status: membershipStatus,
        avatar_emoji: profile?.avatar_emoji || "😀",
        avatar_bg: profile?.avatar_bg || "#fee2e2",
        joined_at: row.joined_at,
        ended_at: row.ended_at,
        ended_by: row.ended_by,
        tournament_winner_id: profile?.tournament_winner_id || null
      } as LobbyMember;
    })
    .sort((a, b) => {
      if (a.lobby_role === "owner" && b.lobby_role !== "owner") return -1;
      if (b.lobby_role === "owner" && a.lobby_role !== "owner") return 1;
      return statusOrder[a.membership_status] - statusOrder[b.membership_status]
        || a.username.localeCompare(b.username);
    });
};

const runMembershipLifecycleRpc = async (
  functionName: "leave_lobby_secure" | "remove_lobby_member_secure" | "restore_lobby_member_secure",
  args: Record<string, string>
) => {
  const { data, error } = await supabase.rpc(functionName, args);
  if (error) throw new Error(error.message || "Membership operation failed.");
  return String(data || "");
};

export const leaveLobby = (lobbyId: string) => (
  runMembershipLifecycleRpc("leave_lobby_secure", {
    lobby_id_param: lobbyId
  })
);

export const removeLobbyMember = (lobbyId: string, memberId: string) => (
  runMembershipLifecycleRpc("remove_lobby_member_secure", {
    lobby_id_param: lobbyId,
    member_id_param: memberId
  })
);

export const restoreLobbyMember = (lobbyId: string, memberId: string) => (
  runMembershipLifecycleRpc("restore_lobby_member_secure", {
    lobby_id_param: lobbyId,
    member_id_param: memberId
  })
);

/**
 * Fetch matches, participants, and users predictions in a single dashboard query (FÁZE S9 & FÁZE S10)
 */
export const fetchLobbyDashboard = async (lobbyId: string, userId: string, explicitTournamentId?: string) => {
  // 1. Get lobby details with tournament actual winner and lobby_tournaments
  let lobby: any;
  let tournamentId: string;
  let lobbyName: string;
  let actualWinnerId = null;

  try {
    const { data, error: lobbyErr } = await supabase
      .from("lobbies")
      .select(`
        tournament_id,
        name,
        short_description,
        long_description,
        tournament:tournaments (
          actual_tournament_winner_id
        ),
        lobby_tournaments (
          id,
          tournament_id,
          status,
          tournament:tournaments (
            name,
            sport_id,
            status,
            actual_tournament_winner_id
          )
        )
      `)
      .eq("id", lobbyId)
      .single();

    if (lobbyErr) throw lobbyErr;
    lobby = data;
    tournamentId = explicitTournamentId || lobby.tournament_id;
    lobbyName = lobby.name;
    actualWinnerId = (lobby as any)?.lobby_tournaments
      ?.find((row: any) => row.tournament_id === tournamentId)
      ?.tournament?.actual_tournament_winner_id ||
      (lobby as any)?.tournament?.actual_tournament_winner_id ||
      null;
  } catch (err: any) {
    console.warn("fetchLobbyDashboard original query failed. Attempting fallback.", err);
    try {
      const { data, error: fbErr } = await supabase
        .from("lobbies")
        .select(`
          tournament_id,
          name,
          short_description,
          long_description,
          tournament:tournaments (
            actual_tournament_winner_id
          )
        `)
        .eq("id", lobbyId)
        .single();

      if (fbErr) throw fbErr;
      lobby = data;
      tournamentId = explicitTournamentId || lobby.tournament_id;
      lobbyName = lobby.name;
      actualWinnerId = (lobby as any)?.tournament?.actual_tournament_winner_id || null;
    } catch (fallbackErr: any) {
      console.warn("fetchLobbyDashboard actual_tournament_winner_id lookup failed. Trying bare minimum.", fallbackErr);
      const { data, error: bareErr } = await supabase
        .from("lobbies")
        .select(`
          tournament_id,
          name,
          short_description,
          long_description,
          tournament:tournaments (
            name
          )
        `)
        .eq("id", lobbyId)
        .single();

      if (bareErr) throw bareErr;
      lobby = data;
      tournamentId = explicitTournamentId || lobby.tournament_id;
      lobbyName = lobby.name;
    }
  }

  // Derive active and archived tournaments
  let active_tournaments: any[] = [];
  let archived_tournaments: any[] = [];
  const lt = lobby.lobby_tournaments || [];
  
  if (lt.length > 0) {
    active_tournaments = lt.filter((t: any) => t.status === 'active');
    archived_tournaments = lt.filter((t: any) => t.status === 'archived');
  } else if (lobby.tournament_id) {
    // Fallback: use legacy tournament
    active_tournaments = [{
      lobby_id: lobbyId,
      tournament_id: lobby.tournament_id,
      status: 'active',
      tournament: lobby.tournament // Might be missing details, but that's ok for fallback
    }];
  }

  // 2. Fetch matches for this tournament
  const { data: matches, error: matchesErr } = await supabase
    .from("matches")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("start_time_utc", { ascending: true });

  if (matchesErr) throw matchesErr;

  // 3. Fetch participants to get details like flags and full names
  const { data: participants, error: pErr } = await supabase
    .from("participants")
    .select("*");

  if (pErr) throw pErr;
  
  const participantsMap = new Map();
  participants?.forEach(p => participantsMap.set(p.id, p));

  // 4. Fetch predictions made by this user in this lobby
  const { data: userPreds, error: predsErr } = await supabase
    .from("predictions")
    .select("*")
    .eq("lobby_id", lobbyId)
    .eq("user_id", userId);

  if (predsErr) throw predsErr;
  const predictionsMap = new Map();
  userPreds?.forEach(p => predictionsMap.set(p.match_id, p));

  // 5. Query grouped prediction counts per match inside this lobby/tournament.
  const statsMap = await fetchPredictionCountsByMatchId(
    lobbyId,
    tournamentId,
    (matches || []).map(match => match.id)
  );

  // 6. Map matches to the expected frontend Match signature
  const formattedMatches: Match[] = (matches || []).map(m => {
    const homePart = participantsMap.get(m.home_participant_id);
    const awayPart = participantsMap.get(m.away_participant_id);
    const userPred = predictionsMap.get(m.id);

    return {
      id: m.id,
      tournament_id: m.tournament_id,
      home_team_id: m.home_participant_id,
      away_team_id: m.away_participant_id,
      start_time_utc: m.start_time_utc,
      home_score: m.home_score ?? null,
      away_score: m.away_score ?? null,
      status: m.status === "finished" ? "finished" : "scheduled",
      stage: m.stage || "Group Stage",
      home_name: homePart?.short_name || homePart?.name || m.home_participant_id.replace(/^(football|hockey)-/, '').toUpperCase(),
      home_flag: homePart?.flag_code || "⚽",
      away_name: awayPart?.short_name || awayPart?.name || m.away_participant_id.replace(/^(football|hockey)-/, '').toUpperCase(),
      away_flag: awayPart?.flag_code || "⚽",
      predicted_home_score: userPred ? userPred.predicted_home_score : null,
      predicted_away_score: userPred ? userPred.predicted_away_score : null,
      total_predictions: statsMap.get(m.id) || 0
    };
  });

  return {
    lobbyName: lobby.name,
    lobbyShortDescription: lobby.short_description || null,
    lobbyLongDescription: lobby.long_description || null,
    tournamentId, // legacy primary tournament
    active_tournaments,
    archived_tournaments,
    matches: formattedMatches,
    participants: (participants || []).map(p => ({
      ...p,
      is_final_winner: p.id === actualWinnerId ? 1 : 0
    }))
  };
};

/**
 * Save user's prediction inside a SPECIFIC lobby (FÁZE S10)
 */
export const savePrediction = async (userId: string, lobbyId: string, matchId: string, home: number, away: number) => {
  if (!userId || !lobbyId || !matchId) throw new Error("Chybný dotaz - scházející parametry.");

  // Get match metadata needed for lock and prediction safety checks.
  const { data: match, error: mErr } = await supabase
    .from("matches")
    .select("lock_time_utc, tournament_id, stage, status, home_score, away_score")
    .eq("id", matchId)
    .single();

  if (mErr) throw mErr;
  if (!match) throw new Error("Zápas nenalezen.");

  const now = new Date();
  const lockTime = new Date(match.lock_time_utc);

  if (now >= lockTime) {
    throw new Error("Uzamčeno! Tipování pro tento zápas již vypršelo (5 min před startem).");
  }

  if (match.status === "finished" || match.home_score !== null || match.away_score !== null) {
    throw new Error("Zápas už má uložený výsledek, tip nelze změnit.");
  }

  if (home === away && match.tournament_id === "ms-hockey-2026") {
    throw new Error("V hokeji není remíza povolena. Vyberte vítěze zápasu v základní době / po prodloužení!");
  }

  if (isDrawPrediction(home, away) && isFootballKnockoutStage(match.stage, match.tournament_id)) {
    throw new Error("V play-off nelze tipovat remízu.");
  }

  const { error: upsertErr } = await supabase
    .from("predictions")
    .upsert({
      user_id: userId,
      lobby_id: lobbyId,
      match_id: matchId,
      predicted_home_score: home,
      predicted_away_score: away
    });

  if (upsertErr) throw upsertErr;
};

/**
 * Fetch all lobby predictions for other members to expand (FÁZE S10 inside lobby)
 */
export const fetchMatchPredictions = async (lobbyId: string, matchId: string) => {
  const { data, error } = await supabase
    .from("predictions")
    .select(`
      user_id,
      predicted_home_score,
      predicted_away_score,
      points_earned,
      profile:profiles (
        username,
        avatar_emoji,
        avatar_bg
      )
    `)
    .eq("lobby_id", lobbyId)
    .eq("match_id", matchId);

  if (error) throw error;

  // Fetch longterm predictions in this lobby
  const { data: ltPreds, error: ltPredsErr } = await supabase
    .from("longterm_predictions")
    .select("user_id, predicted_participant_id")
    .eq("lobby_id", lobbyId)
    .eq("prediction_type", "tournament_winner");

  if (ltPredsErr && ltPredsErr.code !== "PGRST205") {
    throw ltPredsErr;
  }

  const ltWinnerMap = new Map<string, string>();
  ltPreds?.forEach(p => ltWinnerMap.set(p.user_id, p.predicted_participant_id));

  const { data: participants } = await supabase.from("participants").select("id, flag_code");
  const pFlags = new Map();
  participants?.forEach(p => pFlags.set(p.id, p.flag_code));

  const result: Prediction[] = (data || []).map(p => {
    const rawProf = p.profile as any;
    const prof = Array.isArray(rawProf) ? rawProf[0] : rawProf;
    const pWinnerId = ltWinnerMap.get(p.user_id);
    return {
      player_id: p.user_id,
      match_id: matchId,
      predicted_home_score: p.predicted_home_score,
      predicted_away_score: p.predicted_away_score,
      points_earned: p.points_earned,
      username: prof?.username || "Uživatel",
      avatar_emoji: prof?.avatar_emoji || "😀",
      avatar_bg: prof?.avatar_bg || "#fee2e2",
      winner_flag: pWinnerId ? pFlags.get(pWinnerId) : undefined
    } as Prediction;
  });

  return result;
};

/**
 * Fetch Leaderboard for a lobby on-the-fly (FÁZE S12)
 */
export const fetchLobbyLeaderboard = async (
  lobbyId: string,
  tournamentId?: string,
  preloadedPredictions?: Prediction[]
) => {
  // 1. Get all members of the lobby
  const { data: members, error: mErr } = await supabase
    .from("lobby_members")
    .select(`
      user_id,
      role,
      membership_status,
      profile:profiles (
        username,
        role,
        avatar_emoji,
        avatar_bg
      ),
      lobby:lobbies (
        owner_id
      )
    `)
    .eq("lobby_id", lobbyId)
    .in("membership_status", ["active", "left", "removed"]);

  if (mErr) throw mErr;

  // 2. Get predictions of this lobby to count earned points.
  // Deferred app loading can pass the already-loaded tournament prediction rows
  // to avoid downloading the same prediction dataset twice.
  let preds: any[];
  if (preloadedPredictions) {
    preds = preloadedPredictions.map(p => ({
      user_id: p.player_id,
      points_earned: p.points_earned,
      match_id: p.match_id,
      predicted_home_score: p.predicted_home_score,
      predicted_away_score: p.predicted_away_score,
      match: {
        home_score: (p as any).home_score,
        away_score: (p as any).away_score,
        tournament_id: (p as any).tournament_id
      }
    }));
  } else {
    let predsQuery = supabase
      .from("predictions")
      .select(`
        user_id,
        points_earned,
        match_id,
        predicted_home_score,
        predicted_away_score,
        match:matches (
          home_score,
          away_score,
          tournament_id
        )
      `)
      .eq("lobby_id", lobbyId)
      .order("user_id", { ascending: true })
      .order("lobby_id", { ascending: true })
      .order("match_id", { ascending: true });

    if (tournamentId) {
      const { data: tMatches } = await supabase
        .from("matches")
        .select("id")
        .eq("tournament_id", tournamentId);

      if (tMatches && tMatches.length > 0) {
        const matchIds = tMatches.map(m => m.id);
        predsQuery = predsQuery.in("match_id", matchIds);
      } else if (tMatches) {
        predsQuery = predsQuery.in("match_id", ["none"]); // force empty if no matches
      }
    }

    preds = await fetchAllSupabaseRows<any>(predsQuery, "fetchLobbyLeaderboard predictions");
  }

  // 2b. Get longterm predictions of this lobby to aggregate points and determine chosen winners
  let ltQuery = supabase
    .from("longterm_predictions")
    .select("user_id, predicted_participant_id, points_earned")
    .eq("lobby_id", lobbyId)
    .eq("prediction_type", "tournament_winner");

  if (tournamentId) {
    ltQuery = ltQuery.eq("tournament_id", tournamentId);
  }

  const { data: ltPreds, error: ltPredsErr } = await ltQuery;

  if (ltPredsErr) {
    console.warn("Error fetching longterm_predictions, skipping:", ltPredsErr);
  }

  const ltWinnerMap = new Map<string, string>();
  const ltPointsMap = new Map<string, number>();
  ltPreds?.forEach(lp => {
    ltWinnerMap.set(lp.user_id, lp.predicted_participant_id);
    ltPointsMap.set(lp.user_id, lp.points_earned || 0);
  });

  const userPointsMap = new Map<string, { total: number; exact: number; outcome: number }>();
  preds?.forEach(p => {
    const curr = userPointsMap.get(p.user_id) || { total: 0, exact: 0, outcome: 0 };
    const rawMatch = (p as any).match;
    const match = Array.isArray(rawMatch) ? rawMatch[0] : rawMatch;
    const hasFinishedScore = match?.home_score !== null &&
      match?.away_score !== null &&
      match?.home_score !== undefined &&
      match?.away_score !== undefined;
    const points = hasFinishedScore
      ? calculatePoints(
          p.predicted_home_score,
          p.predicted_away_score,
          match.home_score,
          match.away_score,
          match.tournament_id === "ms-hockey-2026" ? "hockey" : "football"
        )
      : (p.points_earned || 0);

    curr.total += points;
    if (points === 5) curr.exact++;
    else if (points > 0) curr.outcome++;
    userPointsMap.set(p.user_id, curr);
  });

  ltPointsMap.forEach((pts, uid) => {
    const curr = userPointsMap.get(uid) || { total: 0, exact: 0, outcome: 0 };
    curr.total += pts;
    userPointsMap.set(uid, curr);
  });

  const resolved: Player[] = (members || []).map(m => {
    const rawProf = m.profile as any;
    const prof = Array.isArray(rawProf) ? rawProf[0] : rawProf;
    const rawLobby = (m as any).lobby;
    const lobby = Array.isArray(rawLobby) ? rawLobby[0] : rawLobby;
    const stats = userPointsMap.get(m.user_id) || { total: 0, exact: 0, outcome: 0 };

    return {
      id: m.user_id,
      username: prof?.username || "Tipující",
      role: prof?.role || "player",
      lobby_role: lobby?.owner_id === m.user_id
        ? "owner"
        : (m.role === "admin" ? "admin" : "member"),
      avatar_emoji: prof?.avatar_emoji || "😀",
      avatar_bg: prof?.avatar_bg || "#fee2e2",
      tournament_winner_id: ltWinnerMap.get(m.user_id) || undefined,
      total_points: stats.total,
      exact_hits: stats.exact,
      outcome_hits: stats.outcome
    };
  });

  // Sort by points desc, exact hits desc, and name asc
  resolved.sort((a, b) => b.total_points! - a.total_points! || b.exact_hits! - a.exact_hits! || a.username.localeCompare(b.username));

  return resolved;
};

/**
 * Pick tournament winner in longterm_predictions
 */
export const pickTournamentWinner = async (
  userId: string,
  participantId: string,
  lobbyId?: string,
  tournamentId?: string
) => {
  const targetLobbyId = lobbyId || "global-hockey-lobby";
  const targetTournamentId = tournamentId || "fifa-world-cup-2026";

  // Lock rule: Tip na vítěze se zamyká při začátku prvního zápasu
  const { data: firstMatch, error: mErr } = await supabase
    .from("matches")
    .select("start_time_utc")
    .eq("tournament_id", targetTournamentId)
    .order("start_time_utc", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (mErr) {
    console.error("Lock validation error:", mErr);
  }

  if (firstMatch) {
    const now = new Date();
    const lockTime = new Date(firstMatch.start_time_utc);
    if (now >= lockTime) {
      throw new Error("Uzamčeno! Tipování pro vítěze turnaje vypršelo se začátkem prvního zápasu.");
    }
  }

  const { error } = await supabase
    .from("longterm_predictions")
    .upsert({
      lobby_id: targetLobbyId,
      tournament_id: targetTournamentId,
      user_id: userId,
      prediction_type: "tournament_winner",
      predicted_participant_id: participantId,
      points_earned: 0,
      updated_at: new Date().toISOString()
    }, {
      onConflict: "lobby_id,tournament_id,user_id,prediction_type"
    });

  if (error) throw error;
};

/**
 * Change profile password (Supabase Auth built-in service)
 */
export const changePassword = async (newPass: string) => {
  const { error } = await supabase.auth.updateUser({ password: newPass });
  if (error) throw error;
};

export const updateProfileUsername = async (userId: string, username: string) => {
  const normalizedUsername = username.trim();
  if (normalizedUsername.length < 2) {
    throw new Error("Zobrazované jméno musí mít alespoň 2 znaky.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ username: normalizedUsername })
    .eq("id", userId);

  if (error) throw error;
};

export const updateProfileAvatar = async (userId: string, avatarEmoji: string, avatarBg: string) => {
  const { error } = await supabase
    .from("profiles")
    .update({
      avatar_emoji: avatarEmoji,
      avatar_bg: avatarBg
    })
    .eq("id", userId);

  if (error) throw error;
};

/**
 * Legacy support / Single user fetch fallback (queries first lobby user has or defaults)
 */
export const fetchAllData = async (userId: string, lobbyId?: string, tournamentId?: string) => {
  // Let's retrieve user's lobbies
  const lobbiesList = await fetchUserLobbies(userId);
  let activeLobbyId = lobbyId;

  // Do not auto-create or auto-select. If no lobbyId provided, return just the lobbies list.
  if (!activeLobbyId) {
    return {
      lobbyId: null,
      lobbyName: "",
      lobbies: lobbiesList,
      matches: [],
      teams: [],
      leaderboard: [],
      allPredictions: []
    };
  }

  // Determine targetTournamentId
  let targetTournamentId = tournamentId;
  const activeLOB = lobbiesList.find(l => l.id === activeLobbyId);
  
  if (!targetTournamentId && activeLOB) {
    const activeTournamentsInLobby = activeLOB.tournaments || [];
    const activeTournObj = activeTournamentsInLobby.find(t => t.status === 'active');
    targetTournamentId = activeTournObj?.tournament_id || activeLOB.tournament_id;
  }

  const {
    lobbyName,
    lobbyShortDescription,
    lobbyLongDescription,
    tournamentId: finalTournamentId,
    matches,
    participants
  } = await fetchLobbyDashboard(activeLobbyId!, userId, targetTournamentId);
  const hydratedLobbiesList = lobbiesList.map(lobby => (
    lobby.id === activeLobbyId
      ? {
          ...lobby,
          short_description: lobbyShortDescription ?? lobby.short_description ?? null,
          long_description: lobbyLongDescription ?? lobby.long_description ?? null
        }
      : lobby
  ));

  const formattedPreds = await fetchFormattedLobbyPredictions(
    activeLobbyId!,
    targetTournamentId,
    matches,
    "fetchAllData predictions"
  );
  const leaderboard = await fetchLobbyLeaderboard(activeLobbyId!, targetTournamentId, formattedPreds);

  // Map participants to Teams interface for compatibility in profile selection
  const teams: Team[] = participants.map(p => ({
    id: p.id,
    name: p.name,
    flag_code: p.flag_code || "🏳️",
    group_name: p.short_name || "A",
    sport_id: p.sport_id || String(p.id).split("-")[0],
    short_name: p.short_name,
    is_final_winner: p.is_final_winner
  }));

  return {
    lobbyId: activeLobbyId,
    lobbyName,
    lobbies: hydratedLobbiesList,
    matches,
    teams,
    leaderboard,
    allPredictions: formattedPreds
  };
};

const fetchFormattedLobbyPredictions = async (
  lobbyId: string,
  tournamentId: string | undefined,
  matches: Match[],
  label: string
): Promise<Prediction[]> => {
  const matchById = new Map(matches.map(match => [match.id, match]));
  const matchIds = matches
    .filter(match => !tournamentId || !match.tournament_id || match.tournament_id === tournamentId)
    .map(match => match.id);

  if (tournamentId && matchIds.length === 0) {
    return [];
  }

  let predsQuery = supabase
    .from("predictions")
    .select("user_id, lobby_id, match_id, predicted_home_score, predicted_away_score, points_earned")
    .eq("lobby_id", lobbyId)
    .order("user_id", { ascending: true })
    .order("lobby_id", { ascending: true })
    .order("match_id", { ascending: true });

  if (matchIds.length > 0) {
    predsQuery = predsQuery.in("match_id", matchIds);
  }

  const allPreds = await fetchAllSupabaseRows<any>(predsQuery, label);

  return (allPreds || []).map(p => {
    const match = matchById.get(p.match_id);
    return {
      player_id: p.user_id,
      match_id: p.match_id,
      predicted_home_score: p.predicted_home_score,
      predicted_away_score: p.predicted_away_score,
      points_earned: p.points_earned,
      home_score: match?.home_score,
      away_score: match?.away_score,
      start_time_utc: match?.start_time_utc,
      tournament_id: match?.tournament_id
    } as Prediction;
  });
};

export const fetchCriticalAppData = async (userId: string, lobbyId?: string, tournamentId?: string) => {
  const lobbiesList = await fetchUserLobbies(userId);
  let activeLobbyId = lobbyId;

  if (!activeLobbyId) {
    return {
      lobbyId: null,
      lobbyName: "",
      tournamentId: null,
      lobbies: lobbiesList,
      matches: [],
      teams: []
    };
  }

  let targetTournamentId = tournamentId;
  const activeLOB = lobbiesList.find(l => l.id === activeLobbyId);

  if (!targetTournamentId && activeLOB) {
    const activeTournamentsInLobby = activeLOB.tournaments || [];
    const activeTournObj = activeTournamentsInLobby.find(t => t.status === 'active');
    targetTournamentId = activeTournObj?.tournament_id || activeLOB.tournament_id;
  }

  const {
    lobbyName,
    lobbyShortDescription,
    lobbyLongDescription,
    tournamentId: finalTournamentId,
    matches,
    participants
  } = await fetchLobbyDashboard(activeLobbyId, userId, targetTournamentId);

  const hydratedLobbiesList = lobbiesList.map(lobby => (
    lobby.id === activeLobbyId
      ? {
          ...lobby,
          short_description: lobbyShortDescription ?? lobby.short_description ?? null,
          long_description: lobbyLongDescription ?? lobby.long_description ?? null
        }
      : lobby
  ));

  const teams: Team[] = participants.map(p => ({
    id: p.id,
    name: p.name,
    flag_code: p.flag_code || "🏳️",
    group_name: p.short_name || "A",
    sport_id: p.sport_id || String(p.id).split("-")[0],
    short_name: p.short_name,
    is_final_winner: p.is_final_winner
  }));

  return {
    lobbyId: activeLobbyId,
    lobbyName,
    tournamentId: finalTournamentId,
    lobbies: hydratedLobbiesList,
    matches,
    teams
  };
};

export const fetchDeferredAppData = async (lobbyId: string, tournamentId: string | undefined, matches: Match[]) => {
  const allPredictions = await fetchFormattedLobbyPredictions(lobbyId, tournamentId, matches, "fetchDeferredAppData predictions");
  const leaderboard = await fetchLobbyLeaderboard(lobbyId, tournamentId, allPredictions);

  return {
    leaderboard,
    allPredictions
  };
};

/**
 * Admin: Update match score and recalculate points of corresponding predictions (FÁZE S11)
 */
export const updateMatchResult = async (matchId: string, homeScore: number, awayScore: number) => {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const response = await fetch("/api/admin/match-result", {
    method: "POST",
    headers,
    body: JSON.stringify({
      matchId,
      homeScore,
      awayScore
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Nepodařilo se uložit výsledek zápasu.");
  }
  return data;
};

/**
 * Admin: Declare absolute final winner of tournament
 */
export const setTournamentWinner = async (
  participantId: string,
  tournamentId: string = "fifa-world-cup-2026",
  options: { confirm?: boolean; previewOnly?: boolean } = {}
) => {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const response = await fetch("/api/admin/set-tournament-winner", {
    method: "POST",
    headers,
    body: JSON.stringify({
      teamId: participantId,
      tournamentId,
      confirm: options.confirm === true,
      previewOnly: options.previewOnly === true
    })
  });

  const data = await response.json().catch(() => ({
    error: "Server nevrátil platnou JSON odpověď."
  }));
  if (!response.ok) {
    throw new Error(data.error || "Nepodařilo se uložit vítěze turnaje.");
  }
  return data;
};

/**
 * Update Lobby name (Owner only - enforced by API/app logic context)
 */
export const updateLobbyName = async (lobbyId: string, newName: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Chybí přihlášení uživatele.");

  const response = await fetch("/api/lobby/update-name", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ lobbyId, newName })
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "Nepodařilo se přejmenovat lobby.");
  }
};

export const updateLobbyDetails = async (
  _userId: string,
  lobbyId: string,
  name: string,
  shortDescription: string,
  longDescription: string
) => {
  const { error } = await supabase
    .from("lobbies")
    .update({
      name: name.trim(),
      short_description: shortDescription.trim() || null,
      long_description: longDescription.trim() || null
    })
    .eq("id", lobbyId);

  if (error) {
    throw new Error(error.message || "Nepodařilo se uložit nastavení lobby.");
  }
};

/**
 * Delete Lobby (Owner only - enforced by API/app logic context)
 * Attempts manual cleanup to avoid FK constraint errors if cascade is missing.
 */
export const deleteLobby = async (lobbyId: string) => {
  // 1. Delete longterm_predictions
  await supabase.from("longterm_predictions").delete().eq("lobby_id", lobbyId);
  // 2. Delete predictions
  await supabase.from("predictions").delete().eq("lobby_id", lobbyId);
  // 3. Delete lobby_tournaments
  await supabase.from("lobby_tournaments").delete().eq("lobby_id", lobbyId);
  // 4. Delete lobby itself. lobby_members is removed by the FK cascade.
  const { error } = await supabase.from("lobbies").delete().eq("id", lobbyId);
  if (error) throw error;
};
