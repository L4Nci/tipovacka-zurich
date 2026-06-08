import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Trophy, ChevronRight, History, Hash, PlusCircle, Pencil, Trash2, X, Check } from 'lucide-react';
import { Lobby, Player as AppUser } from '../types';
import { addTournamentToLobby, updateLobbyName, deleteLobby } from '../lib/db';

interface LobbyViewProps {
  lobby: Lobby;
  user: AppUser;
  onSelectTournament: (tournamentId: string) => void;
  lang: 'cz' | 'en';
  onRefresh?: () => void;
  onLobbyDeleted?: () => void;
  membersCount?: number;
}

export function LobbyView({ lobby, user, onSelectTournament, lang, onRefresh, onLobbyDeleted, membersCount = 1 }: LobbyViewProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  
  // Owner controls state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(lobby.name);
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleUpdateName = async () => {
    if (!editNameValue.trim() || editNameValue.trim() === lobby.name) {
      setIsEditingName(false);
      return;
    }
    setIsUpdatingName(true);
    try {
      await updateLobbyName(user.id, lobby.id, editNameValue.trim());
      setIsEditingName(false);
      if (onRefresh) onRefresh();
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

  // Read tournaments dynamically from the lobby
  let activeTournaments = (lobby.tournaments || [])
    .filter(t => t.status === 'active')
    .map(lt => ({
      id: lt.tournament_id,
      name: lt.tournament?.name || (lt.tournament_id === 'ms-hockey-2026' ? 'MS v hokeji 2026' : 'FIFA World Cup 2026'),
      status: 'active' as const
    }));

  let archivedTournaments = (lobby.tournaments || [])
    .filter(t => t.status === 'archived')
    .map(lt => ({
      id: lt.tournament_id,
      name: lt.tournament?.name || (lt.tournament_id === 'ms-hockey-2026' ? 'MS v hokeji 2026' : 'FIFA World Cup 2026'),
      status: 'archived' as const
    }));

  // Fallback to legacy if no tournaments are present
  if (activeTournaments.length === 0 && archivedTournaments.length === 0) {
    activeTournaments = [
      {
        id: lobby.tournament_id || 'fifa-world-cup-2026',
        name: lobby.tournament_name || (lobby.tournament_id === 'ms-hockey-2026' ? 'MS v hokeji 2026' : 'FIFA World Cup 2026'),
        status: 'active'
      }
    ];
  }

  // Check which tournaments can be added
  const availableToAdd = [
    { id: 'fifa-world-cup-2026', name: '🏆 FIFA World Cup 2026' }
  ].filter(at => 
    !activeTournaments.some(t => t.id === at.id) && 
    !archivedTournaments.some(t => t.id === at.id)
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

  // Placeholder Hall of Fame (mock for F10.1 presentation)
  const hallOfFame = [
    { username: user.username || "Kuba", points: 128, rank: 1 },
    { username: "Honza", points: 120, rank: 2 },
    { username: "Viktor", points: 98, rank: 3 },
  ];

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
            <div className="flex items-center gap-2 max-w-sm mt-1">
              <input
                type="text"
                value={editNameValue}
                onChange={e => setEditNameValue(e.target.value)}
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-black text-slate-900 focus:outline-none focus:ring-1 focus:ring-red-600"
                autoFocus
              />
              <button disabled={isUpdatingName} onClick={handleUpdateName} className="p-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors">
                <Check className="w-4 h-4" />
              </button>
              <button disabled={isUpdatingName} onClick={() => { setIsEditingName(false); setEditNameValue(lobby.name); }} className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <h1 className="text-3xl font-black text-slate-900 uppercase break-words w-full">
              {lobby.name}
            </h1>
          )}
          
          <div className="flex flex-wrap items-center gap-3 mt-3">
             <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-500 rounded-lg border border-slate-100">
               <Hash className="w-3.5 h-3.5" />
               <span className="text-xs font-bold tracking-widest">{lobby.join_code}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">
                <Users className="w-3.5 h-3.5" />
                <span className="text-xs font-bold font-mono">{membersCount}</span>
              </div>
          </div>
        </div>

        {/* OWNER CONTROLS */}
        {lobby.is_owner && (
          <div className="flex sm:flex-col gap-2 shrink-0">
            <button 
              onClick={() => setIsEditingName(true)}
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* LEFT COLUMN */}
        <div className="space-y-6">
          {/* 2. AKTIVNÍ SOUTĚŽE */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {lang === 'cz' ? 'Aktivní soutěže' : 'Active Tournaments'}
            </h2>
            <div className="space-y-3">
              {activeTournaments.map(t => (
                <button
                  key={t.id}
                  onClick={() => onSelectTournament(t.id)}
                  className="w-full relative group overflow-hidden bg-slate-50 hover:bg-slate-900 rounded-2xl p-4 flex items-center justify-between transition-all"
                >
                  <div className="relative z-10 text-left">
                    <p className="text-sm font-black text-slate-700 group-hover:text-white transition-colors uppercase">
                      {t.name}
                    </p>
                  </div>
                  <div className="relative z-10 w-8 h-8 rounded-full bg-white group-hover:bg-slate-800 flex items-center justify-center transition-colors">
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
                  </div>
                </button>
              ))}
            </div>

            {/* ACTION: ADD TOURNAMENT TO LOBBY */}
            {lobby.is_owner && availableToAdd.length > 0 && (
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

          {/* 3. HISTORIE */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 opacity-80">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <History className="w-3.5 h-3.5" />
              {lang === 'cz' ? 'Historie soutěží' : 'Past Tournaments'}
            </h2>
            <div className="space-y-3">
              {archivedTournaments.length > 0 ? (
                archivedTournaments.map(t => (
                  <button
                    key={t.id}
                    onClick={() => onSelectTournament(t.id)}
                    className="w-full relative group overflow-hidden bg-slate-50 hover:bg-slate-900 rounded-2xl p-4 flex items-center justify-between transition-all"
                  >
                    <div className="relative z-10 text-left">
                      <p className="text-sm font-bold text-slate-400 group-hover:text-white transition-colors uppercase">
                        {t.name}
                      </p>
                    </div>
                    <div className="relative z-10 w-8 h-8 rounded-full bg-white group-hover:bg-slate-800 flex items-center justify-center transition-colors">
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
                    </div>
                  </button>
                ))
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
             
             <div className="flex flex-col items-center justify-center p-6 text-center border-t border-slate-50">
               <Trophy className="w-8 h-8 text-slate-200 mb-2" />
               <p className="text-sm font-bold text-slate-400 mb-1">
                 {lang === 'cz' ? 'Zatím žádné záznamy' : 'No records yet'}
               </p>
               <p className="text-[10px] items-center text-slate-400 max-w-[180px]">
                 {lang === 'cz' ? 'Hall of Fame bude dostupná po dokončení prvního turnaje.' : 'Hall of Fame will be available after the first tournament ends.'}
               </p>
             </div>
           </div>
        </div>
      </div>
    </motion.div>
  );
}
