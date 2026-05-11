import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  Calendar, 
  CheckCircle2, 
  User, 
  UserPlus,
  ShieldCheck, 
  ChevronRight, 
  Trophy as TrophyIcon,
  Flame,
  Clock,
  LogOut,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Player, Team, Match, Prediction } from './types.ts';
import { 
  fetchAllData, 
  loginUser, 
  registerUser, 
  savePrediction as savePredDB, 
  fetchMatchPredictions,
  updateMatchResult as updateMatchResDB,
  setTournamentWinner as setWinnerDB,
  pickTournamentWinner as pickWinnerDB,
  changePassword as changePassDB
} from './lib/db.ts';

const translations = {
  cz: {
    matches: "Zápasy",
    results: "Výsledky",
    rank: "Pořadí",
    admin: "Admin",
    profile: "Ja",
    upcoming: "Nadcházející zápasy",
    finished: "Odehrané zápasy",
    pts: "body",
    exact: "přesné",
    winner: "vítěz",
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
    totalPoints: "Celkem bodů",
    exactScores: "Přesné skóre",
    langSelect: "Jazyk / Language",
    logout: "Odhlásit se",
    loginTitle: "MS 2026 Fan Tipovačka",
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
    groupA: "Skupina A",
    groupB: "Skupina B",
    playoffs: "Play-off",
    all: "Vše",
    tipsCount: "tipů",
    createUser: "Vytvořit nového hráče",
    newUsername: "Nové uživatelské jméno",
    newPassword: "Heslo pro nového hráče",
    create: "Vytvořit účet",
    userCreated: "Hráč byl úspěšně vytvořen!",
    officialWinner: "Skutečný šampion turnaje",
    noDraws: "Remíza není povolena. Jeden tým musí vyhrát!",
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
    winner: "winner",
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
    loginTitle: "MS 2026 Fan Predictor",
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
    groupA: "Group A",
    groupB: "Group B",
    playoffs: "Playoffs",
    all: "All",
    tipsCount: "tips",
    createUser: "Create New Player",
    newUsername: "New Username",
    newPassword: "New User Password",
    create: "Create Account",
    userCreated: "Player created successfully!",
    officialWinner: "Official Tournament Winner",
    noDraws: "Draws are not allowed. One team must win!",
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
    'ukr': 'ua', 'kaz': 'kz'
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
  onPredict?: (h: number, a: number) => Promise<void>;
  isFinished?: boolean;
  userId?: string;
  t: any;
  matchPredictions?: Prediction[];
}

const MatchCard: React.FC<MatchCardProps> = ({ 
  match, 
  onPredict, 
  isFinished = false, 
  userId,
  t,
  matchPredictions = []
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
        const data = await fetchMatchPredictions(match.id);
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
    setIsSaving(true);
    try {
      await onPredict(home, away);
      setShowSuccess(true);
      
      // Auto-refresh others if drawer is open
      if (showOthers) {
        const data = await fetchMatchPredictions(match.id);
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
    if (ph === null || pa === null) return null;

    if (ph === match.home_score && pa === match.away_score) return 5;
    if ((ph > pa && match.home_score > match.away_score) || (pa > ph && match.away_score > match.home_score)) return 2;
    return 0;
  };

  const points = getPoints();

  const predictionStats = useMemo(() => {
    const total = matchPredictions.length;
    if (total === 0) return { home: 50, away: 50, draw: 0, isEmpty: true };
    
    const homeWins = matchPredictions.filter(p => p.predicted_home_score > p.predicted_away_score).length;
    const draws = matchPredictions.filter(p => p.predicted_home_score === p.predicted_away_score).length;
    const awayWins = matchPredictions.filter(p => p.predicted_away_score > p.predicted_home_score).length;
    
    return {
      home: Math.round((homeWins / total) * 100),
      draw: Math.round((draws / total) * 100),
      away: Math.round((awayWins / total) * 100),
      isEmpty: false
    };
  }, [matchPredictions]);

  const calcPoints = (ph: number, pa: number) => {
    if (match.home_score === null || match.away_score === null) return 0;
    if (ph === match.home_score && pa === match.away_score) return 5;
    if ((ph > pa && match.home_score > match.away_score) || (pa > ph && match.away_score > match.home_score)) return 2;
    return 0;
  };

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
              <div className="flex justify-between items-center mb-1.5 text-[9px] font-black uppercase text-slate-400 px-1">
                <span className={!predictionStats.isEmpty && predictionStats.home > predictionStats.away && predictionStats.home > predictionStats.draw ? 'text-red-600 font-bold' : ''}>
                  {predictionStats.isEmpty ? '---' : `${predictionStats.home}%`}
                </span>
                {!predictionStats.isEmpty && predictionStats.draw > 0 && (
                  <span className="text-slate-400">
                    Remíza {predictionStats.draw}%
                  </span>
                )}
                <span className={!predictionStats.isEmpty && predictionStats.away > predictionStats.home && predictionStats.away > predictionStats.draw ? 'text-slate-800 font-bold' : ''}>
                  {predictionStats.isEmpty ? '---' : `${predictionStats.away}%`}
                </span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner border border-white">
                <div 
                  style={{ width: `${predictionStats.home}%` }} 
                  className={`h-full transition-all duration-1000 ease-out ${predictionStats.isEmpty ? 'bg-slate-200' : 'bg-red-600'}`} 
                />
                <div 
                  style={{ width: `${predictionStats.draw}%` }} 
                  className={`h-full transition-all duration-1000 ease-out ${predictionStats.isEmpty ? 'bg-slate-200' : 'bg-slate-300'}`} 
                />
                <div 
                  style={{ width: `${predictionStats.away}%` }} 
                  className={`h-full transition-all duration-1000 ease-out ${predictionStats.isEmpty ? 'bg-slate-200' : 'bg-slate-700'}`} 
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
            </div>
            
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handlePredict}
              disabled={isLocked || home === away || isSaving}
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
              ) : (
                match.predicted_home_score !== null ? t.updateTip : t.saveTip
              )}
            </motion.button>
            {!isLocked && home === away && <p className="text-[10px] text-center text-slate-400 italic">{t.noDraws}</p>}
            {isLocked && <p className="text-[10px] text-center text-slate-400 italic">{t.locked}</p>}
          </div>
        )}

        {isFinished && (
          <div className="flex flex-col gap-3">
             <div className={`py-2 px-4 rounded-xl flex items-center justify-between border transition-colors ${
               points === 5 ? 'bg-indigo-50/60 border-indigo-200/50 text-indigo-950 shadow-sm' : 
               points === 2 ? 'bg-slate-50 border-slate-200 text-slate-900 font-medium' : 'bg-slate-50 border-slate-100'
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
                            pPoints === 2 ? 'bg-slate-50/50 border-slate-200 text-slate-900 font-medium' :
                            'bg-white border-slate-100 text-slate-400'
                          }`}
                        >
                        <div className="flex items-center gap-1 mb-0.5">
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

const AdminMatchCard: React.FC<{ match: Match, onUpdate: (h: number, a: number) => Promise<void>, t: any }> = ({ match, onUpdate, t }) => {
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
          disabled={adminH === adminA || isUpdating}
          className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm flex items-center justify-center gap-2 ${
            adminH === adminA ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 
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
      {adminH === adminA && <p className="mt-2 text-[10px] text-center text-slate-400 italic">{t.noDraws}</p>}
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
  const [matchFilter, setMatchFilter] = useState<'all' | 'A' | 'B' | 'playoffs'>('all');
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
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);
  const [adminMatchFilter, setAdminMatchFilter] = useState<'scheduled' | 'finished'>('scheduled');
  const [adminGroupFilter, setAdminGroupFilter] = useState<'all' | 'A' | 'B' | 'playoffs'>('all');
  const [showCreatePlayer, setShowCreatePlayer] = useState(false);
  const [newUserData, setNewUserData] = useState({ username: '', password: '' });
  const [createUserMsg, setCreateUserMsg] = useState('');
  const [passData, setPassData] = useState({ newPass: '', confirmPass: '' });
  const [passMsg, setPassMsg] = useState('');
  const [passError, setPassError] = useState('');

  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);

  const t = (translations as any)[lang];

  const fetchAll = async () => {
    if (!user) return;
    try {
      console.log("Fetching all data for user:", user.username);
      const { matches: matchesData, teams: teamsData, leaderboard: lbData, allPredictions: apData } = await fetchAllData(user.id);
      console.log("Data received:", { 
        matches: matchesData.length, 
        teams: teamsData.length, 
        leaderboard: lbData.length, 
        allPredictions: apData.length 
      });
      setMatches(matchesData);
      setTeams(teamsData);
      setLeaderboard(lbData);
      setAllPredictions(apData);
    } catch (e: any) {
      console.error("fetchAll error:", e);
      setError(e?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [user?.id]); // Only refetch on actual ID change

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let data;
      if (isRegistering) {
        data = await registerUser(loginData.username, loginData.password);
      } else {
        data = await loginUser(loginData.username, loginData.password);
      }
      setUser(data);
      localStorage.setItem('user', JSON.stringify(data));
    } catch (err: any) {
      setError(err.message || 'Chyba serveru');
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
    setMatches([]);
    setLeaderboard([]);
    setAllPredictions([]);
  };

  const savePrediction = async (matchId: string, h: number, a: number) => {
    try {
      await savePredDB(user?.id || '', matchId, h, a);
      await fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const updateMatchResult = async (matchId: string, h: number, a: number) => {
    try {
      await updateMatchResDB(user?.id || '', matchId, h, a);
      await fetchAll();
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
      await setWinnerDB(user?.id || '', teamId);
      await fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const pickWinner = async (teamId: string) => {
    try {
      await pickWinnerDB(user?.id || '', teamId);
      if (user) {
        const updatedUser = { ...user, tournament_winner_id: teamId };
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
      }
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
    if (passData.newPass.length < 4) {
      setPassError(lang === 'cz' ? 'Heslo musí mít aspoň 4 znaky' : 'Password must be at least 4 characters');
      return;
    }

    try {
      await changePassDB(user?.id || '', passData.newPass);
      setPassMsg(t.passUpdated);
      setPassData({ newPass: '', confirmPass: '' });
    } catch (err: any) {
      setPassError(err.message);
    }
  };

  const leaderboardWithStreaks = useMemo(() => {
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
        let currentStreak = 0;
        let tempStreak = 0;
        const history: { points: number, res: 'W' | 'L' | 'E' }[] = [];

        userPreds.forEach(pr => {
          const mh = (pr as any).home_score;
          const ma = (pr as any).away_score;
          const ph = pr.predicted_home_score;
          const pa = pr.predicted_away_score;

          let pts = 0;
          if (ph === mh && pa === ma) {
            pts = 5;
          } else if ((ph > pa && mh > ma) || (pa > ph && ma > mh) || (ph === pa && mh === ma)) {
            pts = 2;
          }

          total += pts;
          if (pts === 5) exact++;
          if (pts === 2) outcomeHits++;

          if (pts > 0) tempStreak++;
          else tempStreak = 0;
          currentStreak = tempStreak;
          history.push({ points: pts, res: pts === 5 ? 'E' : pts === 2 ? 'W' : 'L' });
        });

        // Add tournament winner points if applicable
        if (p.tournament_winner_id && teams.find(tm => tm.id === p.tournament_winner_id && tm.is_final_winner === 1)) {
          total += 10;
        }

        return { id: p.id, username: p.username, total, exact, outcomeHits, currentStreak, history };
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
        const pts = (ph === mh && pa === ma) ? 5 : 
                    ((ph > pa && mh > ma) || (pa > ph && ma > mh) || (ph === pa && mh === ma)) ? 2 : 0;
        if (pts > 0) temp++; else temp = 0;
        bestStreak = Math.max(bestStreak, temp);
      });

      return {
        ...p,
        total_points: stats?.total ?? 0,
        exact_hits: stats?.exact ?? 0,
        outcome_hits: stats?.outcomeHits ?? 0,
        currentStreak: stats?.currentStreak ?? 0,
        bestStreak,
        history: stats?.history.slice(-5) ?? [],
        rankChange: (prevIndex === -1 || currentIndex === -1) ? 0 : prevIndex - currentIndex
      };
    }).sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0) || (b.exact_hits ?? 0) - (a.exact_hits ?? 0) || (b.outcome_hits ?? 0) - (a.outcome_hits ?? 0) || a.username.localeCompare(b.username));
  }, [leaderboard, allPredictions, teams, matches]);


  const currentUserStats = useMemo(() => {
    if (!user) return null;
    const stats = leaderboardWithStreaks.find(p => p.id === user.id);
    return stats || { exact: 0, winner: 0, total: 0, currentStreak: 0, bestStreak: 0, history: [] };
  }, [leaderboardWithStreaks, user]);

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
            <div className="mt-4 px-4 py-3 bg-slate-50 rounded-xl border border-red-100 max-w-[280px] text-center">
              <p className="text-[10px] text-red-500 font-bold uppercase tracking-wider mb-1">DŮLEŽITÉ UPOZORNĚNÍ</p>
              <p className="text-[9px] text-slate-500 font-medium leading-tight">
                Toto je neoficiální, nezisková fanouškovská stránka vytvořená výhradně pro soukromé tipování mezi přáteli. 
                Tato aplikace není žádným způsobem spojena s IIHF ani žádnou oficiální sportovní organizací.
              </p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">{loginT.username}</label>
              <input 
                required
                type="text" 
                value={loginData.username}
                onChange={e => setLoginData(prev => ({ ...prev, username: e.target.value }))}
                className="w-full p-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-red-600 outline-none transition-all"
                placeholder="e.g. lukas"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">{loginT.password}</label>
              <input 
                required
                type="password" 
                value={loginData.password}
                onChange={e => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                className="w-full p-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-red-600 outline-none transition-all"
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-red-500 text-sm font-medium text-center bg-red-50 p-2 rounded-xl">{error}</p>}
            <button 
              type="submit"
              className="w-full py-4 bg-red-600 text-white rounded-2xl font-black shadow-lg shadow-red-200 active:scale-95 transition-transform"
            >
              {isRegistering ? loginT.register : loginT.signin}
            </button>
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

  return (
    <div className="min-h-screen bg-slate-50 pb-24 max-w-lg mx-auto shadow-2xl transition-colors duration-300">
      <header className="bg-white p-6 sticky top-0 z-50 border-b border-slate-100 transition-colors">
        <div className="flex justify-between items-center">
          <div 
            className="cursor-pointer active:opacity-70 transition-opacity"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
             <h1 className="text-2xl font-black text-slate-900 leading-tight transition-colors">MS V HOKEJI 2026</h1>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">Fan Tipovačka • Unofficial</p>
          </div>
        </div>
      </header>

      <main className="p-4">
        {/* Match Filter Bar */}
        {(tab === 'matches' || tab === 'results') && (
          <div className="flex gap-2 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4 bg-slate-50 py-1 transition-colors">
            {[
              { id: 'all', label: t.all },
              { id: 'A', label: t.groupA },
              { id: 'B', label: t.groupB },
              { id: 'playoffs', label: t.playoffs },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setMatchFilter(f.id as any)}
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
                 <Calendar className="w-4 h-4" /> {t.upcoming}
              </h2>
              {matches
                .filter(m => {
                  if (m.status !== 'scheduled') return false;
                  if (matchFilter === 'all') return true;
                  if (matchFilter === 'playoffs') return !m.stage?.includes('Group');
                  return m.stage?.includes(`Group ${matchFilter}`);
                })
                .map(m => (
                 <MatchCard 
                   key={m.id} 
                   match={m} 
                   userId={user.id}
                   t={t}
                   onPredict={(h, a) => savePrediction(m.id, h, a)}
                   matchPredictions={allPredictions.filter(p => p.match_id === m.id)}
                 />
               ))}
              {matches.filter(m => {
                  if (m.status !== 'scheduled') return false;
                  if (matchFilter === 'all') return true;
                  if (matchFilter === 'playoffs') return !m.stage?.includes('Group');
                  return m.stage?.includes(`Group ${matchFilter}`);
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
                  if (matchFilter === 'playoffs') return !m.stage?.includes('Group');
                  return m.stage?.includes(`Group ${matchFilter}`);
                })
                .reverse()
                .map(m => (
                 <MatchCard 
                   key={m.id} 
                   match={m} 
                   isFinished 
                   userId={user.id} 
                   t={t} 
                   matchPredictions={allPredictions.filter(p => p.match_id === m.id)}
                 />
               ))}
               {matches.filter(m => {
                  if (m.status !== 'finished') return false;
                  if (matchFilter === 'all') return true;
                  if (matchFilter === 'playoffs') return !m.stage?.includes('Group');
                  return m.stage?.includes(`Group ${matchFilter}`);
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
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                 <Trophy className="w-4 h-4" /> {t.globalStandings}
              </h2>

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

              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden transition-colors">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-50">
                      <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase">{t.pos}</th>
                      <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase">{t.player}</th>
                      <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase text-right">{t.pts}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardWithStreaks.map((p, i) => (
                      <tr 
                        key={p.id} 
                        className={`border-b border-slate-50 last:border-none transition-colors ${p.id === user.id ? 'bg-red-50/50' : ''}`}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-black ${
                              i === 0 ? 'bg-yellow-400 text-yellow-900 shadow-sm shadow-yellow-100' :
                              i === 1 ? 'bg-slate-300 text-slate-700' :
                              i === 2 ? 'bg-amber-600 text-amber-50' :
                              'bg-slate-100 text-slate-500'
                            }`}>
                              {i + 1}
                            </div>
                            <div className="flex items-center min-w-[28px] ml-1">
                              {p.rankChange > 0 ? (
                                <div className="flex items-center text-[10px] font-black text-emerald-500">
                                  <ChevronUp className="w-3.5 h-3.5 stroke-[3]" />
                                  <span>{p.rankChange}</span>
                                </div>
                              ) : p.rankChange < 0 ? (
                                <div className="flex items-center text-[10px] font-black text-rose-500">
                                  <ChevronDown className="w-3.5 h-3.5 stroke-[3]" />
                                  <span>{Math.abs(p.rankChange)}</span>
                                </div>
                              ) : (
                                <span className="text-slate-400 font-bold text-[10px] ml-1.5 opacity-40">•</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                             <span className="font-bold text-slate-700">{p.username}</span>
                             <TeamFlag code={p.winner_flag || p.tournament_winner_id} className="w-5 h-3.5" />
                             {p.currentStreak >= 3 && (
                               <span className="flex items-center scale-75 origin-left">
                                 {p.currentStreak >= 7 ? '🐐' : 
                                  p.currentStreak >= 5 ? '🔥🔥' : '🔥'}
                               </span>
                             )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-medium flex items-center gap-2">
                            <span>🎯 {p.exact_hits ?? 0}</span>
                            <span>✅ {p.outcome_hits ?? 0}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="text-xl font-black text-slate-900 transition-colors">{p.total_points ?? 0}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {tab === 'profile' && currentUserStats && (
            <motion.div 
              key="profile"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col items-center transition-colors">
                 <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4 border-4 border-white shadow-md overflow-hidden">
                   {(() => {
                     const team = teams.find(tm => tm.id === user.tournament_winner_id);
                     if (team) return <TeamFlag code={team.flag_code || team.id} className="w-12 h-8" />;
                     if (user.winner_flag) return <TeamFlag code={user.winner_flag || user.tournament_winner_id} className="w-12 h-8" />;
                     return <User className="w-10 h-10 text-slate-400" />;
                   })()}
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

              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 transition-colors">
                 <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 text-center">{lang === 'cz' ? 'Historie (posledních 5)' : 'History (last 5)'}</h3>
                 <div className="flex justify-center gap-3">
                   {currentUserStats.history.map((h: any, idx: number) => (
                      <div key={idx} className="flex flex-col items-center gap-1">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black border transition-colors ${
                          h.res === 'E' ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm shadow-emerald-100' :
                          h.res === 'W' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                          'bg-slate-50 text-slate-400 border-slate-100'
                        }`}>
                          {h.res === 'L' ? '0' : `+${h.points}`}
                        </div>
                        <span className="text-[8px] font-bold text-slate-300">
                          {h.res === 'E' ? '✔✔' : h.res === 'W' ? '✔' : '✖'}
                        </span>
                      </div>
                   ))}
                   {currentUserStats.history.length === 0 && <p className="text-[10px] text-slate-400 italic">Zatím žádná historie</p>}
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col items-center transition-colors">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 whitespace-nowrap">{t.totalPoints}</p>
                    <p className="text-4xl font-black text-red-600 transition-colors">{currentUserStats.total_points}</p>
                 </div>
                 <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col items-center transition-colors">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 whitespace-nowrap">{t.exactScores}</p>
                    <p className="text-4xl font-black text-green-600 transition-colors">{currentUserStats.exact_hits}</p>
                 </div>
                 <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col items-center transition-colors">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 whitespace-nowrap">{lang === 'cz' ? 'Nejlepší série' : 'Best Streak'}</p>
                    <p className="text-4xl font-black text-slate-900 transition-colors">{currentUserStats.bestStreak}</p>
                 </div>
                 <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col items-center transition-colors">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 whitespace-nowrap">{lang === 'cz' ? 'Aktuální série' : 'Current Streak'}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-4xl font-black text-orange-500 transition-colors">{currentUserStats.currentStreak}</p>
                      <Flame className={`w-6 h-6 ${currentUserStats.currentStreak >= 3 ? 'text-orange-500 fill-current' : 'text-slate-100'}`} />
                    </div>
                 </div>
              </div>

              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 transition-colors">
                 <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center justify-between">
                   {t.pickWinner}
                   {(() => {
                     const firstMatch = matches.sort((a, b) => new Date(a.start_time_utc).getTime() - new Date(b.start_time_utc).getTime())[0];
                     const firstTime = firstMatch ? new Date(firstMatch.start_time_utc).getTime() : 0;
                     const isLocked = Date.now() > firstTime - (5 * 60 * 1000);
                     return isLocked ? <span className="bg-slate-100 text-[8px] px-2 py-0.5 rounded-full text-slate-500 uppercase transition-colors">Locked</span> : null;
                   })()}
                 </h3>
                 <div className="grid grid-cols-4 gap-2">
                   {teams.filter(tm => tm.id !== 'tba').map(tm => {
                     const firstMatch = [...matches].sort((a, b) => new Date(a.start_time_utc).getTime() - new Date(b.start_time_utc).getTime())[0];
                     const firstTime = firstMatch ? new Date(firstMatch.start_time_utc).getTime() : 0;
                     const isLocked = Date.now() > firstTime - (5 * 60 * 1000);
                     const isSelected = user.tournament_winner_id === tm.id;
                     
                     return (
                       <motion.button
                         key={tm.id}
                         whileTap={!isLocked ? { scale: 0.9 } : {}}
                         onClick={() => !isLocked && pickWinner(tm.id)}
                         disabled={isLocked && !isSelected}
                         className={`p-2 rounded-xl flex flex-col items-center border transition-all relative ${
                           isSelected 
                           ? 'bg-red-600 border-red-600 scale-105 shadow-lg shadow-red-100 z-[1]' 
                           : isLocked ? 'bg-slate-50 border-transparent opacity-40 grayscale pointer-events-none' : 'bg-slate-50 border-transparent hover:border-slate-200'
                         }`}
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
                           {tm.id.toUpperCase()}
                         </span>
                       </motion.button>
                     );
                   })}
                 </div>
                 <p className="mt-4 text-[10px] text-center text-slate-400 italic font-medium">{t.lockedWinner}</p>
              </div>

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
                     className="w-full py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest active:scale-95 transition-all shadow-md"
                   >
                     {t.changePass}
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
                {[
                  { id: 'all', label: t.all },
                  { id: 'A', label: t.groupA },
                  { id: 'B', label: t.groupB },
                  { id: 'playoffs', label: t.playoffs },
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setAdminGroupFilter(f.id as any)}
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
                    if (adminGroupFilter === 'playoffs') return !m.stage?.includes('Group');
                    return m.stage?.includes(`Group ${adminGroupFilter}`);
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
                    />
                  ))}

              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mb-4 mt-8">
                 <h3 className="text-xs font-bold text-slate-400 uppercase mb-4">{t.setFinalWinner}</h3>
                 <div className="grid grid-cols-4 gap-2 mb-4">
                   {teams.filter(t => t.id !== 'tba').map(t => (
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

      {/* Navigation */}
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
          <div className={`w-6 h-6 rounded-full flex items-center justify-center overflow-hidden bg-slate-50 ${user.tournament_winner_id && tab === 'profile' ? 'ring-2 ring-red-600' : ''}`}>
             {(() => {
               const team = teams.find(tm => tm.id === user.tournament_winner_id);
               if (team) return <TeamFlag code={team.flag_code || team.id} className="w-5 h-3" />;
               if (user.winner_flag) return <TeamFlag code={user.winner_flag || user.tournament_winner_id} className="w-5 h-3" />;
               return <User className="w-4 h-4" />;
             })()}
          </div>
          <span className="text-[10px] font-bold uppercase">{t.profile}</span>
        </button>
      </nav>
    </div>
  );
}
