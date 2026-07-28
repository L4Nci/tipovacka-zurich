import React from 'react';
import {
  Check,
  LogOut,
  RotateCcw,
  UserMinus,
  Users,
  X
} from 'lucide-react';
import type { LobbyJoinRequest, LobbyMember, Player } from '../types.ts';
import {
  canChangeJoinPolicy,
  canRemoveLobbyMember,
  canResolveJoinRequests,
  canRestoreLobbyMember,
  type CommunityViewerRole
} from '../lib/membership.ts';

type UserAvatarComponent = React.ComponentType<{
  player?: Pick<Player, 'username' | 'avatar_emoji' | 'avatar_bg'> | null;
  size?: 'sm' | 'md' | 'lg';
}>;

type Props = {
  activeMemberCount: number | null;
  communityProfilesEnabled: boolean;
  joinPolicy: 'open' | 'approval_required';
  lang: 'cz' | 'en';
  loading: boolean;
  members: LobbyMember[];
  membershipActionId: string | null;
  membershipError: string;
  pendingRequests: LobbyJoinRequest[];
  user: Player;
  viewerRole: CommunityViewerRole;
  UserAvatar: UserAvatarComponent;
  onChangeJoinPolicy: (policy: 'open' | 'approval_required') => void;
  onClose: () => void;
  onLeave: () => void;
  onOpenPlayer: (userId: string) => void;
  onRemove: (member: LobbyMember) => void;
  onResolveRequest: (request: LobbyJoinRequest, decision: 'approved' | 'rejected') => void;
  onRestore: (member: LobbyMember) => void;
  onRetry: () => void;
};

export default function LobbyMembersDialog({
  activeMemberCount,
  communityProfilesEnabled,
  joinPolicy,
  lang,
  loading,
  members,
  membershipActionId,
  membershipError,
  pendingRequests,
  user,
  viewerRole,
  UserAvatar,
  onChangeJoinPolicy,
  onClose,
  onLeave,
  onOpenPlayer,
  onRemove,
  onResolveRequest,
  onRestore,
  onRetry
}: Props) {
  const canLeave = viewerRole !== 'owner'
    && viewerRole !== 'platform_admin'
    && members.some(member => (
      member.user_id === user.id && member.membership_status === 'active'
    ));

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/40 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={lang === 'cz' ? 'Členové lobby' : 'Lobby members'}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500">
              <Users className="h-4 w-4" />
              {lang === 'cz' ? 'Členové' : 'Members'}
            </h2>
            <p className="mt-1 text-[10px] font-semibold text-slate-400">
              {loading
                ? (lang === 'cz' ? 'Načítám členy…' : 'Loading members…')
                : `${activeMemberCount ?? 0} ${lang === 'cz' ? 'aktivních členů' : 'active members'}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-500"
            aria-label={lang === 'cz' ? 'Zavřít členy' : 'Close members'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {membershipError && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-[10px] font-bold text-red-600">
            <span>{membershipError}</span>
            <button type="button" onClick={onRetry} className="shrink-0 underline">
              {lang === 'cz' ? 'Zkusit znovu' : 'Retry'}
            </button>
          </div>
        )}

        {canChangeJoinPolicy(viewerRole) && !loading && (
          <fieldset className="mt-5 border-t border-slate-100 pt-4" disabled={membershipActionId === 'join-policy'}>
            <legend className="mb-2 text-[9px] font-black uppercase text-slate-400">
              {lang === 'cz' ? 'Způsob vstupu' : 'Join policy'}
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {([
                ['open', lang === 'cz' ? 'Okamžitý vstup' : 'Immediate entry', lang === 'cz' ? 'Každý s kódem se připojí ihned.' : 'Anyone with the code joins immediately.'],
                ['approval_required', lang === 'cz' ? 'Vstup po schválení' : 'Approval required', lang === 'cz' ? 'Žádost potvrdí majitel nebo admin.' : 'The owner or an admin approves each request.']
              ] as const).map(([value, label, description]) => (
                <label key={value} className={`rounded-xl border p-3 ${joinPolicy === value ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'}`}>
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="lobby-join-policy"
                      checked={joinPolicy === value}
                      onChange={() => onChangeJoinPolicy(value)}
                    />
                    <span className="text-[10px] font-black uppercase text-slate-700">{label}</span>
                  </span>
                  <span className="mt-1 block text-[10px] font-medium text-slate-500">{description}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {canResolveJoinRequests(viewerRole) && !loading && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="text-[9px] font-black uppercase text-slate-400">
              {lang === 'cz' ? 'Žádosti' : 'Requests'}
            </h3>
            {pendingRequests.length > 0 ? (
              <div className="mt-2 space-y-2">
                {pendingRequests.map(request => (
                  <div key={request.id} className="flex items-center gap-3 rounded-2xl bg-amber-50 p-3">
                    <UserAvatar player={request} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-slate-800">{request.username}</p>
                      <p className="text-[9px] font-bold uppercase text-amber-600">
                        {lang === 'cz' ? 'Čeká na schválení' : 'Awaiting approval'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onResolveRequest(request, 'approved')}
                      disabled={membershipActionId === request.id}
                      title={lang === 'cz' ? 'Schválit' : 'Approve'}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onResolveRequest(request, 'rejected')}
                      disabled={membershipActionId === request.id}
                      title={lang === 'cz' ? 'Zamítnout' : 'Reject'}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-red-500 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[10px] font-medium text-slate-400">
                {lang === 'cz' ? 'Žádné čekající žádosti.' : 'No pending requests.'}
              </p>
            )}
          </div>
        )}

        {!loading && members.length > 0 && (
          <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
            {members.map(member => {
              const isOwner = member.lobby_role === 'owner';
              const roleLabel = isOwner
                ? (lang === 'cz' ? 'Majitel' : 'Owner')
                : member.lobby_role === 'admin'
                  ? 'Admin'
                  : (lang === 'cz' ? 'Člen' : 'Member');
              const statusLabel = member.membership_status === 'active'
                ? (lang === 'cz' ? 'Aktivní' : 'Active')
                : member.membership_status === 'removed'
                  ? (lang === 'cz' ? 'Odebraný člen' : 'Removed')
                  : (lang === 'cz' ? 'Odešel' : 'Left');

              return (
                <div key={member.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                  <UserAvatar player={member} size="sm" />
                  <button
                    type="button"
                    disabled={!communityProfilesEnabled}
                    onClick={() => onOpenPlayer(member.user_id)}
                    className="min-w-0 flex-1 text-left disabled:cursor-default"
                  >
                    <p className="truncate text-sm font-black text-slate-800">{member.username}</p>
                    <p className="text-[9px] font-bold uppercase text-slate-400">
                      {roleLabel} · {statusLabel}
                    </p>
                  </button>
                  {canRemoveLobbyMember(viewerRole, user.id, member) && (
                    <button
                      type="button"
                      onClick={() => onRemove(member)}
                      disabled={membershipActionId === member.user_id}
                      title={lang === 'cz' ? 'Odebrat člena' : 'Remove member'}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-red-500 shadow-sm disabled:opacity-50"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  )}
                  {canRestoreLobbyMember(viewerRole, member) && (
                    <button
                      type="button"
                      onClick={() => onRestore(member)}
                      disabled={membershipActionId === member.user_id}
                      title={lang === 'cz' ? 'Obnovit přístup' : 'Restore access'}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm disabled:opacity-50"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {canLeave && (
          <button
            type="button"
            onClick={onLeave}
            disabled={membershipActionId === user.id}
            className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 text-[10px] font-black uppercase text-red-600 disabled:opacity-60"
          >
            <LogOut className="h-3.5 w-3.5" />
            {lang === 'cz' ? 'Opustit lobby' : 'Leave lobby'}
          </button>
        )}
      </section>
    </div>
  );
}
