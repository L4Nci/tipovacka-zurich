import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  Calendar, 
  CheckCircle2, 
  UserPlus,
  ShieldCheck, 
  ChevronRight, 
  Trophy as TrophyIcon,
  Flame,
  Clock,
  LogOut,
  ChevronDown,
  ChevronUp,
  X,
  Pencil
} from 'lucide-react';
import { Player, Team, Match, Prediction, Lobby } from './types.ts';
import { LobbyView } from './components/LobbyView.tsx';
import { supabase } from './lib/supabase.ts';
import { isDrawPrediction, isFootballKnockoutStage } from './lib/matchRules.ts';
import { 
  fetchAllData, 
  loginUser, 
  registerUser, 
  savePrediction as savePredDB, 
  fetchMatchPredictions,
  updateMatchResult as updateMatchResDB,
  setTournamentWinner as setWinnerDB,
  pickTournamentWinner as pickWinnerDB,
  changePassword as changePassDB,
  updateProfileAvatar,
  updateLobbyDetails,
  checkSession,
  createLobby,
  joinLobbyByCode,
  calculatePoints
} from './lib/db.ts';

const translations = {
  cz: {
    matches: "Zápasy",
    results: "Výsledky",
    rank: "Pořadí",
    admin: "Admin",
    profile: "Já",
    upcoming: "Nadcházející zápasy",
    finished: "Odehrané zápasy",
    pts: "body",
    exact: "přesné",
    goalDiff: "rozdíl",
    winner: "vítěz",
    draw: "remíza",
    saveTip: "Uložit tip",
    updateTip: "Aktualizovat tip",
    yourPrediction: "Tvůj tip",
    noUpcoming: "Žádné nadcházející zápasy.",
    noResults: "Žádné výsledky.",
    globalStandings: "Celkové pořadí",
    pos: "Poz",
    player: "Hráč",
    tournamentWinner: "Tvůj vítěz turnaje",
    pickWinner: "Vyber vítěze turnaje",
    currentStreak: "Aktuální série",
    bestStreak: "Nejlepší série",
    totalPoints: "Celkem bodů",
    exactScores: "Přesné skóre",
    langSelect: "Jazyk / Language",
    logout: "Odhlásit se",
    loginTitle: "FAN TIPOVAČKA",
    signin: "Přihlásit se",
    register: "Registrovat se",
    noAccount: "Nemáš účet? Registruj se",
    hasAccount: "Máš účet? Přihlas se",
    username: "Uživatelské jméno",
    password: "Heslo",
    worldChampionship: "ZURICH & FRIBOURG, SWITZERLAND",
    othersTip: "tipy ostatních",
    hide: "Skrýt",
    show: "Zobrazit",
    locked: "Méně než 5 min do zápasu",
    noPredictions: "Zatím žádné tipy.",
    notPicked: "Zatím nevybráno",
    lockedWinner: "Uzamčeno 5 min před prvním zápasem",
    adminControls: "Administrace",
    setFinalWinner: "Nastavit vítěze turnaje",
    setFinalChampion: "Potvrdit šampiona",
    updateResult: "Uložit výsledek a přepočítat",
    loading: "Načítání...",
    all: "Vše",
    tipsCount: "tipů",
    createUser: "Vytvořit nového hráče",
    newUsername: "Nové uživatelské jméno",
    newPassword: "Heslo pro nového hráče",
    create: "Vytvořit účet",
    userCreated: "Hráč byl úspěšně vytvořen!",
    officialWinner: "Skutečný šampion turnaje",
    noDraws: "Remíza není povolena. Jeden tým musí vyhrát!",
    playoffNoDraws: "V play-off nelze tipovat remízu.",
    playoffWinnerRequired: "V play-off musíš vybrat vítěze.",
    pickMatchWinner: "Vyber vítěze zápasu",
    tipSaved: "Tip uložen! ✅",
    notTipped: "Nenatipoval jsi :(",
    locksIn: "Zamyká se za",
    locksAt: "Zamyká se",
    changePass: "Změnit heslo",
    newPass: "Nové heslo",
    passUpdated: "Heslo aktualizováno! ✅",
    confirmPass: "Potvrďte nové heslo",
    passMismatch: "Hesla se neshodují!",
  },
  en: {
    matches: "Matches",
    results: "Results",
    rank: "Rank",
    admin: "Admin",
    profile: "Me",
    upcoming: "Upcoming Matches",
    finished: "Finished Matches",
    pts: "pts",
    exact: "exact",
    goalDiff: "diff",
    winner: "winner",
    draw: "draw",
    saveTip: "Save Prediction",
    updateTip: "Update Prediction",
    yourPrediction: "Your Prediction",
    noUpcoming: "No upcoming matches.",
    noResults: "No results.",
    globalStandings: "Global Standings",
    pos: "Pos",
    player: "Player",
    tournamentWinner: "Your Tournament Winner",
    pickWinner: "Pick Tournament Winner",
    currentStreak: "Current Streak",
    bestStreak: "Best Streak",
    totalPoints: "Total Points",
    exactScores: "Exact Scores",
    langSelect: "Language",
    logout: "Logout",
    loginTitle: "FAN PREDICTOR",
    signin: "Sign In",
    register: "Register",
    noAccount: "No account? Register here",
    hasAccount: "Have an account? Sign in",
    username: "Username",
    password: "Password",
    worldChampionship: "World Championship",
    othersTip: "other users' predictions",
    hide: "Hide",
    show: "Show",
    locked: "Less than 5 min to game",
    noPredictions: "No predictions yet.",
    notPicked: "Not picked yet",
    lockedWinner: "Locked 5 min before first game",
    adminControls: "Admin Controls",
    setFinalWinner: "Set Tournament Winner",
    setFinalChampion: "Set Final Champion",
    updateResult: "Update Final Result & Recalculate",
    loading: "Loading...",
    all: "All",
    tipsCount: "tips",
    createUser: "Create New Player",
    newUsername: "New Username",
    newPassword: "New User Password",
    create: "Create Account",
    userCreated: "Player created successfully!",
    officialWinner: "Official Tournament Winner",
    noDraws: "Draws are not allowed. One team must win!",
    playoffNoDraws: "Draw predictions are not allowed in playoffs.",
    playoffWinnerRequired: "Pick a winner in playoffs.",
    pickMatchWinner: "Pick match winner",
    tipSaved: "Tip saved! ✅",
    notTipped: "You didn't predict :(",
    locksIn: "Locks in",
    locksAt: "Locks at",
    changePass: "Change Password",
    newPass: "New Password",
    confirmPass: "Confirm New Password",
    passUpdated: "Password updated! ✅",
    passMismatch: "Passwords do not match!",
  }
};

// --- Components ---

const avatarEmojis = [
  '😀', '😎', '🤖', '👑', '🦊', '🐺', '🦁', '🚀', '⚽', '🏒',
  '🐯', '🐼', '🐨', '🐵', '🦅', '🦉', '🦈', '🐙', '🦖', '🐉',
  '🦄', '🐸', '🐧', '🦔', '🦥', '🐻', '🐗', '🦇', '🐬', '🐢',
  '🦂', '🐍', '🦋', '🐞', '🐝', '🐿️', '🦝', '🐱', '🐶'
];
const avatarColors = ['#fee2e2', '#ffedd5', '#fef3c7', '#dcfce7', '#ccfbf1', '#dbeafe', '#e0e7ff', '#f3e8ff', '#fce7f3', '#e2e8f0'];

const UserAvatar = ({ player, size = 'md' }: { player?: Pick<Player, 'username' | 'avatar_emoji' | 'avatar_bg'> | null, size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClass = size === 'lg' ? 'w-20 h-20 text-4xl' : size === 'sm' ? 'w-7 h-7 text-sm' : 'w-10 h-10 text-xl';
  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center shrink-0 border border-white shadow-sm`}
      style={{ backgroundColor: player?.avatar_bg || '#fee2e2' }}
      title={player?.username || undefined}
    >
      <span aria-hidden="true">{player?.avatar_emoji || '😀'}</span>
    </div>
  );
};

const formatStageLabel = (stage: string, lang: 'cz' | 'en') => {
  if (lang === 'cz') return stage.replace(/^Group\s+/i, 'Skupina ');
  return stage;
};

const getGroupCode = (stage: string) => {
  return stage.match(/^Group\s+([A-Z])$/i)?.[1]?.toUpperCase() || null;
};

const TeamFlag = ({ code, className = "w-6 h-4" }: { code: string | null | undefined, className?: string }) => {
  const [error, setError] = React.useState(false);
  const [retry, setRetry] = React.useState(false);

  if (!code) return null;

  // Function to convert flag emoji to 2-letter ISO code
  const emojiToIso = (emoji: string) => {
    const charCodes = Array.from(emoji).map(c => c.codePointAt(0));
    const iso = charCodes
      .filter(code => code !== undefined && code >= 0x1F1E6 && code <= 0x1F1FF)
      .map(code => String.fromCharCode(code! - 0x1F1E6 + 65))
      .join('')
      .toLowerCase();
    return iso.length === 2 ? iso : null;
  };

  const isoFromEmoji = emojiToIso(code);
  
  const map: Record<string, string> = {
    'cze': 'cz', 'svk': 'sk', 'can': 'ca', 'usa': 'us',
    'fin': 'fi', 'swe': 'se', 'sui': 'ch', 'ger': 'de',
    'lat': 'lv', 'den': 'dk', 'nor': 'no', 'kaz': 'kz',
    'aut': 'at', 'fra': 'fr', 'slo': 'si', 'hun': 'hu',
    'gbr': 'gb', 'pol': 'pl', 'ita': 'it', 'slv': 'si',
    'kor': 'kr', 'jpn': 'jp', 'aus': 'au', 'bel': 'be', 
    'ukr': 'ua'
  };

  const clean = code.trim().toLowerCase();
  const iso = isoFromEmoji || map[clean] || (clean.length === 2 ? clean : null);

  // If we can't determine ISO, or both image attempts failed
  if (!iso || (error && retry)) {
    const isEmoji = /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(code);
    return (
      <div className={`${className} bg-slate-100 rounded-sm flex items-center justify-center border border-slate-200 overflow-hidden`}>
        {isEmoji ? (
          <span className="text-xl leading-none scale-125">{code}</span>
        ) : (
          <span className="text-[8px] font-black text-slate-500 uppercase">
            {code.length > 3 ? code.substring(0, 3) : code}
          </span>
        )}
      </div>
    );
  }

  const flagSrc = retry 
    ? `https://flagicons.lipis.dev/flags/4x3/${iso}.svg`
    : `https://flagcdn.com/w160/${iso}.png`;

  return (
    <img 
      src={flagSrc} 
      alt={code}
      className={`${className} object-contain rounded-sm shadow-sm flex-shrink-0 animate-in fade-in duration-300`}
      referrerPolicy="no-referrer"
      onError={() => {
        if (!retry) {
          setRetry(true);
        } else {
          setError(true);
        }
      }}
    />
  );
};

interface MatchCardProps {
  match: Match;
  lobbyId?: string;
  onPredict?: (h: number, a: number) => Promise<void>;
  isFinished?: boolean;
  userId?: string;
  t: any;
  matchPredictions?: Prediction[];
  isHockey?: boolean;
}

const MatchCard: React.FC<MatchCardProps> = ({ 
  match, 
  lobbyId,
  onPredict, 
  isFinished = false, 
  userId,
  t,
  matchPredictions = [],
  isHockey = false
}) => {
  const [home, setHome] = useState(match.predicted_home_score ?? 0);
  const [away, setAway] = useState(match.predicted_away_score ?? 0);
  const [showOthers, setShowOthers] = useState(false);
  const [others, setOthers] = useState<Prediction[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  const startTime = new Date(match.start_time_utc).getTime();
  const lockTime = startTime - (5 * 60 * 1000);
  const isLocked = Date.now() > lockTime || match.status === 'finished';
  const isFootballKnockout = !isHockey && isFootballKnockoutStage(match.stage, match.tournament_id);
  const drawPredictionSelected = isDrawPrediction(home, away);
  const drawPredictionBlocked = drawPredictionSelected && (isHockey || isFootballKnockout);

  useEffect(() => {
    if (isLocked || isFinished) {
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const diff = lockTime - now;

      if (diff <= 0) {
        setTimeLeft(null);
        return;
      }

      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);

      if (h > 0) {
        setTimeLeft(`${h}h ${m}m`);
      } else if (m > 0) {
        setTimeLeft(`${m}m ${s}s`);
      } else {
        setTimeLeft(`${s}s`);
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [lockTime, isLocked, isFinished]);

  const fetchOthers = async (forceRefresh = false) => {
    if (!showOthers || forceRefresh === true) {
      try {
        const data = await fetchMatchPredictions(lobbyId || '', match.id);
        setOthers(data);
        if (forceRefresh !== true) setShowOthers(true);
      } catch (err) {
        console.error(err);
      }
    } else {
      setShowOthers(false);
    }
  };

  const handlePredict = async () => {
    if (!onPredict) return;
    if (drawPredictionBlocked) return;
    setIsSaving(true);
    try {
      await onPredict(home, away);
      setShowSuccess(true);
      
      // Auto-refresh others if drawer is open
      if (showOthers) {
        const data = await fetchMatchPredictions(lobbyId || '', match.id);
        setOthers(data);
      }
      
      setTimeout(() => setShowSuccess(false), 2000);
    } catch (err) {
      // Error handled by parent alert
    } finally {
      setIsSaving(false);
    }
  };

  const getPoints = () => {
    if (match.home_score === null || match.away_score === null) return null;
    const ph = match.predicted_home_score;
    const pa = match.predicted_away_score;
    if (ph === null || pa === null || ph === undefined || pa === undefined) return null;
    return calculatePoints(ph, pa, match.home_score, match.away_score, isHockey ? 'hockey' : 'football');
  };

  const points = getPoints();

  const predictionStats = useMemo(() => {
    const predictionsForDistribution = isFootballKnockout
      ? matchPredictions.filter(p => p.predicted_home_score !== p.predicted_away_score)
      : matchPredictions;
    const total = predictionsForDistribution.length;
    if (total === 0) return { home: 0, away: 0, draw: 0, isEmpty: true };
    
    const homeWins = predictionsForDistribution.filter(p => p.predicted_home_score > p.predicted_away_score).length;
    const draws = isFootballKnockout ? 0 : predictionsForDistribution.filter(p => p.predicted_home_score === p.predicted_away_score).length;
    const awayWins = predictionsForDistribution.filter(p => p.predicted_away_score > p.predicted_home_score).length;
    
    return {
      home: Math.round((homeWins / total) * 100),
      draw: Math.round((draws / total) * 100),
      away: Math.round((awayWins / total) * 100),
      isEmpty: false
    };
  }, [isFootballKnockout, matchPredictions]);

  const calcPoints = (ph: number, pa: number) => {
    if (match.home_score === null || match.away_score === null) return 0;
    return calculatePoints(ph, pa, match.home_score, match.away_score, isHockey ? 'hockey' : 'football');
  };

  const homeOutcomeLabel = (match.home_name || match.home_team_id.replace(/^(football|hockey)-/, '')).toUpperCase();
  const awayOutcomeLabel = (match.away_name || match.away_team_id.replace(/^(football|hockey)-/, '')).toUpperCase();

  return (
    <motion.div 
      layout
      className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-4 transition-colors"
    >
      <div className="p-4">
        <div className="flex justify-between items-center mb-3">
          <div className="flex flex-col">
            <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase">
              <Clock className="w-3 h-3" />
              {new Date(match.start_time_utc).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
            {timeLeft && (
              <span className="text-[9px] font-black text-red-500 uppercase mt-0.5 animate-pulse">
                {t.locksIn} {timeLeft}
              </span>
            )}
          </div>
          <span className="text-[10px] bg-slate-50 px-2 py-0.5 rounded-full font-bold text-slate-400 uppercase tracking-tighter transition-colors">{match.stage}</span>
        </div>

        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex-1 flex flex-col items-center text-center">
            <TeamFlag code={match.home_flag || match.home_team_id} className="w-12 h-8 mb-2" />
            <span className="text-sm font-semibold text-slate-700 line-clamp-1">{match.home_name}</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            {match.status === 'finished' ? (
              <div className="text-3xl font-black tabular-nums tracking-tighter text-slate-900 transition-colors">
                {match.home_score} : {match.away_score}
              </div>
            ) : (
              <div className="text-slate-300 font-bold text-xl">VS</div>
            )}
          </div>

          <div className="flex-1 flex flex-col items-center text-center">
            <TeamFlag code={match.away_flag || match.away_team_id} className="w-12 h-8 mb-2" />
            <span className="text-sm font-semibold text-slate-700 line-clamp-1">{match.away_name}</span>
          </div>
        </div>

        {!isFinished && (
          <div className="flex flex-col gap-3">
            <div className="px-1 mb-1">
              <div className={`grid ${isFootballKnockout ? 'grid-cols-2' : 'grid-cols-3'} items-end gap-2 mb-1.5 px-1 text-[9px] font-black uppercase`}>
                <span className="text-left text-[#ce1126]">
                  <span className="block text-[8px] text-slate-400 truncate">{homeOutcomeLabel}</span>
                  {predictionStats.home}%
                </span>
                {!isFootballKnockout && (
                  <span className="text-center text-[#1f2937]">
                    <span className="block text-[8px] text-slate-400">Remíza</span>
                    {predictionStats.draw}%
                  </span>
                )}
                <span className="text-right text-[#006847]">
                  <span className="block text-[8px] text-slate-400 truncate">{awayOutcomeLabel}</span>
                  {predictionStats.away}%
                </span>
              </div>
              <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden flex shadow-inner ring-1 ring-slate-100">
                <div 
                  style={{ width: `${predictionStats.home}%` }} 
                  className="h-full bg-[#ce1126] transition-[width] duration-700 ease-out" 
                />
                {!isFootballKnockout && (
                  <div
                    style={{ width: `${predictionStats.draw}%` }}
                    className="h-full bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.12)] transition-[width] duration-700 ease-out"
                  />
                )}
                <div 
                  style={{ width: `${predictionStats.away}%` }} 
                  className="h-full bg-[#006847] transition-[width] duration-700 ease-out" 
                />
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3 flex flex-col items-center justify-center transition-colors">
              <div className="flex items-center justify-center gap-4">
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={() => setHome(h => Math.max(0, h - 1))}
                    disabled={isLocked}
                    className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center shadow-sm active:scale-95 disabled:opacity-50 transition-colors"
                  >
                    <ChevronDown className="w-4 h-4 text-slate-600" />
                  </button>
                  <div className="w-10 h-10 bg-white rounded-xl border border-slate-200 flex items-center justify-center text-2xl font-black text-slate-900 shadow-sm transition-colors">
                    {home}
                  </div>
                  <button 
                    onClick={() => setHome(h => Math.max(0, h + 1))}
                    disabled={isLocked}
                    className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center shadow-sm active:scale-95 disabled:opacity-50 transition-colors"
                  >
                    <ChevronUp className="w-4 h-4 text-slate-600" />
                  </button>
                </div>

                <span className="text-slate-300 font-black text-xl">:</span>

                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={() => setAway(h => Math.max(0, h - 1))}
                    disabled={isLocked}
                    className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center shadow-sm active:scale-95 disabled:opacity-50 transition-colors"
                  >
                    <ChevronDown className="w-4 h-4 text-slate-600" />
                  </button>
                  <div className="w-10 h-10 bg-white rounded-xl border border-slate-200 flex items-center justify-center text-2xl font-black text-slate-900 shadow-sm transition-colors">
                    {away}
                  </div>
                  <button 
                    onClick={() => setAway(h => Math.max(0, h + 1))}
                    disabled={isLocked}
                    className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center shadow-sm active:scale-95 disabled:opacity-50 transition-colors"
                  >
                    <ChevronUp className="w-4 h-4 text-slate-600" />
                  </button>
                </div>
              </div>
              {!isLocked && isFootballKnockout && !drawPredictionSelected && (
                <p className="mt-2 text-[10px] text-center text-slate-400 italic">
                  {t.playoffWinnerRequired}
                </p>
              )}
            </div>
            
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handlePredict}
              disabled={isLocked || drawPredictionBlocked || isSaving}
              className={`w-full py-4 rounded-2xl font-black shadow-lg transition-all disabled:shadow-none flex items-center justify-center gap-2 ${
                isLocked ? 'bg-slate-100 text-slate-400' :
                showSuccess ? 'bg-green-500 text-white shadow-green-100' : 'bg-red-600 text-white shadow-red-200'
              }`}
            >
              {isSaving ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isLocked ? (
                t.locked
              ) : showSuccess ? (
                t.tipSaved
              ) : isFootballKnockout && drawPredictionSelected ? (
                t.pickMatchWinner
              ) : (
                match.predicted_home_score !== null ? t.updateTip : t.saveTip
              )}
            </motion.button>
            {!isLocked && isHockey && drawPredictionSelected && <p className="text-[10px] text-center text-slate-400 italic">{t.noDraws}</p>}
            {isLocked && <p className="text-[10px] text-center text-slate-400 italic">{t.locked}</p>}
          </div>
        )}

        {isFinished && (
          <div className="flex flex-col gap-3">
             <div className={`py-2 px-4 rounded-xl flex items-center justify-between border transition-colors ${
               points === 5 ? 'bg-indigo-50/60 border-indigo-200/50 text-indigo-950 shadow-sm' : 
               points === 3 ? 'bg-emerald-50/60 border-emerald-200/50 text-emerald-950 shadow-sm' : 
               points === 2 || points === 1 ? 'bg-slate-50 border-slate-200 text-slate-900 font-medium' : 'bg-slate-50 border-slate-100'
             }`}>
               <div className="flex flex-col">
                 <span className="text-[10px] text-slate-400 uppercase font-bold leading-tight">{t.yourPrediction}</span>
                 <span className={`text-lg font-black leading-tight ${match.predicted_home_score === null ? 'text-slate-400 italic text-sm' : 'text-slate-900'}`}>
                    {match.predicted_home_score !== null ? `${match.predicted_home_score} : ${match.predicted_away_score}` : t.notTipped}
                 </span>
               </div>
               {points !== null && (
                 <div className={`flex items-center gap-1 font-black ${points > 0 ? 'text-indigo-700' : 'text-slate-400'}`}>
                   {points > 0 && <CheckCircle2 className="w-4 h-4" />}
                   +{points} {t.pts}
                 </div>
               )}
             </div>
          </div>
        )}

        <button 
          onClick={fetchOthers}
          className="w-full mt-4 flex items-center justify-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          {showOthers ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {showOthers ? t.hide : t.show} {t.othersTip}
          <span className="ml-1 bg-slate-100 px-1.5 py-0.5 rounded-md font-bold text-[10px] transition-colors">{match.total_predictions ?? 0} {t.tipsCount}</span>
        </button>
      </div>

      <AnimatePresence>
        {showOthers && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden bg-slate-50 border-t border-slate-100 transition-colors"
          >
            <div className="p-4">
              {others.length === 0 ? (
                <p className="text-center text-xs text-slate-400">{t.noPredictions}</p>
              ) : (
                <div className="flex flex-wrap gap-2 justify-center">
                  {others.map(p => {
                    const pPoints = calcPoints(p.predicted_home_score, p.predicted_away_score);
                    return (
                        <div 
                          key={p.player_id} 
                          className={`px-3 py-2 rounded-xl border flex flex-col items-center min-w-[70px] transition-colors ${
                            p.player_id === userId ? 'ring-2 ring-red-500 border-red-500 shadow-sm z-10' : ''
                          } ${
                            pPoints === 5 ? 'bg-indigo-50/60 border-indigo-100 text-indigo-950 font-bold shadow-sm' :
                            pPoints === 3 ? 'bg-emerald-50/60 border-emerald-100 text-emerald-950 font-bold shadow-sm' :
                            pPoints === 2 || pPoints === 1 ? 'bg-slate-50/50 border-slate-200 text-slate-900 font-medium' :
                            'bg-white border-slate-100 text-slate-400'
                          }`}
                        >
                        <div className="flex items-center gap-1 mb-0.5">
                          <UserAvatar player={{ username: p.username || 'Uživatel', avatar_emoji: p.avatar_emoji, avatar_bg: p.avatar_bg }} size="sm" />
                          <span className={`text-[9px] font-black uppercase truncate max-w-[55px] ${p.player_id === userId ? 'text-red-600' : ''}`}>
                            {p.player_id === userId ? 'VY' : p.username}
                          </span>
                          <TeamFlag code={(p as any).winner_flag || (p as any).tournament_winner_id} className="w-4 h-3 grayscale-[0.5] opacity-80" />
                        </div>
                        <span className={`text-xs ${pPoints === 5 ? 'font-black' : 'font-bold'}`}>{p.predicted_home_score}:{p.predicted_away_score}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const AdminMatchCard: React.FC<{ match: Match, onUpdate: (h: number, a: number) => Promise<void>, t: any, isHockey?: boolean }> = ({ match, onUpdate, t, isHockey = false }) => {
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
      // handled elsewhere
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

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<Player | null>(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [tab, setTab] = useState<'matches' | 'results' | 'leaderboard' | 'admin' | 'profile'>('matches');
  const [matchFilter, setMatchFilter] = useState('all');
  const [lang, setLang] = useState<'cz' | 'en'>(() => {
    const saved = localStorage.getItem('lang');
    return (saved as 'cz' | 'en') || 'cz';
  });
  
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [leaderboard, setLeaderboard] = useState<Player[]>([]);
  const [allPredictions, setAllPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [loginData, setLoginData] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  
  // Lobbies State (FÁZE S7 & S8)
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [activeLobbyId, setActiveLobbyId] = useState<string | null>(() => localStorage.getItem('activeLobbyId'));
  const [activeLobbyName, setActiveLobbyName] = useState<string>("");
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(() => sessionStorage.getItem('activeTournamentId'));
  const [suppressAutoEnter, setSuppressAutoEnter] = useState(() => sessionStorage.getItem('suppressAutoEnter') === 'true');
  const previousActiveLobbyIdRef = useRef<string | null>(activeLobbyId);
  const [lobbyExpanded, setLobbyExpanded] = useState(false);
  const [isLobbyRulesOpen, setIsLobbyRulesOpen] = useState(false);
  const [newLobbyName, setNewLobbyName] = useState("");
  const [newLobbyShortDescription, setNewLobbyShortDescription] = useState("");
  const [newLobbyLongDescription, setNewLobbyLongDescription] = useState("");
  const [newLobbyTournament, setNewLobbyTournament] = useState("fifa-world-cup-2026");
  const [joinCodeInput, setJoinCodeInput] = useState(() => {
    return new URLSearchParams(window.location.search).get("join") || "";
  });

  const activeLobby = lobbies.find(l => l.id === activeLobbyId);
  const isHockey = activeTournamentId === "ms-hockey-2026";
  const canEditActiveLobby = Boolean(activeLobby && (activeLobby.is_owner || user?.role === 'admin'));

  const [winnerPickerTeams, setWinnerPickerTeams] = useState<any[]>([]);
  const [isEditingLobbyInfo, setIsEditingLobbyInfo] = useState(false);
  const [editLobbyShortDescription, setEditLobbyShortDescription] = useState('');
  const [editLobbyLongDescription, setEditLobbyLongDescription] = useState('');
  const [lobbyInfoMsg, setLobbyInfoMsg] = useState('');
  const [lobbyInfoError, setLobbyInfoError] = useState('');
  const [isLobbyInfoSaving, setIsLobbyInfoSaving] = useState(false);

  useEffect(() => {
    setEditLobbyShortDescription(activeLobby?.short_description || '');
    setEditLobbyLongDescription(activeLobby?.long_description || '');
    setIsEditingLobbyInfo(false);
    setLobbyInfoMsg('');
    setLobbyInfoError('');
  }, [activeLobby?.id, activeLobby?.short_description, activeLobby?.long_description]);

  useEffect(() => {
    let isCancelled = false;

    const getEmergencyFallbackTeams = () => {
      console.warn("Winner picker official participants unavailable; using loaded football teams fallback.");
      return (teams ?? []).filter((tm: any) => {
        const id = String(tm.id ?? '');
        return String(tm.sport_id ?? '') === 'football' &&
          id.startsWith('football-') &&
          !id.toLowerCase().includes('-tba');
      });
    };

    const fetchWinnerPickerTeams = async () => {
      if (!activeTournamentId) {
        setWinnerPickerTeams([]);
        return;
      }

      try {
        const { data: matchRows, error: matchesError } = await supabase
          .from('matches')
          .select('home_participant_id, away_participant_id')
          .eq('tournament_id', activeTournamentId);

        if (matchesError) throw matchesError;

        const uniqueIds = Array.from(new Set(
          (matchRows ?? [])
            .flatMap((match: any) => [match.home_participant_id, match.away_participant_id])
            .filter((id: any) => {
              const normalizedId = String(id ?? '');
              return normalizedId && !normalizedId.toLowerCase().includes('-tba');
            })
        ));

        if (uniqueIds.length === 0) {
          if (!isCancelled) setWinnerPickerTeams(getEmergencyFallbackTeams());
          return;
        }

        const { data: participantRows, error: participantsError } = await supabase
          .from('participants')
          .select('*')
          .in('id', uniqueIds);

        if (participantsError) throw participantsError;

        const participantsById = new Map((participantRows ?? []).map((participant: any) => [participant.id, participant]));
        const officialTeams = uniqueIds
          .map((id) => participantsById.get(id))
          .filter(Boolean);

        if (!isCancelled) {
          setWinnerPickerTeams(officialTeams.length > 0 ? officialTeams : getEmergencyFallbackTeams());
        }
      } catch (err) {
        console.warn("Winner picker official participants fetch failed; using loaded football teams fallback.", err);
        if (!isCancelled) setWinnerPickerTeams(getEmergencyFallbackTeams());
      }
    };

    fetchWinnerPickerTeams();

    return () => {
      isCancelled = true;
    };
  }, [activeTournamentId, teams]);

  const [lobbyFormActive, setLobbyFormActive] = useState<'none' | 'create' | 'join'>(() => {
    if (new URLSearchParams(window.location.search).get("join")) return 'join';
    return 'none';
  });
  const [lobbyError, setLobbyError] = useState("");
  const [lobbySuccess, setLobbySuccess] = useState("");

  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);
  const [adminMatchFilter, setAdminMatchFilter] = useState<'scheduled' | 'finished'>('scheduled');
  const [adminGroupFilter, setAdminGroupFilter] = useState('all');
  const [showCreatePlayer, setShowCreatePlayer] = useState(false);
  const [newUserData, setNewUserData] = useState({ username: '', password: '' });
  const [createUserMsg, setCreateUserMsg] = useState('');
  const [passData, setPassData] = useState({ newPass: '', confirmPass: '' });
  const [passMsg, setPassMsg] = useState('');
  const [passError, setPassError] = useState('');
  const [isPassSaving, setIsPassSaving] = useState(false);
  const [avatarData, setAvatarData] = useState({
    emoji: user?.avatar_emoji || '😀',
    bg: user?.avatar_bg || '#fee2e2'
  });
  const [avatarMsg, setAvatarMsg] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const [showAvatarEditor, setShowAvatarEditor] = useState(false);
  const [showScoringInfo, setShowScoringInfo] = useState(false);

  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);

  useEffect(() => {
    if (activeLobbyId) {
      localStorage.setItem('activeLobbyId', activeLobbyId);
      setIsLobbyRulesOpen(false);
      if (previousActiveLobbyIdRef.current && previousActiveLobbyIdRef.current !== activeLobbyId) {
        setActiveTournamentId(null);
        sessionStorage.removeItem('activeTournamentId');
      }
    } else {
      localStorage.removeItem('activeLobbyId');
      setActiveTournamentId(null);
      sessionStorage.removeItem('activeTournamentId');
      setIsLobbyRulesOpen(false);
    }
    previousActiveLobbyIdRef.current = activeLobbyId;
  }, [activeLobbyId]);

  useEffect(() => {
    if (activeTournamentId) {
      sessionStorage.setItem('activeTournamentId', activeTournamentId);
    } else {
      sessionStorage.removeItem('activeTournamentId');
    }
    setIsLobbyRulesOpen(false);
  }, [activeTournamentId]);

  useEffect(() => {
    if (suppressAutoEnter) {
      sessionStorage.setItem('suppressAutoEnter', 'true');
    } else {
      sessionStorage.removeItem('suppressAutoEnter');
    }
  }, [suppressAutoEnter]);

  useEffect(() => {
    if (!user || activeLobbyId || activeTournamentId || suppressAutoEnter || lobbyFormActive !== 'none') return;
    if (lobbies.length !== 1) return;

    const onlyLobby = lobbies[0];
    const activeTournaments = (onlyLobby.tournaments || []).filter(tournament => tournament.status === 'active');
    if (activeTournaments.length !== 1) return;

    setActiveLobbyId(onlyLobby.id);
    setActiveLobbyName(onlyLobby.name);
    setActiveTournamentId(activeTournaments[0].tournament_id);
    setTab('matches');
  }, [user, lobbies, activeLobbyId, activeTournamentId, suppressAutoEnter, lobbyFormActive]);

  const t = (translations as any)[lang];

  const stageFilters = useMemo(() => {
    const byStage = new Map<string, number>();
    matches.forEach(match => {
      const stage = String(match.stage || '').trim();
      if (!stage) return;
      const time = new Date(match.start_time_utc).getTime();
      const current = byStage.get(stage);
      if (current === undefined || time < current) {
        byStage.set(stage, time);
      }
    });

    return [
      { id: 'all', label: t.all },
      ...Array.from(byStage.entries())
        .sort((a, b) => {
          const groupA = getGroupCode(a[0]);
          const groupB = getGroupCode(b[0]);
          if (groupA && groupB) return groupA.localeCompare(groupB);
          if (groupA) return -1;
          if (groupB) return 1;
          return a[1] - b[1] || a[0].localeCompare(b[0]);
        })
        .map(([stage]) => ({
          id: stage,
          label: formatStageLabel(stage, lang)
        }))
    ];
  }, [matches, t.all, lang]);

  const matchPassesStageFilter = (match: Match, filter: string) => {
    return filter === 'all' || match.stage === filter;
  };

  const tournamentStats = useMemo(() => {
    const defaultTournamentId = activeTournamentId
      || activeLobby?.tournaments?.find(tournament => tournament.status === 'active')?.tournament_id
      || activeLobby?.tournament_id;

    if (!defaultTournamentId) return {};

    const tournamentMatches = matches.filter(match => !match.tournament_id || match.tournament_id === defaultTournamentId);
    const scheduledMatches = tournamentMatches.filter(match => match.status === 'scheduled');
    const nextMatch = scheduledMatches
      .slice()
      .sort((a, b) => new Date(a.start_time_utc).getTime() - new Date(b.start_time_utc).getTime())[0];

    return {
      [defaultTournamentId]: {
        total: tournamentMatches.length,
        scheduled: scheduledMatches.length,
        finished: tournamentMatches.filter(match => match.status === 'finished').length,
        nextStart: nextMatch?.start_time_utc || null,
        nextMatchLabel: nextMatch ? `${nextMatch.home_name} vs ${nextMatch.away_name}` : null
      }
    };
  }, [activeLobby, activeTournamentId, matches]);

  useEffect(() => {
    if (!stageFilters.some(filter => filter.id === matchFilter)) {
      setMatchFilter('all');
    }
    if (!stageFilters.some(filter => filter.id === adminGroupFilter)) {
      setAdminGroupFilter('all');
    }
  }, [stageFilters, matchFilter, adminGroupFilter]);

  useEffect(() => {
    if (!user) return;
    setAvatarData({
      emoji: user.avatar_emoji || '😀',
      bg: user.avatar_bg || '#fee2e2'
    });
  }, [user?.id, user?.avatar_emoji, user?.avatar_bg]);

  // Try to restore Supabase session automatically on launch
  useEffect(() => {
    const checkSupSession = async () => {
      try {
        const restored = await checkSession();
        if (restored) {
          setUser(restored);
          localStorage.setItem('user', JSON.stringify(restored));
        } else {
          // If no database session, prompt to sign in
          setUser(null);
          localStorage.removeItem('user');
        }
      } catch (err) {
        console.error("Error checking passive session:", err);
      } finally {
        setLoading(false);
      }
    };
    checkSupSession();
  }, []);

  const fetchAll = async (lobbyIdParam?: string) => {
    if (!user) return;
    try {
      setError('');
      const targetLobbyId = lobbyIdParam || activeLobbyId;
      console.log("Fetching all data for user:", user.username, "Target Lobby:", targetLobbyId);
      
      const res = await fetchAllData(user.id, targetLobbyId || undefined, activeTournamentId || undefined);
      
      setMatches(res.matches);
      setTeams(res.teams);
      setLeaderboard(res.leaderboard);
      setAllPredictions(res.allPredictions);
      setLobbies(res.lobbies);
      
      if (res.lobbyId) {
        setActiveLobbyId(res.lobbyId);
      }
      if (res.lobbyName) {
        setActiveNameOnly(res.lobbyName); // helper mapping
      }

      // Sync active user's tournament winner selection from the target lobby leaderboard selection
      if (res.leaderboard) {
        const myPlayer = res.leaderboard.find(p => p.id === user.id);
        if (myPlayer) {
          setUser(prev => {
            if (!prev) return prev;
            const updated = {
              ...prev,
              avatar_emoji: myPlayer.avatar_emoji || prev.avatar_emoji || '😀',
              avatar_bg: myPlayer.avatar_bg || prev.avatar_bg || '#fee2e2',
              tournament_winner_id: myPlayer.tournament_winner_id || undefined
            };
            localStorage.setItem('user', JSON.stringify(updated));
            return updated;
          });
        } else {
          // If not in the leaderboard yet, clear it
          setUser(prev => {
            if (!prev) return prev;
            const updated = { ...prev, tournament_winner_id: undefined };
            localStorage.setItem('user', JSON.stringify(updated));
            return updated;
          });
        }
      }
    } catch (e: any) {
      console.error("fetchAll error:", e);
      setError(e?.message || "Nepodařilo se synchronizovat data se Supabase.");
    } finally {
      setLoading(false);
    }
  };

  const setActiveNameOnly = (name: string) => {
    setActiveLobbyName(name);
  };

  useEffect(() => {
    if (user?.id) {
      fetchAll();
    }
  }, [user?.id, activeLobbyId, activeTournamentId]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let data;
      if (isRegistering) {
        // Register using email, username, password (FÁZE S6)
        const emailToSubmit = loginData.email || `${loginData.username.toLowerCase().replace(/\s+/g, "")}@tipovacka.cz`;
        data = await registerUser(loginData.username, loginData.password, undefined, emailToSubmit);
      } else {
        // Sign in using email (or username) and password
        data = await loginUser(loginData.email || loginData.username, loginData.password);
      }
      setSuppressAutoEnter(false);
      setUser(data);
      localStorage.setItem('user', JSON.stringify(data));
    } catch (err: any) {
      setError(err.message || 'Chyba serveru při ověřování identity.');
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('activeLobbyId');
    sessionStorage.removeItem('activeTournamentId');
    sessionStorage.removeItem('suppressAutoEnter');
    setMatches([]);
    setLeaderboard([]);
    setAllPredictions([]);
    setLobbies([]);
    setActiveLobbyId(null);
    setActiveLobbyName("");
    setActiveTournamentId(null);
    setSuppressAutoEnter(false);
  };

  const savePrediction = async (matchId: string, h: number, a: number) => {
    try {
      await savePredDB(user?.id || '', activeLobbyId || '', matchId, h, a);
      await fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const updateMatchResult = async (matchId: string, h: number, a: number) => {
    try {
      const result = await updateMatchResDB(user?.id || '', matchId, h, a);
      await fetchAll();
      alert(`Výsledek uložen. Přepočteno ${result.updated_predictions_count}/${result.expected_predictions_count} tipů.`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAdminCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateUserMsg('');
    try {
      await registerUser(newUserData.username, newUserData.password, user?.id);
      setCreateUserMsg(t.userCreated);
      setNewUserData({ username: '', password: '' });
      await fetchAll();
    } catch (err: any) {
      setCreateUserMsg(err.message);
    }
  };

  const setTournamentWinner = async (teamId: string) => {
    try {
      await setWinnerDB(user?.id || '', teamId, activeLobby?.tournament_id || 'fifa-world-cup-2026');
      await fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const currentUserPickId = user ? leaderboard.find(l => l.id === user.id)?.tournament_winner_id : undefined;
  const isWinnerPickerLocked = useMemo(() => {
    const firstMatch = [...matches].sort((a, b) => new Date(a.start_time_utc).getTime() - new Date(b.start_time_utc).getTime())[0];
    const firstTime = firstMatch ? new Date(firstMatch.start_time_utc).getTime() : 0;
    return firstTime > 0 && Date.now() > firstTime;
  }, [matches]);

  const pickTournamentWinner = async (teamId: string) => {
    try {
      await pickWinnerDB(
        user?.id || '', 
        teamId, 
        activeLobbyId || '', 
        activeTournamentId || activeLobby?.tournament_id || 'fifa-world-cup-2026'
      );
      // Legacy cleanup: not saving to user local storage anymore
      // just rely on longterm_predictions via fetchAll
      await fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg('');
    setPassError('');
    if (passData.newPass !== passData.confirmPass) {
      setPassError(t.passMismatch);
      return;
    }
    if (passData.newPass.length < 6) {
      setPassError(lang === 'cz' ? 'Heslo musí mít aspoň 6 znaků' : 'Password must be at least 6 characters');
      return;
    }

    setIsPassSaving(true);
    try {
      await changePassDB(user?.id || '', passData.newPass);
      setPassMsg(t.passUpdated);
      setPassData({ newPass: '', confirmPass: '' });
    } catch (err: any) {
      setPassError(err.message);
    } finally {
      setIsPassSaving(false);
    }
  };

  const handleSaveAvatar = async (nextEmoji = avatarData.emoji, nextBg = avatarData.bg) => {
    if (!user) return;
    setAvatarMsg('');
    setAvatarError('');

    try {
      await updateProfileAvatar(user.id, nextEmoji, nextBg);
      const updatedUser = {
        ...user,
        avatar_emoji: nextEmoji,
        avatar_bg: nextBg
      };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setAvatarData({ emoji: nextEmoji, bg: nextBg });
      setAvatarMsg(lang === 'cz' ? 'Avatar uložen.' : 'Avatar saved.');
      await fetchAll();
    } catch (err: any) {
      setAvatarError(err.message || (lang === 'cz' ? 'Avatar se nepodařilo uložit.' : 'Could not save avatar.'));
    }
  };

  const handleSaveLobbyInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeLobby) return;

    setLobbyInfoMsg('');
    setLobbyInfoError('');
    setIsLobbyInfoSaving(true);

    try {
      await updateLobbyDetails(
        user.id,
        activeLobby.id,
        activeLobby.name,
        editLobbyShortDescription,
        editLobbyLongDescription
      );
      await fetchAll(activeLobby.id);
      setIsEditingLobbyInfo(false);
      setIsLobbyRulesOpen(true);
      setLobbyInfoMsg(lang === 'cz' ? 'Informace o lobby uloženy.' : 'Lobby information saved.');
    } catch (err: any) {
      setLobbyInfoError(err.message || (lang === 'cz' ? 'Informace se nepodařilo uložit.' : 'Could not save lobby information.'));
    } finally {
      setIsLobbyInfoSaving(false);
    }
  };

  const leaderboardWithStreaks = useMemo(() => {
    const activeLobby = lobbies.find(l => l.id === activeLobbyId);
    const isHockey = activeTournamentId === "ms-hockey-2026";

    // Determine the most recently finished match to calculate "previous" state
    const finishedMatchesSorted = [...matches]
      .filter(m => m.home_score !== null && m.away_score !== null)
      .sort((a, b) => new Date(b.start_time_utc).getTime() - new Date(a.start_time_utc).getTime());
    
    const lastFinishedMatchId = finishedMatchesSorted[0]?.id;

    // Current ranks - only use finished matches for scoring
    const calculateRanks = (preds: Prediction[], excludeMatchId?: string) => {
      const filteredPreds = preds.filter(p => {
        const scoreH = (p as any).home_score;
        const scoreA = (p as any).away_score;
        const isFinished = scoreH !== null && scoreA !== null && scoreH !== undefined && scoreA !== undefined;
        return isFinished && (excludeMatchId ? p.match_id !== excludeMatchId : true);
      });

      const pStats = leaderboard.map(p => {
        const userPreds = filteredPreds.filter(pr => pr.player_id === p.id);
        let total = 0;
        let exact = 0;
        let outcomeHits = 0;
        let goalDifferenceHits = 0;
        let winnerHits = 0;
        let drawHits = 0;
        let currentStreak = 0;
        let tempStreak = 0;
        const history: { points: number, res: 'W' | 'L' | 'E' }[] = [];

        userPreds.forEach(pr => {
          const mh = (pr as any).home_score;
          const ma = (pr as any).away_score;
          const ph = pr.predicted_home_score;
          const pa = pr.predicted_away_score;

          const pts = calculatePoints(ph, pa, mh, ma, isHockey ? 'hockey' : 'football');

          total += pts;
          if (pts === 5) exact++;
          else if (pts > 0) {
            outcomeHits++;

            if (!isHockey) {
              const isActualDraw = mh === ma;
              const isPredictedDraw = ph === pa;
              const correctWinner = (ph > pa && mh > ma) || (pa > ph && ma > mh);

              if (isActualDraw && isPredictedDraw) {
                drawHits++;
              } else if (correctWinner && ph - pa === mh - ma) {
                goalDifferenceHits++;
              } else if (correctWinner) {
                winnerHits++;
              }
            }
          }

          if (pts > 0) tempStreak++;
          else tempStreak = 0;
          currentStreak = tempStreak;
          history.push({ points: pts, res: pts === 5 ? 'E' : pts > 0 ? 'W' : 'L' });
        });

        // Add tournament winner points if applicable
        if (p.tournament_winner_id && teams.find(tm => tm.id === p.tournament_winner_id && tm.is_final_winner === 1)) {
          total += 10;
        }

        return {
          id: p.id,
          username: p.username,
          total,
          exact,
          outcomeHits,
          goalDifferenceHits,
          winnerHits,
          drawHits,
          currentStreak,
          history
        };
      });

      return pStats.sort((a, b) => b.total - a.total || b.exact - a.exact || b.outcomeHits - a.outcomeHits || a.username.localeCompare(b.username));
    };

    const currentResults = calculateRanks(allPredictions);
    const prevResults = lastFinishedMatchId ? calculateRanks(allPredictions, lastFinishedMatchId) : currentResults;

    return leaderboard.map(p => {
      const stats = currentResults.find(r => r.id === p.id);
      const prevIndex = prevResults.findIndex(r => r.id === p.id);
      const currentIndex = currentResults.findIndex(r => r.id === p.id);
      
      const finishedPredictions = allPredictions.filter(pr => {
        const mh = (pr as any).home_score;
        const ma = (pr as any).away_score;
        return mh !== null && ma !== null && mh !== undefined && ma !== undefined;
      });

      const userPredsAll = finishedPredictions
        .filter(pr => pr.player_id === p.id)
        .sort((a, b) => new Date((a as any).start_time_utc).getTime() - new Date((b as any).start_time_utc).getTime());
      
      let bestStreak = 0;
      let temp = 0;
      userPredsAll.forEach(pr => {
        const mh = (pr as any).home_score;
        const ma = (pr as any).away_score;
        const ph = pr.predicted_home_score;
        const pa = pr.predicted_away_score;
        const pts = calculatePoints(ph, pa, mh, ma, isHockey ? 'hockey' : 'football');
        if (pts > 0) temp++; else temp = 0;
        bestStreak = Math.max(bestStreak, temp);
      });

      return {
        ...p,
        total_points: stats?.total ?? 0,
        exact_hits: stats?.exact ?? 0,
        outcome_hits: stats?.outcomeHits ?? 0,
        goal_difference_hits: stats?.goalDifferenceHits ?? 0,
        winner_hits: stats?.winnerHits ?? 0,
        draw_hits: stats?.drawHits ?? 0,
        currentStreak: stats?.currentStreak ?? 0,
        bestStreak,
        history: stats?.history.slice(-10) ?? [],
        rankChange: (prevIndex === -1 || currentIndex === -1) ? 0 : prevIndex - currentIndex
      };
    }).sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0) || (b.exact_hits ?? 0) - (a.exact_hits ?? 0) || (b.outcome_hits ?? 0) - (a.outcome_hits ?? 0) || a.username.localeCompare(b.username));
  }, [leaderboard, allPredictions, teams, matches]);


  const currentUserStats = useMemo(() => {
    if (!user) return null;
    const stats = leaderboardWithStreaks.find(p => p.id === user.id);
    return stats || { exact: 0, winner: 0, total: 0, currentStreak: 0, bestStreak: 0, history: [] };
  }, [leaderboardWithStreaks, user]);

  const currentUserRank = useMemo(() => {
    if (!user) return null;
    const index = leaderboardWithStreaks.findIndex(player => player.id === user.id);
    return index >= 0 ? index + 1 : null;
  }, [leaderboardWithStreaks, user]);

  const currentUserLeaderGap = useMemo(() => {
    if (!currentUserStats || leaderboardWithStreaks.length === 0) return 0;
    const leaderPoints = leaderboardWithStreaks[0].total_points ?? 0;
    return Math.min(0, (currentUserStats.total_points ?? 0) - leaderPoints);
  }, [currentUserStats, leaderboardWithStreaks]);

  if (!user) {
    const loginT = translations.cz; 
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm bg-white rounded-[40px] shadow-2xl p-8 border border-slate-100"
        >
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="w-20 h-20 bg-red-600 rounded-3xl flex items-center justify-center shadow-lg shadow-red-200 mb-6 transform rotate-3">
              <Trophy className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter italic leading-none">{loginT.loginTitle}</h1>
            <p className="text-[10px] font-bold text-red-600 uppercase tracking-[0.2em] mt-1">UNOFFICIAL FAN PREDICTOR</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {isRegistering && (
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">E-mail</label>
                <input 
                  required
                  type="email" 
                  value={loginData.email}
                  onChange={e => setLoginData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full p-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-red-600 outline-none transition-all focus:bg-white"
                  placeholder="e.g. test@tipovacka.cz"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">
                {loginT.username}
              </label>
              <input 
                required
                type="text" 
                value={loginData.username}
                onChange={e => setLoginData(prev => ({ ...prev, username: e.target.value }))}
                className="w-full p-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-red-600 outline-none transition-all focus:bg-white font-semibold text-slate-800"
                placeholder={isRegistering ? "e.g. lukas" : "e.g. Hana"}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">{loginT.password}</label>
              <input 
                required
                type="password" 
                value={loginData.password}
                onChange={e => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                className="w-full p-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-red-600 outline-none transition-all focus:bg-white"
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-red-500 text-xs font-bold text-center bg-red-50 p-3 rounded-2xl">{error}</p>}
            <button 
              type="submit"
              className="w-full py-4 bg-red-600 text-white rounded-2xl font-black shadow-lg shadow-red-200 active:scale-95 transition-transform uppercase tracking-wider text-xs cursor-pointer"
            >
              {isRegistering ? loginT.register : loginT.signin}
            </button>

            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => {
                  setIsRegistering(!isRegistering);
                  setError('');
                }}
                className="text-xs font-black text-red-600 hover:underline uppercase tracking-wide cursor-pointer animate-pulse"
              >
                {isRegistering ? loginT.hasAccount : loginT.noAccount}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    );
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-8 h-8 border-4 border-red-600/20 border-t-red-600 rounded-full animate-spin mb-4" />
      <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">{t.loading}</p>
      {error && (
        <div className="mt-6 p-4 bg-white rounded-2xl border border-red-100 shadow-sm max-w-xs text-center">
          <p className="text-red-600 text-xs font-bold uppercase mb-2">Error</p>
          <p className="text-slate-600 text-sm mb-4">{error}</p>
          <button 
            onClick={() => { setError(''); setLoading(true); fetchAll(); }}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-transform"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );

  if (!activeLobbyId) {
    return (
      <div className="min-h-screen bg-slate-50 pb-24 max-w-lg mx-auto shadow-2xl transition-colors duration-300 animate-fade-in flex flex-col">
        <header className="bg-white p-6 sticky top-0 z-50 border-b border-slate-100 transition-colors">
          <div className="flex justify-between items-center mr-1">
            <div 
              className="cursor-pointer active:opacity-70 transition-opacity"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
               <h1 className="text-2xl font-black text-slate-900 leading-none tracking-tighter italic uppercase transition-colors">FAN TIPOVAČKA</h1>
            </div>
            <button 
              onClick={handleLogout}
              className="text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest"
            >
              Odhlásit
            </button>
          </div>
        </header>
        
        <main className="p-6 flex-1 flex flex-col">
          {lobbies.length > 0 ? (
            <div className="space-y-4">
               <h2 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4">
                 {lang === 'cz' ? 'Moje lobby' : 'My lobbies'} ({lobbies.length})
               </h2>
               <div className="space-y-3">
                 {lobbies.map(l => (
                   <div key={l.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                         <div>
                           <h3 className="text-sm uppercase font-black text-slate-800">{l.name}</h3>
                           {l.short_description && (
                             <p className="text-xs text-slate-500 font-medium mt-1 line-clamp-1">{l.short_description}</p>
                           )}
                           <p className="text-[10px] uppercase font-bold text-slate-400 mt-1">{l.tournament_name || "Football"}</p>
                         </div>
                         <div className="flex items-center gap-2">
                            {l.is_owner && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-slate-100 text-slate-400">Owner</span>
                            )}
                         </div>
                      </div>
                      
                      <div className="flex gap-2 mt-2">
                         <button 
                           onClick={() => {
                             setActiveLobbyId(l.id);
                             setActiveTournamentId(null);
                             setActiveLobbyName(l.name);
                           }}
                           className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-colors active:scale-95 transition-transform"
                         >
                           Otevřít lobby
                         </button>
                      </div>
                   </div>
                 ))}
               </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
               <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-6">
                 <TrophyIcon className="w-8 h-8" />
               </div>
               <h2 className="text-xl font-black text-slate-800 mb-2">
                 Zatím nejsi v žádné lobby
               </h2>
               <p className="text-[12px] text-slate-500 max-w-[250px] mx-auto font-medium leading-relaxed">
                 Připoj se ke svým přátelům pomocí kódu, nebo založ úplně novou tipovačku.
               </p>
            </div>
          )}

          <div className="mt-8 space-y-4">
            <div className="flex gap-2">
               <button 
                 onClick={() => {
                   setLobbyFormActive(lobbyFormActive === 'join' ? 'none' : 'join');
                   setLobbyError(""); setLobbySuccess("");
                 }}
                 className={`flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors border ${
                   lobbyFormActive === 'join' || (lobbies.length === 0 && lobbyFormActive !== 'create') ? 'bg-red-600 border-red-600 text-white shadow-md shadow-red-200' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                 }`}
               >
                 {lang === 'cz' ? 'Připojit kód' : 'Join via Code'}
               </button>
               <button 
                 onClick={() => {
                   setLobbyFormActive(lobbyFormActive === 'create' ? 'none' : 'create');
                   setLobbyError(""); setLobbySuccess("");
                 }}
                 className={`flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors border ${
                   lobbyFormActive === 'create' ? 'bg-slate-900 border-slate-900 text-white shadow-md' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                 }`}
               >
                 {lang === 'cz' ? 'Založit lobby' : 'Create Lobby'}
               </button>
            </div>

            {/* Expanded Forms */}
            {(lobbyFormActive !== 'none' || (lobbies.length === 0 && lobbyFormActive === 'none')) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm text-left"
              >
                {(lobbyFormActive === 'create') ? (
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    setLobbyError(""); setLobbySuccess("");
                    try {
                      if (!newLobbyName.trim()) throw new Error("Prosím zadejte název lobby.");
                      const created = await createLobby(
                        user.id,
                        newLobbyName.trim(),
                        newLobbyTournament,
                        'public',
                        newLobbyShortDescription,
                        newLobbyLongDescription
                      );
                      setLobbySuccess(`Lobby "${created.name}" vytvořena! Kód: ${created.join_code}`);
                      setNewLobbyName("");
                      setNewLobbyShortDescription("");
                      setNewLobbyLongDescription("");
                      setLobbyFormActive('none');
                      setActiveLobbyId(created.id);
                      setActiveTournamentId(null);
                      setActiveLobbyName(created.name);
                      await fetchAll(created.id);
                    } catch(err: any) {
                      setLobbyError(err.message || "Chyba při vytváření lobby.");
                    }
                  }} className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Vytvořit novou lobby</h4>
                    <div>
                      <label className="block text-[9px] text-slate-400 font-bold uppercase mb-1">Název lobby</label>
                      <input 
                        type="text" required value={newLobbyName} onChange={e => setNewLobbyName(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-red-600 font-semibold"
                        placeholder="e.g. Kolegové z práce"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-slate-400 font-bold uppercase mb-1">O lobby</label>
                      <input 
                        type="text"
                        value={newLobbyShortDescription}
                        onChange={e => setNewLobbyShortDescription(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-red-600 font-semibold"
                        placeholder="Friends League Brno"
                        maxLength={120}
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-slate-400 font-bold uppercase mb-1">Informace o lobby</label>
                      <textarea
                        value={newLobbyLongDescription}
                        onChange={e => setNewLobbyLongDescription(e.target.value)}
                        className="w-full min-h-[88px] p-2.5 bg-slate-50 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-red-600 font-medium resize-y"
                        placeholder="Entry fee 200 CZK. Payment deadline 10.6.2026. Winner takes all."
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-slate-400 font-bold uppercase mb-1">Turnaj</label>
                      <select
                        value={newLobbyTournament} onChange={e => setNewLobbyTournament(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-red-600 font-bold text-slate-700"
                      >
                        <option value="fifa-world-cup-2026">🏆 FIFA World Cup 2026</option>
                        <option value="ms-hockey-2026">🏒 MS v hokeji 2026</option>
                      </select>
                    </div>
                    <button type="submit" className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-colors active:scale-95 transition-transform cursor-pointer">
                      Potvrdit a vytvořit
                    </button>
                  </form>
                ) : (
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    setLobbyError(""); setLobbySuccess("");
                    try {
                      if (!joinCodeInput.trim()) throw new Error("Prosím zadejte kód.");
                      const joined = await joinLobbyByCode(user.id, joinCodeInput.trim());
                      setLobbySuccess(`Úspěšně ses připojil k lobby "${joined.name}"!`);
                      setJoinCodeInput("");
                      setLobbyFormActive('none');
                      setActiveLobbyId(joined.id);
                      setActiveTournamentId(null);
                      setActiveLobbyName(joined.name);
                      await fetchAll(joined.id);
                    } catch(err: any) {
                      setLobbyError(err.message || "Chyba při připojování k lobby.");
                    }
                  }} className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-wider font-semibold">Připojit se k lobby</h4>
                    <div>
                      <label className="block text-[9px] text-slate-400 font-bold uppercase mb-1">Pozvánkový kód</label>
                      <input 
                        type="text" required value={joinCodeInput} onChange={e => setJoinCodeInput(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 text-xs rounded-xl border border-slate-200 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-red-600 uppercase"
                        placeholder="e.g. LOB-C2F8"
                      />
                    </div>
                    <button type="submit" className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-colors active:scale-95 transition-transform cursor-pointer">
                      Odeslat kód a připojit
                    </button>
                  </form>
                )}
                
                {lobbyError && <p className="text-red-500 font-bold text-[10px] mt-2 text-center bg-red-50 p-1.5 rounded-lg">{lobbyError}</p>}
                {lobbySuccess && <p className="text-green-600 font-bold text-[10px] mt-2 text-center bg-green-50 p-1.5 rounded-lg">{lobbySuccess}</p>}
              </motion.div>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24 max-w-lg mx-auto shadow-2xl transition-colors duration-300 animate-fade-in">
      <header className="bg-white p-6 sticky top-0 z-50 border-b border-slate-100 transition-colors">
        <div className="flex justify-between items-center mr-1">
          <div className="flex items-center gap-3">
            {activeTournamentId ? (
              <button 
                onClick={() => {
                  setSuppressAutoEnter(true);
                  setActiveTournamentId(null);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors"
                title="Zpět do Lobby"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
            ) : activeLobbyId ? (
              <button 
                onClick={() => {
                  setSuppressAutoEnter(true);
                  setActiveLobbyId(null);
                  setActiveTournamentId(null);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors"
                title={lang === 'cz' ? 'Zpět na Seznam Lobby' : 'Back to Lobbies'}
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
            ) : null}
            <div 
              className="cursor-pointer active:opacity-70 transition-opacity"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
               <h1 className="text-2xl font-black text-slate-900 leading-none tracking-tighter italic uppercase transition-colors">FAN TIPOVAČKA</h1>
            </div>
          </div>
        </div>
      </header>

      {activeLobby && !activeTournamentId ? (
        <main className="p-4" style={{ backgroundColor: '#f8fafc' }}>
          <LobbyView 
            lobby={activeLobby}
            user={{ ...user, username: user.username || '' }}
            lang={lang as 'cz' | 'en'}
            onSelectTournament={id => {
              setActiveTournamentId(id);
              setTab('matches');
            }}
            onRefresh={() => fetchAll()}
            onLobbyDeleted={() => {
              setActiveLobbyId(null);
              setActiveTournamentId(null);
              fetchAll();
            }}
            membersCount={leaderboard.length}
            tournamentStats={tournamentStats}
          />
        </main>
      ) : activeLobby && activeTournamentId ? (
        <main className="p-4">
          {/* Match Filter Bar */}
          {(tab === 'matches' || tab === 'results') && (
            <div className="flex gap-2 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4 bg-slate-50 py-1 transition-colors">
              {stageFilters.map(f => (
              <button
                key={f.id}
                onClick={() => setMatchFilter(f.id)}
                className={`flex-none px-4 py-1.5 rounded-full text-[10px] font-black transition-all ${
                  matchFilter === f.id 
                    ? 'bg-red-600 text-white shadow-lg shadow-red-100' 
                    : 'bg-white text-slate-400 border-slate-100 border hover:border-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          {tab === 'matches' && (
            <motion.div 
              key="matches"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  <Calendar className="w-4 h-4 shrink-0" /> {t.upcoming}
                </span>
              </h2>
              {matches
                .filter(m => {
                  if (m.status !== 'scheduled') return false;
                  if (matchFilter === 'all') return true;
                  return matchPassesStageFilter(m, matchFilter);
                })
                .map(m => (
                 <MatchCard 
                   key={m.id} 
                   match={m} 
                   lobbyId={activeLobbyId || ''}
                   userId={user.id}
                   t={t}
                   onPredict={(h, a) => savePrediction(m.id, h, a)}
                   matchPredictions={allPredictions.filter(p => p.match_id === m.id)}
                   isHockey={isHockey}
                 />
               ))}
              {matches.filter(m => {
                  if (m.status !== 'scheduled') return false;
                  if (matchFilter === 'all') return true;
                  return matchPassesStageFilter(m, matchFilter);
               }).length === 0 && (
                <div className="text-center py-12 text-slate-400">{t.noUpcoming}</div>
              )}
            </motion.div>
          )}

          {tab === 'results' && (
            <motion.div 
              key="results"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                 <CheckCircle2 className="w-4 h-4" /> {t.finished}
              </h2>
              {[...matches]
                .filter(m => {
                  if (m.status !== 'finished') return false;
                  if (matchFilter === 'all') return true;
                  return matchPassesStageFilter(m, matchFilter);
                })
                .reverse()
                .map(m => (
                 <MatchCard 
                   key={m.id} 
                   match={m} 
                   lobbyId={activeLobbyId || ''}
                   isFinished 
                   userId={user.id} 
                   t={t} 
                   matchPredictions={allPredictions.filter(p => p.match_id === m.id)}
                   isHockey={isHockey}
                 />
               ))}
               {matches.filter(m => {
                  if (m.status !== 'finished') return false;
                  if (matchFilter === 'all') return true;
                  return matchPassesStageFilter(m, matchFilter);
               }).length === 0 && (
                <div className="text-center py-12 text-slate-400">{t.noResults}</div>
              )}
            </motion.div>
          )}

          {tab === 'leaderboard' && (
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

              {/* Official Winner Display - Only if decided */}
              {teams.find(tm => tm.is_final_winner === 1) && (
                <div className="bg-gradient-to-r from-red-600 to-red-700 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden mb-6">
                    <TrophyIcon className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 rotate-12" />
                    <div className="relative z-10 flex flex-col items-center text-center">
                      <p className="text-xs font-bold uppercase opacity-80 mb-2">{t.officialWinner}</p>
                      {(() => {
                        const officialWinner = teams.find(tm => tm.is_final_winner === 1);
                        return (
                          <div className="flex flex-col items-center">
                            <TeamFlag code={officialWinner?.flag_code || officialWinner?.id} className="w-20 h-12 mb-2" />
                            <span className="text-2xl font-black">{officialWinner?.name}</span>
                          </div>
                        );
                      })()}
                    </div>
                </div>
              )}

              <div className="space-y-3">
                {leaderboardWithStreaks.map((p, i) => {
                  const pTeamInfo = teams.find(tm => tm.id === p.tournament_winner_id) || winnerPickerTeams.find(tm => tm.id === p.tournament_winner_id);
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
                              {p.currentStreak >= 3 && (
                                <span className="text-xs">
                                  {p.currentStreak >= 7 ? '🐐' : p.currentStreak >= 5 ? '🔥🔥' : '🔥'}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {p.rankChange > 0 ? (
                                <span className="inline-flex items-center text-[10px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                                  <ChevronUp className="w-3 h-3 stroke-[3]" /> {p.rankChange}
                                </span>
                              ) : p.rankChange < 0 ? (
                                <span className="inline-flex items-center text-[10px] font-black text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md">
                                  <ChevronDown className="w-3 h-3 stroke-[3]" /> {Math.abs(p.rankChange)}
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
            </motion.div>
          )}

          {tab === 'profile' && currentUserStats && (
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
                 {currentUserStats.currentStreak >= 3 && (
                   <div className="mt-2 flex items-center gap-1 text-orange-500 font-black italic text-sm">
                      <Flame className="w-4 h-4 fill-current" />
                      {currentUserStats.currentStreak >= 7 ? 'GOAT' : 
                       currentUserStats.currentStreak >= 5 ? 'ON FIRE' : 'HOT'}
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
                            onClick={() => handleSaveAvatar(emoji, avatarData.bg)}
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
                            onClick={() => handleSaveAvatar(avatarData.emoji, color)}
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
                   {currentUserStats.history.map((h: any, idx: number) => (
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
                   {currentUserStats.history.length === 0 && <p className="col-span-10 text-center text-[10px] text-slate-400 italic">Zatím žádná historie</p>}
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
                      <Flame className={`w-4 h-4 ${currentUserStats.currentStreak >= 3 ? 'text-orange-500 fill-current' : 'text-slate-100'}`} />
                    </div>
                 </div>
              </div>

              {(() => {
                const pickerOptions = winnerPickerTeams;

                return (
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 transition-colors">
                 <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center justify-between">
                   {t.pickWinner} ({pickerOptions.length} TEAMS AVAILABLE)
                   {isWinnerPickerLocked ? <span className="bg-slate-100 text-[8px] px-2 py-0.5 rounded-full text-slate-500 uppercase transition-colors">Locked</span> : null}
                 </h3>
                 <div className="grid grid-cols-4 gap-2">
                   {pickerOptions.map(tm => {
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
                         onClick={() => !isWinnerPickerLocked && pickTournamentWinner(tm.id)}
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
                );
              })()}

              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 transition-colors">
                 <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 italic">{t.changePass}</h3>
                 <form onSubmit={handleUpdatePassword} className="space-y-3">
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
                          setLobbyInfoMsg('');
                          setLobbyInfoError('');
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
                        <form onSubmit={handleSaveLobbyInfo} className="mt-4 space-y-3">
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
                                setLobbyInfoError('');
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
                            {activeLobby.long_description || (lang === 'cz' ? 'Zatím bez popisu skupiny.' : 'No group description yet.')}
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
                onClick={handleLogout}
                className="w-full py-4 bg-slate-50 text-slate-400 rounded-3xl font-bold uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 hover:text-red-500 transition-colors active:scale-95"
              >
                <LogOut className="w-4 h-4" />
                {lang === 'cz' ? 'Odhlásit se' : 'Logout'}
              </button>
            </motion.div>
          )}

          {tab === 'admin' && user.role === 'admin' && (
            <motion.div 
               key="admin"
               initial={{ opacity: 0, x: -20 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: 20 }}
            >
               <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                 <ShieldCheck className="w-4 h-4" /> {t.adminControls}
              </h2>

              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mb-8 overflow-hidden transition-colors">
                 <div className="flex items-center justify-between mb-4">
                   <h3 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                     <UserPlus className="w-4 h-4" /> {t.createUser}
                   </h3>
                   <button 
                     onClick={() => setShowCreatePlayer(!showCreatePlayer)}
                     className="p-1 rounded-full hover:bg-slate-50 transition-colors"
                   >
                     {showCreatePlayer ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                   </button>
                 </div>
                 <AnimatePresence>
                   {showCreatePlayer && (
                     <motion.form 
                       initial={{ height: 0, opacity: 0 }}
                       animate={{ height: 'auto', opacity: 1 }}
                       exit={{ height: 0, opacity: 0 }}
                       onSubmit={handleAdminCreateUser} 
                       className="space-y-3 overflow-hidden"
                     >
                       <div>
                         <input 
                           type="text"
                           required
                           placeholder={t.newUsername}
                           value={newUserData.username}
                           onChange={e => setNewUserData(prev => ({ ...prev, username: e.target.value }))}
                           className="w-full p-3 bg-slate-50 rounded-xl border-none text-sm outline-none focus:ring-2 focus:ring-red-600 transition-colors"
                         />
                       </div>
                       <div>
                         <input 
                           type="password"
                           required
                           placeholder={t.newPassword}
                           value={newUserData.password}
                           onChange={e => setNewUserData(prev => ({ ...prev, password: e.target.value }))}
                           className="w-full p-3 bg-slate-50 rounded-xl border-none text-sm outline-none focus:ring-2 focus:ring-red-600 transition-colors"
                         />
                       </div>
                       <button 
                         type="submit"
                         className="w-full py-3 bg-red-600 text-white rounded-xl font-bold shadow-md shadow-red-100 transition-transform active:scale-95"
                       >
                         {t.create}
                       </button>
                       {createUserMsg && (
                         <p className={`text-[10px] font-bold uppercase text-center mt-2 ${createUserMsg.includes('!') ? 'text-green-600' : 'text-red-500'}`}>
                           {createUserMsg}
                         </p>
                       )}
                     </motion.form>
                   )}
                 </AnimatePresence>
              </div>

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

              {matches
                 .filter(m => {
                    if (m.status !== adminMatchFilter) return false;
                    if (adminGroupFilter === 'all') return true;
                    return matchPassesStageFilter(m, adminGroupFilter);
                 })
                 .sort((a, b) => {
                    const timeA = new Date(a.start_time_utc).getTime();
                    const timeB = new Date(b.start_time_utc).getTime();
                    return adminMatchFilter === 'finished' ? timeB - timeA : timeA - timeB;
                 })
                 .map(m => (
                    <AdminMatchCard 
                      key={m.id} 
                      match={m} 
                      t={t} 
                      onUpdate={(h, a) => updateMatchResult(m.id, h, a)} 
                      isHockey={m.tournament_id === "ms-hockey-2026"}
                    />
                  ))}

              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mb-4 mt-8">
                 <h3 className="text-xs font-bold text-slate-400 uppercase mb-4">{t.setFinalWinner}</h3>
                 <div className="grid grid-cols-4 gap-2 mb-4">
                   {teams.map(t => (
                     <button
                       key={t.id}
                       onClick={() => setSelectedWinner(t.id)}
                       className={`p-2 rounded-xl flex flex-col items-center border transition-all ${
                         selectedWinner === t.id ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-transparent'
                       }`}
                     >
                       <TeamFlag code={t.flag_code || t.id} className="w-10 h-6 mb-1" />
                       <span className="text-[10px] font-bold">{t.id.toUpperCase()}</span>
                     </button>
                   ))}
                 </div>
                 <button 
                   onClick={() => selectedWinner && setTournamentWinner(selectedWinner)}
                   className="w-full py-3 bg-orange-600 text-white rounded-xl font-bold shadow-md shadow-orange-100"
                 >
                   {t.setFinalChampion}
                 </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      ) : null}

      {/* Navigation */}
      {activeLobby && activeTournamentId && (
        <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white/80 backdrop-blur-lg border-t px-2 py-3 flex justify-around items-center rounded-t-[2rem] z-50 transition-colors border-slate-100">
        <button onClick={() => setTab('matches')} className={`flex flex-col items-center gap-1 transition-all ${tab === 'matches' ? 'text-red-600 scale-110' : 'text-slate-400'}`}>
          <Calendar className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">{t.matches}</span>
        </button>
        <button onClick={() => setTab('results')} className={`flex flex-col items-center gap-1 transition-all ${tab === 'results' ? 'text-red-600 scale-110' : 'text-slate-400'}`}>
          <CheckCircle2 className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">{t.results}</span>
        </button>
        <button onClick={() => setTab('leaderboard')} className={`flex flex-col items-center gap-1 transition-all ${tab === 'leaderboard' ? 'text-red-600 scale-110' : 'text-slate-400'}`}>
          <TrophyIcon className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">{t.rank}</span>
        </button>
        {user.role === 'admin' && (
          <button onClick={() => setTab('admin')} className={`flex flex-col items-center gap-1 transition-all ${tab === 'admin' ? 'text-red-600 scale-110' : 'text-slate-400'}`}>
            <ShieldCheck className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase">{t.admin}</span>
          </button>
        )}
        <button onClick={() => setTab('profile')} className={`flex flex-col items-center gap-1 transition-all ${tab === 'profile' ? 'text-red-600 scale-110' : 'text-slate-400'}`}>
          <div className={`${tab === 'profile' ? 'ring-2 ring-red-600 rounded-full' : ''}`}>
             <UserAvatar player={user} size="sm" />
          </div>
          <span className="text-[10px] font-bold uppercase">{t.profile}</span>
        </button>
      </nav>
      )}
    </div>
  );
}
