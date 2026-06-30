import { supabase } from "./supabase.ts";
import { calculatePoints } from "./scoring.ts";
import { isDrawPrediction, isFootballKnockoutStage } from "./matchRules.ts";
import { Player, Team, Match, Prediction, Lobby, TournamentParticipant } from "../types.ts";

/**
 * Direct check of active session.
 * Used on app mount to restore user profile.
 */
export const checkSession = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session || !session.user) return null;
  
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .maybeSingle();

  if (!profile) return null;

  return {
    id: profile.id,
    username: profile.username,
    role: profile.role || "player",
    tournament_winner_id: profile.tournament_winner_id,
    avatar_emoji: profile.avatar_emoji || "😀",
    avatar_bg: profile.avatar_bg || "#fee2e2"
  } as Player;
};

/**
 * Sign In
 */
export const loginUser = async (emailOrUsername: string, pass: string) => {
  const login = emailOrUsername.trim();
  const normalizedUsername = login.toLowerCase().replace(/\s+/g, "");
  const loginEmails = login.includes("@")
    ? [login]
    : [
        `${normalizedUsername}@tipovacka.local`,
        `${normalizedUsername}@tipovacka.cz`
      ];

  let authData = null;
  let authError = null;

  for (const email of loginEmails) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: pass
    });

    if (!error && data.user) {
      authData = data;
      authError = null;
      break;
    }

    authError = error;
  }

  if (authError) throw authError;
  if (!authData?.user) throw new Error("Chyba při přihlašování.");

  // Fetch corresponding profile
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", authData.user.id)
    .single();

  if (pErr) {
    return {
      id: authData.user.id,
      username: authData.user.user_metadata?.username || authData.user.email?.split("@")[0] || "Hráč",
      role: "player",
      avatar_emoji: "😀",
      avatar_bg: "#fee2e2"
    } as Player;
  }

  return {
    id: profile.id,
    username: profile.username,
    role: profile.role || "player",
    tournament_winner_id: profile.tournament_winner_id,
    avatar_emoji: profile.avatar_emoji || "😀",
    avatar_bg: profile.avatar_bg || "#fee2e2"
  } as Player;
};

/**
 * Sign Up / Registration
 */
export const registerUser = async (username: string, pass: string, adminId?: string, emailParam?: string) => {
  // If registered by admin, we could handle differently, but here we can register standard users.
  // Note: Supabase requires an email. Therefore, we construct a dummy or virtual email if the input is a simple string without '@'.
  let email = emailParam || username;
  if (!email.includes("@")) {
    email = `${email.toLowerCase().replace(/\s+/g, "")}@tipovacka.cz`;
  }
  
  const { data, error } = await supabase.auth.signUp({
    email,
    password: pass,
    options: {
      data: {
        username: username
      }
    }
  });

  if (error) throw error;
  if (!data.user) throw new Error("Registrace se nezdařila.");

  const trimmedUsername = username.trim();
  if (trimmedUsername) {
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("role, avatar_emoji, avatar_bg")
      .eq("id", data.user.id)
      .maybeSingle();

    const { error: upsertErr } = await supabase
      .from("profiles")
      .upsert({
        id: data.user.id,
        username: trimmedUsername,
        role: existingProfile?.role || "player",
        avatar_emoji: existingProfile?.avatar_emoji || "😀",
        avatar_bg: existingProfile?.avatar_bg || "#fee2e2"
      });
      
    if (upsertErr) {
      console.error("Chyba při aktualizaci profilu:", upsertErr);
      throw new Error("Nepodařilo se uložit uživatelské jméno.");
    }
  }

  return {
    id: data.user.id,
    username: trimmedUsername || username,
    role: "player",
    avatar_emoji: "😀",
    avatar_bg: "#fee2e2",
    tournament_winner_id: undefined
  } as Player;
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
 * Fetch tournament participants for a given tournament (FÁZE F6.1)
 */
export const fetchTournamentParticipants = async (tournamentId: string): Promise<TournamentParticipant[]> => {
  const { data, error } = await supabase
    .from("tournament_participants")
    .select("*")
    .eq("tournament_id", tournamentId);
  if (error) throw error;
  return data || [];
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
      .eq("user_id", userId);

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
      .eq("user_id", userId);
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
        tournaments
      });
    }
  });

  return formatted;
};

/**
 * Create new lobby and auto-enroll owner (FÁZE S7)
 */
export const createLobby = async (
  userId: string,
  name: string,
  tournamentId: string,
  visibility: 'private' | 'public' = 'public',
  shortDescription = "",
  longDescription = ""
) => {
  // Generate random unique 8-character code
  const joinCode = Math.random().toString(36).substring(2, 10).toUpperCase();
  const lobbyId = "lobby-" + Math.random().toString(36).substring(2, 10);

  // 1. Create the lobby
  const { error: lobbyErr } = await supabase
    .from("lobbies")
    .insert({
      id: lobbyId,
      name,
      owner_id: userId,
      tournament_id: tournamentId,
      short_description: shortDescription.trim() || null,
      long_description: longDescription.trim() || null,
      join_code: joinCode,
      visibility
    });

  if (lobbyErr) throw lobbyErr;

  // Keep the Supabase lobby_tournaments relation in sync with the created lobby.
  const { error: ltErr } = await supabase
    .from("lobby_tournaments")
    .insert({
      lobby_id: lobbyId,
      tournament_id: tournamentId,
      status: 'active'
    });
    
  if (ltErr) {
    console.warn("Creating lobby_tournaments relation failed (migration might be missing):", ltErr);
  }

  const lobby = {
    id: lobbyId,
    name,
    owner_id: userId,
    tournament_id: tournamentId,
    short_description: shortDescription.trim() || null,
    long_description: longDescription.trim() || null,
    join_code: joinCode,
    visibility
  };

  // 2. Add owner as member
  const { error: lmErr } = await supabase
    .from("lobby_members")
    .insert({
      lobby_id: lobbyId,
      user_id: userId,
      role: "owner"
    });

  if (lmErr) throw lmErr;

  return {
    ...lobby,
    tournament_name: tournamentId === "fifa-world-cup-2026" ? "FIFA World Cup 2026" : "MS v Hokeji 2026",
    is_owner: true
  } as Lobby;
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
 * Join Lobby by invitation join code (FÁZE S8)
 */
export const joinLobbyByCode = async (userId: string, joinCode: string) => {
  const upperCode = joinCode.trim().toUpperCase();

  // 1. Find lobby
  const { data: lobby, error: lobbyErr } = await supabase
    .from("lobbies")
    .select(`
      id,
      name,
      owner_id,
      tournament_id,
      join_code,
      visibility,
      tournament:tournaments (
        name
      )
    `)
    .eq("join_code", upperCode)
    .maybeSingle();

  if (lobbyErr) throw lobbyErr;
  if (!lobby) throw new Error("Žádná lobby s tímto kódem neexistuje.");

  const lob = lobby as any;

  // 2. Check if already a member
  const { data: membership, error: mErr } = await supabase
    .from("lobby_members")
    .select("id")
    .eq("lobby_id", lob.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (mErr) throw mErr;
  if (membership) {
    return {
      id: lob.id,
      name: lob.name,
      owner_id: lob.owner_id,
      tournament_id: lob.tournament_id,
      join_code: lob.join_code,
      visibility: lob.visibility,
      tournament_name: lob.tournament?.name || ""
    };
  }

  // 3. Insert membership
  const { error: joinErr } = await supabase
    .from("lobby_members")
    .insert({
      lobby_id: lob.id,
      user_id: userId,
      role: "member"
    });

  if (joinErr) throw joinErr;

  return {
    id: lob.id,
    name: lob.name,
    owner_id: lob.owner_id,
    tournament_id: lob.tournament_id,
    join_code: lob.join_code,
    visibility: lob.visibility,
    tournament_name: lob.tournament?.name || "FIFA World Cup 2026",
    is_owner: false
  } as Lobby;
};

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
            status
          )
        )
      `)
      .eq("id", lobbyId)
      .single();

    if (lobbyErr) throw lobbyErr;
    lobby = data;
    tournamentId = explicitTournamentId || lobby.tournament_id;
    lobbyName = lobby.name;
    actualWinnerId = (lobby as any)?.tournament?.actual_tournament_winner_id || null;
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
  
  // Fetch tournament_participants for this tournament
  const { data: tpData, error: tpErr } = await supabase
    .from("tournament_participants")
    .select("participant_id")
    .eq("tournament_id", tournamentId);
    
  if (tpErr) {
    console.warn("Could not fetch tournament_participants. Error/Missing table:", tpErr);
  }
  
  const tpSet = new Set(tpData?.map((tp: any) => tp.participant_id) || []);
  
  console.log("DEBUG fetchLobbyDashboard:", {
    tournamentId,
    participants_raw_length: participants?.length,
    tournament_participants_length: tpData?.length,
    tpSet_size: tpSet.size
  });

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

  // 5. Query prediction counts per match inside this lobby
  const { data: totalPredsCountList } = await supabase
    .from("predictions")
    .select("match_id")
    .eq("lobby_id", lobbyId);

  const statsMap = new Map<string, number>();
  totalPredsCountList?.forEach(pred => {
    statsMap.set(pred.match_id, (statsMap.get(pred.match_id) || 0) + 1);
  });

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
export const fetchLobbyLeaderboard = async (lobbyId: string, tournamentId?: string) => {
  // 1. Get all members of the lobby
  const { data: members, error: mErr } = await supabase
    .from("lobby_members")
    .select(`
      user_id,
      role,
      profile:profiles (
        username,
        role,
        avatar_emoji,
        avatar_bg
      )
    `)
    .eq("lobby_id", lobbyId);

  if (mErr) throw mErr;

  // 2. Get predictions of this lobby to count earned points
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
    .eq("lobby_id", lobbyId);

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

  const { data: preds, error: predsErr } = await predsQuery;
  if (predsErr) throw predsErr;

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
    const stats = userPointsMap.get(m.user_id) || { total: 0, exact: 0, outcome: 0 };

    return {
      id: m.user_id,
      username: prof?.username || "Tipující",
      role: prof?.role || "player",
      lobby_role: m.role || "member",
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
export const changePassword = async (userId: string, newPass: string) => {
  const { error } = await supabase.auth.updateUser({ password: newPass });
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
  const leaderboard = await fetchLobbyLeaderboard(activeLobbyId!, targetTournamentId);
  const hydratedLobbiesList = lobbiesList.map(lobby => (
    lobby.id === activeLobbyId
      ? {
          ...lobby,
          short_description: lobbyShortDescription ?? lobby.short_description ?? null,
          long_description: lobbyLongDescription ?? lobby.long_description ?? null
        }
      : lobby
  ));

  // Fetch all predictions in this lobby for streak mathematical evaluations
  let predsQuery = supabase
    .from("predictions")
    .select("*")
    .eq("lobby_id", activeLobbyId);

  if (targetTournamentId) {
    const { data: tMatches } = await supabase
      .from("matches")
      .select("id")
      .eq("tournament_id", targetTournamentId);

    if (tMatches && tMatches.length > 0) {
      const matchIds = tMatches.map(m => m.id);
      predsQuery = predsQuery.in("match_id", matchIds);
    } else if (tMatches) {
      predsQuery = predsQuery.in("match_id", ["none"]); // force empty if no matches
    }
  }

  const { data: allPreds } = await predsQuery;

  const matchById = new Map(matches.map(match => [match.id, match]));
  const formattedPreds: Prediction[] = (allPreds || []).map(p => {
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

/**
 * Admin: Update match score and recalculate points of corresponding predictions (FÁZE S11)
 */
export const updateMatchResult = async (adminUserId: string, matchId: string, homeScore: number, awayScore: number) => {
  const response = await fetch("/api/admin/match-result", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      userId: adminUserId,
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
export const setTournamentWinner = async (adminUserId: string, participantId: string, tournamentId: string = "fifa-world-cup-2026") => {
  const response = await fetch("/api/admin/set-tournament-winner", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      userId: adminUserId,
      teamId: participantId,
      tournamentId
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Nepodařilo se uložit vítěze turnaje.");
  }
  return data;
};

/**
 * Update Lobby name (Owner only - enforced by API/app logic context)
 */
export const updateLobbyName = async (userId: string, lobbyId: string, newName: string) => {
  const response = await fetch("/api/lobby/update-name", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, lobbyId, newName })
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
  // 4. Delete lobby_members
  await supabase.from("lobby_members").delete().eq("lobby_id", lobbyId);
  
  // 5. Delete lobby itself
  const { error } = await supabase.from("lobbies").delete().eq("id", lobbyId);
  if (error) throw error;
};
