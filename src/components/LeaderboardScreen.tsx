import React, { Dispatch, SetStateAction } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, ChevronDown, ChevronUp, Trophy, Trophy as TrophyIcon, X } from 'lucide-react';
import { Player, Team } from '../types.ts';

type TeamFlagComponent = React.ComponentType<{
  code: string | null | undefined;
  className?: string;
}>;

type UserAvatarComponent = React.ComponentType<{
  player?: Pick<Player, 'username' | 'avatar_emoji' | 'avatar_bg'> | null;
  size?: 'sm' | 'md' | 'lg';
}>;

type LeaderboardPlayer = Player & {
  currentStreak?: number;
  bestStreak?: number;
  rankChange?: number;
};

type LeaderboardScreenProps = {
  t: any;
  lang: 'cz' | 'en';
  user: Player;
  leaderboardWithStreaks: LeaderboardPlayer[];
  teams: Team[];
  winnerPickerTeams: Team[];
  officialWinnerTeam: Team | null;
  deferredLoading: boolean;
  deferredError: string;
  showScoringInfo: boolean;
  setShowScoringInfo: Dispatch<SetStateAction<boolean>>;
  DeferredLeaderboardSkeleton: React.ComponentType;
  TeamFlag: TeamFlagComponent;
  UserAvatar: UserAvatarComponent;
};

export default function LeaderboardScreen({
  t,
  lang,
  user,
  leaderboardWithStreaks,
  teams,
  winnerPickerTeams,
  officialWinnerTeam,
  deferredLoading,
  deferredError,
  showScoringInfo,
  setShowScoringInfo,
  DeferredLeaderboardSkeleton,
  TeamFlag,
  UserAvatar
}: LeaderboardScreenProps) {
  return (
    <motion.div
      key="leaderboard"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
    >
      <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <Trophy className="w-4 h-4" /> {t.globalStandings}
        </span>
        <button
          type="button"
          onClick={() => setShowScoringInfo(true)}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white border border-slate-100 text-slate-400 hover:text-slate-600 hover:border-slate-200 transition-colors shadow-sm"
          aria-label={lang === 'cz' ? 'Informace o bodování' : 'Scoring information'}
        >
          <span className="text-sm font-black normal-case tracking-normal" aria-hidden="true">ⓘ</span>
        </button>
      </h2>

      <AnimatePresence>
        {showScoringInfo && (
          <motion.div
            key="scoring-info-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowScoringInfo(false)}
          >
            <motion.div
              initial={{ y: 16, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 16, scale: 0.98 }}
              className="w-full max-w-sm rounded-3xl border border-slate-100 bg-white p-5 shadow-2xl"
              onClick={event => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">
                  {lang === 'cz' ? 'Bodování' : 'Scoring'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowScoringInfo(false)}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100"
                  aria-label={lang === 'cz' ? 'Zavřít informace o bodování' : 'Close scoring information'}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-1.5">
                {[
                  ['Přesný výsledek', '5 b'],
                  ['Vítěz + rozdíl', '3 b'],
                  ['Správný vítěz', '2 b'],
                  ['Správná remíza', '2 b'],
                  ['Vítěz turnaje', '10 b']
                ].map(([label, points]) => (
                  <div key={label} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                    <span className="text-xs font-bold text-slate-700">{label}</span>
                    <span className="shrink-0 rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-black text-white">
                      {points}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {officialWinnerTeam && (
        <div className="bg-gradient-to-r from-red-600 to-red-700 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden mb-6">
          <TrophyIcon className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 rotate-12" />
          <div className="relative z-10 flex flex-col items-center text-center">
            <p className="text-xs font-bold uppercase opacity-80 mb-2">{t.officialWinner}</p>
            <div className="flex flex-col items-center">
              <TeamFlag code={officialWinnerTeam.flag_code || officialWinnerTeam.id} className="w-20 h-12 mb-2" />
              <span className="text-2xl font-black">{officialWinnerTeam.name}</span>
            </div>
          </div>
        </div>
      )}

      {deferredError && leaderboardWithStreaks.length === 0 && (
        <div className="mb-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-center text-xs font-bold text-red-600">
          {deferredError}
        </div>
      )}

      {deferredLoading && leaderboardWithStreaks.length === 0 ? (
        <DeferredLeaderboardSkeleton />
      ) : (
        <div className="space-y-3">
          {leaderboardWithStreaks.map((p, i) => {
            const pTeamInfo = teams.find(tm => tm.id === p.tournament_winner_id) || winnerPickerTeams.find(tm => tm.id === p.tournament_winner_id);
            const hasCorrectChampionPick = Boolean(officialWinnerTeam && p.tournament_winner_id === officialWinnerTeam.id);
            const rankTone = i === 0 ? 'bg-yellow-400 text-yellow-900' :
              i === 1 ? 'bg-slate-300 text-slate-700' :
              i === 2 ? 'bg-amber-600 text-amber-50' :
              'bg-slate-100 text-slate-500';

            return (
              <div
                key={p.id}
                className={`bg-white rounded-2xl border shadow-sm p-4 transition-colors ${p.id === user.id ? 'border-red-200 bg-red-50/40' : 'border-slate-100'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs font-black shadow-sm ${rankTone}`}>
                      {i + 1}
                    </div>
                    <UserAvatar player={p} size="md" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-black text-slate-800 truncate">{p.username}</span>
                        {p.lobby_role === 'owner' && <span title="Správce lobby">👑</span>}
                        {(p.currentStreak ?? 0) >= 3 && (
                          <span className="text-xs">
                            {(p.currentStreak ?? 0) >= 7 ? '🐐' : (p.currentStreak ?? 0) >= 5 ? '🔥🔥' : '🔥'}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {(p.rankChange ?? 0) > 0 ? (
                          <span className="inline-flex items-center text-[10px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                            <ChevronUp className="w-3 h-3 stroke-[3]" /> {p.rankChange}
                          </span>
                        ) : (p.rankChange ?? 0) < 0 ? (
                          <span className="inline-flex items-center text-[10px] font-black text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md">
                            <ChevronDown className="w-3 h-3 stroke-[3]" /> {Math.abs(p.rankChange ?? 0)}
                          </span>
                        ) : (
                          <span className="text-[10px] font-black text-slate-300 bg-slate-50 px-1.5 py-0.5 rounded-md">=</span>
                        )}
                        {pTeamInfo && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200/60">
                            <TeamFlag code={pTeamInfo.flag_code || pTeamInfo.id} className="w-4 h-2.5 shadow-sm" />
                            {pTeamInfo.short_name || pTeamInfo.name.substring(0, 3).toUpperCase()}
                          </span>
                        )}
                        {hasCorrectChampionPick && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100">
                            <CheckCircle2 className="w-3 h-3 stroke-[3]" />
                            Správný tip · +10 bodů
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-black text-slate-900 leading-none">{p.total_points ?? 0}</p>
                    <p className="text-[9px] font-black uppercase text-slate-400 mt-1">{t.pts}</p>
                  </div>
                </div>
                <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                  <div className="min-w-0 rounded-xl bg-slate-50 px-1.5 py-1.5">
                    <p className="text-[9px] font-black uppercase leading-none text-slate-400">
                      <span className="block">{lang === 'cz' ? 'Přesné' : 'Exact'}</span>
                      <span className="block">{lang === 'cz' ? 'skóre' : 'score'}</span>
                    </p>
                    <p className="mt-0.5 text-sm font-black leading-none text-slate-800">{p.exact_hits ?? 0}</p>
                  </div>
                  <div className="min-w-0 rounded-xl bg-slate-50 px-1.5 py-1.5">
                    <p className="text-[9px] font-black uppercase leading-none text-slate-400">
                      <span className="block">{lang === 'cz' ? 'Rozdíl' : 'Goal'}</span>
                      <span className="block">{lang === 'cz' ? 'gólů' : 'difference'}</span>
                    </p>
                    <p className="mt-0.5 text-sm font-black leading-none text-slate-800">{p.goal_difference_hits ?? 0}</p>
                  </div>
                  <div className="min-w-0 rounded-xl bg-slate-50 px-1.5 py-1.5">
                    <p className="text-[9px] font-black uppercase leading-none text-slate-400">
                      <span className="block">{lang === 'cz' ? 'Správný' : 'Correct'}</span>
                      <span className="block">{lang === 'cz' ? 'vítěz' : 'winner'}</span>
                    </p>
                    <p className="mt-0.5 text-sm font-black leading-none text-slate-800">{p.winner_hits ?? 0}</p>
                  </div>
                  <div className="min-w-0 rounded-xl bg-slate-50 px-1.5 py-1.5">
                    <p className="text-[9px] font-black uppercase leading-none text-slate-400">
                      <span className="block">{lang === 'cz' ? 'Tip na' : 'Inexact'}</span>
                      <span className="block">{lang === 'cz' ? 'remízu' : 'draw'}</span>
                    </p>
                    <p className="mt-0.5 text-sm font-black leading-none text-slate-800">{p.draw_hits ?? 0}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
