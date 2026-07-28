import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Users, Trophy, ChevronRight, History, Hash, PlusCircle, Pencil, Trash2, X, Check, LockKeyhole, Share2 } from 'lucide-react';
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
} from '../lib/db';
import { type CommunityViewerRole } from '../lib/membership';
import { updateLobbyFieldSecure } from '../lib/productFeatures.ts';
import { ConfirmDialog } from './ProductFeedback.tsx';
import InviteShareDialog from './InviteShareDialog.tsx';
import LobbyMembersDialog from './LobbyMembersDialog.tsx';
import LobbyTournamentManager from './LobbyTournamentManager.tsx';
import PlayerProfileDialog from './PlayerProfileDialog.tsx';

type UserAvatarComponent = React.ComponentType<{
  player?: Pick<AppUser, 'username' | 'avatar_emoji' | 'avatar_bg'> | null;
  size?: 'sm' | 'md' | 'lg';
}>;

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
  onMembershipMutation?: () => Promise<void> | void;
  membersCount?: number;
  communityProfilesEnabled: boolean;
  shareEnabled: boolean;
  tournamentManagementEnabled: boolean;
  UserAvatar: UserAvatarComponent;
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
  onMembershipMutation,
  membersCount,
  communityProfilesEnabled,
  shareEnabled,
  tournamentManagementEnabled,
  UserAvatar,
  tournamentStats = {}
}: LobbyViewProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  
  const [editingField, setEditingField] = useState<'name' | 'short_description' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isUpdatingField, setIsUpdatingField] = useState(false);
  const [fieldMessage, setFieldMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  
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
  const [pendingConfirmation, setPendingConfirmation] = useState<
    | { kind: 'leave' }
    | { kind: 'remove'; member: LobbyMember }
    | null
  >(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

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
    setMembershipActionId(user.id);
    setMembershipError('');
    try {
      await leaveLobby(lobby.id);
      setPendingConfirmation(null);
      onMembershipEnded?.(lobby.id);
    } catch (err: any) {
      setMembershipError(err?.message || (lang === 'cz' ? 'Lobby se nepodařilo opustit.' : 'Could not leave the lobby.'));
    } finally {
      setMembershipActionId(null);
    }
  };

  const handleRemoveMember = async (member: LobbyMember) => {
    setMembershipActionId(member.user_id);
    setMembershipError('');
    try {
      await removeLobbyMember(lobby.id, member.user_id);
      setPendingConfirmation(null);
      const community = await loadCommunity();
      await onMembershipMutation?.();
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
      await onMembershipMutation?.();
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
      await onMembershipMutation?.();
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
      await onMembershipMutation?.();
      onRefresh?.({ join_policy: savedPolicy });
    } catch (err: any) {
      setMembershipError(err?.message || (lang === 'cz' ? 'Způsob vstupu se nepodařilo změnit.' : 'Could not change join policy.'));
    } finally {
      setMembershipActionId(null);
    }
  };

  const startFieldEdit = (
    field: 'name' | 'short_description',
    value: string
  ) => {
    setEditingField(field);
    setEditValue(value);
    setFieldMessage(null);
  };

  const handleUpdateField = async () => {
    if (!editingField) return;
    setIsUpdatingField(true);
    setFieldMessage(null);
    try {
      const saved = await updateLobbyFieldSecure(lobby.id, editingField, editValue);
      const updates = {
        [editingField]: saved.value
      } as Partial<Lobby>;
      onRefresh?.(updates);
      setEditingField(null);
      setFieldMessage({
        tone: 'success',
        text: lang === 'cz' ? 'Změna byla uložena.' : 'Change saved.'
      });
    } catch (err: any) {
      setFieldMessage({
        tone: 'error',
        text: err?.message || (lang === 'cz' ? 'Změnu se nepodařilo uložit.' : 'Change could not be saved.')
      });
    } finally {
      setIsUpdatingField(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteLobby(lobby.id);
      if (onLobbyDeleted) onLobbyDeleted();
    } catch (err: any) {
      setMembershipError(err?.message || (lang === 'cz' ? 'Lobby se nepodařilo smazat.' : 'Lobby could not be deleted.'));
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
          
          {editingField === 'name' ? (
            <div className="mt-1 max-w-sm space-y-2">
              <input
                type="text"
                value={editValue}
                onChange={event => setEditValue(event.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-black text-slate-900 focus:outline-none focus:ring-1 focus:ring-red-600"
                autoFocus
                maxLength={80}
              />
              <div className="flex items-center gap-2">
                <button type="button" disabled={isUpdatingField} onClick={() => void handleUpdateField()} className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white disabled:opacity-50" aria-label={lang === 'cz' ? 'Uložit název lobby' : 'Save lobby name'}>
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={isUpdatingField}
                  onClick={() => setEditingField(null)}
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500 disabled:opacity-50"
                  aria-label={lang === 'cz' ? 'Zrušit úpravu názvu' : 'Cancel name edit'}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <h1 className="text-3xl font-black text-slate-900 uppercase break-words w-full">
                {lobby.name}
              </h1>
              {canEditLobby && (
                <button type="button" onClick={() => startFieldEdit('name', lobby.name)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500" aria-label={lang === 'cz' ? 'Upravit název lobby' : 'Edit lobby name'}>
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {editingField === 'short_description' ? (
            <div className="mt-2 max-w-sm space-y-2">
              <input
                type="text"
                value={editValue}
                onChange={event => setEditValue(event.target.value)}
                maxLength={120}
                autoFocus
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-red-600"
                placeholder={lang === 'cz' ? 'Krátký popis lobby' : 'Short lobby description'}
              />
              <div className="flex gap-2">
                <button type="button" disabled={isUpdatingField} onClick={() => void handleUpdateField()} className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white disabled:opacity-50" aria-label={lang === 'cz' ? 'Uložit krátký popis' : 'Save short description'}><Check className="h-4 w-4" /></button>
                <button type="button" disabled={isUpdatingField} onClick={() => setEditingField(null)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500" aria-label={lang === 'cz' ? 'Zrušit úpravu popisu' : 'Cancel description edit'}><X className="h-4 w-4" /></button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex items-start gap-2">
              <p className={`min-w-0 flex-1 text-sm font-semibold ${lobby.short_description ? 'text-slate-500' : 'text-slate-300 italic'}`}>
                {lobby.short_description || (lang === 'cz' ? 'Bez krátkého popisu' : 'No short description')}
              </p>
              {canEditLobby && (
                <button type="button" onClick={() => startFieldEdit('short_description', lobby.short_description || '')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500" aria-label={lang === 'cz' ? 'Upravit krátký popis' : 'Edit short description'}><Pencil className="h-3.5 w-3.5" /></button>
              )}
            </div>
          )}

          {fieldMessage && (
            <p role={fieldMessage.tone === 'error' ? 'alert' : 'status'} className={`mt-2 text-[10px] font-bold ${fieldMessage.tone === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
              {fieldMessage.text}
            </p>
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
          <div className="flex shrink-0 gap-2 sm:flex-col">
            {shareEnabled && (
              <button type="button" onClick={() => setShowInviteDialog(true)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-[10px] font-black uppercase text-white">
                <Share2 className="h-4 w-4" />
                {lang === 'cz' ? 'Pozvat' : 'Invite'}
              </button>
            )}
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

      <button
        type="button"
        onClick={() => setShowMembersDialog(true)}
        className="flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-left shadow-sm"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <Users className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-black uppercase text-slate-700">
              {lang === 'cz' ? 'Členové' : 'Members'}
            </span>
            <span className="mt-1 block text-[10px] font-semibold text-slate-400">
              {membersLoading
                ? (lang === 'cz' ? 'Načítám členy…' : 'Loading members…')
                : membershipError
                  ? (lang === 'cz' ? 'Správa členů není dostupná' : 'Member management unavailable')
                  : pendingRequests.length > 0
                    ? `${pendingRequests.length} ${lang === 'cz' ? 'čeká na vyřízení' : 'awaiting review'}`
                    : viewerRole === 'owner' || viewerRole === 'admin' || viewerRole === 'platform_admin'
                      ? (lang === 'cz' ? 'Správa přístupu a žádostí' : 'Access and request management')
                      : (lang === 'cz' ? 'Zobrazit seznam' : 'View list')}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {pendingRequests.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black text-amber-700">
              {pendingRequests.length}
            </span>
          )}
          <ChevronRight className="h-4 w-4 text-slate-300" />
        </span>
      </button>

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
            {canEditLobby && !tournamentManagementEnabled && availableToAdd.length > 0 && (
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

          {canEditLobby && tournamentManagementEnabled && (
            <LobbyTournamentManager
              lobbyId={lobby.id}
              lang={lang}
              onChanged={() => onRefresh?.()}
            />
          )}

          {(rulesText || canEditLobby) && (
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
              <button
                type="button"
                onClick={() => setIsRulesExpanded(expanded => !expanded)}
                className="flex w-full items-center justify-between gap-3 text-left"
                aria-expanded={isRulesExpanded}
              >
                <span>
                  <h2 className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
                    {lang === 'cz' ? 'Pravidla' : 'Rules'}
                  </h2>
                  <span className="mt-1 block text-[10px] font-semibold text-slate-400">
                    {lang === 'cz' ? 'Pravidla hry a pravidla turnaje' : 'Game rules and tournament rules'}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <LockKeyhole className="h-3.5 w-3.5 text-slate-300" aria-label={lang === 'cz' ? 'Pouze pro čtení' : 'Read only'} />
                  <ChevronRight className={`w-4 h-4 shrink-0 text-slate-400 transition-transform md:hidden ${isRulesExpanded ? 'rotate-90' : ''}`} />
                </span>
              </button>
              <div className={`${isRulesExpanded ? 'mt-4 block' : 'hidden'} space-y-4 md:mt-4 md:block`}>
                <div>
                  <h3 className="text-[9px] font-black uppercase text-slate-400">
                    {lang === 'cz' ? 'Pravidla hry' : 'Game rules'}
                  </h3>
                  <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600">
                    {lang === 'cz'
                      ? 'Tipy jsou vždy svázané s konkrétní lobby a turnajem. Po uzávěrce zápasu je nelze měnit.'
                      : 'Predictions always belong to one lobby and tournament. They cannot be changed after the match lock.'}
                  </p>
                </div>
                <div className="border-t border-slate-100 pt-4">
                  <h3 className="text-[9px] font-black uppercase text-slate-400">
                    {lang === 'cz' ? 'Pravidla turnaje' : 'Tournament rules'}
                  </h3>
                  <div className="mt-2 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="whitespace-pre-wrap text-xs font-medium leading-relaxed text-slate-600">
                      {rulesText || (lang === 'cz' ? 'Pravidla turnaje zatím nejsou k dispozici.' : 'Tournament rules are not available yet.')}
                    </p>
                  </div>
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
                     <button
                       key={entry.player_id}
                       type="button"
                       disabled={!communityProfilesEnabled}
                       onClick={() => setSelectedPlayerId(entry.player_id)}
                       className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-left disabled:cursor-default"
                       aria-label={communityProfilesEnabled
                         ? (lang === 'cz' ? `Otevřít profil ${entry.username}` : `Open ${entry.username}'s profile`)
                         : undefined}
                     >
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
                     </button>
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
      {showMembersDialog && (
        <LobbyMembersDialog
          activeMemberCount={activeMemberCount}
          communityProfilesEnabled={communityProfilesEnabled}
          joinPolicy={joinPolicy}
          lang={lang}
          loading={membersLoading}
          members={members}
          membershipActionId={membershipActionId}
          membershipError={membershipError}
          pendingRequests={pendingRequests}
          user={user}
          viewerRole={viewerRole}
          UserAvatar={UserAvatar}
          onChangeJoinPolicy={policy => void handleJoinPolicyChange(policy)}
          onClose={() => setShowMembersDialog(false)}
          onLeave={() => setPendingConfirmation({ kind: 'leave' })}
          onOpenPlayer={setSelectedPlayerId}
          onRemove={member => setPendingConfirmation({ kind: 'remove', member })}
          onResolveRequest={(request, decision) => void handleResolveRequest(request, decision)}
          onRestore={member => void handleRestoreMember(member)}
          onRetry={() => void loadCommunity()}
        />
      )}
      <ConfirmDialog
        open={Boolean(pendingConfirmation)}
        title={pendingConfirmation?.kind === 'remove'
          ? (lang === 'cz' ? 'Odebrat člena?' : 'Remove member?')
          : (lang === 'cz' ? 'Opustit lobby?' : 'Leave lobby?')}
        description={pendingConfirmation?.kind === 'remove'
          ? (lang === 'cz'
            ? `${pendingConfirmation.member.username} ztratí přístup do lobby. Historické tipy a body zůstanou zachované.`
            : `${pendingConfirmation.member.username} will lose lobby access. Historical predictions and points remain.`)
          : (lang === 'cz'
            ? 'Ztratíš přístup do lobby. Tvoje historické tipy a body zůstanou zachované.'
            : 'You will lose lobby access. Your historical predictions and points remain.')}
        confirmLabel={pendingConfirmation?.kind === 'remove'
          ? (lang === 'cz' ? 'Odebrat' : 'Remove')
          : (lang === 'cz' ? 'Opustit' : 'Leave')}
        cancelLabel={lang === 'cz' ? 'Zrušit' : 'Cancel'}
        busy={membershipActionId === user.id || (
          pendingConfirmation?.kind === 'remove'
          && membershipActionId === pendingConfirmation.member.user_id
        )}
        destructive
        onClose={() => setPendingConfirmation(null)}
        onConfirm={() => {
          if (pendingConfirmation?.kind === 'remove') {
            void handleRemoveMember(pendingConfirmation.member);
          } else if (pendingConfirmation?.kind === 'leave') {
            void handleLeaveLobby();
          }
        }}
      />
      {showInviteDialog && (
        <InviteShareDialog
          lobbyName={lobby.name}
          joinCode={lobby.join_code}
          lang={lang}
          onClose={() => setShowInviteDialog(false)}
        />
      )}
      {communityProfilesEnabled && selectedPlayerId && (
        <PlayerProfileDialog
          userId={selectedPlayerId}
          lobbyId={lobby.id}
          lang={lang}
          onClose={() => setSelectedPlayerId(null)}
          UserAvatar={UserAvatar}
        />
      )}
    </motion.div>
  );
}
