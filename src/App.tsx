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
  pickTournamentWinner as pickWinnerDB
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
    locked: "Uzamčeno (5 min před startem)",
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
    loginTitle: "MS V HOKEJI 2026",
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
    noPredictions: "Zatím žádné tipy.",
    notPicked: "Zatím nevybráno",
    lockedWinner: "Uzamčeno 4 hodiny před prvním zápasem",
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
    officialWinner: "Oficiální vítěz turnaje",
    noDraws: "Remíza není povolena. Jeden tým musí vyhrát!",
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
    locked: "Locked (5 min before start)",
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
    loginTitle: "IIHF 2026 Predictor",
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
    noPredictions: "No predictions yet.",
    notPicked: "Not picked yet",
    lockedWinner: "Locked 4 hours before first game",
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
  }
};

// --- Components ---

interface MatchCardProps {
  match: Match;
  onPredict?: (h: number, a: number) => void;
  isFinished?: boolean;
  userId?: string;
  t: any;
}

const MatchCard: React.FC<MatchCardProps> = ({ 
  match, 
  onPredict, 
  isFinished = false, 
  userId,
  t
}) => {
  const [home, setHome] = useState(match.predicted_home_score ?? 0);
  const [away, setAway] = useState(match.predicted_away_score ?? 0);
  const [showOthers, setShowOthers] = useState(false);
  const [others, setOthers] = useState<Prediction[]>([]);

  const startTime = new Date(match.start_time_utc).getTime();
  const lockTime = startTime - (5 * 60 * 1000);
  const isLocked = Date.now() > lockTime || match.status === 'finished';

  const fetchOthers = async () => {
    if (!showOthers) {
      try {
        const data = await fetchMatchPredictions(match.id);
        setOthers(data);
      } catch (err) {
        console.error(err);
      }
    }
    setShowOthers(!showOthers);
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

  return (
    <motion.div 
      layout
      className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-4"
    >
      <div className="p-4">
        <div className="flex justify-between items-center mb-3">
          <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase">
            <Clock className="w-3 h-3" />
            {new Date(match.start_time_utc).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="text-[10px] bg-slate-50 px-2 py-0.5 rounded-full font-bold text-slate-400 uppercase tracking-tighter">{match.stage}</span>
        </div>

        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex-1 flex flex-col items-center text-center">
            <span className="text-4xl mb-2">{match.home_flag}</span>
            <span className="text-sm font-semibold text-slate-700 line-clamp-1">{match.home_name}</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            {match.status === 'finished' ? (
              <div className="text-3xl font-black tabular-nums tracking-tighter text-slate-900">
                {match.home_score} : {match.away_score}
              </div>
            ) : (
              <div className="text-slate-300 font-bold text-xl">VS</div>
            )}
          </div>

          <div className="flex-1 flex flex-col items-center text-center">
            <span className="text-4xl mb-2">{match.away_flag}</span>
            <span className="text-sm font-semibold text-slate-700 line-clamp-1">{match.away_name}</span>
          </div>
        </div>

        {!isFinished && (
          <div className="flex flex-col gap-3">
            <div className="bg-slate-50 rounded-2xl p-4 flex items-center justify-around gap-2">
              <div className="flex flex-col items-center gap-2">
                <button 
                  onClick={() => setHome(h => Math.max(0, h + 1))}
                  disabled={isLocked}
                  className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm active:scale-90 disabled:opacity-50"
                >
                  <ChevronUp className="w-5 h-5 text-slate-600" />
                </button>
                <div className="w-16 h-16 bg-white rounded-2xl border-2 border-slate-100 flex items-center justify-center text-3xl font-black text-slate-900 shadow-sm">
                  {home}
                </div>
                <button 
                  onClick={() => setHome(h => Math.max(0, h - 1))}
                  disabled={isLocked}
                  className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm active:scale-90 disabled:opacity-50"
                >
                  <ChevronDown className="w-5 h-5 text-slate-600" />
                </button>
              </div>

              <span className="text-slate-300 font-black text-3xl mb-8">:</span>

              <div className="flex flex-col items-center gap-2">
                <button 
                  onClick={() => setAway(h => Math.max(0, h + 1))}
                  disabled={isLocked}
                  className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm active:scale-90 disabled:opacity-50"
                >
                  <ChevronUp className="w-5 h-5 text-slate-600" />
                </button>
                <div className="w-16 h-16 bg-white rounded-2xl border-2 border-slate-100 flex items-center justify-center text-3xl font-black text-slate-900 shadow-sm">
                  {away}
                </div>
                <button 
                  onClick={() => setAway(h => Math.max(0, h - 1))}
                  disabled={isLocked}
                  className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm active:scale-90 disabled:opacity-50"
                >
                  <ChevronDown className="w-5 h-5 text-slate-600" />
                </button>
              </div>
            </div>
            
            <button
              onClick={() => onPredict?.(home, away)}
              disabled={isLocked || home === away}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg shadow-blue-100 active:scale-95 transition-transform disabled:bg-slate-300 disabled:shadow-none"
            >
              {match.predicted_home_score !== null ? t.updateTip : t.saveTip}
            </button>
            {!isLocked && home === away && <p className="text-[10px] text-center text-slate-400 italic">{t.noDraws}</p>}
            {isLocked && <p className="text-[10px] text-center text-slate-400 italic">{t.locked}</p>}
          </div>
        )}

        {isFinished && (
          <div className="flex flex-col gap-3">
             <div className={`p-4 rounded-xl flex items-center justify-between ${
               points === 5 ? 'bg-green-100 border border-green-200' : 
               points === 2 ? 'bg-green-50 border border-green-100' : 'bg-slate-50 border border-slate-100'
             }`}>
               <div className="flex flex-col">
                 <span className="text-xs text-slate-500 uppercase font-bold">{t.yourPrediction}</span>
                 <span className="text-xl font-bold text-slate-800">
                    {match.predicted_home_score ?? '?'} : {match.predicted_away_score ?? '?'}
                 </span>
               </div>
               {points !== null && (
                 <div className={`flex items-center gap-1 font-bold ${points > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                   {points > 0 && <CheckCircle2 className="w-5 h-5" />}
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
          <span className="ml-1 bg-slate-100 px-1.5 py-0.5 rounded-md font-bold text-[10px]">{match.total_predictions ?? 0} {t.tipsCount}</span>
        </button>
      </div>

      <AnimatePresence>
        {showOthers && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden bg-slate-50 border-t border-slate-100"
          >
            <div className="p-4">
              {others.length === 0 ? (
                <p className="text-center text-xs text-slate-400">{t.noPredictions}</p>
              ) : (
                <div className="flex flex-wrap gap-2 justify-center">
                  {others.map(p => (
                    <div 
                      key={p.player_id} 
                      className={`px-3 py-2 rounded-xl border flex flex-col items-center min-w-[70px] ${
                        p.player_id === userId ? 'ring-2 ring-blue-500 border-blue-500 shadow-sm' : ''
                      } ${
                        p.points_earned === 5 ? 'bg-green-100 border-green-200 text-green-800' :
                        p.points_earned === 2 ? 'bg-green-50 border-green-100 text-green-700' :
                        'bg-white border-slate-200 text-slate-500'
                      }`}
                    >
                      <div className="flex items-center gap-1 mb-1">
                        <span className={`text-[10px] font-bold uppercase truncate max-w-[60px] ${p.player_id === userId ? 'text-blue-600' : ''}`}>
                          {p.player_id === userId ? 'VY' : p.username}
                        </span>
                        {(p as any).winner_flag && (
                          <span className="text-[10px] grayscale-[0.5] opacity-80">{(p as any).winner_flag}</span>
                        )}
                      </div>
                      <span className="text-xs font-black">{p.predicted_home_score}:{p.predicted_away_score}</span>
                    </div>
                  ))}
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

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mb-4">
      <div className="flex justify-between items-center mb-4">
        <span className="text-xs font-bold text-slate-400">{match.stage}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${match.status === 'finished' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
          {match.status.toUpperCase()}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex flex-col items-center flex-1">
          <span className="text-2xl mb-1">{match.home_flag}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setAdminH(Math.max(0, adminH - 1))} className="w-8 h-8 bg-slate-50 rounded-full border border-slate-200 flex items-center justify-center font-bold text-slate-600 active:scale-90">-</button>
            <span className="text-xl font-black w-6 text-center">{adminH}</span>
            <button onClick={() => setAdminH(adminH + 1)} className="w-8 h-8 bg-slate-50 rounded-full border border-slate-200 flex items-center justify-center font-bold text-slate-600 active:scale-90">+</button>
          </div>
        </div>

        <span className="text-slate-300 font-bold text-xl">:</span>

        <div className="flex flex-col items-center flex-1">
          <span className="text-2xl mb-1">{match.away_flag}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setAdminA(Math.max(0, adminA - 1))} className="w-8 h-8 bg-slate-50 rounded-full border border-slate-200 flex items-center justify-center font-bold text-slate-600 active:scale-90">-</button>
            <span className="text-xl font-black w-6 text-center">{adminA}</span>
            <button onClick={() => setAdminA(adminA + 1)} className="w-8 h-8 bg-slate-50 rounded-full border border-slate-200 flex items-center justify-center font-bold text-slate-600 active:scale-90">+</button>
          </div>
        </div>
      </div>
      <button 
        onClick={() => onUpdate(adminH, adminA)}
        disabled={adminH === adminA}
        className={`w-full py-3 rounded-xl text-xs font-bold transition-transform shadow-sm ${
          adminH === adminA ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-900 text-white active:scale-95'
        }`}
      >
        {t.updateResult}
      </button>
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
  const [loading, setLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);
  const [newUserData, setNewUserData] = useState({ username: '', password: '' });
  const [createUserMsg, setCreateUserMsg] = useState('');

  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);

  const t = (translations as any)[lang];

  const fetchAll = async () => {
    if (!user) return;
    try {
      const { matches: matchesData, teams: teamsData, leaderboard: lbData } = await fetchAllData(user.id);
      setMatches(matchesData);
      setTeams(teamsData);
      setLeaderboard(lbData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
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
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  const savePrediction = async (matchId: string, h: number, a: number) => {
    try {
      await savePredDB(user?.id || '', matchId, h, a);
      fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const updateMatchResult = async (matchId: string, h: number, a: number) => {
    try {
      await updateMatchResDB(user?.id || '', matchId, h, a);
      fetchAll();
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
      fetchAll();
    } catch (err: any) {
      setCreateUserMsg(err.message);
    }
  };

  const setTournamentWinner = async (teamId: string) => {
    try {
      await setWinnerDB(user?.id || '', teamId);
      fetchAll();
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
      fetchAll();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Streak calculation logic
  const streaks = useMemo(() => {
    const userStreaks: Record<string, { current: number, best: number }> = {};
    
    leaderboard.forEach(p => {
      userStreaks[p.id] = { current: 0, best: 0 };
    });

    // We need finished matches sorted chronologically to compute streaks
    const finishedMatches = [...matches]
      .filter(m => m.status === 'finished')
      .sort((a, b) => new Date(a.start_time_utc).getTime() - new Date(b.start_time_utc).getTime());

    // This is complex because we don't have all predictions for all users here easily
    // But since it's "10-15 friends", maybe we can just compute it for the logged-in user for now
    // or fetch more data. For now, let's just do it for the current user in Profile.
    return userStreaks;
  }, [matches, leaderboard]);

  const currentUserStats = useMemo(() => {
    if (!user) return null;
    const stats = { currentStreak: 0, bestStreak: 0, exact: 0, winner: 0, total: 0 };
    
    // Sort finished matches chronologically
    const finished = matches
      .filter(m => m.status === 'finished')
      .sort((a, b) => new Date(a.start_time_utc).getTime() - new Date(b.start_time_utc).getTime());

    let curr = 0;
    finished.forEach(m => {
      const ph = m.predicted_home_score;
      const pa = m.predicted_away_score;
      const mh = m.home_score;
      const ma = m.away_score;

      if (ph === null || pa === null || mh === null || ma === null) {
        curr = 0;
        return;
      }

      if (ph === mh && pa === ma) {
        stats.exact++;
        stats.winner++;
        curr++;
      } else if ((ph > pa && mh > ma) || (pa > ph && ma > mh)) {
        stats.winner++;
        curr++;
      } else {
        curr = 0;
      }
      stats.bestStreak = Math.max(stats.bestStreak, curr);
    });
    stats.currentStreak = curr;
    
    const lbEntry = leaderboard.find(l => l.id === user.id);
    stats.total = lbEntry?.total_points ?? 0;

    return stats;
  }, [matches, user, leaderboard]);

  if (!user) {
    const loginT = translations.cz; 
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm bg-white rounded-[40px] shadow-2xl p-8 border border-slate-100"
        >
          <div className="flex flex-col items-center mb-8">
            <img 
              src="https://upload.wikimedia.org/wikipedia/en/thumb/2/22/2026_IIHF_World_Championship_logo.png/220px-2026_IIHF_World_Championship_logo.png" 
              alt="IIHF 2026 Logo"
              className="w-24 h-24 mb-4 object-contain"
              onError={(e) => (e.currentTarget.src = "https://www.iihf.com/Content/img/iihf-logo.svg")}
            />
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter italic leading-none">{loginT.loginTitle}</h1>
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-[0.2em] mt-1">{loginT.worldChampionship}</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">{loginT.username}</label>
              <input 
                required
                type="text" 
                value={loginData.username}
                onChange={e => setLoginData(prev => ({ ...prev, username: e.target.value }))}
                className="w-full p-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all"
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
                className="w-full p-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-red-500 text-sm font-medium text-center bg-red-50 p-2 rounded-xl">{error}</p>}
            <button 
              type="submit"
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg shadow-blue-200 active:scale-95 transition-transform"
            >
              {isRegistering ? loginT.register : loginT.signin}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center">{t.loading}</div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-24 max-w-lg mx-auto shadow-2xl">
      <header className="bg-white p-6 sticky top-0 z-10 border-b border-slate-100">
        <div className="flex justify-between items-center">
          <div>
             <h1 className="text-2xl font-black text-slate-900 leading-tight">MS V HOKEJI 2026</h1>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">Zurich & Fribourg, Switzerland</p>
          </div>
          <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="p-4">
        {/* Match Filter Bar */}
        {(tab === 'matches' || tab === 'results') && (
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide no-scrollbar -mx-4 px-4 sticky top-[81px] bg-slate-50 z-[5] py-1">
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
                  matchFilter === f.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-white text-slate-400 border border-slate-100 hover:border-slate-200'
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
                 <MatchCard key={m.id} match={m} isFinished userId={user.id} t={t} />
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
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden mb-6">
                    <TrophyIcon className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 rotate-12" />
                    <div className="relative z-10 flex flex-col items-center text-center">
                      <p className="text-xs font-bold uppercase opacity-80 mb-2">{t.officialWinner}</p>
                      {(() => {
                        const officialWinner = teams.find(tm => tm.is_final_winner === 1);
                        return (
                          <div className="flex flex-col items-center">
                            <span className="text-6xl mb-2">{officialWinner?.flag_code}</span>
                            <span className="text-2xl font-black">{officialWinner?.name}</span>
                          </div>
                        );
                      })()}
                    </div>
                </div>
              )}

              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-50">
                      <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase">{t.pos}</th>
                      <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase">{t.player}</th>
                      <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase text-right">{t.pts}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((p, i) => (
                      <tr 
                        key={p.id} 
                        className={`border-b border-slate-50 last:border-none ${p.id === user.id ? 'bg-blue-50/50' : ''}`}
                      >
                        <td className="px-5 py-4">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                            i === 0 ? 'bg-yellow-400 text-yellow-900' :
                            i === 1 ? 'bg-slate-300 text-slate-700' :
                            i === 2 ? 'bg-amber-600 text-amber-50' :
                            'bg-slate-100 text-slate-500'
                          }`}>
                            {i + 1}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                             <span className="font-bold text-slate-700">{p.username}</span>
                             <span className="text-xs opacity-60">{p.winner_flag}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-medium">
                            {p.exact_scores} {t.exact} • {p.correct_winners} {t.winner}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="text-xl font-black text-slate-900">{p.total_points ?? 0}</span>
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
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col items-center">
                 <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4 border-4 border-white shadow-md overflow-hidden bg-white">
                   {(() => {
                     const team = teams.find(tm => tm.id === user.tournament_winner_id);
                     if (team) return <span className="text-5xl leading-none">{team.flag_code}</span>;
                     if (user.winner_flag) return <span className="text-5xl leading-none">{user.winner_flag}</span>;
                     return <User className="w-10 h-10 text-slate-400" />;
                   })()}
                 </div>
                 <h2 className="text-xl font-black text-slate-900 uppercase">{user.username}</h2>
                 {currentUserStats.currentStreak >= 3 && (
                   <div className="mt-2 flex items-center gap-1 text-orange-500 font-black italic">
                      <Flame className="w-5 h-5 fill-current" />
                      {currentUserStats.currentStreak >= 7 ? 'GOAT' : 
                       currentUserStats.currentStreak >= 5 ? 'ON FIRE' : 'HOT'}
                   </div>
                 )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t.totalPoints}</p>
                    <p className="text-3xl font-black text-blue-600">{currentUserStats.total}</p>
                 </div>
                 <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t.currentStreak}</p>
                    <div className="flex items-center gap-2">
                       <p className="text-3xl font-black text-orange-500">{currentUserStats.currentStreak}</p>
                       <Flame className={`w-6 h-6 ${currentUserStats.currentStreak >= 3 ? 'text-orange-500 fill-current' : 'text-slate-200'}`} />
                    </div>
                 </div>
                 <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t.exactScores}</p>
                    <p className="text-3xl font-black text-green-600">{currentUserStats.exact}</p>
                 </div>
                 <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t.bestStreak}</p>
                    <p className="text-3xl font-black text-slate-900">{currentUserStats.bestStreak}</p>
                 </div>
              </div>

              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                 <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">{t.pickWinner}</h3>
                 <div className="grid grid-cols-4 gap-2">
                   {teams.filter(t => t.id !== 'tba').map(t => (
                     <button
                       key={t.id}
                       onClick={() => pickWinner(t.id)}
                       className={`p-2 rounded-xl flex flex-col items-center border transition-all relative ${
                         user.tournament_winner_id === t.id 
                         ? 'bg-blue-600 border-blue-600 scale-105 shadow-lg shadow-blue-100 z-[1]' 
                         : 'bg-slate-50 border-transparent hover:border-slate-200'
                       }`}
                     >
                       {user.tournament_winner_id === t.id && (
                         <div className="absolute -top-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                           <CheckCircle2 className="w-3 h-3 text-blue-600" />
                         </div>
                       )}
                       <span className="text-2xl">{t.flag_code}</span>
                       <span className={`text-[10px] font-black ${user.tournament_winner_id === t.id ? 'text-white' : 'text-slate-400'}`}>
                         {t.id.toUpperCase()}
                       </span>
                     </button>
                   ))}
                 </div>
                 <p className="mt-4 text-[10px] text-center text-slate-400 italic">{t.lockedWinner}</p>
              </div>

              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
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

              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mb-8">
                 <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 flex items-center gap-2">
                   <UserPlus className="w-4 h-4" /> {t.createUser}
                 </h3>
                 <form onSubmit={handleAdminCreateUser} className="space-y-3">
                   <div>
                     <input 
                       type="text"
                       required
                       placeholder={t.newUsername}
                       value={newUserData.username}
                       onChange={e => setNewUserData(prev => ({ ...prev, username: e.target.value }))}
                       className="w-full p-3 bg-slate-50 rounded-xl border-none text-sm outline-none focus:ring-2 focus:ring-blue-500"
                     />
                   </div>
                   <div>
                     <input 
                       type="password"
                       required
                       placeholder={t.newPassword}
                       value={newUserData.password}
                       onChange={e => setNewUserData(prev => ({ ...prev, password: e.target.value }))}
                       className="w-full p-3 bg-slate-50 rounded-xl border-none text-sm outline-none focus:ring-2 focus:ring-blue-500"
                     />
                   </div>
                   <button 
                     type="submit"
                     className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold shadow-md shadow-blue-100 transition-transform active:scale-95"
                   >
                     {t.create}
                   </button>
                   {createUserMsg && (
                     <p className={`text-[10px] font-bold uppercase text-center mt-2 ${createUserMsg.includes('!') ? 'text-green-600' : 'text-red-500'}`}>
                       {createUserMsg}
                     </p>
                   )}
                 </form>
              </div>
              {matches.map(m => (
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
                       <span className="text-2xl">{t.flag_code}</span>
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
      <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white/80 backdrop-blur-lg border-t border-slate-100 px-2 py-3 flex justify-around items-center rounded-t-[2rem]">
        <button onClick={() => setTab('matches')} className={`flex flex-col items-center gap-1 transition-all ${tab === 'matches' ? 'text-blue-600 scale-110' : 'text-slate-400'}`}>
          <Calendar className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">{t.matches}</span>
        </button>
        <button onClick={() => setTab('results')} className={`flex flex-col items-center gap-1 transition-all ${tab === 'results' ? 'text-blue-600 scale-110' : 'text-slate-400'}`}>
          <CheckCircle2 className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">{t.results}</span>
        </button>
        <button onClick={() => setTab('leaderboard')} className={`flex flex-col items-center gap-1 transition-all ${tab === 'leaderboard' ? 'text-blue-600 scale-110' : 'text-slate-400'}`}>
          <TrophyIcon className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">{t.rank}</span>
        </button>
        {user.role === 'admin' && (
          <button onClick={() => setTab('admin')} className={`flex flex-col items-center gap-1 transition-all ${tab === 'admin' ? 'text-blue-600 scale-110' : 'text-slate-400'}`}>
            <ShieldCheck className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase">{t.admin}</span>
          </button>
        )}
        <button onClick={() => setTab('profile')} className={`flex flex-col items-center gap-1 transition-all ${tab === 'profile' ? 'text-blue-600 scale-110' : 'text-slate-400'}`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center overflow-hidden bg-slate-50 ${user.tournament_winner_id && tab === 'profile' ? 'ring-2 ring-blue-600' : ''}`}>
             {(() => {
               const team = teams.find(tm => tm.id === user.tournament_winner_id);
               if (team) return <span className="text-lg leading-none">{team.flag_code}</span>;
               if (user.winner_flag) return <span className="text-lg leading-none">{user.winner_flag}</span>;
               return <User className="w-4 h-4" />;
             })()}
          </div>
          <span className="text-[10px] font-bold uppercase">{t.profile}</span>
        </button>
      </nav>
    </div>
  );
}
