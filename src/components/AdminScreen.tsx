import React, { Dispatch, SetStateAction, useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck } from 'lucide-react';
import { Match, Team } from '../types.ts';

type StageFilter = {
  id: string;
  label: string;
};

type TeamFlagComponent = React.ComponentType<{
  code: string | null | undefined;
  className?: string;
}>;

type AdminScreenProps = {
  t: any;
  stageFilters: StageFilter[];
  adminMatchFilter: 'scheduled' | 'finished';
  setAdminMatchFilter: Dispatch<SetStateAction<'scheduled' | 'finished'>>;
  adminGroupFilter: string;
  setAdminGroupFilter: Dispatch<SetStateAction<string>>;
  adminMatchesForView: Match[];
  onUpdateMatchResult: (matchId: string, homeScore: number, awayScore: number) => Promise<void>;
  adminChampionOptions: Team[];
  selectedWinner: string | null;
  setSelectedWinner: Dispatch<SetStateAction<string | null>>;
  onSetTournamentWinner: (teamId: string) => Promise<void>;
  championMsg: string;
  championError: string;
  TeamFlag: TeamFlagComponent;
};

const AdminMatchCard: React.FC<{
  match: Match;
  onUpdate: (h: number, a: number) => Promise<void>;
  t: any;
  isHockey?: boolean;
  TeamFlag: TeamFlagComponent;
}> = ({ match, onUpdate, t, isHockey = false, TeamFlag }) => {
  const [adminH, setAdminH] = useState(match.home_score ?? 0);
  const [adminA, setAdminA] = useState(match.away_score ?? 0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdate = async () => {
    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }
    setIsUpdating(true);
    try {
      await onUpdate(adminH, adminA);
      setShowConfirm(false);
    } catch (err) {
      // handled by parent alert
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mb-4 overflow-hidden transition-colors">
      <div className="flex justify-between items-center mb-4">
        <span className="text-xs font-bold text-slate-400 uppercase">{match.stage}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition-colors ${match.status === 'finished' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
          {match.status.toUpperCase()}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex flex-col items-center flex-1">
          <TeamFlag code={match.home_flag || match.home_team_id} className="w-12 h-8 mb-1" />
          <div className="flex items-center gap-1">
            <button onClick={() => setAdminH(Math.max(0, adminH - 1))} className="w-8 h-8 bg-slate-50 rounded-full border border-slate-200 flex items-center justify-center font-bold text-slate-600 active:scale-90 transition-colors">-</button>
            <span className="text-xl font-black w-6 text-center text-slate-900 transition-colors">{adminH}</span>
            <button onClick={() => setAdminH(adminH + 1)} className="w-8 h-8 bg-slate-50 rounded-full border border-slate-200 flex items-center justify-center font-bold text-slate-600 active:scale-90 transition-colors">+</button>
          </div>
        </div>

        <span className="text-slate-300 font-bold text-xl">:</span>

        <div className="flex flex-col items-center flex-1">
          <TeamFlag code={match.away_flag || match.away_team_id} className="w-12 h-8 mb-1" />
          <div className="flex items-center gap-1">
            <button onClick={() => setAdminA(Math.max(0, adminA - 1))} className="w-8 h-8 bg-slate-50 rounded-full border border-slate-200 flex items-center justify-center font-bold text-slate-600 active:scale-90 transition-colors">-</button>
            <span className="text-xl font-black w-6 text-center text-slate-900 transition-colors">{adminA}</span>
            <button onClick={() => setAdminA(adminA + 1)} className="w-8 h-8 bg-slate-50 rounded-full border border-slate-200 flex items-center justify-center font-bold text-slate-600 active:scale-90 transition-colors">+</button>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <button
          onClick={handleUpdate}
          disabled={(isHockey && adminH === adminA) || isUpdating}
          className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm flex items-center justify-center gap-2 ${
            (isHockey && adminH === adminA) ? 'bg-slate-100 text-slate-400 cursor-not-allowed' :
            showConfirm ? 'bg-orange-600 text-white animate-pulse' : 'bg-slate-900 text-white active:scale-95'
          }`}
        >
          {isUpdating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> :
           showConfirm ? (t.lang === 'cz' ? 'Určitě?' : 'Are you sure?') : t.updateResult}
        </button>
        {showConfirm && (
          <button
            onClick={() => setShowConfirm(false)}
            className="w-full py-2 text-[10px] font-bold text-slate-400 uppercase"
          >
            {t.lang === 'cz' ? 'Zrušit' : 'Cancel'}
          </button>
        )}
      </div>
      {isHockey && adminH === adminA && <p className="mt-2 text-[10px] text-center text-slate-400 italic">{t.noDraws}</p>}
    </div>
  );
};

export default function AdminScreen({
  t,
  stageFilters,
  adminMatchFilter,
  setAdminMatchFilter,
  adminGroupFilter,
  setAdminGroupFilter,
  adminMatchesForView,
  onUpdateMatchResult,
  adminChampionOptions,
  selectedWinner,
  setSelectedWinner,
  onSetTournamentWinner,
  championMsg,
  championError,
  TeamFlag
}: AdminScreenProps) {
  return (
    <motion.div
      key="admin"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
    >
      <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4" /> {t.adminControls}
      </h2>

      <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-xl transition-colors">
        <button
          onClick={() => setAdminMatchFilter('scheduled')}
          className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${adminMatchFilter === 'scheduled' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
        >
          {t.upcoming}
        </button>
        <button
          onClick={() => setAdminMatchFilter('finished')}
          className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${adminMatchFilter === 'finished' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
        >
          {t.finished}
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-4 no-scrollbar mb-4">
        {stageFilters.map(f => (
          <button
            key={f.id}
            onClick={() => setAdminGroupFilter(f.id)}
            className={`flex-none px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${
              adminGroupFilter === f.id ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-400 border border-slate-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {adminMatchesForView.map(m => (
        <AdminMatchCard
          key={m.id}
          match={m}
          t={t}
          onUpdate={(h, a) => onUpdateMatchResult(m.id, h, a)}
          isHockey={m.tournament_id === "ms-hockey-2026"}
          TeamFlag={TeamFlag}
        />
      ))}

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mb-4 mt-8">
        <h3 className="text-xs font-bold text-slate-400 uppercase mb-4">{t.setFinalWinner}</h3>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {adminChampionOptions.map(tm => (
            <button
              key={tm.id}
              onClick={() => setSelectedWinner(tm.id)}
              className={`p-2 rounded-xl flex flex-col items-center border transition-all ${
                selectedWinner === tm.id ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-transparent'
              }`}
            >
              <TeamFlag code={tm.flag_code || tm.id} className="w-10 h-6 mb-1" />
              <span className="text-[10px] font-bold">{(tm.short_name || tm.id).toUpperCase()}</span>
            </button>
          ))}
        </div>
        <button
          disabled={!selectedWinner}
          onClick={() => selectedWinner && onSetTournamentWinner(selectedWinner)}
          className={`w-full py-3 rounded-xl font-bold shadow-md transition-colors ${
            selectedWinner
              ? 'bg-orange-600 text-white shadow-orange-100'
              : 'bg-slate-100 text-slate-400 shadow-none cursor-not-allowed'
          }`}
        >
          {t.setFinalChampion}
        </button>
        {championMsg && <p className="mt-2 text-[10px] text-green-600 font-bold text-center">{championMsg}</p>}
        {championError && <p className="mt-2 text-[10px] text-red-600 font-bold text-center">{championError}</p>}
      </div>
    </motion.div>
  );
}
