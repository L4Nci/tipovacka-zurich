import React, { Component, Suspense, lazy, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  Calendar, 
  CheckCircle2, 
  ShieldCheck, 
  ChevronRight, 
  Trophy as TrophyIcon,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Player, Team, Match, Prediction, Lobby, type AuthStatus } from './types.ts';
import { supabase } from './lib/supabase.ts';
import { isDrawPrediction, isFootballKnockoutStage } from './lib/matchRules.ts';
import { 
  fetchAllData, 
  fetchCriticalAppData,
  fetchDeferredAppData,
  fetchHomeDashboard,
  loginUser, 
  registerUser, 
  logoutUser,
  savePrediction as savePredDB, 
  fetchMatchPredictions,
  updateMatchResult as updateMatchResDB,
  setTournamentWinner as setWinnerDB,
  pickTournamentWinner as pickWinnerDB,
  changePassword as changePassDB,
  updateProfileAvatar,
  updateProfileUsername,
  loadPlayerFromAuthUser,
  createLobby,
  joinLobbyByCode,
  calculatePoints
} from './lib/db.ts';
import AuthScreen from './components/AuthScreen.tsx';
import { HomeDashboard, type AddLobbyMode } from './components/HomeDashboard.tsx';
import { isUntippedMatchForDisplay, type HomeDashboardSummary } from './lib/homeDashboard.ts';
import {
  getUserAuthProviders,
  isGeneratedProfileName,
  requestPasswordReset,
  resendSignupConfirmation,
  signInWithOAuthProvider,
  toFriendlyAuthError,
  type SupportedOAuthProvider
} from './lib/auth.ts';
import { getAuthEventAction } from './lib/authLifecycle.ts';
import {
  canStartLobbyNavigation,
  getLobbyNavigationViewState,
  runLobbyNavigationTransition,
  type LobbyNavigationAction
} from './lib/lobbyNavigation.ts';

const LazyAdminScreen = lazy(() => import('./components/AdminScreen.tsx'));
const LazyLeaderboardScreen = lazy(() => import('./components/LeaderboardScreen.tsx'));
const LazyLobbyView = lazy(() => import('./components/LobbyView.tsx').then(module => ({ default: module.LobbyView })));
const LazyProfileScreen = lazy(() => import('./components/ProfileScreen.tsx'));

const translations = {
  cz: {
    matches: "Zápasy",
    results: "Výsledky",
    rank: "Pořadí",
    admin: "Admin",
    profile: "Profil",
    winnerTab: "Vítěz",
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
    profile: "Profile",
    winnerTab: "Winner",
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
    'ukr': 'ua',
    'eng': 'gb-eng', 'england': 'gb-eng', 'football-eng': 'gb-eng',
    'sco': 'gb-sct', 'scotland': 'gb-sct', 'football-sco': 'gb-sct',
    'wal': 'gb-wls', 'wales': 'gb-wls', 'football-wal': 'gb-wls'
  };

  const subdivisionEmojiMap: Record<string, string> = {
    "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}": "gb-eng",
    "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}": "gb-sct",
    "\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}": "gb-wls"
  };

  const clean = code.trim().toLowerCase();
  const subdivisionIso = map[clean] || subdivisionEmojiMap[code];
  const iso = subdivisionIso || isoFromEmoji || (clean.length === 2 ? clean : null);

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
  matchPredictionsLoading?: boolean;
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
  matchPredictionsLoading = false,
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
    if (matchPredictionsLoading && matchPredictions.length === 0 && (match.total_predictions || 0) > 0) {
      return { home: 0, away: 0, draw: 0, isEmpty: true, isLoading: true };
    }

    const predictionsForDistribution = isFootballKnockout
      ? matchPredictions.filter(p => p.predicted_home_score !== p.predicted_away_score)
      : matchPredictions;
    const total = predictionsForDistribution.length;
    if (total === 0) return { home: 0, away: 0, draw: 0, isEmpty: true, isLoading: false };
    
    const homeWins = predictionsForDistribution.filter(p => p.predicted_home_score > p.predicted_away_score).length;
    const draws = isFootballKnockout ? 0 : predictionsForDistribution.filter(p => p.predicted_home_score === p.predicted_away_score).length;
    const awayWins = predictionsForDistribution.filter(p => p.predicted_away_score > p.predicted_home_score).length;
    
    return {
      home: Math.round((homeWins / total) * 100),
      draw: Math.round((draws / total) * 100),
      away: Math.round((awayWins / total) * 100),
      isEmpty: false,
      isLoading: false
    };
  }, [isFootballKnockout, match.total_predictions, matchPredictions, matchPredictionsLoading]);
  const hasOwnPrediction = match.predicted_home_score !== null && match.predicted_away_score !== null;
  const fallbackOtherPredictionsCount = Math.max((match.total_predictions || 0) - (hasOwnPrediction ? 1 : 0), 0);
  const otherPredictionsCount = showOthers
    ? others.filter(p => p.player_id !== userId).length
    : matchPredictionsLoading
      ? fallbackOtherPredictionsCount
      : matchPredictions.filter(p => p.player_id !== userId).length;

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
                  {predictionStats.isLoading ? '…' : `${predictionStats.home}%`}
                </span>
                {!isFootballKnockout && (
                  <span className="text-center text-[#1f2937]">
                    <span className="block text-[8px] text-slate-400">Remíza</span>
                    {predictionStats.isLoading ? '…' : `${predictionStats.draw}%`}
                  </span>
                )}
                <span className="text-right text-[#006847]">
                  <span className="block text-[8px] text-slate-400 truncate">{awayOutcomeLabel}</span>
                  {predictionStats.isLoading ? '…' : `${predictionStats.away}%`}
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
          <span className="ml-1 bg-slate-100 px-1.5 py-0.5 rounded-md font-bold text-[10px] transition-colors">{otherPredictionsCount} {t.tipsCount}</span>
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

const AuthenticatedAppSkeleton = ({ t, error, onRetry }: { t: any, error: string, onRetry: () => void }) => (
  <div className="min-h-screen bg-slate-50 pb-24 max-w-lg mx-auto shadow-2xl transition-colors duration-300">
    <header className="bg-white p-6 sticky top-0 z-50 border-b border-slate-100 transition-colors">
      <div className="flex items-center justify-between">
        <div className="h-7 w-44 rounded-xl bg-slate-100 motion-safe:animate-pulse" />
        <div className="h-8 w-8 rounded-full bg-slate-100 motion-safe:animate-pulse" />
      </div>
    </header>

    <main className="p-4">
      <div className="flex gap-2 overflow-hidden pb-4 -mx-4 px-4 bg-slate-50 py-1">
        {[0, 1, 2, 3].map(item => (
          <div key={item} className="h-7 w-20 flex-none rounded-full bg-white border border-slate-100 motion-safe:animate-pulse" />
        ))}
      </div>

      <div className="mb-4 flex items-center gap-2">
        <div className="h-4 w-4 rounded bg-slate-200 motion-safe:animate-pulse" />
        <div className="h-3 w-48 rounded bg-slate-200 motion-safe:animate-pulse" />
      </div>

      <div className="space-y-4">
        {[0, 1, 2].map(item => (
          <div key={item} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div className="h-3 w-20 rounded bg-slate-100 motion-safe:animate-pulse" />
              <div className="h-6 w-20 rounded-full bg-slate-100 motion-safe:animate-pulse" />
            </div>
            <div className="mb-6 flex items-center justify-around">
              <div className="flex flex-col items-center gap-3">
                <div className="h-12 w-20 rounded-lg bg-slate-100 motion-safe:animate-pulse" />
                <div className="h-5 w-12 rounded bg-slate-100 motion-safe:animate-pulse" />
              </div>
              <div className="h-8 w-10 rounded bg-slate-100 motion-safe:animate-pulse" />
              <div className="flex flex-col items-center gap-3">
                <div className="h-12 w-20 rounded-lg bg-slate-100 motion-safe:animate-pulse" />
                <div className="h-5 w-12 rounded bg-slate-100 motion-safe:animate-pulse" />
              </div>
            </div>
            <div className="h-28 rounded-2xl bg-slate-50 motion-safe:animate-pulse" />
          </div>
        ))}
      </div>

      {error ? (
        <div className="mt-6 p-4 bg-white rounded-2xl border border-red-100 shadow-sm text-center">
          <p className="text-red-600 text-xs font-bold uppercase mb-2">Error</p>
          <p className="text-slate-600 text-sm mb-4">{error}</p>
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-transform"
          >
            Try Again
          </button>
        </div>
      ) : (
        <p className="mt-6 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">{t.loading}</p>
      )}
    </main>
  </div>
);

const DeferredLeaderboardSkeleton = () => (
  <div className="space-y-3">
    {[0, 1, 2].map(item => (
      <div key={item} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-slate-100 motion-safe:animate-pulse" />
            <div className="w-10 h-10 rounded-full bg-slate-100 motion-safe:animate-pulse" />
            <div className="space-y-2">
              <div className="h-3 w-24 rounded-full bg-slate-100 motion-safe:animate-pulse" />
              <div className="h-2 w-16 rounded-full bg-slate-100 motion-safe:animate-pulse" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="h-5 w-10 rounded-full bg-slate-100 motion-safe:animate-pulse" />
            <div className="h-2 w-8 rounded-full bg-slate-100 motion-safe:animate-pulse" />
          </div>
        </div>
        <div className="mt-2.5 grid grid-cols-4 gap-1.5">
          {[0, 1, 2, 3].map(stat => (
            <div key={stat} className="rounded-xl bg-slate-50 px-1.5 py-1.5">
              <div className="h-2 w-full rounded-full bg-slate-100 motion-safe:animate-pulse" />
              <div className="mt-1 h-3 w-5 rounded-full bg-slate-100 motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

const DeferredProfileSkeleton = () => (
  <div className="space-y-4">
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col items-center">
      <div className="w-20 h-20 rounded-full bg-slate-100 motion-safe:animate-pulse mb-4" />
      <div className="h-5 w-28 rounded-full bg-slate-100 motion-safe:animate-pulse" />
    </div>
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map(item => (
        <div key={item} className="bg-white rounded-2xl border border-slate-100 p-3">
          <div className="h-3 w-10 rounded-full bg-slate-100 motion-safe:animate-pulse mx-auto mb-2" />
          <div className="h-5 w-8 rounded-full bg-slate-100 motion-safe:animate-pulse mx-auto" />
        </div>
      ))}
    </div>
  </div>
);

class LazyScreenErrorBoundary extends (Component as any) {
  declare props: { children: React.ReactNode; fallback?: React.ReactNode };
  declare state: { hasError: boolean };

  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Lazy screen load error:", error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-center text-xs font-bold text-red-600">
          Obrazovku se nepodařilo načíst. Zkus aplikaci obnovit.
        </div>
      );
    }

    return this.props.children;
  }
}

const DeferredScreenSkeleton = () => (
  <div className="space-y-3">
    {[0, 1, 2].map(item => (
      <div key={item} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="mb-3 h-4 w-32 rounded-full bg-slate-100 motion-safe:animate-pulse" />
        <div className="space-y-2">
          <div className="h-3 w-full rounded-full bg-slate-100 motion-safe:animate-pulse" />
          <div className="h-3 w-3/4 rounded-full bg-slate-100 motion-safe:animate-pulse" />
          <div className="h-10 w-full rounded-xl bg-slate-50 motion-safe:animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

const LobbyContextFallback = ({
  loading,
  error,
  onRetry,
  onHome
}: {
  loading: boolean;
  error: string;
  onRetry: () => void;
  onHome: () => void;
}) => (
  <div className="min-h-screen bg-slate-50 pb-24 max-w-lg mx-auto shadow-2xl transition-colors duration-300">
    <header className="bg-white p-6 sticky top-0 z-50 border-b border-slate-100">
      <h1 className="text-2xl font-black text-slate-900 leading-none tracking-tighter italic uppercase">
        FAN TIPOVAČKA
      </h1>
    </header>
    <main className="p-4" aria-busy={loading}>
      <DeferredScreenSkeleton />
      <div className={`mt-4 rounded-2xl border bg-white p-4 text-center shadow-sm ${error ? 'border-red-100' : 'border-slate-100'}`}>
        <p className={`text-sm font-bold ${error ? 'text-red-600' : 'text-slate-600'}`}>
          {error || 'Připravuji lobby...'}
        </p>
        {error ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onHome}
              className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wider text-slate-600"
            >
              Zpět na Home
            </button>
            <button
              type="button"
              onClick={onRetry}
              className="min-h-10 rounded-xl bg-slate-900 px-3 text-[10px] font-black uppercase tracking-wider text-white"
            >
              Zkusit znovu
            </button>
          </div>
        ) : null}
      </div>
    </main>
  </div>
);

type TournamentWinnerScreenProps = {
  t: any;
  lang: 'cz' | 'en';
  winnerPickerTeams: Team[];
  currentUserPickId?: string;
  isWinnerPickerLocked: boolean;
  onPickTournamentWinner: (teamId: string) => Promise<void>;
  TeamFlag: React.ComponentType<{ code: string | null | undefined; className?: string }>;
};

const TournamentWinnerScreen = ({
  t,
  lang,
  winnerPickerTeams,
  currentUserPickId,
  isWinnerPickerLocked,
  onPickTournamentWinner,
  TeamFlag
}: TournamentWinnerScreenProps) => (
  <motion.div
    key="winner"
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: 20 }}
  >
    <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
      <TrophyIcon className="w-4 h-4" /> {t.tournamentWinner}
    </h2>
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
  </motion.div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<Player | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('initializing');
  const [authProviders, setAuthProviders] = useState<string[]>([]);
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState('');
  const authSyncRequestRef = useRef(0);
  const authenticatedUserIdRef = useRef<string | null>(null);
  const authenticatingUserIdRef = useRef<string | null>(null);
  const passwordRecoveryRef = useRef(false);
  
  const [tab, setTab] = useState<'matches' | 'results' | 'leaderboard' | 'winner' | 'admin' | 'profile'>('matches');
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
  const [deferredLoading, setDeferredLoading] = useState(false);
  const [deferredError, setDeferredError] = useState('');
  const [loadedDataContext, setLoadedDataContext] = useState<{ lobbyId: string | null; tournamentId: string | null }>({
    lobbyId: null,
    tournamentId: null
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [loginData, setLoginData] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const criticalLoadRequestRef = useRef(0);
  const deferredLoadRequestRef = useRef(0);
  
  // Lobbies State (FÁZE S7 & S8)
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [activeLobbyId, setActiveLobbyId] = useState<string | null>(() => (
    sessionStorage.getItem('activeTournamentId') ? localStorage.getItem('activeLobbyId') : null
  ));
  const [activeLobbyName, setActiveLobbyName] = useState<string>("");
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(() => sessionStorage.getItem('activeTournamentId'));
  const previousActiveLobbyIdRef = useRef<string | null>(activeLobbyId);
  const [entryOrigin, setEntryOrigin] = useState<'direct-home-action' | 'lobby-detail' | 'normal-tournament-navigation'>('normal-tournament-navigation');
  const [homeDashboardSummaries, setHomeDashboardSummaries] = useState<HomeDashboardSummary[]>([]);
  const [homeDashboardLoading, setHomeDashboardLoading] = useState(false);
  const [homeDashboardError, setHomeDashboardError] = useState('');
  const homeDashboardRequestRef = useRef(0);
  const lobbyNavigationRequestRef = useRef(0);
  const lobbyMutationInFlightRef = useRef(false);
  const skipNextInitialDataLoadRef = useRef(false);
  const [newLobbyName, setNewLobbyName] = useState("");
  const [newLobbyShortDescription, setNewLobbyShortDescription] = useState("");
  const [newLobbyLongDescription, setNewLobbyLongDescription] = useState("");
  const [newLobbyTournament, setNewLobbyTournament] = useState("fifa-world-cup-2026");
  const [joinCodeInput, setJoinCodeInput] = useState(() => {
    return new URLSearchParams(window.location.search).get("join") || "";
  });

  const activeLobby = lobbies.find(l => l.id === activeLobbyId);
  const isHockey = activeTournamentId === "ms-hockey-2026";
  const [winnerPickerTeams, setWinnerPickerTeams] = useState<any[]>([]);

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
      if (authStatus !== 'authenticated' || !activeTournamentId) {
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
  }, [authStatus, activeTournamentId, teams]);

  const [lobbyFormActive, setLobbyFormActive] = useState<AddLobbyMode>(() => {
    if (new URLSearchParams(window.location.search).get("join")) return 'join';
    return 'none';
  });
  const [lobbyError, setLobbyError] = useState("");
  const [lobbySuccess, setLobbySuccess] = useState("");
  const [isLobbyMutationSubmitting, setIsLobbyMutationSubmitting] = useState(false);
  const [pendingLobbyNavigation, setPendingLobbyNavigation] = useState<{
    action: LobbyNavigationAction;
    targetLobby: Lobby;
    status: 'loading' | 'error';
    error: string;
  } | null>(null);

  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);
  const [championMsg, setChampionMsg] = useState('');
  const [championError, setChampionError] = useState('');
  const [adminMatchFilter, setAdminMatchFilter] = useState<'scheduled' | 'finished'>('scheduled');
  const [adminGroupFilter, setAdminGroupFilter] = useState('all');
  const [passData, setPassData] = useState({ newPass: '', confirmPass: '' });
  const [passMsg, setPassMsg] = useState('');
  const [passError, setPassError] = useState('');
  const [isPassSaving, setIsPassSaving] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
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
      if (previousActiveLobbyIdRef.current && previousActiveLobbyIdRef.current !== activeLobbyId) {
        setActiveTournamentId(null);
        sessionStorage.removeItem('activeTournamentId');
      }
    } else {
      localStorage.removeItem('activeLobbyId');
      setActiveTournamentId(null);
      sessionStorage.removeItem('activeTournamentId');
    }
    previousActiveLobbyIdRef.current = activeLobbyId;
  }, [activeLobbyId]);

  useEffect(() => {
    if (activeTournamentId) {
      sessionStorage.setItem('activeTournamentId', activeTournamentId);
    } else {
      sessionStorage.removeItem('activeTournamentId');
    }
  }, [activeTournamentId]);

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

  const matchFilters = useMemo(() => [
    stageFilters[0],
    { id: 'untipped', label: lang === 'cz' ? 'Bez tipu' : 'Missing' },
    ...stageFilters.slice(1)
  ], [stageFilters, lang]);

  const matchPassesStageFilter = (match: Match, filter: string) => {
    return filter === 'all' || match.stage === filter;
  };

  const predictionsByMatchId = useMemo(() => {
    const byMatch = new Map<string, Prediction[]>();
    allPredictions.forEach(prediction => {
      const existing = byMatch.get(prediction.match_id);
      if (existing) {
        existing.push(prediction);
      } else {
        byMatch.set(prediction.match_id, [prediction]);
      }
    });
    return byMatch;
  }, [allPredictions]);

  const scheduledMatchesForView = useMemo(() => {
    return matches.filter(match => {
      if (match.status !== 'scheduled') return false;
      if (matchFilter === 'untipped') return isUntippedMatchForDisplay(match);
      if (matchFilter === 'all') return true;
      return matchPassesStageFilter(match, matchFilter);
    });
  }, [matches, matchFilter]);

  const finishedMatchesForView = useMemo(() => {
    return [...matches]
      .filter(match => {
        if (match.status !== 'finished') return false;
        if (matchFilter === 'all' || matchFilter === 'untipped') return true;
        return matchPassesStageFilter(match, matchFilter);
      })
      .reverse();
  }, [matches, matchFilter]);

  const adminMatchesForView = useMemo(() => {
    return matches
      .filter(match => {
        if (match.status !== adminMatchFilter) return false;
        if (adminGroupFilter === 'all') return true;
        return matchPassesStageFilter(match, adminGroupFilter);
      })
      .slice()
      .sort((a, b) => {
        const timeA = new Date(a.start_time_utc).getTime();
        const timeB = new Date(b.start_time_utc).getTime();
        return adminMatchFilter === 'finished' ? timeB - timeA : timeA - timeB;
      });
  }, [matches, adminMatchFilter, adminGroupFilter]);

  const tournamentStats = useMemo(() => {
    const defaultTournamentId = activeTournamentId
      || activeLobby?.tournaments?.find(tournament => tournament.status === 'active')?.tournament_id
      || activeLobby?.tournament_id;

    if (!defaultTournamentId) return {};

    const tournamentMatches = matches.filter(match => !match.tournament_id || match.tournament_id === defaultTournamentId);
    const scheduledMatches = tournamentMatches.filter(match => match.status === 'scheduled');
    const unresolvedMatches = tournamentMatches.filter(match => (
      match.status !== 'finished' ||
      match.home_score === null ||
      match.away_score === null
    ));
    const nextMatch = scheduledMatches
      .slice()
      .sort((a, b) => new Date(a.start_time_utc).getTime() - new Date(b.start_time_utc).getTime())[0];
    const champion = teams.find(tm => tm.is_final_winner === 1) || null;
    const isCompleted = Boolean(champion) && tournamentMatches.length > 0 && unresolvedMatches.length === 0;

    return {
      [defaultTournamentId]: {
        total: tournamentMatches.length,
        scheduled: scheduledMatches.length,
        finished: tournamentMatches.filter(match => match.status === 'finished').length,
        unresolved: unresolvedMatches.length,
        isCompleted,
        championName: champion?.name || null,
        championShortName: champion?.short_name || null,
        championFlag: champion?.flag_code || null,
        nextStart: nextMatch?.start_time_utc || null,
        nextMatchLabel: nextMatch ? `${nextMatch.home_name} vs ${nextMatch.away_name}` : null
      }
    };
  }, [activeLobby, activeTournamentId, matches, teams]);

  useEffect(() => {
    if (!matchFilters.some(filter => filter.id === matchFilter)) {
      setMatchFilter('all');
    }
    if (!stageFilters.some(filter => filter.id === adminGroupFilter)) {
      setAdminGroupFilter('all');
    }
  }, [stageFilters, matchFilters, matchFilter, adminGroupFilter]);

  useEffect(() => {
    if (!user) return;
    setAvatarData({
      emoji: user.avatar_emoji || '😀',
      bg: user.avatar_bg || '#fee2e2'
    });
  }, [user?.id, user?.avatar_emoji, user?.avatar_bg]);

  const clearAuthenticatedState = useCallback(() => {
    authSyncRequestRef.current += 1;
    lobbyNavigationRequestRef.current += 1;
    lobbyMutationInFlightRef.current = false;
    authenticatedUserIdRef.current = null;
    authenticatingUserIdRef.current = null;
    setUser(null);
    setAuthProviders([]);
    localStorage.removeItem('user');
    localStorage.removeItem('activeLobbyId');
    sessionStorage.removeItem('activeTournamentId');
    setMatches([]);
    setTeams([]);
    setLeaderboard([]);
    setAllPredictions([]);
    setLobbies([]);
    setHomeDashboardSummaries([]);
    setPendingLobbyNavigation(null);
    setIsLobbyMutationSubmitting(false);
    setLoadedDataContext({ lobbyId: null, tournamentId: null });
    setActiveLobbyId(null);
    setActiveLobbyName('');
    setActiveTournamentId(null);
    setTab('matches');
    setLoading(false);
    setDeferredLoading(false);
  }, []);

  // Supabase session is the only authoritative identity source.
  useEffect(() => {
    let active = true;

    const synchronizeSession = async (
      session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']
    ) => {
      if (!session?.user) {
        if (!active) return;
        clearAuthenticatedState();
        setAuthStatus('signed_out');
        return;
      }

      if (
        authenticatedUserIdRef.current === session.user.id ||
        authenticatingUserIdRef.current === session.user.id
      ) return;

      const requestId = ++authSyncRequestRef.current;
      authenticatingUserIdRef.current = session.user.id;
      try {
        const restored = await loadPlayerFromAuthUser(session.user);
        if (!active || requestId !== authSyncRequestRef.current || passwordRecoveryRef.current) return;

        authenticatedUserIdRef.current = session.user.id;
        setUser(restored);
        setAuthProviders(getUserAuthProviders(session.user));
        setAuthStatus(isGeneratedProfileName(restored.username) ? 'profile_onboarding' : 'authenticated');
      } catch (err: any) {
        if (!active || requestId !== authSyncRequestRef.current) return;
        console.error('Error restoring authenticated profile:', err);
        authenticatedUserIdRef.current = null;
        setUser(null);
        setAuthProviders([]);
        setError(err?.message || 'Nepodařilo se načíst přihlášený profil.');
        setAuthStatus('auth_error');
        setLoading(false);
      } finally {
        if (authenticatingUserIdRef.current === session.user.id) {
          authenticatingUserIdRef.current = null;
        }
      }
    };

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setError(toFriendlyAuthError(sessionError));
        setAuthStatus('auth_error');
        setLoading(false);
        return;
      }
      void synchronizeSession(data.session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      const action = getAuthEventAction(event, Boolean(session), passwordRecoveryRef.current);

      if (action === 'password_recovery') {
        passwordRecoveryRef.current = true;
        authenticatedUserIdRef.current = null;
        setUser(null);
        setAuthProviders([]);
        setError('');
        setAuthStatus('password_recovery');
        setLoading(false);
        return;
      }

      if (action === 'signed_out') {
        passwordRecoveryRef.current = false;
        clearAuthenticatedState();
        setAuthStatus('signed_out');
        return;
      }

      if (action === 'ignore') return;

      window.setTimeout(() => {
        if (active) void synchronizeSession(session);
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [clearAuthenticatedState]);

  const syncUserFromLeaderboard = (nextLeaderboard: Player[]) => {
    const myPlayer = nextLeaderboard.find(p => p.id === user?.id);
    if (myPlayer) {
      setUser(prev => {
        if (!prev) return prev;
        const updated = {
          ...prev,
          avatar_emoji: myPlayer.avatar_emoji || prev.avatar_emoji || '😀',
          avatar_bg: myPlayer.avatar_bg || prev.avatar_bg || '#fee2e2',
          tournament_winner_id: myPlayer.tournament_winner_id || undefined
        };
        return updated;
      });
    } else {
      setUser(prev => {
        if (!prev) return prev;
        const updated = { ...prev, tournament_winner_id: undefined };
        return updated;
      });
    }
  };

  const fetchAll = async (lobbyIdParam?: string) => {
    if (!user) return;
    try {
      setError('');
      setDeferredError('');
      const targetLobbyId = lobbyIdParam || activeLobbyId;
      
      const res = await fetchAllData(user.id, targetLobbyId || undefined, activeTournamentId || undefined);
      
      setMatches(res.matches);
      setTeams(res.teams);
      setLeaderboard(res.leaderboard);
      setAllPredictions(res.allPredictions);
      setLobbies(res.lobbies);
      setLoadedDataContext({
        lobbyId: res.lobbyId || null,
        tournamentId: activeTournamentId || null
      });
      
      if (res.lobbyId) {
        setActiveLobbyId(res.lobbyId);
      }
      if (res.lobbyName) {
        setActiveNameOnly(res.lobbyName); // helper mapping
      }

      // Sync active user's tournament winner selection from the target lobby leaderboard selection
      if (res.leaderboard) {
        syncUserFromLeaderboard(res.leaderboard);
      }
    } catch (e: any) {
      console.error("fetchAll error:", e);
      setError(e?.message || "Nepodařilo se synchronizovat data se Supabase.");
    } finally {
      setDeferredLoading(false);
      setLoading(false);
    }
  };

  const loadInitialData = async () => {
    if (!user) return;

    const criticalRequestId = criticalLoadRequestRef.current + 1;
    criticalLoadRequestRef.current = criticalRequestId;
    deferredLoadRequestRef.current += 1;

    setLoading(true);
    setDeferredLoading(false);
    setError('');
    setDeferredError('');

    try {
      const targetLobbyId = activeLobbyId || undefined;
      const critical = await fetchCriticalAppData(user.id, targetLobbyId, activeTournamentId || undefined);
      if (criticalLoadRequestRef.current !== criticalRequestId) return;

      setMatches(critical.matches);
      setTeams(critical.teams);
      setLobbies(critical.lobbies);
      setLeaderboard([]);
      setAllPredictions([]);
      setLoadedDataContext({
        lobbyId: critical.lobbyId || null,
        tournamentId: activeTournamentId || null
      });

      if (critical.lobbyId) {
        setActiveLobbyId(critical.lobbyId);
      }
      if (critical.lobbyName) {
        setActiveNameOnly(critical.lobbyName);
      }

      setLoading(false);

      if (!critical.lobbyId) return;

      const deferredRequestId = deferredLoadRequestRef.current + 1;
      deferredLoadRequestRef.current = deferredRequestId;
      setDeferredLoading(true);

      try {
        const deferred = await fetchDeferredAppData(
          critical.lobbyId,
          critical.tournamentId || activeTournamentId || undefined,
          critical.matches
        );
        if (
          criticalLoadRequestRef.current !== criticalRequestId ||
          deferredLoadRequestRef.current !== deferredRequestId
        ) {
          return;
        }

        setLeaderboard(deferred.leaderboard);
        setAllPredictions(deferred.allPredictions);
        syncUserFromLeaderboard(deferred.leaderboard);
      } catch (e: any) {
        if (deferredLoadRequestRef.current !== deferredRequestId) return;
        console.error("deferred data load error:", e);
        setDeferredError(e?.message || "Nepodařilo se načíst žebříček a statistiky.");
      } finally {
        if (deferredLoadRequestRef.current === deferredRequestId) {
          setDeferredLoading(false);
        }
      }
    } catch (e: any) {
      if (criticalLoadRequestRef.current !== criticalRequestId) return;
      console.error("critical data load error:", e);
      setError(e?.message || "Nepodařilo se synchronizovat data se Supabase.");
      setLoading(false);
      setDeferredLoading(false);
    }
  };

  const setActiveNameOnly = (name: string) => {
    setActiveLobbyName(name);
  };

  const updateLocalLobby = (lobbyId: string, updates: Partial<Lobby>) => {
    setLobbies(prev => prev.map(lobby => (
      lobby.id === lobbyId
        ? { ...lobby, ...updates }
        : lobby
    )));

    if (lobbyId === activeLobbyId && updates.name) {
      setActiveLobbyName(updates.name);
    }
    if (updates.name) {
      setHomeDashboardSummaries(prev => prev.map(summary => (
        summary.lobby_id === lobbyId ? { ...summary, lobby_name: updates.name as string } : summary
      )));
    }
  };

  const loadHomeDashboard = useCallback(async () => {
    if (!user) return;

    const requestId = homeDashboardRequestRef.current + 1;
    homeDashboardRequestRef.current = requestId;
    setHomeDashboardLoading(true);
    setHomeDashboardError('');

    try {
      const result = await fetchHomeDashboard(user.id, lobbies);
      if (homeDashboardRequestRef.current !== requestId) return;
      setHomeDashboardSummaries(result.summaries);
    } catch (homeError: any) {
      if (homeDashboardRequestRef.current !== requestId) return;
      console.error('home dashboard load error:', homeError);
      setHomeDashboardError(homeError?.message || 'Akční přehled se nepodařilo načíst.');
    } finally {
      if (homeDashboardRequestRef.current === requestId) {
        setHomeDashboardLoading(false);
      }
    }
  }, [user, lobbies]);

  useEffect(() => {
    if (!user || loading) return;
    if (activeLobbyId) {
      homeDashboardRequestRef.current += 1;
      setHomeDashboardLoading(false);
      return;
    }
    void loadHomeDashboard();
  }, [user, loading, activeLobbyId, loadHomeDashboard]);

  const goHome = () => {
    lobbyNavigationRequestRef.current += 1;
    lobbyMutationInFlightRef.current = false;
    setIsLobbyMutationSubmitting(false);
    setPendingLobbyNavigation(null);
    setHomeDashboardLoading(true);
    setHomeDashboardError('');
    setEntryOrigin('normal-tournament-navigation');
    setMatchFilter('all');
    setActiveTournamentId(null);
    setActiveLobbyId(null);
    setTab('matches');
    window.scrollTo({ top: 0 });
  };

  const openLobbyDetail = (lobby: Lobby) => {
    lobbyNavigationRequestRef.current += 1;
    lobbyMutationInFlightRef.current = false;
    setIsLobbyMutationSubmitting(false);
    setPendingLobbyNavigation(null);
    setEntryOrigin('lobby-detail');
    setMatchFilter('all');
    setActiveTournamentId(null);
    setActiveLobbyId(lobby.id);
    setActiveLobbyName(lobby.name);
    setTab('matches');
    window.scrollTo({ top: 0 });
  };

  const openHomeContext = (summary: HomeDashboardSummary, showOnlyMissing: boolean) => {
    lobbyNavigationRequestRef.current += 1;
    lobbyMutationInFlightRef.current = false;
    setIsLobbyMutationSubmitting(false);
    setPendingLobbyNavigation(null);
    setEntryOrigin('direct-home-action');
    setActiveLobbyId(summary.lobby_id);
    setActiveLobbyName(summary.lobby_name);
    setActiveTournamentId(summary.tournament_id);
    setMatchFilter(showOnlyMissing ? 'untipped' : 'all');
    setTab('matches');
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    if (loading || entryOrigin !== 'normal-tournament-navigation' || !activeTournamentId) return;
    if (tournamentStats[activeTournamentId]?.isCompleted) {
      goHome();
    }
  }, [loading, entryOrigin, activeTournamentId, tournamentStats]);

  useEffect(() => {
    if (authStatus === 'authenticated' && user?.id) {
      if (skipNextInitialDataLoadRef.current) {
        skipNextInitialDataLoadRef.current = false;
        return;
      }
      loadInitialData();
    }
  }, [authStatus, user?.id, activeLobbyId, activeTournamentId]);

  const navigateAfterLobbyMutation = async (
    action: LobbyNavigationAction,
    mutate: () => Promise<Lobby>
  ) => {
    if (!user || !canStartLobbyNavigation(
      lobbyMutationInFlightRef.current,
      pendingLobbyNavigation?.status
    )) {
      return null;
    }

    const requestId = lobbyNavigationRequestRef.current + 1;
    lobbyNavigationRequestRef.current = requestId;
    lobbyMutationInFlightRef.current = true;
    setIsLobbyMutationSubmitting(true);
    setLobbyError('');
    setLobbySuccess('');

    let targetLobby: Lobby | null = null;

    try {
      const result = await runLobbyNavigationTransition({
        requestId,
        isCurrent: currentRequestId => lobbyNavigationRequestRef.current === currentRequestId,
        mutate,
        refresh: lobbyId => fetchAllData(user.id, lobbyId, undefined),
        onTarget: lobby => {
          targetLobby = lobby;
          setPendingLobbyNavigation({
            action,
            targetLobby: lobby,
            status: 'loading',
            error: ''
          });
        }
      });

      if (result.status === 'stale') return null;

      const data = result.data;
      setMatches(data.matches);
      setTeams(data.teams);
      setLeaderboard(data.leaderboard);
      setAllPredictions(data.allPredictions);
      setLobbies(data.lobbies);
      setLoadedDataContext({
        lobbyId: result.hydratedLobby.id,
        tournamentId: null
      });
      syncUserFromLeaderboard(data.leaderboard);

      skipNextInitialDataLoadRef.current = true;
      setEntryOrigin('lobby-detail');
      setActiveTournamentId(null);
      setActiveLobbyName(result.hydratedLobby.name);
      setTab('matches');
      setActiveLobbyId(result.hydratedLobby.id);
      setPendingLobbyNavigation(null);
      setLobbyFormActive('none');
      if (action === 'create') {
        setLobbySuccess(`Lobby "${result.hydratedLobby.name}" vytvořena! Kód: ${result.hydratedLobby.join_code}`);
        setNewLobbyName('');
        setNewLobbyShortDescription('');
        setNewLobbyLongDescription('');
      } else {
        setLobbySuccess(`Úspěšně ses připojil k lobby "${result.hydratedLobby.name}"!`);
        setJoinCodeInput('');
      }
      window.scrollTo({ top: 0 });
      return result.hydratedLobby;
    } catch (navigationError: any) {
      if (lobbyNavigationRequestRef.current !== requestId) return null;

      const message = navigationError?.message || (
        action === 'create'
          ? 'Chyba při vytváření lobby.'
          : 'Chyba při připojování k lobby.'
      );

      if (targetLobby) {
        setPendingLobbyNavigation({
          action,
          targetLobby,
          status: 'error',
          error: message
        });
      } else {
        setLobbyError(message);
      }
      return null;
    } finally {
      if (lobbyNavigationRequestRef.current === requestId) {
        lobbyMutationInFlightRef.current = false;
        setIsLobbyMutationSubmitting(false);
      }
    }
  };

  const retryPendingLobbyNavigation = () => {
    const pending = pendingLobbyNavigation;
    if (!pending) return;
    void navigateAfterLobbyMutation(pending.action, async () => pending.targetLobby);
  };

  const recoverLobbyNavigationToHome = () => {
    lobbyNavigationRequestRef.current += 1;
    lobbyMutationInFlightRef.current = false;
    setIsLobbyMutationSubmitting(false);
    setPendingLobbyNavigation(null);
    setLobbyFormActive('none');
    setLobbyError('');
    setActiveTournamentId(null);
    setActiveLobbyId(null);
    setLoading(true);
    void loadInitialData();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLogoutError('');
    setAuthStatus(isRegistering ? 'signing_up' : 'authenticating');

    try {
      if (isRegistering) {
        const result = await registerUser(loginData.username, loginData.password, loginData.email);
        if (result.status === 'email_confirmation_pending') {
          setPendingConfirmationEmail(result.email);
          setAuthStatus('email_confirmation_pending');
        }
      } else {
        await loginUser(loginData.email, loginData.password);
      }
    } catch (err: any) {
      setError(toFriendlyAuthError(err));
      setAuthStatus('auth_error');
    }
  };

  const handleOAuthLogin = async (provider: SupportedOAuthProvider) => {
    setError('');
    setAuthStatus('authenticating');
    try {
      await signInWithOAuthProvider(provider);
    } catch (err: any) {
      setError(toFriendlyAuthError(err));
      setAuthStatus('auth_error');
    }
  };

  const handlePasswordResetRequest = async (email: string) => {
    setError('');
    await requestPasswordReset(email);
  };

  const handleResendConfirmation = async () => {
    setError('');
    await resendSignupConfirmation(pendingConfirmationEmail);
  };

  const handleFinishPasswordRecovery = async (newPassword: string) => {
    setError('');
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) throw new Error(toFriendlyAuthError(updateError));

    passwordRecoveryRef.current = false;
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error(toFriendlyAuthError(sessionError));
    if (!session?.user) {
      clearAuthenticatedState();
      setAuthStatus('signed_out');
      return;
    }

    const restored = await loadPlayerFromAuthUser(session.user);
    authenticatedUserIdRef.current = session.user.id;
    setUser(restored);
    setAuthProviders(getUserAuthProviders(session.user));
    setAuthStatus(isGeneratedProfileName(restored.username) ? 'profile_onboarding' : 'authenticated');
  };

  const handleCompleteProfileOnboarding = async (username: string) => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error(toFriendlyAuthError(sessionError));
    if (!session?.user) throw new Error('Přihlášení vypršelo. Přihlas se prosím znovu.');

    await updateProfileUsername(session.user.id, username);
    const restored = await loadPlayerFromAuthUser(session.user);
    authenticatedUserIdRef.current = session.user.id;
    setUser(restored);
    setAuthProviders(getUserAuthProviders(session.user));
    setAuthStatus('authenticated');
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutError('');

    try {
      await logoutUser();
      passwordRecoveryRef.current = false;
      clearAuthenticatedState();
      setAuthStatus('signed_out');
    } catch (logoutFailure: any) {
      setLogoutError(
        toFriendlyAuthError(logoutFailure) ||
        (lang === 'cz' ? 'Odhlášení se nezdařilo. Zkus to prosím znovu.' : 'Logout failed. Please try again.')
      );
    } finally {
      setIsLoggingOut(false);
    }
  };

  const savePrediction = async (matchId: string, h: number, a: number) => {
    try {
      const existingMatch = matches.find(match => match.id === matchId);
      const hadPrediction = existingMatch?.predicted_home_score !== null && existingMatch?.predicted_home_score !== undefined;

      await savePredDB(user?.id || '', activeLobbyId || '', matchId, h, a);

      setMatches(prev => prev.map(match => (
        match.id === matchId
          ? {
              ...match,
              predicted_home_score: h,
              predicted_away_score: a,
              total_predictions: hadPrediction ? match.total_predictions : (match.total_predictions || 0) + 1
            }
          : match
      )));

      setAllPredictions(prev => {
        if (prev.length === 0 || !user) return prev;

        let found = false;
        const updated = prev.map(prediction => {
          if (prediction.player_id === user.id && prediction.match_id === matchId) {
            found = true;
            return {
              ...prediction,
              predicted_home_score: h,
              predicted_away_score: a
            };
          }
          return prediction;
        });

        if (found) return updated;

        return [
          ...updated,
          {
            player_id: user.id,
            match_id: matchId,
            predicted_home_score: h,
            predicted_away_score: a,
            points_earned: 0,
            home_score: existingMatch?.home_score,
            away_score: existingMatch?.away_score,
            start_time_utc: existingMatch?.start_time_utc,
            tournament_id: existingMatch?.tournament_id
          } as Prediction
        ];
      });
    } catch (err: any) {
      alert(err.message);
    }
  };

  const updateMatchResult = async (matchId: string, h: number, a: number) => {
    try {
      const result = await updateMatchResDB(matchId, h, a);
      await fetchAll();
      alert(`Výsledek uložen. Přepočteno ${result.updated_predictions_count}/${result.expected_predictions_count} tipů.`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const setTournamentWinner = async (teamId: string) => {
    setChampionMsg('');
    setChampionError('');

    try {
      const tournamentId = activeTournamentId || activeLobby?.tournament_id || 'fifa-world-cup-2026';
      const champion = winnerPickerTeams.find(tm => tm.id === teamId) || teams.find(tm => tm.id === teamId);
      const preview = await setWinnerDB(teamId, tournamentId, { previewOnly: true });
      const summary = preview.summary || {};
      const confirmed = window.confirm(
        `Potvrdit šampiona: ${champion?.name || preview.selected_champion?.name || teamId}?\n\n` +
        `Tipů celkem: ${summary.longterm_predictions ?? 0}\n` +
        `+10 bodů: ${summary.users_receiving_10 ?? 0}\n` +
        `0 bodů: ${summary.users_receiving_0 ?? 0}\n` +
        `Změněné řádky: ${summary.rows_that_would_change ?? 0}`
      );

      if (!confirmed) return;

      const result = await setWinnerDB(teamId, tournamentId, { confirm: true });
      await fetchAll();
      setChampionMsg(
        `Šampion potvrzen: ${result.selected_champion?.name || champion?.name || teamId}. ` +
        `+10 bodů získá ${result.summary?.users_receiving_10 ?? 0} hráčů.`
      );
      setSelectedWinner(null);
    } catch (err: any) {
      setChampionError(err.message);
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
      // just rely on longterm_predictions through leaderboard state
      setLeaderboard(prev => prev.map(player => (
        player.id === user?.id
          ? { ...player, tournament_winner_id: teamId }
          : player
      )));
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
    if (passData.newPass.length < 8) {
      setPassError(lang === 'cz' ? 'Heslo musí mít alespoň 8 znaků.' : 'Password must be at least 8 characters.');
      return;
    }

    setIsPassSaving(true);
    try {
      await changePassDB(passData.newPass);
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
      setAvatarData({ emoji: nextEmoji, bg: nextBg });
      setAvatarMsg(lang === 'cz' ? 'Avatar uložen.' : 'Avatar saved.');
      setLeaderboard(prev => prev.map(player => (
        player.id === user.id
          ? { ...player, avatar_emoji: nextEmoji, avatar_bg: nextBg }
          : player
      )));
    } catch (err: any) {
      setAvatarError(err.message || (lang === 'cz' ? 'Avatar se nepodařilo uložit.' : 'Could not save avatar.'));
    }
  };

  const leaderboardWithStreaks = useMemo(() => {
    const isHockey = activeTournamentId === "ms-hockey-2026";

    // Determine the most recently finished match to calculate "previous" state
    const finishedMatchesSorted = [...matches]
      .filter(m => m.home_score !== null && m.away_score !== null)
      .sort((a, b) => new Date(b.start_time_utc).getTime() - new Date(a.start_time_utc).getTime());
    
    const lastFinishedMatchId = finishedMatchesSorted[0]?.id;
    const finalWinnerIds = new Set(teams.filter(tm => tm.is_final_winner === 1).map(tm => tm.id));

    // Current ranks - only use finished matches for scoring
    const calculateRanks = (excludeMatchId?: string) => {
      const statsByUserId = new Map<string, {
        id: string;
        username: string;
        total: number;
        exact: number;
        outcomeHits: number;
        goalDifferenceHits: number;
        winnerHits: number;
        drawHits: number;
        currentStreak: number;
        tempStreak: number;
        history: { points: number, res: 'W' | 'L' | 'E' }[];
      }>();

      leaderboard.forEach(player => {
        statsByUserId.set(player.id, {
          id: player.id,
          username: player.username,
          total: 0,
          exact: 0,
          outcomeHits: 0,
          goalDifferenceHits: 0,
          winnerHits: 0,
          drawHits: 0,
          currentStreak: 0,
          tempStreak: 0,
          history: []
        });
      });

      allPredictions.forEach(pr => {
        const scoreH = (pr as any).home_score;
        const scoreA = (pr as any).away_score;
        const isFinished = scoreH !== null && scoreA !== null && scoreH !== undefined && scoreA !== undefined;
        if (!isFinished || (excludeMatchId && pr.match_id === excludeMatchId)) return;

        const stats = statsByUserId.get(pr.player_id);
        if (!stats) return;

        const mh = (pr as any).home_score;
        const ma = (pr as any).away_score;
        const ph = pr.predicted_home_score;
        const pa = pr.predicted_away_score;

        const pts = calculatePoints(ph, pa, mh, ma, isHockey ? 'hockey' : 'football');

        stats.total += pts;
        if (pts === 5) stats.exact++;
        else if (pts > 0) {
          stats.outcomeHits++;

          if (!isHockey) {
            const isActualDraw = mh === ma;
            const isPredictedDraw = ph === pa;
            const correctWinner = (ph > pa && mh > ma) || (pa > ph && ma > mh);

            if (isActualDraw && isPredictedDraw) {
              stats.drawHits++;
            } else if (correctWinner && ph - pa === mh - ma) {
              stats.goalDifferenceHits++;
            } else if (correctWinner) {
              stats.winnerHits++;
            }
          }
        }

        if (pts > 0) stats.tempStreak++;
        else stats.tempStreak = 0;
        stats.currentStreak = stats.tempStreak;
        stats.history.push({ points: pts, res: pts === 5 ? 'E' : pts > 0 ? 'W' : 'L' });
      });

      leaderboard.forEach(player => {
        if (player.tournament_winner_id && finalWinnerIds.has(player.tournament_winner_id)) {
          const stats = statsByUserId.get(player.id);
          if (stats) stats.total += 10;
        }
      });

      return Array.from(statsByUserId.values())
        .map(({ tempStreak, ...stats }) => stats)
        .sort((a, b) => b.total - a.total || b.exact - a.exact || b.outcomeHits - a.outcomeHits || a.username.localeCompare(b.username));
    };

    const currentResults = calculateRanks();
    const prevResults = lastFinishedMatchId ? calculateRanks(lastFinishedMatchId) : currentResults;
    const currentStatsByUserId = new Map(currentResults.map((result, index) => [result.id, { ...result, index }]));
    const prevIndexByUserId = new Map(prevResults.map((result, index) => [result.id, index]));

    const finishedPredictionsByUserId = new Map<string, Prediction[]>();
    allPredictions.forEach(pr => {
      const mh = (pr as any).home_score;
      const ma = (pr as any).away_score;
      if (mh === null || ma === null || mh === undefined || ma === undefined) return;

      const existing = finishedPredictionsByUserId.get(pr.player_id);
      if (existing) {
        existing.push(pr);
      } else {
        finishedPredictionsByUserId.set(pr.player_id, [pr]);
      }
    });

    return leaderboard.map(p => {
      const stats = currentStatsByUserId.get(p.id);
      const prevIndex = prevIndexByUserId.get(p.id) ?? -1;
      const currentIndex = stats?.index ?? -1;
      const userPredsAll = (finishedPredictionsByUserId.get(p.id) || [])
        .slice()
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
    return stats || {
      ...user,
      total_points: 0,
      exact_hits: 0,
      outcome_hits: 0,
      goal_difference_hits: 0,
      winner_hits: 0,
      draw_hits: 0,
      currentStreak: 0,
      bestStreak: 0,
      history: []
    };
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

  const hallOfFameEntries = useMemo(() => {
    const completedTournamentCount = Object.values(tournamentStats as Record<string, { isCompleted?: boolean }>)
      .filter(stats => stats.isCompleted)
      .length;

    if (completedTournamentCount === 0) return [];

    return leaderboardWithStreaks.map(player => ({
      player_id: player.id,
      username: player.username,
      avatar_emoji: player.avatar_emoji,
      avatar_bg: player.avatar_bg,
      total_points: player.total_points ?? 0,
      completed_tournaments_count: completedTournamentCount
    }));
  }, [leaderboardWithStreaks, tournamentStats]);

  const officialWinnerTeam = useMemo(() => {
    return teams.find(tm => tm.is_final_winner === 1) || null;
  }, [teams]);

  const adminChampionOptions = useMemo(() => {
    return winnerPickerTeams.filter((tm: any) => {
      const id = String(tm.id || '').toLowerCase();
      return id.startsWith('football-') &&
        id !== 'football-tba' &&
        !id.startsWith('football-tba-') &&
        String(tm.sport_id || '') === 'football';
    });
  }, [winnerPickerTeams]);

  const lobbyNavigationViewState = getLobbyNavigationViewState({
    activeLobbyId,
    activeLobby,
    activeTournamentId,
    pendingLobbyId: pendingLobbyNavigation?.targetLobby.id ?? null
  });

  if (authStatus !== 'authenticated' || !user) {
    return (
      <AuthScreen
        status={authStatus}
        registering={isRegistering}
        email={loginData.email}
        username={authStatus === 'profile_onboarding' ? (user?.username || loginData.username) : loginData.username}
        password={loginData.password}
        pendingEmail={pendingConfirmationEmail}
        error={error}
        onChange={(field, value) => setLoginData(previous => ({ ...previous, [field]: value }))}
        onSubmit={handleLogin}
        onToggleRegistering={() => {
          setIsRegistering(previous => !previous);
          setError('');
          setAuthStatus('signed_out');
        }}
        onForgotPassword={handlePasswordResetRequest}
        onOAuth={handleOAuthLogin}
        onResendConfirmation={handleResendConfirmation}
        onBackToLogin={() => {
          setPendingConfirmationEmail('');
          setError('');
          setIsRegistering(false);
          setAuthStatus('signed_out');
        }}
        onFinishPasswordRecovery={handleFinishPasswordRecovery}
        onCompleteProfileOnboarding={handleCompleteProfileOnboarding}
      />
    );
  }

  const isLoadedDataContextStale = Boolean(
    user &&
    activeLobbyId &&
    (
      loadedDataContext.lobbyId !== activeLobbyId ||
      loadedDataContext.tournamentId !== (activeTournamentId || null)
    )
  );

  if (loading || isLoadedDataContextStale) return (
    <AuthenticatedAppSkeleton
      t={t}
      error={error}
      onRetry={() => { setError(''); setLoading(true); loadInitialData(); }}
    />
  );

  if (lobbyNavigationViewState === 'pending') {
    return (
      <LobbyContextFallback
        loading={pendingLobbyNavigation?.status === 'loading'}
        error={pendingLobbyNavigation?.error || ''}
        onRetry={retryPendingLobbyNavigation}
        onHome={recoverLobbyNavigationToHome}
      />
    );
  }

  if (tab === 'profile') {
    return (
      <div className="min-h-screen bg-slate-50 pb-24 max-w-lg mx-auto shadow-2xl transition-colors duration-300 animate-fade-in">
        <header className="bg-white p-6 sticky top-0 z-50 border-b border-slate-100 transition-colors">
          <div className="flex justify-between items-center mr-1">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setTab('matches')}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors"
                title={lang === 'cz' ? 'Zpět' : 'Back'}
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
              <div>
                <h1 className="text-2xl font-black text-slate-900 leading-none tracking-tighter italic uppercase transition-colors">{t.profile}</h1>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  {lang === 'cz' ? 'Globální účet' : 'Global account'}
                </p>
              </div>
            </div>
            <UserAvatar player={user} size="sm" />
          </div>
        </header>

        <main className="p-4">
          <LazyScreenErrorBoundary>
            <Suspense fallback={<DeferredProfileSkeleton />}>
              <LazyProfileScreen
                t={t}
                lang={lang}
                user={user}
                authProviders={authProviders}
                currentUserStats={currentUserStats}
                currentUserRank={currentUserRank}
                currentUserLeaderGap={currentUserLeaderGap}
                passData={passData}
                setPassData={setPassData}
                passMsg={passMsg}
                passError={passError}
                isPassSaving={isPassSaving}
                logoutError={logoutError}
                isLoggingOut={isLoggingOut}
                onUpdatePassword={handleUpdatePassword}
                avatarData={avatarData}
                showAvatarEditor={showAvatarEditor}
                setShowAvatarEditor={setShowAvatarEditor}
                avatarMsg={avatarMsg}
                avatarError={avatarError}
                onSaveAvatar={handleSaveAvatar}
                onLogout={handleLogout}
                setLang={setLang}
                UserAvatar={UserAvatar}
              />
            </Suspense>
          </LazyScreenErrorBoundary>
        </main>
      </div>
    );
  }

  if (
    lobbyNavigationViewState === 'missing-lobby' ||
    lobbyNavigationViewState === 'missing-tournament'
  ) {
    const contextError = lobbyNavigationViewState === 'missing-lobby'
      ? 'Lobby se nepodařilo načíst. Můžeš zkusit data obnovit nebo se vrátit na Home.'
      : 'Turnaj se nepodařilo načíst. Můžeš zkusit data obnovit nebo se vrátit na Home.';

    return (
      <LobbyContextFallback
        loading={false}
        error={contextError}
        onRetry={() => {
          setError('');
          setLoading(true);
          void loadInitialData();
        }}
        onHome={goHome}
      />
    );
  }

  if (lobbyNavigationViewState === 'home') {
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
              onClick={() => setTab('profile')}
              className="flex items-center gap-2 rounded-full bg-slate-50 py-1 pl-1 pr-3 text-[10px] font-bold text-slate-500 hover:text-slate-700 uppercase tracking-widest transition-colors"
            >
              <UserAvatar player={user} size="sm" />
              {t.profile}
            </button>
          </div>
        </header>
        
        <div className="flex-1">
          <HomeDashboard
            lang={lang}
            lobbies={lobbies}
            summaries={homeDashboardSummaries}
            summariesLoading={homeDashboardLoading}
            summariesError={homeDashboardError}
            addLobbyMode={lobbyFormActive}
            onRetrySummaries={() => void loadHomeDashboard()}
            onOpenContext={openHomeContext}
            onOpenLobby={openLobbyDetail}
            onSetAddLobbyMode={mode => {
              setLobbyFormActive(mode);
              setLobbyError('');
              setLobbySuccess('');
            }}
          />
          <div className="px-4 pb-6 sm:px-6">
            {/* Expanded Forms */}
            {(lobbyFormActive === 'create' || lobbyFormActive === 'join') && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm text-left"
              >
                {(lobbyFormActive === 'create') ? (
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    setLobbyError(""); setLobbySuccess("");
                    if (lobbyMutationInFlightRef.current) return;
                    if (!newLobbyName.trim()) {
                      setLobbyError("Prosím zadejte název lobby.");
                      return;
                    }
                    await navigateAfterLobbyMutation(
                      'create',
                      () => createLobby(
                        newLobbyName.trim(),
                        newLobbyTournament,
                        'public',
                        newLobbyShortDescription,
                        newLobbyLongDescription
                      )
                    );
                  }} className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Vytvořit novou lobby</h4>
                    <div>
                      <label className="block text-[9px] text-slate-400 font-bold uppercase mb-1">Název lobby</label>
                      <input 
                        type="text" required value={newLobbyName} onChange={e => setNewLobbyName(e.target.value)}
                        disabled={isLobbyMutationSubmitting}
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
                        disabled={isLobbyMutationSubmitting}
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
                        disabled={isLobbyMutationSubmitting}
                        className="w-full min-h-[88px] p-2.5 bg-slate-50 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-red-600 font-medium resize-y"
                        placeholder="Entry fee 200 CZK. Payment deadline 10.6.2026. Winner takes all."
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-slate-400 font-bold uppercase mb-1">Turnaj</label>
                      <select
                        value={newLobbyTournament} onChange={e => setNewLobbyTournament(e.target.value)}
                        disabled={isLobbyMutationSubmitting}
                        className="w-full p-2.5 bg-slate-50 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-red-600 font-bold text-slate-700"
                      >
                        <option value="fifa-world-cup-2026">🏆 FIFA World Cup 2026</option>
                        <option value="ms-hockey-2026">🏒 MS v hokeji 2026</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={isLobbyMutationSubmitting}
                      className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-wait text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-colors active:scale-95 transition-transform cursor-pointer"
                    >
                      {isLobbyMutationSubmitting ? 'Vytvářím lobby...' : 'Potvrdit a vytvořit'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    setLobbyError(""); setLobbySuccess("");
                    if (lobbyMutationInFlightRef.current) return;
                    if (!joinCodeInput.trim()) {
                      setLobbyError("Prosím zadejte kód.");
                      return;
                    }
                    await navigateAfterLobbyMutation(
                      'join',
                      () => joinLobbyByCode(joinCodeInput.trim())
                    );
                  }} className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-wider font-semibold">Připojit se k lobby</h4>
                    <div>
                      <label className="block text-[9px] text-slate-400 font-bold uppercase mb-1">Pozvánkový kód</label>
                      <input 
                        type="text" required value={joinCodeInput} onChange={e => setJoinCodeInput(e.target.value)}
                        disabled={isLobbyMutationSubmitting}
                        className="w-full p-2.5 bg-slate-50 text-xs rounded-xl border border-slate-200 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-red-600 uppercase"
                        placeholder="e.g. LOB-C2F8"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isLobbyMutationSubmitting}
                      className="w-full py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-wait text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-colors active:scale-95 transition-transform cursor-pointer"
                    >
                      {isLobbyMutationSubmitting ? 'Připojuji...' : 'Odeslat kód a připojit'}
                    </button>
                  </form>
                )}
                
                {lobbyError && <p className="text-red-500 font-bold text-[10px] mt-2 text-center bg-red-50 p-1.5 rounded-lg">{lobbyError}</p>}
                {lobbySuccess && <p className="text-green-600 font-bold text-[10px] mt-2 text-center bg-green-50 p-1.5 rounded-lg">{lobbySuccess}</p>}
              </motion.div>
            )}
          </div>
        </div>
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
                  if (entryOrigin === 'direct-home-action') {
                    goHome();
                  } else {
                    setActiveTournamentId(null);
                  }
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors"
                title="Zpět do Lobby"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
            ) : activeLobbyId ? (
              <button 
                onClick={goHome}
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
          <button
            type="button"
            onClick={() => setTab('profile')}
            className="flex items-center gap-2 rounded-full bg-slate-50 py-1 pl-1 pr-3 text-[10px] font-bold text-slate-500 hover:text-slate-700 uppercase tracking-widest transition-colors"
          >
            <UserAvatar player={user} size="sm" />
            {t.profile}
          </button>
        </div>
      </header>

      {activeLobby && !activeTournamentId ? (
        <main className="p-4" style={{ backgroundColor: '#f8fafc' }}>
          <LazyScreenErrorBoundary>
            <Suspense fallback={<DeferredScreenSkeleton />}>
              <LazyLobbyView
                lobby={activeLobby}
                user={{ ...user, username: user.username || '' }}
                lang={lang as 'cz' | 'en'}
                onSelectTournament={id => {
                  setEntryOrigin('lobby-detail');
                  setActiveTournamentId(id);
                  setTab('matches');
                }}
                onRefresh={(updatedLobby) => {
                  if (updatedLobby) {
                    updateLocalLobby(activeLobby.id, updatedLobby);
                  } else {
                    fetchAll();
                  }
                }}
                onLobbyDeleted={() => {
                  setActiveLobbyId(null);
                  setActiveTournamentId(null);
                  fetchAll();
                }}
                membersCount={activeLobby.member_count ?? (deferredLoading ? undefined : leaderboard.length)}
                tournamentStats={tournamentStats}
                hallOfFameEntries={hallOfFameEntries}
              />
            </Suspense>
          </LazyScreenErrorBoundary>
        </main>
      ) : activeLobby && activeTournamentId ? (
        <main className="p-4">
          {/* Match Filter Bar */}
          {(tab === 'matches' || tab === 'results') && (
            <div className="flex gap-2 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4 bg-slate-50 py-1 transition-colors">
              {matchFilters.map(f => (
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
              {scheduledMatchesForView.map(m => (
                 <MatchCard 
                   key={m.id} 
                   match={m} 
                   lobbyId={activeLobbyId || ''}
                   userId={user.id}
                   t={t}
                   onPredict={(h, a) => savePrediction(m.id, h, a)}
                   matchPredictions={predictionsByMatchId.get(m.id) || []}
                   matchPredictionsLoading={deferredLoading && !predictionsByMatchId.has(m.id)}
                   isHockey={isHockey}
                 />
               ))}
              {scheduledMatchesForView.length === 0 && (
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
              {finishedMatchesForView.map(m => (
                 <MatchCard 
                   key={m.id} 
                   match={m} 
                   lobbyId={activeLobbyId || ''}
                   isFinished 
                   userId={user.id}
                   t={t}
                   matchPredictions={predictionsByMatchId.get(m.id) || []}
                   matchPredictionsLoading={deferredLoading && !predictionsByMatchId.has(m.id)}
                   isHockey={isHockey}
                 />
               ))}
               {finishedMatchesForView.length === 0 && (
                <div className="text-center py-12 text-slate-400">{t.noResults}</div>
              )}
            </motion.div>
          )}

          {tab === 'leaderboard' && (
            <LazyScreenErrorBoundary>
              <Suspense fallback={<DeferredLeaderboardSkeleton />}>
                <LazyLeaderboardScreen
                  t={t}
                  lang={lang}
                  user={user}
                  leaderboardWithStreaks={leaderboardWithStreaks}
                  teams={teams}
                  winnerPickerTeams={winnerPickerTeams}
                  officialWinnerTeam={officialWinnerTeam}
                  deferredLoading={deferredLoading}
                  deferredError={deferredError}
                  showScoringInfo={showScoringInfo}
                  setShowScoringInfo={setShowScoringInfo}
                  DeferredLeaderboardSkeleton={DeferredLeaderboardSkeleton}
                  TeamFlag={TeamFlag}
                  UserAvatar={UserAvatar}
                />
              </Suspense>
            </LazyScreenErrorBoundary>
          )}

          {tab === 'winner' && (
            <TournamentWinnerScreen
              t={t}
              lang={lang}
              winnerPickerTeams={winnerPickerTeams}
              currentUserPickId={currentUserPickId}
              isWinnerPickerLocked={isWinnerPickerLocked}
              onPickTournamentWinner={pickTournamentWinner}
              TeamFlag={TeamFlag}
            />
          )}

          {tab === 'admin' && user.role === 'admin' && (
            <LazyScreenErrorBoundary>
              <Suspense fallback={<DeferredScreenSkeleton />}>
                <LazyAdminScreen
                  t={t}
                  stageFilters={stageFilters}
                  adminMatchFilter={adminMatchFilter}
                  setAdminMatchFilter={setAdminMatchFilter}
                  adminGroupFilter={adminGroupFilter}
                  setAdminGroupFilter={setAdminGroupFilter}
                  adminMatchesForView={adminMatchesForView}
                  onUpdateMatchResult={updateMatchResult}
                  adminChampionOptions={adminChampionOptions}
                  selectedWinner={selectedWinner}
                  setSelectedWinner={setSelectedWinner}
                  onSetTournamentWinner={setTournamentWinner}
                  championMsg={championMsg}
                  championError={championError}
                  TeamFlag={TeamFlag}
                />
              </Suspense>
            </LazyScreenErrorBoundary>
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
        <button onClick={() => setTab('winner')} className={`flex flex-col items-center gap-1 transition-all ${tab === 'winner' ? 'text-red-600 scale-110' : 'text-slate-400'}`}>
          <Trophy className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">{t.winnerTab}</span>
        </button>
        {user.role === 'admin' && (
          <button onClick={() => setTab('admin')} className={`flex flex-col items-center gap-1 transition-all ${tab === 'admin' ? 'text-red-600 scale-110' : 'text-slate-400'}`}>
            <ShieldCheck className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase">{t.admin}</span>
          </button>
        )}
      </nav>
      )}
    </div>
  );
}
