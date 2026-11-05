import { supabase } from './supabase.ts';
import type {
  AdminOperationsSummary,
  BadgeOverview,
  CommunityProfile,
  LobbyPrizeEntry,
  LobbyTournamentCatalogItem,
  ProductFeatureFlags
} from '../types.ts';

const missingRpcCodes = new Set(['42883', 'PGRST202']);

const isMissingRpc = (error: { code?: string } | null) => (
  Boolean(error?.code && missingRpcCodes.has(error.code))
);

const emptyFlags: ProductFeatureFlags = {};

export const fetchProductFeatureFlags = async (): Promise<ProductFeatureFlags> => {
  const { data, error } = await supabase.rpc('get_public_feature_flags');
  if (isMissingRpc(error)) return emptyFlags;
  if (error) throw error;
  return (data || emptyFlags) as ProductFeatureFlags;
};

export const isProductFeatureEnabled = (
  flags: ProductFeatureFlags,
  key: string
) => Boolean(flags[key]?.enabled);

export const fetchMyProfileOverview = async (): Promise<CommunityProfile | null> => {
  const { data, error } = await supabase.rpc('get_my_profile_overview');
  if (isMissingRpc(error)) return null;
  if (error) throw error;
  return data as CommunityProfile;
};

export const fetchCommunityProfile = async (
  userId: string,
  lobbyId?: string
): Promise<CommunityProfile | null> => {
  const { data, error } = await supabase.rpc('get_profile_summary', {
    target_user_id: userId,
    lobby_id_param: lobbyId || null
  });
  if (isMissingRpc(error)) return null;
  if (error) throw error;
  return data as CommunityProfile;
};

export const updateMyCommunityProfile = async (
  bio: string,
  visibility: 'private' | 'public'
) => {
  const { data, error } = await supabase.rpc('update_my_community_profile', {
    bio_param: bio,
    visibility_param: visibility
  });
  if (error) throw error;
  return data as { bio: string | null; profile_visibility: 'private' | 'public' };
};

export const reconcileMyAchievements = async () => {
  const { data, error } = await supabase.rpc('reconcile_my_achievements');
  if (isMissingRpc(error)) return null;
  if (error) throw error;
  return data as Record<string, number>;
};

export const fetchUserBadges = async (userId: string): Promise<BadgeOverview> => {
  const { data, error } = await supabase.rpc('get_user_badges', {
    target_user_id: userId
  });
  if (isMissingRpc(error)) return { badges: [], progress: [] };
  if (error) throw error;
  return (data || { badges: [], progress: [] }) as BadgeOverview;
};

export const setFeaturedBadges = async (badgeIds: string[]) => {
  const { error } = await supabase.rpc('set_featured_badges', {
    badge_ids: badgeIds
  });
  if (error) throw error;
};

export const fetchLobbyTournamentCatalog = async (
  lobbyId: string
): Promise<LobbyTournamentCatalogItem[]> => {
  const { data, error } = await supabase.rpc('get_lobby_tournament_catalog', {
    lobby_id_param: lobbyId
  });
  if (isMissingRpc(error)) return [];
  if (error) throw error;
  return (data || []).map((row: any) => ({
    tournament_id: String(row.tournament_id),
    tournament_name: String(row.tournament_name),
    sport_id: String(row.sport_id),
    relation_status: row.relation_status === 'active' || row.relation_status === 'archived'
      ? row.relation_status
      : null,
    is_linked: Boolean(row.is_linked),
    is_completed: Boolean(row.is_completed),
    match_count: Number(row.match_count) || 0
  }));
};

export const addTournamentToLobbySecure = async (
  lobbyId: string,
  tournamentId: string
) => {
  const { data, error } = await supabase.rpc('add_tournament_to_lobby_secure', {
    lobby_id_param: lobbyId,
    tournament_id_param: tournamentId
  });
  if (error) throw error;
  return String(data || 'active');
};

export const setLobbyTournamentStatus = async (
  lobbyId: string,
  tournamentId: string,
  status: 'active' | 'archived'
) => {
  const { data, error } = await supabase.rpc('set_lobby_tournament_status_secure', {
    lobby_id_param: lobbyId,
    tournament_id_param: tournamentId,
    status_param: status
  });
  if (error) throw error;
  return String(data || status);
};

export const updateLobbyFieldSecure = async (
  lobbyId: string,
  field: 'name' | 'short_description' | 'long_description',
  value: string
) => {
  const { data, error } = await supabase.rpc('update_lobby_field_secure', {
    lobby_id_param: lobbyId,
    field_param: field,
    value_param: value
  });
  if (error) throw error;
  return data as { field: string; value: string | null };
};

export const setLobbyPrizesSecure = async (
  lobbyId: string,
  enabled: boolean,
  entries: LobbyPrizeEntry[]
) => {
  const { data, error } = await supabase.rpc('set_lobby_prizes_secure', {
    lobby_id_param: lobbyId,
    enabled_param: enabled,
    entries_param: entries
  });
  if (error) throw error;
  return data as { enabled: boolean; entries: LobbyPrizeEntry[] };
};

export const fetchAdminOperationsSummary = async (): Promise<AdminOperationsSummary | null> => {
  const { data, error } = await supabase.rpc('get_admin_operations_summary');
  if (isMissingRpc(error)) return null;
  if (error) throw error;
  return data as AdminOperationsSummary;
};
