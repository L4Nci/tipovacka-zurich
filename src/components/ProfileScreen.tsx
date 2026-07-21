import React, { Dispatch, FormEvent, SetStateAction } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, ChevronDown, Flame, LogOut, Pencil, X } from 'lucide-react';
import { Lobby, Player, Team } from '../types.ts';

const avatarEmojis = [
  '😀', '😎', '🤖', '👑', '🦊', '🐺', '🦁', '🚀', '⚽', '🏒',
  '🐯', '🐼', '🐨', '🐵', '🦅', '🦉', '🦈', '🐙', '🦖', '🐉',
  '🦄', '🐸', '🐧', '🦔', '🦥', '🐻', '🐗', '🦇', '🐬', '🐢',
  '🦂', '🐍', '🦋', '🐞', '🐝', '🐿️', '🦝', '🐱', '🐶'
];

const avatarColors = ['#fee2e2', '#ffedd5', '#fef3c7', '#dcfce7', '#ccfbf1', '#dbeafe', '#e0e7ff', '#f3e8ff', '#fce7f3', '#e2e8f0'];

type TeamFlagComponent = React.ComponentType<{
  code: string | null | undefined;
  className?: string;
}>;

type UserAvatarComponent = React.ComponentType<{
  player?: Pick<Player, 'username' | 'avatar_emoji' | 'avatar_bg'> | null;
  size?: 'sm' | 'md' | 'lg';
}>;

type ProfileStats = Player & {
  currentStreak?: number;
  bestStreak?: number;
  history?: { points: number; res: 'W' | 'L' | 'E' }[];
};

type ProfileScreenProps = {
  t: any;
  lang: 'cz' | 'en';
  user: Player;
  currentUserStats: ProfileStats;
  currentUserRank: number | null;
  currentUserLeaderGap: number;
  winnerPickerTeams: Team[];
  currentUserPickId?: string;
  isWinnerPickerLocked: boolean;
  onPickTournamentWinner: (teamId: string) => Promise<void>;
  passData: { newPass: string; confirmPass: string };
  setPassData: Dispatch<SetStateAction<{ newPass: string; confirmPass: string }>>;
  passMsg: string;
  passError: string;
  isPassSaving: boolean;
  onUpdatePassword: (event: FormEvent) => Promise<void>;
  avatarData: { emoji: string; bg: string };
  showAvatarEditor: boolean;
  setShowAvatarEditor: Dispatch<SetStateAction<boolean>>;
  avatarMsg: string;
  avatarError: string;
  onSaveAvatar: (emoji?: string, bg?: string) => Promise<void>;
  activeLobby: Lobby | undefined;
  isLobbyRulesOpen: boolean;
  setIsLobbyRulesOpen: Dispatch<SetStateAction<boolean>>;
  canEditActiveLobby: boolean;
  isEditingLobbyInfo: boolean;
  setIsEditingLobbyInfo: Dispatch<SetStateAction<boolean>>;
  editLobbyShortDescription: string;
  setEditLobbyShortDescription: Dispatch<SetStateAction<string>>;
  editLobbyLongDescription: string;
  setEditLobbyLongDescription: Dispatch<SetStateAction<string>>;
  isLobbyInfoSaving: boolean;
  lobbyInfoMsg: string;
  lobbyInfoError: string;
  onSaveLobbyInfo: (event: FormEvent) => Promise<void>;
  onLogout: () => void;
  setLang: Dispatch<SetStateAction<'cz' | 'en'>>;
  TeamFlag: TeamFlagComponent;
  UserAvatar: UserAvatarComponent;
};

export default function ProfileScreen({
  t,
  lang,
  user,
  currentUserStats,
  currentUserRank,
  currentUserLeaderGap,
  winnerPickerTeams,
  currentUserPickId,
  isWinnerPickerLocked,
  onPickTournamentWinner,
  passData,
  setPassData,
  passMsg,
  passError,
  isPassSaving,
  onUpdatePassword,
  avatarData,
  showAvatarEditor,
  setShowAvatarEditor,
  avatarMsg,
  avatarError,
  onSaveAvatar,
  activeLobby,
  isLobbyRulesOpen,
  setIsLobbyRulesOpen,
  canEditActiveLobby,
  isEditingLobbyInfo,
  setIsEditingLobbyInfo,
  editLobbyShortDescription,
  setEditLobbyShortDescription,
  editLobbyLongDescription,
  setEditLobbyLongDescription,
  isLobbyInfoSaving,
  lobbyInfoMsg,
  lobbyInfoError,
  onSaveLobbyInfo,
  onLogout,
  setLang,
  TeamFlag,
  UserAvatar
}: ProfileScreenProps) {
  return (
    <motion.div
      key="profile"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="space-y-4"
    >
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col items-center transition-colors">
        <div className="mb-4 relative">
          <UserAvatar player={user} size="lg" />
          <button
            type="button"
            onClick={() => setShowAvatarEditor(true)}
            className="absolute -right-1 -bottom-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg ring-4 ring-white active:scale-95 transition-all"
            aria-label={lang === 'cz' ? 'Upravit avatar' : 'Edit avatar'}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
        <h2 className="text-xl font-black text-slate-900 uppercase transition-colors">{user.username}</h2>
        {(currentUserStats.currentStreak ?? 0) >= 3 && (
          <div className="mt-2 flex items-center gap-1 text-orange-500 font-black italic text-sm">
            <Flame className="w-4 h-4 fill-current" />
            {(currentUserStats.currentStreak ?? 0) >= 7 ? 'GOAT' :
             (currentUserStats.currentStreak ?? 0) >= 5 ? 'ON FIRE' : 'HOT'}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showAvatarEditor && (
          <motion.div
            key="avatar-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center px-4 pb-4"
            onClick={() => setShowAvatarEditor(false)}
          >
            <motion.div
              initial={{ y: 24, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 24, scale: 0.98 }}
              className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-slate-100"
              onClick={event => event.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {lang === 'cz' ? 'Avatar' : 'Avatar'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAvatarEditor(false)}
                  className="w-8 h-8 rounded-full bg-slate-50 text-slate-500 flex items-center justify-center hover:bg-slate-100"
                  aria-label={lang === 'cz' ? 'Zavřít avatar editor' : 'Close avatar editor'}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex justify-center mb-4">
                <UserAvatar player={{ username: user.username, avatar_emoji: avatarData.emoji, avatar_bg: avatarData.bg }} size="lg" />
              </div>
              <div className="grid grid-cols-5 gap-2 mb-4">
                {avatarEmojis.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onSaveAvatar(emoji, avatarData.bg)}
                    className={`h-10 rounded-xl text-xl border transition-all ${avatarData.emoji === emoji ? 'border-red-600 bg-red-50 shadow-sm scale-105' : 'border-slate-100 bg-slate-50 hover:border-slate-200'}`}
                    aria-label={`Avatar ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-2">
                {avatarColors.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => onSaveAvatar(avatarData.emoji, color)}
                    className={`h-9 rounded-xl border transition-all ${avatarData.bg === color ? 'border-slate-900 ring-2 ring-slate-900/10 scale-105' : 'border-white hover:border-slate-200'}`}
                    style={{ backgroundColor: color }}
                    aria-label={`Avatar color ${color}`}
                  />
                ))}
              </div>
              {avatarMsg && <p className="text-[10px] text-green-600 font-bold text-center mt-3">{avatarMsg}</p>}
              {avatarError && <p className="text-[10px] text-red-600 font-bold text-center mt-3">{avatarError}</p>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 transition-colors">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 text-center">{lang === 'cz' ? 'Historie (posledních 10)' : 'History (last 10)'}</h3>
        <div className="grid grid-cols-10 gap-1">
          {(currentUserStats.history ?? []).map((h, idx) => (
            <div key={idx} className="min-w-0 flex flex-col items-center gap-0.5">
              <div className={`aspect-square w-full rounded-lg flex items-center justify-center text-[9px] font-black border transition-colors ${
                h.res === 'E' ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm shadow-emerald-100' :
                h.res === 'W' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                'bg-slate-50 text-slate-400 border-slate-100'
              }`}>
                {h.res === 'L' ? '0' : `+${h.points}`}
              </div>
              <span className="text-[7px] font-bold leading-none text-slate-300">
                {h.res === 'E' ? '✔✔' : h.res === 'W' ? '✔' : '✖'}
              </span>
            </div>
          ))}
          {(currentUserStats.history ?? []).length === 0 && <p className="col-span-10 text-center text-[10px] text-slate-400 italic">Zatím žádná historie</p>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex flex-col items-center transition-colors">
          <p className="text-[9px] font-bold text-slate-400 uppercase whitespace-nowrap">{t.totalPoints}</p>
          <p className="mt-1 text-2xl font-black leading-none text-red-600 transition-colors">{currentUserStats.total_points}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex flex-col items-center transition-colors">
          <p className="text-[9px] font-bold text-slate-400 uppercase whitespace-nowrap">{lang === 'cz' ? 'Pořadí' : 'Rank'}</p>
          <p className="mt-1 text-2xl font-black leading-none text-slate-900 transition-colors">#{currentUserRank ?? '-'}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex flex-col items-center transition-colors">
          <p className="text-[9px] font-bold text-slate-400 uppercase whitespace-nowrap">{lang === 'cz' ? 'Na lídra' : 'To Leader'}</p>
          <p className="mt-1 text-2xl font-black leading-none text-slate-900 transition-colors">{currentUserLeaderGap}</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-3 shadow-sm border border-slate-100 transition-colors">
        <div className="grid grid-cols-4 gap-1.5">
          <div className="min-w-0 rounded-xl bg-slate-50 px-1.5 py-2">
            <p className="text-[9px] font-black uppercase leading-none text-slate-400">{t.exact}</p>
            <p className="mt-1 text-sm font-black leading-none text-slate-800">{currentUserStats.exact_hits ?? 0}</p>
          </div>
          <div className="min-w-0 rounded-xl bg-slate-50 px-1.5 py-2">
            <p className="text-[9px] font-black uppercase leading-none text-slate-400">{t.goalDiff}</p>
            <p className="mt-1 text-sm font-black leading-none text-slate-800">{currentUserStats.goal_difference_hits ?? 0}</p>
          </div>
          <div className="min-w-0 rounded-xl bg-slate-50 px-1.5 py-2">
            <p className="text-[9px] font-black uppercase leading-none text-slate-400">{t.winner}</p>
            <p className="mt-1 text-sm font-black leading-none text-slate-800">{currentUserStats.winner_hits ?? 0}</p>
          </div>
          <div className="min-w-0 rounded-xl bg-slate-50 px-1.5 py-2">
            <p className="text-[9px] font-black uppercase leading-none text-slate-400">{t.draw}</p>
            <p className="mt-1 text-sm font-black leading-none text-slate-800">{currentUserStats.draw_hits ?? 0}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex flex-col items-center transition-colors">
          <p className="text-[9px] font-bold text-slate-400 uppercase whitespace-nowrap">{lang === 'cz' ? 'Nejlepší série' : 'Best Streak'}</p>
          <p className="mt-1 text-2xl font-black leading-none text-slate-900 transition-colors">{currentUserStats.bestStreak}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex flex-col items-center transition-colors">
          <p className="text-[9px] font-bold text-slate-400 uppercase whitespace-nowrap">{lang === 'cz' ? 'Aktuální série' : 'Current Streak'}</p>
          <div className="flex items-center gap-2">
            <p className="mt-1 text-2xl font-black leading-none text-orange-500 transition-colors">{currentUserStats.currentStreak}</p>
            <Flame className={`w-4 h-4 ${(currentUserStats.currentStreak ?? 0) >= 3 ? 'text-orange-500 fill-current' : 'text-slate-100'}`} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 transition-colors">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center justify-between">
          {t.pickWinner} ({winnerPickerTeams.length} TEAMS AVAILABLE)
          {isWinnerPickerLocked ? <span className="bg-slate-100 text-[8px] px-2 py-0.5 rounded-full text-slate-500 uppercase transition-colors">Locked</span> : null}
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {winnerPickerTeams.map(tm => {
            const isSelected = tm.id === currentUserPickId;
            let buttonStateClass = 'bg-slate-50 border-transparent hover:border-slate-200';
            if (isWinnerPickerLocked) {
              buttonStateClass = 'bg-slate-50 border-transparent opacity-40 grayscale cursor-not-allowed';
            }
            if (isSelected) {
              buttonStateClass = 'bg-red-600 border-red-600 scale-105 shadow-lg shadow-red-100 z-[1]';
            }

            return (
              <motion.button
                key={tm.id}
                whileTap={!isWinnerPickerLocked ? { scale: 0.9 } : {}}
                onClick={() => !isWinnerPickerLocked && onPickTournamentWinner(tm.id)}
                disabled={isWinnerPickerLocked}
                className={`p-2 rounded-xl flex flex-col items-center border transition-all relative ${buttonStateClass}`}
              >
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 bg-white rounded-full p-0.5 shadow-sm"
                  >
                    <CheckCircle2 className="w-3 h-3 text-red-600" />
                  </motion.div>
                )}
                <TeamFlag code={tm.flag_code || tm.id} className="w-10 h-6 mb-1" />
                <span className={`text-[10px] font-black ${isSelected ? 'text-white' : 'text-slate-400'}`}>
                  {tm.short_name ? tm.short_name : tm.id.replace('football-', '').toUpperCase()}
                </span>
              </motion.button>
            );
          })}
        </div>
        <p className="mt-4 text-[10px] text-center text-slate-400 italic font-medium">{t.lockedWinner}</p>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 transition-colors">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 italic">{t.changePass}</h3>
        <form onSubmit={onUpdatePassword} className="space-y-3">
          <input
            type="password"
            placeholder={t.newPass}
            value={passData.newPass}
            onChange={e => setPassData(p => ({ ...p, newPass: e.target.value }))}
            className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 text-sm focus:ring-2 focus:ring-red-500 transition-all outline-none"
            required
          />
          <input
            type="password"
            placeholder={t.confirmPass}
            value={passData.confirmPass}
            onChange={e => setPassData(p => ({ ...p, confirmPass: e.target.value }))}
            className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 text-sm focus:ring-2 focus:ring-red-500 transition-all outline-none"
            required
          />
          <button
            type="submit"
            disabled={isPassSaving}
            className="w-full py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest active:scale-95 transition-all shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPassSaving ? (lang === 'cz' ? 'Ukládám...' : 'Saving...') : t.changePass}
          </button>
          {passMsg && <p className="text-[10px] text-green-600 font-bold text-center mt-2">{passMsg}</p>}
          {passError && <p className="text-[10px] text-red-600 font-bold text-center mt-2">{passError}</p>}
        </form>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 transition-colors">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">{t.langSelect}</h3>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setLang('cz')}
            className={`py-3 rounded-2xl font-black border-2 transition-all ${lang === 'cz' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-100'}`}
          >
            Čeština
          </button>
          <button
            onClick={() => setLang('en')}
            className={`py-3 rounded-2xl font-black border-2 transition-all ${lang === 'en' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-100'}`}
          >
            English
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => setIsLobbyRulesOpen(open => !open)}
            className="flex flex-1 items-center gap-3 min-w-0 text-left"
            aria-expanded={isLobbyRulesOpen}
          >
            <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-black shrink-0">
              ⓘ
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-black text-slate-800 uppercase tracking-wider">
                {lang === 'cz' ? 'O lobby' : 'About lobby'}
              </span>
              <span className="block text-[10px] font-semibold text-slate-400 mt-0.5">
                {lang === 'cz' ? 'Informace o skupině, komunikaci a domluvě' : 'Group information, communication and notes'}
              </span>
            </span>
          </button>
          <div className="flex items-center gap-1 shrink-0">
            {canEditActiveLobby && (
              <button
                type="button"
                onClick={() => {
                  setIsEditingLobbyInfo(true);
                  setIsLobbyRulesOpen(true);
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label={lang === 'cz' ? 'Upravit O lobby' : 'Edit about lobby'}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsLobbyRulesOpen(open => !open)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-slate-100 transition-colors"
              aria-label={isLobbyRulesOpen ? (lang === 'cz' ? 'Sbalit O lobby' : 'Collapse about lobby') : (lang === 'cz' ? 'Rozbalit O lobby' : 'Expand about lobby')}
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${isLobbyRulesOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {isLobbyRulesOpen && (
            <motion.div
              key="profile-lobby-about"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              {isEditingLobbyInfo ? (
                <form onSubmit={onSaveLobbyInfo} className="mt-4 space-y-3">
                  <input
                    type="text"
                    value={editLobbyShortDescription}
                    onChange={e => setEditLobbyShortDescription(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 text-sm font-semibold focus:ring-2 focus:ring-red-500 transition-all outline-none"
                    placeholder={lang === 'cz' ? 'Krátké shrnutí skupiny' : 'Short group summary'}
                    maxLength={120}
                  />
                  <textarea
                    value={editLobbyLongDescription}
                    onChange={e => setEditLobbyLongDescription(e.target.value)}
                    className="w-full min-h-[120px] px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 text-sm font-medium focus:ring-2 focus:ring-red-500 transition-all outline-none resize-y"
                    placeholder={lang === 'cz' ? 'Zatím bez popisu skupiny.' : 'No group description yet.'}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingLobbyInfo(false);
                        setEditLobbyShortDescription(activeLobby?.short_description || '');
                        setEditLobbyLongDescription(activeLobby?.long_description || '');
                      }}
                      className="px-3 py-2 rounded-xl bg-slate-50 text-slate-500 text-[10px] font-black uppercase tracking-wider"
                    >
                      {lang === 'cz' ? 'Zrušit' : 'Cancel'}
                    </button>
                    <button
                      type="submit"
                      disabled={isLobbyInfoSaving}
                      className="px-3 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-60"
                    >
                      {isLobbyInfoSaving ? (lang === 'cz' ? 'Ukládám...' : 'Saving...') : (lang === 'cz' ? 'Uložit' : 'Save')}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="mt-4 rounded-2xl bg-slate-50 border border-slate-100 p-4">
                  <p className="text-xs font-medium text-slate-600 leading-relaxed whitespace-pre-wrap">
                    {activeLobby?.long_description || (lang === 'cz' ? 'Zatím bez popisu skupiny.' : 'No group description yet.')}
                  </p>
                </div>
              )}
              {lobbyInfoMsg && <p className="text-[10px] text-green-600 font-bold text-center mt-3">{lobbyInfoMsg}</p>}
              {lobbyInfoError && <p className="text-[10px] text-red-600 font-bold text-center mt-3">{lobbyInfoError}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button
        onClick={onLogout}
        className="w-full py-4 bg-slate-50 text-slate-400 rounded-3xl font-bold uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 hover:text-red-500 transition-colors active:scale-95"
      >
        <LogOut className="w-4 h-4" />
        {lang === 'cz' ? 'Odhlásit se' : 'Logout'}
      </button>
    </motion.div>
  );
}
