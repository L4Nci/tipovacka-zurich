import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Users, Trophy, ChevronRight, History, Hash, PlusCircle, Pencil, Trash2, X, Check, LogOut, RotateCcw, UserMinus } from 'lucide-react';
import { Lobby, LobbyMember, Player as AppUser, type HallOfFameEntry, type LobbyJoinRequest } from '../types';
import {
  addTournamentToLobby,
  deleteLobby,
  fetchLobbyCommunity,
  leaveLobby,
  removeLobbyMember,
  resolveLobbyJoinRequest,
  restoreLobbyMember,
  setLobbyJoinPolicy,
  updateLobbyDetails
} from '../lib/db';
import {
  canChangeJoinPolicy,
  canRemoveLobbyMember,
  canResolveJoinRequests,
  canRestoreLobbyMember,
  type CommunityViewerRole
} from '../lib/membership';

const rulesStartMarkers = [
  'Pravidla',
  'Pravidlá',
  'Bodování',
  'Bodovani',
  'Scoring',
  'Rules',
  'Tip na celkového vítěze',
  'Tip na celkoveho viteze',
  'Tip na celkového víťaza',
];

const getLobbyRulesText = (longDescription?: string | null) => {
  const longText = longDescription?.trim() || '';

  if (!longText) {
    return '';
  }

  const lowerLongText = longText.toLocaleLowerCase('cs-CZ');
  const markerIndex = rulesStartMarkers
    .map(marker => lowerLongText.indexOf(marker.toLocaleLowerCase('cs-CZ')))
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0];

  if (markerIndex === undefined) {
    return '';
  }

  return longText.slice(markerIndex).trim();
};

interface LobbyViewProps {
  lobby: Lobby;
  user: AppUser;
  onSelectTournament: (tournamentId: string) => void;
  lang: 'cz' | 'en';
  onRefresh?: (updatedLobby?: Partial<Lobby>) => void;
  onLobbyDeleted?: () => void;
  onMembershipEnded?: (lobbyId: string) => void;
  membersCount?: number;
  tournamentStats?: Record<string, {
    total: number;
    scheduled: number;
    finished: number;
    unresolved?: number;
    isCompleted?: boolean;
    championName?: string | null;
    championShortName?: string | null;
    championFlag?: string | null;
    nextStart?: string | null;
    nextMatchLabel?: string | null;
  }>;
}

export function LobbyView({
  lobby,
  user,
  onSelectTournament,
  lang,
  onRefresh,
  onLobbyDeleted,
  onMembershipEnded,
  membersCount,
  tournamentStats = {}
}: LobbyViewProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  
  // Owner controls state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(lobby.name);
  const [editShortDescription, setEditShortDescription] = useState(lobby.short_description || '');
  const [editLongDescription, setEditLongDescription] = useState(lobby.long_description || '');
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRulesExpanded, setIsRulesExpanded] = useState(false);
  const [members, setMembers] = useState<LobbyMember[]>([]);
  const [pendingRequests, setPendingRequests] = useState<LobbyJoinRequest[]>([]);
  const [hallOfFameEntries, setHallOfFameEntries] = useState<HallOfFameEntry[]>([]);
  const [joinPolicy, setJoinPolicy] = useState<'open' | 'approval_required'>(lobby.join_policy || 'open');
  const [viewerRole, setViewerRole] = useState<CommunityViewerRole>(
    user.role === 'admin' ? 'platform_admin' : lobby.is_owner ? 'owner' : lobby.lobby_role === 'admin' ? 'admin' : 'member'
  );
  const [activeMemberCount, setActiveMemberCount] = useState<number | null>(membersCount ?? null);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membershipError, setMembershipError] = useState('');
  const [membershipActionId, setMembershipActionId] = useState<string | null>(null);

  const canEditLobby = Boolean(lobby.is_owner || user.role === 'admin');
  const rulesText = getLobbyRulesText(lobby.long_description);

  const loadCommunity = useCallback(async () => {
    setMembersLoading(true);
    setMembershipError('');
    try {
      const community = await fetchLobbyCommunity(lobby.id);
      setMembers(community.members);
      setPendingRequests(community.pending_requests);
      setHallOfFameEntries(community.hall_of_fame);
      setJoinPolicy(community.join_policy);
      setViewerRole(community.viewer_role);
      setActiveMemberCount(community.active_member_count);
      return community;
    } catch (err: any) {
      setMembershipError(err?.message || (lang === 'cz' ? 'Správu komunity se nepodařilo načíst.' : 'Community management could not be loaded.'));
    } finally {
      setMembersLoading(false);
    }
  }, [lang, lobby.id]);

  useEffect(() => {
    void loadCommunity();
  }, [loadCommunity]);

  const handleLeaveLobby = async () => {
    if (!window.confirm(lang === 'cz'
      ? 'Opravdu chceš opustit tuto lobby? Tvoje historické tipy a body zůstanou zachované.'
      : 'Leave this lobby? Your historical predictions and points will remain.')) {
      return;
    }

    setMembershipActionId(user.id);
    setMembershipError('');
    try {
      await leaveLobby(lobby.id);
      onMembershipEnded?.(lobby.id);
    } catch (err: any) {
      setMembershipError(err?.message || (lang === 'cz' ? 'Lobby se nepodařilo opustit.' : 'Could not leave the lobby.'));
    } finally {
      setMembershipActionId(null);
    }
  };

  const handleRemoveMember = async (member: LobbyMember) => {
    if (!window.confirm(lang === 'cz'
      ? `Odebrat uživatele ${member.username}? Historické tipy a body zůstanou zachované.`
      : `Remove ${member.username}? Historical predictions and points will remain.`)) {
      return;
    }

    setMembershipActionId(member.user_id);
    setMembershipError('');
    try {
      await removeLobbyMember(lobby.id, member.user_id);
      const community = await loadCommunity();
      if (community) {
        onRefresh?.({ member_count: community.active_member_count });
      }
    } catch (err: any) {
      setMembershipError(err?.message || (lang === 'cz' ? 'Člena se nepodařilo odebrat.' : 'Could not remove the member.'));
    } finally {
      setMembershipActionId(null);
    }
  };

  const handleRestoreMember = async (member: LobbyMember) => {
    setMembershipActionId(member.user_id);
    setMembershipError('');
    try {
      await restoreLobbyMember(lobby.id, member.user_id);
      const community = await loadCommunity();
      if (community) {
        onRefresh?.({ member_count: community.active_member_count });
      }
    } catch (err: any) {
      setMembershipError(err?.message || (lang === 'cz' ? 'Přístup se nepodařilo obnovit.' : 'Could not restore access.'));
    } finally {
      setMembershipActionId(null);
    }
  };

  const handleResolveRequest = async (request: LobbyJoinRequest, decision: 'approved' | 'rejected') => {
    setMembershipActionId(request.id);
    setMembershipError('');
    try {
      await resolveLobbyJoinRequest(request.id, decision);
      const community = await loadCommunity();
      if (community) {
        onRefresh?.({ member_count: community.active_member_count });
      }
    } catch (err: any) {
      setMembershipError(err?.message || (
        decision === 'approved'
          ? (lang === 'cz' ? 'Žádost se nepodařilo schválit.' : 'Could not approve the request.')
          : (lang === 'cz' ? 'Žádost se nepodařilo zamítnout.' : 'Could not reject the request.')
      ));
    } finally {
      setMembershipActionId(null);
    }
  };

  const handleJoinPolicyChange = async (nextPolicy: 'open' | 'approval_required') => {
    if (nextPolicy === joinPolicy) return;
    setMembershipActionId('join-policy');
    setMembershipError('');
    try {
      const savedPolicy = await setLobbyJoinPolicy(lobby.id, nextPolicy);
      setJoinPolicy(savedPolicy);
      onRefresh?.({ join_policy: savedPolicy });
    } catch (err: any) {
      setMembershipError(err?.message || (lang === 'cz' ? 'Způsob vstupu se nepodařilo změnit.' : 'Could not change join policy.'));
    } finally {
      setMembershipActionId(null);
    }
  };

  const handleUpdateName = async () => {
    if (!editNameValue.trim()) {
      setIsEditingName(false);
      return;
    }
    setIsUpdatingName(true);
    try {
      await updateLobbyDetails(
        user.id,
        lobby.id,
        editNameValue.trim(),
        editShortDescription.trim(),
        editLongDescription.trim()
      );
      setIsEditingName(false);
      if (onRefresh) {
        onRefresh({
          id: lobby.id,
          name: editNameValue.trim(),
          short_description: editShortDescription.trim() || null,
          long_description: editLongDescription.trim() || null
        });
      }
    } catch (err: any) {
      alert(err.message || "Failed to update lobby name");
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteLobby(lobby.id);
      if (onLobbyDeleted) onLobbyDeleted();
    } catch (err: any) {
      alert(err.message || "Failed to delete lobby");
      setIsDeleting(false);
    }
  };

  // Read tournaments dynamically from the lobby. Completion is derived from results,
  // not persisted by mutating lobby_tournaments.status.
  let lobbyTournaments = (lobby.tournaments || [])
    .map(lt => ({
      id: lt.tournament_id,
      name: lt.tournament?.name || (lt.tournament_id === 'ms-hockey-2026' ? 'MS v hokeji 2026' : 'FIFA World Cup 2026'),
      description: lt.tournament?.description || '',
      status: lt.status
    }));

  // Fallback to legacy if no tournaments are present
  if (lobbyTournaments.length === 0) {
    lobbyTournaments = [
      {
        id: lobby.tournament_id || 'fifa-world-cup-2026',
        name: lobby.tournament_name || (lobby.tournament_id === 'ms-hockey-2026' ? 'MS v hokeji 2026' : 'FIFA World Cup 2026'),
        description: '',
        status: 'active'
      }
    ];
  }

  const completedTournaments = lobbyTournaments
    .filter(t => Boolean(tournamentStats[t.id]?.isCompleted))
    .sort((a, b) => {
      const aNext = tournamentStats[a.id]?.nextStart || '';
      const bNext = tournamentStats[b.id]?.nextStart || '';
      return bNext.localeCompare(aNext) || a.name.localeCompare(b.name);
    });

  const activeTournaments = lobbyTournaments.filter(t => (
    t.status === 'active' && !tournamentStats[t.id]?.isCompleted
  ));

  // Check which tournaments can be added
  const availableToAdd = [
    { id: 'fifa-world-cup-2026', name: '🏆 FIFA World Cup 2026' }
  ].filter(at => 
    !lobbyTournaments.some(t => t.id === at.id)
  );

  const handleAddTournament = async (tournamentId: string) => {
    setIsAdding(true);
    setAddError('');
    setAddSuccess('');
    try {
      await addTournamentToLobby(lobby.id, tournamentId);
      setAddSuccess(lang === 'cz' ? 'Turnaj úspěšně přidán!' : 'Tournament added successfully!');
      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      setAddError(err.message || 'Chyba při přidávání turnaje.');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-2xl mx-auto pb-20"
    >
      {/* 1. LOBBY HEADER */}
      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-colors">
        <div className="flex-1 w-full">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
            {lang === 'cz' ? 'Tvoje Lobby' : 'Your Lobby'}
          </p>
          
          {isEditingName ? (
            <div className="space-y-2 max-w-sm mt-1">
              <input
                type="text"
                value={editNameValue}
                onChange={e => setEditNameValue(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-black text-slate-900 focus:outline-none focus:ring-1 focus:ring-red-600"
                autoFocus
              />
              <input
                type="text"
                value={editShortDescription}
                onChange={e => setEditShortDescription(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-red-600"
                placeholder={lang === 'cz' ? 'O lobby' : 'About lobby'}
                maxLength={120}
              />
              <textarea
                value={editLongDescription}
                onChange={e => setEditLongDescription(e.target.value)}
                className="w-full min-h-[96px] bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-red-600 resize-y"
                placeholder={lang === 'cz' ? 'Informace o skupině, komunikaci a domluvě...' : 'Group information, communication and notes...'}
              />
              <div className="flex items-center gap-2">
                <button disabled={isUpdatingName} onClick={handleUpdateName} className="p-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors">
                  <Check className="w-4 h-4" />
                </button>
                <button
                  disabled={isUpdatingName}
                  onClick={() => {
                    setIsEditingName(false);
                    setEditNameValue(lobby.name);
                    setEditShortDescription(lobby.short_description || '');
                    setEditLongDescription(lobby.long_description || '');
                  }}
                  className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-black text-slate-900 uppercase break-words w-full">
                {lobby.name}
              </h1>
              {lobby.short_description && (
                <p className="text-sm text-slate-500 font-semibold mt-2">{lobby.short_description}</p>
              )}
            </>
          )}
          
          <div className="flex flex-wrap items-center gap-3 mt-3">
             <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-500 rounded-lg border border-slate-100">
               <Hash className="w-3.5 h-3.5" />
               <span className="text-xs font-bold tracking-widest">{lobby.join_code}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">
                <Users className="w-3.5 h-3.5" />
	                <span className="text-xs font-bold font-mono">{membersCount ?? '…'}</span>
              </div>
          </div>
        </div>

        {/* OWNER CONTROLS */}
        {canEditLobby && (
          <div className="flex sm:flex-col gap-2 shrink-0">
            <button 
              onClick={() => {
                setEditNameValue(lobby.name);
                setEditShortDescription(lobby.short_description || '');
                setEditLongDescription(lobby.long_description || '');
                setIsEditingName(true);
              }}
              className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
            >
              <Pencil className="w-3 h-3" />
              {lang === 'cz' ? 'Upravit' : 'Edit'}
            </button>
            
            {showDeleteConfirm ? (
               <div className="flex flex-col gap-2 bg-red-50 p-2 rounded-xl border border-red-100 max-w-[200px]">
                 <span className="text-[9px] font-bold text-red-600 text-center leading-tight">
                   {lang === 'cz' ? 'Opravdu chceš smazat tuto lobby? Tato akce smaže členství a tipy v této lobby.' : 'Really delete?'}
                 </span>
                 <div className="flex gap-1.5 mt-1">
                   <button disabled={isDeleting} onClick={handleDelete} className="flex-1 bg-red-600 text-white rounded-lg py-1 text-[10px] font-bold uppercase hover:bg-red-700">Ano</button>
                   <button disabled={isDeleting} onClick={() => setShowDeleteConfirm(false)} className="flex-1 bg-white text-slate-500 rounded-lg py-1 text-[10px] font-bold uppercase border border-slate-200 hover:bg-slate-50">Ne</button>
                 </div>
               </div>
            ) : (
              <button 
                onClick={() => setShowDeleteConfirm(true)}
                className="px-3 py-2 bg-slate-50 hover:bg-red-50 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-3 h-3" />
                {lang === 'cz' ? 'Smazat' : 'Delete'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Users className="w-4 h-4" />
              {lang === 'cz' ? 'Členové' : 'Members'}
            </h2>
            <p className="mt-1 text-[10px] font-medium text-slate-400">
              {membersLoading
                ? (lang === 'cz' ? 'Načítám členy…' : 'Loading members…')
                : membershipError
                  ? (lang === 'cz' ? 'Počet členů není dostupný' : 'Member count unavailable')
                  : `${activeMemberCount ?? 0} ${lang === 'cz' ? 'aktivních členů' : 'active members'}`}
            </p>
          </div>

          {viewerRole !== 'owner' && viewerRole !== 'platform_admin' && members.some(member => (
            member.user_id === user.id && member.membership_status === 'active'
          )) && (
            <button
              type="button"
              onClick={handleLeaveLobby}
              disabled={membershipActionId === user.id}
              className="inline-flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[10px] font-black uppercase text-red-600 hover:bg-red-100 disabled:cursor-wait disabled:opacity-60"
            >
              <LogOut className="h-3.5 w-3.5" />
              {lang === 'cz' ? 'Opustit lobby' : 'Leave lobby'}
            </button>
          )}
        </div>

        {membershipError && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-[10px] font-bold text-red-600">
            <span>{membershipError}</span>
            <button type="button" onClick={() => void loadCommunity()} className="shrink-0 underline">
              {lang === 'cz' ? 'Zkusit znovu' : 'Retry'}
            </button>
          </div>
        )}

        {canChangeJoinPolicy(viewerRole) && !membersLoading && (
          <fieldset className="mt-4 border-t border-slate-100 pt-4" disabled={membershipActionId === 'join-policy'}>
            <legend className="mb-2 text-[9px] font-black uppercase tracking-wider text-slate-400">
              {lang === 'cz' ? 'Způsob vstupu' : 'Join policy'}
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className={`rounded-xl border p-3 ${joinPolicy === 'open' ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'}`}>
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`join-policy-${lobby.id}`}
                    checked={joinPolicy === 'open'}
                    onChange={() => void handleJoinPolicyChange('open')}
                  />
                  <span className="text-[10px] font-black uppercase text-slate-700">
                    {lang === 'cz' ? 'Okamžitý vstup' : 'Immediate entry'}
                  </span>
                </span>
                <span className="mt-1 block text-[10px] font-medium text-slate-500">
                  {lang === 'cz' ? 'Každý s kódem se připojí ihned.' : 'Anyone with the code joins immediately.'}
                </span>
              </label>
              <label className={`rounded-xl border p-3 ${joinPolicy === 'approval_required' ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'}`}>
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`join-policy-${lobby.id}`}
                    checked={joinPolicy === 'approval_required'}
                    onChange={() => void handleJoinPolicyChange('approval_required')}
                  />
                  <span className="text-[10px] font-black uppercase text-slate-700">
                    {lang === 'cz' ? 'Vstup po schválení' : 'Approval required'}
                  </span>
                </span>
                <span className="mt-1 block text-[10px] font-medium text-slate-500">
                  {lang === 'cz' ? 'Žádost potvrdí majitel nebo admin.' : 'The owner or an admin approves each request.'}
                </span>
              </label>
            </div>
          </fieldset>
        )}

        {canResolveJoinRequests(viewerRole) && !membersLoading && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <h3 className="text-[9px] font-black uppercase tracking-wider text-slate-400">
              {lang === 'cz' ? 'Žádosti' : 'Requests'}
            </h3>
            {pendingRequests.length > 0 ? (
              <div className="mt-2 space-y-2">
                {pendingRequests.map(request => (
                  <div key={request.id} className="flex items-center gap-3 rounded-2xl bg-amber-50 p-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg"
                      style={{ backgroundColor: request.avatar_bg || '#fee2e2' }}
                    >
                      {request.avatar_emoji || '😀'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-slate-800">{request.username}</p>
                      <p className="text-[9px] font-bold uppercase text-amber-600">
                        {lang === 'cz' ? 'Čeká na schválení' : 'Awaiting approval'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleResolveRequest(request, 'approved')}
                      disabled={membershipActionId === request.id}
                      title={lang === 'cz' ? 'Schválit' : 'Approve'}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleResolveRequest(request, 'rejected')}
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

        {!membersLoading && members.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
            {members.map(member => {
              const isOwner = member.lobby_role === 'owner';
              const statusLabel = member.membership_status === 'active'
                ? (lang === 'cz' ? 'Aktivní' : 'Active')
                : member.membership_status === 'removed'
                  ? (lang === 'cz' ? 'Odebraný člen' : 'Removed')
                  : (lang === 'cz' ? 'Odešel' : 'Left');
              const roleLabel = isOwner
                ? (lang === 'cz' ? 'Majitel' : 'Owner')
                : member.lobby_role === 'admin'
                  ? 'Admin'
                  : (lang === 'cz' ? 'Člen' : 'Member');

              return (
                <div key={member.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg"
                    style={{ backgroundColor: member.avatar_bg || '#fee2e2' }}
                  >
                    {member.avatar_emoji || '😀'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-slate-800">{member.username}</p>
                    <p className="text-[9px] font-bold uppercase text-slate-400">
                      {roleLabel} · {statusLabel}
                    </p>
                  </div>

                  {canRemoveLobbyMember(viewerRole, user.id, member) && (
                    <button
                      type="button"
                      onClick={() => void handleRemoveMember(member)}
                      disabled={membershipActionId === member.user_id}
                      title={lang === 'cz' ? 'Odebrat člena' : 'Remove member'}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-red-500 shadow-sm hover:bg-red-50 disabled:cursor-wait disabled:opacity-50"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  )}

                  {canRestoreLobbyMember(viewerRole, member) && (
                    <button
                      type="button"
                      onClick={() => void handleRestoreMember(member)}
                      disabled={membershipActionId === member.user_id}
                      title={lang === 'cz' ? 'Obnovit přístup' : 'Restore access'}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-50"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* LEFT COLUMN */}
        <div className="space-y-6">
          {/* 2. AKTIVNÍ SOUTĚŽE */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {lang === 'cz' ? 'Aktivní soutěže' : 'Active Tournaments'}
            </h2>
            <div className="space-y-3">
              {activeTournaments.length > 0 ? activeTournaments.map(t => {
                const stats = tournamentStats[t.id] || { total: 0, scheduled: 0, finished: 0, nextStart: null };
                const isCompleted = Boolean(stats.isCompleted);
                const progress = isCompleted ? 100 : (stats.total > 0 ? Math.round((stats.finished / stats.total) * 100) : 0);
                const statusLabel = isCompleted
                  ? (lang === 'cz' ? 'Ukončeno' : 'Completed')
                  : stats.nextStart
                  ? new Date(stats.nextStart).toLocaleDateString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                  : (lang === 'cz' ? 'Čeká na rozpis' : 'Schedule pending');
                const statusDetail = isCompleted
                  ? (stats.championShortName || stats.championName || null)
                  : (stats.nextMatchLabel || null);

                return (
                  <button
                    key={t.id}
                    onClick={() => onSelectTournament(t.id)}
                    className="w-full relative group overflow-hidden bg-slate-50 hover:bg-slate-900 rounded-2xl p-4 text-left transition-all"
                  >
                    <div className="relative z-10 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-700 group-hover:text-white transition-colors uppercase">
                          {t.name}
                        </p>
                        {t.description && (
                          <p className="mt-1 text-[11px] font-semibold text-slate-400 group-hover:text-slate-300 line-clamp-2">
                            {t.description}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 w-8 h-8 rounded-full bg-white group-hover:bg-slate-800 flex items-center justify-center transition-colors">
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
                      </div>
                    </div>

                    <div className="relative z-10 mt-4 grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-white/80 group-hover:bg-white/10 px-2 py-2 border border-white/80 group-hover:border-white/10">
                        <p className="text-[8px] font-black uppercase text-slate-400 group-hover:text-slate-300">{lang === 'cz' ? 'Zápasy' : 'Matches'}</p>
                        <p className="text-sm font-black text-slate-800 group-hover:text-white">{stats.total}</p>
                      </div>
                      <div className="rounded-xl bg-white/80 group-hover:bg-white/10 px-2 py-2 border border-white/80 group-hover:border-white/10">
                        <p className="text-[8px] font-black uppercase text-slate-400 group-hover:text-slate-300">{lang === 'cz' ? 'Hotovo' : 'Done'}</p>
                        <p className="text-sm font-black text-slate-800 group-hover:text-white">{progress}%</p>
                      </div>
                      <div className="rounded-xl bg-white/80 group-hover:bg-white/10 px-2 py-2 border border-white/80 group-hover:border-white/10 min-w-0">
                        <p className="text-[8px] font-black uppercase text-slate-400 group-hover:text-slate-300">
                          {isCompleted ? (lang === 'cz' ? 'Stav' : 'Status') : (lang === 'cz' ? 'Další' : 'Next')}
                        </p>
                        {statusDetail && (
                          <p className="text-[10px] font-black text-slate-800 group-hover:text-white truncate">{statusDetail}</p>
                        )}
                        <p className={`${statusDetail ? 'text-[9px]' : 'text-[10px]'} font-black text-slate-500 group-hover:text-slate-300 truncate`}>{statusLabel}</p>
                      </div>
                    </div>

                    {stats.total > 0 && (
                      <div className="relative z-10 mt-3 h-1.5 rounded-full bg-white overflow-hidden group-hover:bg-white/10">
                        <div className="h-full bg-red-600 group-hover:bg-white transition-all" style={{ width: `${progress}%` }} />
                      </div>
                    )}
                  </button>
                );
              }) : (
                <p className="text-xs text-slate-400 italic text-center py-4">
                  {lang === 'cz' ? 'Žádné aktivní soutěže' : 'No active tournaments'}
                </p>
              )}
            </div>

            {/* ACTION: ADD TOURNAMENT TO LOBBY */}
            {canEditLobby && availableToAdd.length > 0 && (
              <div className="mt-6 pt-4 border-t border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  {lang === 'cz' ? 'Správa turnajů (Owner)' : 'Manage Tournaments (Owner)'}
                </p>
                <div className="flex flex-col gap-2">
                  {availableToAdd.map(at => (
                    <button
                      key={at.id}
                      onClick={() => handleAddTournament(at.id)}
                      disabled={isAdding}
                      className="w-full py-2.5 px-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <PlusCircle className="w-4 h-4" />
                      {lang === 'cz' ? `Přidat ${at.name} do lobby` : `Add ${at.name} to lobby`}
                    </button>
                  ))}
                </div>
                {addError && <p className="text-red-500 text-[10px] font-bold mt-2 text-center">{addError}</p>}
                {addSuccess && <p className="text-green-600 text-[10px] font-bold mt-2 text-center">{addSuccess}</p>}
              </div>
            )}
          </div>

          {rulesText && (
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
              <button
                type="button"
                onClick={() => setIsRulesExpanded(expanded => !expanded)}
                className="flex w-full items-center justify-between gap-3 text-left"
                aria-expanded={isRulesExpanded}
              >
                <span>
                  <h2 className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
                    {lang === 'cz' ? 'Pravidla a bodování' : 'Rules and scoring'}
                  </h2>
                  <span className="mt-1 block text-[10px] font-semibold text-slate-400">
                    {lang === 'cz' ? 'Instrukce k turnaji a uložené bodování' : 'Tournament instructions and saved scoring notes'}
                  </span>
                </span>
                <ChevronRight className={`w-4 h-4 shrink-0 text-slate-400 transition-transform md:hidden ${isRulesExpanded ? 'rotate-90' : ''}`} />
              </button>
              <div className={`${isRulesExpanded ? 'mt-4 block' : 'hidden'} md:mt-4 md:block`}>
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                  <p className="text-xs font-medium text-slate-600 leading-relaxed whitespace-pre-wrap">
                    {rulesText}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 3. HISTORIE */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 opacity-80">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <History className="w-3.5 h-3.5" />
              {lang === 'cz' ? 'Historie soutěží' : 'Past Tournaments'}
            </h2>
            <div className="space-y-3">
              {completedTournaments.length > 0 ? (
                completedTournaments.map(t => {
                  const stats = tournamentStats[t.id] || { total: 0, scheduled: 0, finished: 0 };
                  const champion = stats.championName || stats.championShortName || null;

                  return (
                  <button
                    key={t.id}
                    onClick={() => onSelectTournament(t.id)}
                    className="w-full relative group overflow-hidden bg-slate-50 hover:bg-slate-900 rounded-2xl p-4 text-left transition-all"
                  >
                    <div className="relative z-10 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-700 group-hover:text-white transition-colors uppercase">
                          {t.name}
                        </p>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-emerald-600 group-hover:text-emerald-200">
                          {lang === 'cz' ? 'Ukončeno' : 'Completed'}
                        </p>
                      </div>
                      <div className="shrink-0 w-8 h-8 rounded-full bg-white group-hover:bg-slate-800 flex items-center justify-center transition-colors">
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
                      </div>
                    </div>

                    <div className="relative z-10 mt-4 grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-white/80 group-hover:bg-white/10 px-2 py-2 border border-white/80 group-hover:border-white/10">
                        <p className="text-[8px] font-black uppercase text-slate-400 group-hover:text-slate-300">{lang === 'cz' ? 'Zápasy' : 'Matches'}</p>
                        <p className="text-sm font-black text-slate-800 group-hover:text-white">{stats.total}</p>
                      </div>
                      <div className="rounded-xl bg-white/80 group-hover:bg-white/10 px-2 py-2 border border-white/80 group-hover:border-white/10">
                        <p className="text-[8px] font-black uppercase text-slate-400 group-hover:text-slate-300">{lang === 'cz' ? 'Hotovo' : 'Done'}</p>
                        <p className="text-sm font-black text-slate-800 group-hover:text-white">100%</p>
                      </div>
                      <div className="rounded-xl bg-white/80 group-hover:bg-white/10 px-2 py-2 border border-white/80 group-hover:border-white/10 min-w-0">
                        <p className="text-[8px] font-black uppercase text-slate-400 group-hover:text-slate-300">{lang === 'cz' ? 'Vítěz' : 'Winner'}</p>
                        <p className="text-[10px] font-black text-slate-800 group-hover:text-white truncate">{champion || '—'}</p>
                      </div>
                    </div>

                    {stats.total > 0 && (
                      <div className="relative z-10 mt-3 h-1.5 rounded-full bg-white overflow-hidden group-hover:bg-white/10">
                        <div className="h-full bg-amber-500 group-hover:bg-white transition-all" style={{ width: '100%' }} />
                      </div>
                    )}
                  </button>
                  );
                })
              ) : (
                <p className="text-xs text-slate-400 italic text-center py-4">
                  {lang === 'cz' ? 'Žádné archivované turnaje' : 'No archived tournaments'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
           {/* 4. HALL OF FAME */}
           <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
             <h2 className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-1 flex items-center gap-2">
               <Trophy className="w-4 h-4" />
               Hall of Fame
             </h2>
             <p className="text-[10px] text-slate-400 font-medium mb-5">
               {lang === 'cz' ? 'Kumulované body za všechny turnaje' : 'All-time accumulated points'}
             </p>
             
             {hallOfFameEntries.length > 0 ? (
               <div className="space-y-2 border-t border-slate-50 pt-4">
                 {hallOfFameEntries.map((entry, index) => {
                   const rankTone = index === 0 ? 'bg-yellow-400 text-yellow-900' :
                     index === 1 ? 'bg-slate-300 text-slate-700' :
                     index === 2 ? 'bg-amber-600 text-amber-50' :
                     'bg-slate-100 text-slate-500';

                   return (
                     <div key={entry.player_id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 border border-slate-100 p-3">
                       <div className="flex items-center gap-3 min-w-0">
                         <div className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[10px] font-black ${rankTone}`}>
                           {index + 1}
                         </div>
                         <div
                           className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-lg shadow-sm border border-white"
                           style={{ backgroundColor: entry.avatar_bg || '#fee2e2' }}
                         >
                           {entry.avatar_emoji || '😀'}
                         </div>
                         <div className="min-w-0">
                           <p className="text-sm font-black text-slate-800 truncate">{entry.username}</p>
                           <p className="text-[9px] font-bold uppercase text-slate-400">
                             {entry.completed_tournaments_count} {lang === 'cz' ? 'dokončený turnaj' : 'completed tournament'}
                           </p>
                         </div>
                       </div>
                       <div className="text-right shrink-0">
                         <p className="text-lg font-black text-slate-900 leading-none">{entry.total_points}</p>
                         <p className="text-[8px] font-black uppercase text-slate-400">{lang === 'cz' ? 'bodů' : 'pts'}</p>
                       </div>
                     </div>
                   );
                 })}
               </div>
             ) : (
               <div className="flex flex-col items-center justify-center p-6 text-center border-t border-slate-50">
                 <Trophy className="w-8 h-8 text-slate-200 mb-2" />
                 <p className="text-sm font-bold text-slate-400 mb-1">
                   {lang === 'cz' ? 'Zatím žádné záznamy' : 'No records yet'}
                 </p>
                 <p className="text-[10px] items-center text-slate-400 max-w-[180px]">
                   {lang === 'cz' ? 'Hall of Fame bude dostupná po dokončení prvního turnaje.' : 'Hall of Fame will be available after the first tournament ends.'}
                 </p>
               </div>
             )}
           </div>
        </div>
      </div>
    </motion.div>
  );
}
