import assert from 'node:assert/strict';
import {
  canChangeJoinPolicy,
  canRemoveLobbyMember,
  canResolveJoinRequests,
  canRestoreLobbyMember,
  getManagementRequestCount,
  hasPendingMembershipRequest,
  shouldRefreshHomeMembership
} from './membership.ts';
import type { LobbyMember, MembershipHomeItem } from '../types.ts';

const member: LobbyMember = {
  id: 'membership-member',
  user_id: 'member-user',
  username: 'Member',
  role: 'player',
  lobby_role: 'member',
  membership_status: 'active',
  joined_at: '2026-01-01T00:00:00.000Z'
};

const admin: LobbyMember = {
  ...member,
  id: 'membership-admin',
  user_id: 'admin-user',
  username: 'Admin',
  lobby_role: 'admin'
};

const owner: LobbyMember = {
  ...member,
  id: 'membership-owner',
  user_id: 'owner-user',
  username: 'Owner',
  lobby_role: 'owner'
};

assert.equal(canResolveJoinRequests('owner'), true);
assert.equal(canResolveJoinRequests('admin'), true);
assert.equal(canResolveJoinRequests('member'), false);
assert.equal(canChangeJoinPolicy('owner'), true);
assert.equal(canChangeJoinPolicy('admin'), false);

assert.equal(canRemoveLobbyMember('admin', 'admin-user', member), true);
assert.equal(canRemoveLobbyMember('admin', 'admin-user', admin), false);
assert.equal(canRemoveLobbyMember('admin', 'admin-user', owner), false);
assert.equal(canRemoveLobbyMember('owner', 'owner-user', admin), true);
assert.equal(canRemoveLobbyMember('owner', 'owner-user', owner), false);

assert.equal(
  canRestoreLobbyMember('owner', { ...member, membership_status: 'removed' }),
  true
);
assert.equal(
  canRestoreLobbyMember('admin', { ...member, membership_status: 'removed' }),
  false
);

const homeItems: MembershipHomeItem[] = [
  {
    item_type: 'join_request',
    lobby_id: 'lobby-1',
    lobby_name: 'Lobby 1',
    lobby_role: null,
    join_policy: 'approval_required',
    request_id: 'request-1',
    request_status: 'pending',
    membership_status: null,
    pending_request_count: 0,
    event_at: '2026-01-01T00:00:00.000Z'
  },
  {
    item_type: 'management',
    lobby_id: 'lobby-2',
    lobby_name: 'Lobby 2',
    lobby_role: 'owner',
    join_policy: 'approval_required',
    request_id: null,
    request_status: null,
    membership_status: null,
    pending_request_count: 2,
    event_at: '2026-01-01T00:00:00.000Z'
  }
];

assert.equal(hasPendingMembershipRequest(homeItems), true);
assert.equal(getManagementRequestCount(homeItems, 'lobby-2'), 2);
assert.equal(getManagementRequestCount(homeItems, 'lobby-missing'), 0);

const homeRefreshContext = {
  hasAuthenticatedUser: true,
  loading: false,
  refreshing: false,
  activeLobbyId: null,
  activeTab: 'matches',
  visibilityState: 'visible' as DocumentVisibilityState
};

assert.equal(shouldRefreshHomeMembership({ ...homeRefreshContext, trigger: 'home-return' }), true);
assert.equal(shouldRefreshHomeMembership({ ...homeRefreshContext, trigger: 'focus' }), true);
assert.equal(shouldRefreshHomeMembership({ ...homeRefreshContext, trigger: 'visibility' }), true);
assert.equal(shouldRefreshHomeMembership({ ...homeRefreshContext, trigger: 'local-mutation' }), true);
assert.equal(shouldRefreshHomeMembership({
  ...homeRefreshContext,
  trigger: 'visibility',
  visibilityState: 'hidden'
}), false);
assert.equal(shouldRefreshHomeMembership({
  ...homeRefreshContext,
  trigger: 'focus',
  activeLobbyId: 'lobby-1'
}), false);
assert.equal(shouldRefreshHomeMembership({
  ...homeRefreshContext,
  trigger: 'home-return',
  activeTab: 'profile'
}), false);
assert.equal(shouldRefreshHomeMembership({
  ...homeRefreshContext,
  trigger: 'focus',
  hasAuthenticatedUser: false
}), false);
assert.equal(shouldRefreshHomeMembership({
  ...homeRefreshContext,
  trigger: 'focus',
  refreshing: true
}), false);

console.log('Membership community scenarios passed.');
