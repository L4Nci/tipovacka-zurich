import type { LobbyMember, MembershipHomeItem } from '../types.ts';

export type CommunityViewerRole = 'owner' | 'admin' | 'member' | 'platform_admin';

export const canResolveJoinRequests = (viewerRole: CommunityViewerRole) => (
  viewerRole === 'owner' ||
  viewerRole === 'admin' ||
  viewerRole === 'platform_admin'
);

export const canChangeJoinPolicy = (viewerRole: CommunityViewerRole) => (
  viewerRole === 'owner' || viewerRole === 'platform_admin'
);

export const canRemoveLobbyMember = (
  viewerRole: CommunityViewerRole,
  viewerId: string,
  member: LobbyMember
) => {
  if (member.membership_status !== 'active') return false;
  if (member.lobby_role === 'owner') return false;
  if (member.user_id === viewerId) return false;
  if (viewerRole === 'owner' || viewerRole === 'platform_admin') return true;
  return viewerRole === 'admin' && member.lobby_role === 'member';
};

export const canRestoreLobbyMember = (
  viewerRole: CommunityViewerRole,
  member: LobbyMember
) => (
  (viewerRole === 'owner' || viewerRole === 'platform_admin') &&
  member.lobby_role !== 'owner' &&
  member.membership_status === 'removed'
);

export const hasPendingMembershipRequest = (items: MembershipHomeItem[]) => (
  items.some(item => (
    item.item_type === 'join_request' &&
    item.request_status === 'pending'
  ))
);

export const getManagementRequestCount = (
  items: MembershipHomeItem[],
  lobbyId: string
) => (
  items.find(item => item.item_type === 'management' && item.lobby_id === lobbyId)
    ?.pending_request_count || 0
);
