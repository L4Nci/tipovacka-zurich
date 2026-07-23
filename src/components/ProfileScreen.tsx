import React, { Dispatch, FormEvent, SetStateAction } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Flame, LogOut, Pencil, X } from 'lucide-react';
import { Player } from '../types.ts';

const avatarEmojis = [
  '😀', '😎', '🤖', '👑', '🦊', '🐺', '🦁', '🚀', '⚽', '🏒',
  '🐯', '🐼', '🐨', '🐵', '🦅', '🦉', '🦈', '🐙', '🦖', '🐉',
  '🦄', '🐸', '🐧', '🦔', '🦥', '🐻', '🐗', '🦇', '🐬', '🐢',
  '🦂', '🐍', '🦋', '🐞', '🐝', '🐿️', '🦝', '🐱', '🐶'
];

const avatarColors = ['#fee2e2', '#ffedd5', '#fef3c7', '#dcfce7', '#ccfbf1', '#dbeafe', '#e0e7ff', '#f3e8ff', '#fce7f3', '#e2e8f0'];

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
  passData: { newPass: string; confirmPass: string };
  setPassData: Dispatch<SetStateAction<{ newPass: string; confirmPass: string }>>;
  passMsg: string;
  passError: string;
  isPassSaving: boolean;
  logoutError: string;
  isLoggingOut: boolean;
  onUpdatePassword: (event: FormEvent) => Promise<void>;
  avatarData: { emoji: string; bg: string };
  showAvatarEditor: boolean;
  setShowAvatarEditor: Dispatch<SetStateAction<boolean>>;
  avatarMsg: string;
  avatarError: string;
  onSaveAvatar: (emoji?: string, bg?: string) => Promise<void>;
  onLogout: () => Promise<void>;
  setLang: Dispatch<SetStateAction<'cz' | 'en'>>;
  UserAvatar: UserAvatarComponent;
};

export default function ProfileScreen({
  t,
  lang,
  user,
  currentUserStats,
  currentUserRank,
  currentUserLeaderGap,
  passData,
  setPassData,
  passMsg,
  passError,
  isPassSaving,
  logoutError,
  isLoggingOut,
  onUpdatePassword,
  avatarData,
  showAvatarEditor,
  setShowAvatarEditor,
  avatarMsg,
  avatarError,
  onSaveAvatar,
  onLogout,
  setLang,
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

      <button
        onClick={onLogout}
        disabled={isLoggingOut}
        className="w-full py-4 bg-slate-50 text-slate-400 rounded-3xl font-bold uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 hover:text-red-500 transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LogOut className="w-4 h-4" />
        {isLoggingOut
          ? (lang === 'cz' ? 'Odhlašuji...' : 'Logging out...')
          : (lang === 'cz' ? 'Odhlásit se' : 'Logout')}
      </button>
      {logoutError && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-center text-[10px] font-bold text-red-600">
          {logoutError}
        </p>
      )}
    </motion.div>
  );
}
