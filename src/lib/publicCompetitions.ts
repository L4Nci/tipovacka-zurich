import { supabase } from './supabase.ts';

export type PublicCompetition = {
  slug: string;
  name: string;
  tournament_id: string;
  tournament_name: string;
  sport_id: string;
  format: 'score' | 'mma';
  status: 'open' | 'upcoming' | 'closed';
  next_lock_at: string | null;
  participant_count: number;
  is_member: boolean;
};

export type PublicCompetitionJoin = {
  slug: string;
  lobby_id: string;
  tournament_id: string;
  membership_state: 'joined' | 'rejoined' | 'already_member';
} | { slug: string; membership_state: 'removed' };

export const isPublicCompetitionSlug = (value: unknown): value is string => (
  typeof value === 'string' && value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
);

export function normalizePublicCompetition(value: unknown): PublicCompetition {
  const item = value as Record<string, unknown> | null;
  if (!item || !isPublicCompetitionSlug(item.slug) ||
      typeof item.name !== 'string' || typeof item.tournament_id !== 'string' ||
      typeof item.tournament_name !== 'string' || typeof item.sport_id !== 'string' ||
      !['score', 'mma'].includes(String(item.format)) ||
      !['open', 'upcoming', 'closed'].includes(String(item.status)) ||
      !(item.next_lock_at === null || typeof item.next_lock_at === 'string' && Number.isFinite(Date.parse(item.next_lock_at))) ||
      typeof item.participant_count !== 'number' || !Number.isSafeInteger(item.participant_count) || item.participant_count < 0 ||
      typeof item.is_member !== 'boolean') {
    throw new Error('Invalid public competition response.');
  }
  // Explicit projection keeps private registry fields out of frontend state.
  return {
    slug: item.slug, name: item.name, tournament_id: item.tournament_id,
    tournament_name: item.tournament_name, sport_id: item.sport_id,
    format: item.format as PublicCompetition['format'], status: item.status as PublicCompetition['status'],
    next_lock_at: item.next_lock_at as string | null, participant_count: item.participant_count,
    is_member: item.is_member,
  };
}

export async function fetchPublicCompetitions(): Promise<PublicCompetition[]> {
  const { data, error } = await supabase.rpc('get_public_competitions').abortSignal(AbortSignal.timeout(10_000));
  // A source-only rollout must leave the existing private game usable.
  if (error?.code === 'PGRST202' || error?.code === '42883') return [];
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Invalid public competition catalog.');
  return data.map(normalizePublicCompetition);
}

export async function joinPublicCompetition(slug: string): Promise<PublicCompetitionJoin> {
  if (!isPublicCompetitionSlug(slug)) throw new Error('Invalid competition slug.');
  const { data, error } = await supabase.rpc('join_public_competition', { p_slug: slug }).abortSignal(AbortSignal.timeout(15_000));
  if (error) throw error;
  const item = data as Record<string, unknown> | null;
  if (item?.slug === slug && item.membership_state === 'removed') return { slug, membership_state: 'removed' };
  if (!item || item.slug !== slug || typeof item.lobby_id !== 'string' || typeof item.tournament_id !== 'string' ||
      !['joined', 'rejoined', 'already_member'].includes(String(item.membership_state))) {
    throw new Error('Invalid competition participation response.');
  }
  return { slug, lobby_id: item.lobby_id, tournament_id: item.tournament_id,
    membership_state: item.membership_state as 'joined' | 'rejoined' | 'already_member' };
}
