import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Users, Trophy, ChevronRight, History, Hash, PlusCircle, Pencil, Trash2, X, Check } from 'lucide-react';
import { Lobby, Player as AppUser } from '../types';
import { addTournamentToLobby, updateLobbyDetails, deleteLobby } from '../lib/db';

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
  hallOfFameEntries?: {
    player_id: string;
    username: string;
    avatar_emoji?: string | null;
    avatar_bg?: string | null;
    total_points: number;
    completed_tournaments_count: number;
  }[];
}

export function LobbyView({
  lobby,
  user,
  onSelectTournament,
  lang,
  onRefresh,
  onLobbyDeleted,
  membersCount,
  tournamentStats = {},
  hallOfFameEntries = []
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

  const canEditLobby = Boolean(lobby.is_owner || user.role === 'admin');
  const rulesText = getLobbyRulesText(lobby.long_description);

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
