import { translate, getMessages, normalizeLocale, loadLocaleResources, type Locale } from './i18n/index.ts';
import { LocalizedText, useLocale } from './i18n/LocaleProvider.tsx';
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
  Gift,
  Minus,
  Plus,
} from 'lucide-react';
import {
  Player,
  Team,
  Match,
  Prediction,
  Lobby,
  type AuthStatus,
  type MembershipHomeItem,
  type LobbyPrizeEntry,
  type OfficialEventCard,
  type OnboardingState,
  type ProductFeatureFlags
} from './types.ts';
import { useClerkGameSession } from './lib/clerkSession.tsx';
import { supabase } from './lib/supabase.ts';
import { isDrawPrediction, requiresFootballWinner, formatStageLabel, isHockeyTournament } from './lib/matchRules.ts';
import { clubCrestUrl } from './lib/teamAssets.ts';
import { formatMatchKickoff, MATCH_TIME_ZONE } from './lib/matchTime.ts';
import { TournamentSetup } from './components/TournamentSetup.tsx';
import { isMmaTournament } from './lib/mma.ts';
import { PredictionDistribution } from './components/PredictionDistribution.tsx';
import { 
  fetchAllData, 
  fetchCriticalAppData,
  fetchDeferredAppData,
  fetchHomeDashboard,
  fetchHomeMembershipState,
  fetchUserLobbies,
  fetchTournaments,
  fetchLobbyPrizeMetadata,
  LobbyPrizeSchemaUnavailableError,
  savePrediction as savePredDB, 
  fetchMatchPredictions,
  updateMatchResult as updateMatchResDB,
  setTournamentWinner as setWinnerDB,
  pickTournamentWinner as pickWinnerDB,
  bootstrapMyAccount,
  completeMyProfile,
  createLobby,
  joinLobbyByCode,
  cancelLobbyJoinRequest,
  LobbyJoinPendingError,
  calculatePoints
} from './lib/db.ts';
import AuthScreen from './components/AuthScreen.tsx';
import { PublicPlayScreen } from './components/PublicPlayScreen.tsx';
import { usePublicPlay } from './lib/usePublicPlay.ts';
import { HomeDashboard, type AddLobbyMode } from './components/HomeDashboard.tsx';
import { isUntippedMatchForDisplay, type HomeDashboardSummary } from './lib/homeDashboard.ts';
import { shouldRefreshHomeMembership } from './lib/membership.ts';
import {
  canStartLobbyNavigation,
  getLobbyNavigationViewState,
  runLobbyNavigationTransition,
  type LobbyNavigationAction
} from './lib/lobbyNavigation.ts';
import { fetchProductFeatureFlags, isProductFeatureEnabled } from './lib/productFeatures.ts';
import { getInviteCodeFromLocation } from './lib/sharing.ts';
import {
  fetchMyOnboardingState,
  fetchOfficialEventHomeCard,
  resolveOfficialEventSlug,
  updateMyOnboardingState
} from './lib/officialEvents.ts';
import {
  shouldShowFirstTipOnboarding,
  shouldShowOfficialEventOnHome
} from './lib/officialEventsState.ts';
import { FirstTipOnboarding } from './components/FirstTipOnboarding.tsx';
import {
  MAX_LOBBY_PRIZES,
  mergeLobbyPrizeMetadata,
  prepareLobbyPrizeSelection,
  preserveLobbyPrizeMetadata
} from './lib/productEvolution.ts';

const LazyAdminScreen = lazy(() => import('./components/AdminScreen.tsx'));
const LazyLeaderboardScreen = lazy(() => import('./components/LeaderboardScreen.tsx'));
const LazyLobbyView = lazy(() => import('./components/LobbyView.tsx').then(module => ({ default: module.LobbyView })));
const LazyProfileScreen = lazy(() => import('./components/ProfileScreen.tsx'));
const LazyOfficialEventView = lazy(() => import('./components/OfficialEventView.tsx'));
const LazyMmaEventView = lazy(() => import('./components/MmaEventView.tsx'));


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

const getGroupCode = (stage: string) => {
  return stage.match(/^Group\s+([A-Z])$/i)?.[1]?.toUpperCase() || null;
};

export const TeamFlag = ({ code, logoUrl, name, className = "w-6 h-4" }: { code: string | null | undefined; logoUrl?: string | null; name?: string; className?: string }) => {
  const [error, setError] = React.useState(false);
  const [retry, setRetry] = React.useState(false);
  const [failedLogo, setFailedLogo] = React.useState<string | null>(null);
  const crest = clubCrestUrl(logoUrl);
  if (crest && failedLogo !== crest) return (
    <span className={`${className} inline-flex items-center justify-center rounded-sm border border-slate-200 bg-slate-50 shadow-sm flex-shrink-0 overflow-hidden`}>
      <img src={crest} alt={name || 'Club'} title={name} loading="lazy" decoding="async" referrerPolicy="no-referrer"
        className="h-full w-full object-contain" onError={() => setFailedLogo(crest)} />
    </span>
  );

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
    'cze': 'cs', 'svk': 'sk', 'can': 'ca', 'usa': 'us',
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
  lang?: Locale;
}

export const MatchCard: React.FC<MatchCardProps> = ({
  match, 
  lobbyId,
  onPredict, 
  isFinished = false, 
  userId,
  t,
  matchPredictions = [],
  matchPredictionsLoading = false,
  isHockey = false,
  lang = 'cs' as const
}) => {
  const [home, setHome] = useState(match.predicted_home_score ?? 0);
  const [away, setAway] = useState(match.predicted_away_score ?? 0);
  const [showOthers, setShowOthers] = useState(false);
  const [others, setOthers] = useState<Prediction[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  const startTime = new Date(match.start_time_utc).getTime();
  const lockTime = match.lock_time_utc ? new Date(match.lock_time_utc).getTime() : startTime - (5 * 60 * 1000);
  const isLocked = Date.now() > lockTime || match.status === 'finished';
  const footballWinnerRequired = !isHockey && requiresFootballWinner(match.stage, match.tournament_id);
  const drawPredictionSelected = isDrawPrediction(home, away);
  const drawPredictionBlocked = drawPredictionSelected && (isHockey || footballWinnerRequired);

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

    const predictionsForDistribution = footballWinnerRequired
      ? matchPredictions.filter(p => p.predicted_home_score !== p.predicted_away_score)
      : matchPredictions;
    const total = predictionsForDistribution.length;
    if (total === 0) return { home: 0, away: 0, draw: 0, isEmpty: true, isLoading: false };
    
    const homeWins = predictionsForDistribution.filter(p => p.predicted_home_score > p.predicted_away_score).length;
    const draws = footballWinnerRequired ? 0 : predictionsForDistribution.filter(p => p.predicted_home_score === p.predicted_away_score).length;
    const awayWins = predictionsForDistribution.filter(p => p.predicted_away_score > p.predicted_home_score).length;
    
    return {
      home: Math.round((homeWins / total) * 100),
      draw: Math.round((draws / total) * 100),
      away: Math.round((awayWins / total) * 100),
      isEmpty: false,
      isLoading: false
    };
  }, [footballWinnerRequired, match.total_predictions, matchPredictions, matchPredictionsLoading]);
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
            <span title={`${MATCH_TIME_ZONE} · ${translate(lang, "app.czechTime")}`} className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase">
              <Clock className="w-3 h-3" />
              {formatMatchKickoff(match.start_time_utc, lang)}
            </span>
            {timeLeft && (
              <span className="text-[9px] font-black text-red-500 uppercase mt-0.5 animate-pulse">
                {t.locksIn} {timeLeft}
              </span>
            )}
          </div>
          <span className="text-[10px] bg-slate-50 px-2 py-0.5 rounded-full font-bold text-slate-400 uppercase tracking-tighter transition-colors">{formatStageLabel(match.stage, lang)}</span>
        </div>

        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex-1 flex flex-col items-center text-center">
            <TeamFlag code={match.home_flag || match.home_team_id} logoUrl={match.home_logo_url} name={match.home_name} className={match.home_logo_url ? 'w-12 h-12 mb-2' : 'w-12 h-8 mb-2'} />
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
            <TeamFlag code={match.away_flag || match.away_team_id} logoUrl={match.away_logo_url} name={match.away_name} className={match.away_logo_url ? 'w-12 h-12 mb-2' : 'w-12 h-8 mb-2'} />
            <span className="text-sm font-semibold text-slate-700 line-clamp-1">{match.away_name}</span>
          </div>
        </div>

        {!isFinished && (
          <div className="flex flex-col gap-3">
            <PredictionDistribution homeLabel={homeOutcomeLabel} awayLabel={awayOutcomeLabel}
              homePercent={predictionStats.home} awayPercent={predictionStats.away}
              drawPercent={!isHockey && !footballWinnerRequired ? predictionStats.draw : undefined}
              loading={predictionStats.isLoading} lang={lang} />

            <div className="bg-slate-50 rounded-2xl p-3 flex flex-col items-center justify-center transition-colors">
              <div className="flex items-center justify-center gap-4">
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={() => setHome(h => Math.max(0, h - 1))}
                    aria-label={translate(lang, "app.decreaseHomePrediction")}
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
                    aria-label={translate(lang, "app.increaseHomePrediction")}
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
                    aria-label={translate(lang, "app.decreaseAwayPrediction")}
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
                    aria-label={translate(lang, "app.increaseAwayPrediction")}
                    disabled={isLocked}
                    className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center shadow-sm active:scale-95 disabled:opacity-50 transition-colors"
                  >
                    <ChevronUp className="w-4 h-4 text-slate-600" />
                  </button>
                </div>
              </div>
              {!isLocked && footballWinnerRequired && !drawPredictionSelected && (
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
                showSuccess ? 'bg-green-500 text-white shadow-green-100' : 'bg-fan-primary text-fan-snow shadow-fan-soft'
              }`}
            >
              {isSaving ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isLocked ? (
                t.locked
              ) : showSuccess ? (
                <>
                  <CheckCircle2 className="h-5 w-5" />
                  {t.tipSaved}
                </>
              ) : footballWinnerRequired && drawPredictionSelected ? (
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
                 {points === 5 && (
                   <span className="mt-1 text-[10px] font-black uppercase text-indigo-700">
                     {t.exactHit}
                   </span>
                 )}
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
                            p.player_id === userId ? 'ring-2 ring-fan-primary border-fan-primary shadow-sm z-10' : ''
                          } ${
                            pPoints === 5 ? 'bg-indigo-50/60 border-indigo-100 text-indigo-950 font-bold shadow-sm' :
                            pPoints === 3 ? 'bg-emerald-50/60 border-emerald-100 text-emerald-950 font-bold shadow-sm' :
                            pPoints === 2 || pPoints === 1 ? 'bg-slate-50/50 border-slate-200 text-slate-900 font-medium' :
                            'bg-white border-slate-100 text-slate-400'
                          }`}
                        >
                        <div className="flex items-center gap-1 mb-0.5">
                          <UserAvatar player={{ username: p.username || translate(lang, "app.player"), avatar_emoji: p.avatar_emoji, avatar_bg: p.avatar_bg }} size="sm" />
                          <span className={`text-[9px] font-black uppercase truncate max-w-[55px] ${p.player_id === userId ? 'text-fan-primary' : ''}`}>
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
          <p className="text-red-600 text-xs font-bold uppercase mb-2"><LocalizedText message="common.error" /></p>
          <p className="text-slate-600 text-sm mb-4">{error}</p>
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-transform"
          >
            <LocalizedText message="authScreen.tryAgain" />
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
          <LocalizedText message="app.screenError" />
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
}) => {
  const { locale: lang } = useLocale();
  return (
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
          {error || translate(lang, "app.preparingYourLobby")}
        </p>
        {error ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onHome}
              className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wider text-slate-600"
            >
              {translate(lang, "officialEventView.backToHome")}</button>
            <button
              type="button"
              onClick={onRetry}
              className="min-h-10 rounded-xl bg-slate-900 px-3 text-[10px] font-black uppercase tracking-wider text-white"
            >
              {translate(lang, "authScreen.tryAgain")}</button>
          </div>
        ) : null}
      </div>
    </main>
  </div>
  );
};

type TournamentWinnerScreenProps = {
  t: any;
  lang: Locale;
  winnerPickerTeams: Team[];
  currentUserPickId?: string;
  isWinnerPickerLocked: boolean;
  onPickTournamentWinner: (teamId: string) => Promise<void>;
  TeamFlag: React.ComponentType<{ code: string | null | undefined; className?: string; logoUrl?: string | null; name?: string }>;
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
        {t.pickWinner} ({winnerPickerTeams.length} {translate(lang, 'common.teamsAvailable')})
        {isWinnerPickerLocked ? <span className="bg-slate-100 text-[8px] px-2 py-0.5 rounded-full text-slate-500 uppercase transition-colors">{translate(lang, 'common.locked')}</span> : null}
      </h3>
      <div className="grid grid-cols-4 gap-2">
        {winnerPickerTeams.map(tm => {
          const isSelected = tm.id === currentUserPickId;
          let buttonStateClass = 'bg-slate-50 border-transparent hover:border-slate-200';
          if (isWinnerPickerLocked) {
            buttonStateClass = 'bg-slate-50 border-transparent opacity-40 grayscale cursor-not-allowed';
          }
          if (isSelected) {
            buttonStateClass = 'bg-fan-primary border-fan-primary scale-105 shadow-lg shadow-fan-soft z-[1]';
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
                  <CheckCircle2 className="w-3 h-3 text-fan-primary" />
                </motion.div>
              )}
              <TeamFlag code={tm.flag_code || tm.id} logoUrl={tm.logo_url} name={tm.name} className={tm.logo_url ? 'w-10 h-10 mb-1' : 'w-10 h-6 mb-1'} />
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
  const clerkSession = useClerkGameSession();
  const [authRetry, setAuthRetry] = useState(0);
  const [user, setUser] = useState<Player | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('initializing');
  const authSyncRequestRef = useRef(0);
  const authenticatedUserIdRef = useRef<string | null>(null);
  
  const [tab, setTab] = useState<'matches' | 'results' | 'leaderboard' | 'winner' | 'admin' | 'profile'>('matches');
  const [matchFilter, setMatchFilter] = useState('all');
  const { locale: lang, setLocale: setLang } = useLocale();
  const languageRef = useRef(lang);
  useEffect(() => { languageRef.current = lang; }, [lang]);
  
  const [matches, setMatches] = useState<Match[]>([]);
  const [visibleMatchCount, setVisibleMatchCount] = useState(30);
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
  const [homeMembershipItems, setHomeMembershipItems] = useState<MembershipHomeItem[]>([]);
  const [homeMembershipLoading, setHomeMembershipLoading] = useState(false);
  const [homeMembershipError, setHomeMembershipError] = useState('');
  const [productFeatureFlags, setProductFeatureFlags] = useState<ProductFeatureFlags>({});
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
  const [officialEventCard, setOfficialEventCard] = useState<OfficialEventCard | null>(null);
  const [activeOfficialEventId, setActiveOfficialEventId] = useState<string | null>(null);
  const [officialEventSlugInput] = useState(() => (
    new URLSearchParams(window.location.search).get('event')?.trim().toLowerCase() || ''
  ));
  const [officialProductLoading, setOfficialProductLoading] = useState(false);
  const [officialProductError, setOfficialProductError] = useState('');
  const [productFeatureFlagsReady, setProductFeatureFlagsReady] = useState(false);
  const officialProductRequestRef = useRef(0);
  const officialEventDeepLinkRequestRef = useRef(0);
  const homeDashboardRequestRef = useRef(0);
  const homeExternalRefreshInFlightRef = useRef(false);
  const skipNextHomeLoadAfterLobbyRefreshRef = useRef(false);
  const lobbyNavigationRequestRef = useRef(0);
  const lobbyMetadataRequestRef = useRef(0);
  const lobbyMutationInFlightRef = useRef(false);
  const skipNextInitialDataLoadRef = useRef(false);
  const [newLobbyName, setNewLobbyName] = useState("");
  const [newLobbyShortDescription, setNewLobbyShortDescription] = useState("");
  const [newLobbyLongDescription, setNewLobbyLongDescription] = useState("");
  const [newLobbyTournament, setNewLobbyTournament] = useState("");
  const [tournamentCatalog, setTournamentCatalog] = useState<{id: string; name: string; sport_id: string}[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [newLobbyJoinPolicy, setNewLobbyJoinPolicy] = useState<'open' | 'approval_required'>('open');
  const [newLobbyPrizesEnabled, setNewLobbyPrizesEnabled] = useState(false);
  const [newLobbyPrizeEntries, setNewLobbyPrizeEntries] = useState<LobbyPrizeEntry[]>([
    { position: 1, label: '' },
    { position: 2, label: '' },
    { position: 3, label: '' }
  ]);
  const [joinCodeInput, setJoinCodeInput] = useState(() => {
    return getInviteCodeFromLocation(window.location.pathname, window.location.search);
  });

  const activeLobby = lobbies.find(l => l.id === activeLobbyId);
  const isHockey = isHockeyTournament(activeTournamentId, tournamentCatalog.find(t => t.id === activeTournamentId)?.sport_id);
  const [winnerPickerTeams, setWinnerPickerTeams] = useState<any[]>([]);

  useEffect(() => { setVisibleMatchCount(30); }, [activeTournamentId, matchFilter, tab]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    let cancelled = false;
    fetchTournaments().then(items => {
      if (cancelled) return;
      setTournamentCatalog(items);
      setCatalogError('');
      setNewLobbyTournament(previous => items.some(item => item.id === previous) ? previous
        : items.find(item => item.id === 'uefa-champions-league-2026-27')?.id || items[0]?.id || '');
    }).catch(() => { if (!cancelled) setCatalogError(translate(lang, "app.couldNotLoadCompetitionsRefreshThePage")); });
    return () => { cancelled = true; };
  }, [authStatus, lang]);

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
      if (authStatus !== 'authenticated' || !activeTournamentId || isMmaTournament(activeTournamentId)) {
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
    if (getInviteCodeFromLocation(window.location.pathname, window.location.search)) return 'join';
    return 'none';
  });
  const [lobbyError, setLobbyError] = useState("");
  const [lobbySuccess, setLobbySuccess] = useState("");
  const [lobbyPrizeLoadError, setLobbyPrizeLoadError] = useState("");
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
  const lobbyPrizeMetadataRequestRef = useRef(0);
  const lobbyPrizeEnrichmentKeyRef = useRef('');
  const privateLobbyPrizesEnabled = isProductFeatureEnabled(
    productFeatureFlags,
    'private_lobby_prizes_enabled'
  );

  useEffect(() => {
    let current = true;
    if (authStatus !== 'authenticated') {
      setProductFeatureFlags({});
      setProductFeatureFlagsReady(false);
      return () => {
        current = false;
      };
    }

    setProductFeatureFlagsReady(false);
    void fetchProductFeatureFlags()
      .then(flags => {
        if (current) setProductFeatureFlags(flags);
      })
      .catch(error => {
        console.warn('Product feature flags are unavailable; optional features stay disabled.', error);
        if (current) setProductFeatureFlags({});
      })
      .finally(() => {
        if (current) setProductFeatureFlagsReady(true);
      });

    return () => {
      current = false;
    };
  }, [authStatus]);

  useEffect(() => {
    if (
      !productFeatureFlagsReady ||
      authStatus !== 'authenticated' ||
      !user?.id ||
      !privateLobbyPrizesEnabled
    ) {
      lobbyPrizeMetadataRequestRef.current += 1;
      lobbyPrizeEnrichmentKeyRef.current = '';
      setLobbyPrizeLoadError('');
      return;
    }

    const lobbyIds = lobbies.map(lobby => lobby.id).sort();
    if (lobbyIds.length === 0) {
      setLobbyPrizeLoadError('');
      return;
    }

    const enrichmentKey = `${user.id}:${lobbyIds.join(',')}`;
    if (lobbyPrizeEnrichmentKeyRef.current === enrichmentKey) return;

    const requestId = lobbyPrizeMetadataRequestRef.current + 1;
    lobbyPrizeMetadataRequestRef.current = requestId;
    lobbyPrizeEnrichmentKeyRef.current = enrichmentKey;
    setLobbyPrizeLoadError('');

    void fetchLobbyPrizeMetadata(lobbyIds)
      .then(metadata => {
        if (lobbyPrizeMetadataRequestRef.current !== requestId) return;
        setLobbies(previous => mergeLobbyPrizeMetadata(previous, metadata));
      })
      .catch(prizeError => {
        if (lobbyPrizeMetadataRequestRef.current !== requestId) return;
        lobbyPrizeEnrichmentKeyRef.current = '';
        console.error('Optional lobby prize metadata could not be loaded.', prizeError);
        setLobbyPrizeLoadError(
          prizeError instanceof LobbyPrizeSchemaUnavailableError
            ? translate(languageRef.current, "app.lobbyPrizesAreNotAvailableYetYourLobbiesAre")
            : translate(languageRef.current, "app.unableToLoadLobbyPrizesYourLobbiesRemainAvailable")
        );
      });
  }, [
    authStatus,
    lobbies,
    privateLobbyPrizesEnabled,
    productFeatureFlagsReady,
    user?.id
  ]);

  const loadOfficialProductContext = useCallback(async () => {
    const onboardingEnabled = isProductFeatureEnabled(
      productFeatureFlags,
      'onboarding_first_tip_enabled'
    );
    const officialEventsEnabled = isProductFeatureEnabled(
      productFeatureFlags,
      'official_events_enabled'
    );

    if (
      authStatus !== 'authenticated' ||
      !user?.id ||
      (!onboardingEnabled && !officialEventsEnabled)
    ) {
      officialProductRequestRef.current += 1;
      setOnboardingState(null);
      setOfficialEventCard(null);
      setOfficialProductLoading(false);
      setOfficialProductError('');
      return null;
    }

    const requestId = officialProductRequestRef.current + 1;
    officialProductRequestRef.current = requestId;
    setOfficialProductLoading(true);
    setOfficialProductError('');

    try {
      const [nextOnboardingState, nextEventCard] = await Promise.all([
        onboardingEnabled ? fetchMyOnboardingState() : Promise.resolve(null),
        officialEventsEnabled ? fetchOfficialEventHomeCard() : Promise.resolve(null)
      ]);
      if (officialProductRequestRef.current !== requestId) return null;
      setOnboardingState(nextOnboardingState);
      setOfficialEventCard(nextEventCard);
      return nextEventCard;
    } catch (contextError: any) {
      if (officialProductRequestRef.current !== requestId) return null;
      setOfficialProductError(
        contextError?.message || translate(languageRef.current, "app.unableToLoadTheOfficialEvent")
      );
      setOfficialEventCard(null);
      return null;
    } finally {
      if (officialProductRequestRef.current === requestId) {
        setOfficialProductLoading(false);
      }
    }
  }, [authStatus, productFeatureFlags, user?.id]);

  useEffect(() => {
    void loadOfficialProductContext();
  }, [loadOfficialProductContext]);

  useEffect(() => {
    if (
      authStatus !== 'authenticated'
      || !officialEventSlugInput
      || !isProductFeatureEnabled(productFeatureFlags, 'official_events_enabled')
    ) return;

    const requestId = officialEventDeepLinkRequestRef.current + 1;
    officialEventDeepLinkRequestRef.current = requestId;
    setOfficialProductLoading(true);
    void resolveOfficialEventSlug(officialEventSlugInput)
      .then(eventId => {
        if (officialEventDeepLinkRequestRef.current !== requestId) return;
        if (eventId) setActiveOfficialEventId(eventId);
        else setOfficialProductError(translate(languageRef.current, "app.thisOfficialTournamentIsUnavailable"));
      })
      .catch(eventError => {
        if (officialEventDeepLinkRequestRef.current !== requestId) return;
        setOfficialProductError(eventError?.message || translate(languageRef.current, "app.unableToLoadTheOfficialTournament"));
      })
      .finally(() => {
        if (officialEventDeepLinkRequestRef.current === requestId) {
          setOfficialProductLoading(false);
        }
      });
  }, [authStatus, officialEventSlugInput, productFeatureFlags]);

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

  const t = getMessages(lang);

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
    { id: 'untipped', label: translate(lang, "app.missing") },
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
    const mmaStats = Object.fromEntries(homeDashboardSummaries
      .filter(row => row.lobby_id === activeLobbyId && isMmaTournament(row.tournament_id))
      .map(row => [row.tournament_id, {
        total: row.total_match_count ?? 0, scheduled: (row.total_match_count ?? 0) - (row.settled_match_count ?? 0),
        finished: row.settled_match_count ?? 0, unresolved: (row.total_match_count ?? 0) - (row.settled_match_count ?? 0),
        isCompleted: row.is_completed, championName: null, championShortName: null, championFlag: null,
        nextStart: row.is_completed ? null : row.event_starts_at ?? null,
        nextMatchLabel: translate(lang, "app.firstBellMma"),
      }]));
    const defaultTournamentId = activeTournamentId
      || activeLobby?.tournaments?.find(tournament => tournament.status === 'active')?.tournament_id
      || activeLobby?.tournament_id;

    if (!defaultTournamentId || isMmaTournament(defaultTournamentId)) return mmaStats;

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
      ...mmaStats,
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
  }, [activeLobby, activeLobbyId, activeTournamentId, matches, teams, homeDashboardSummaries, lang]);
  const activeTournamentIsCompleted = Boolean(
    activeTournamentId && tournamentStats[activeTournamentId]?.isCompleted
  );

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
    criticalLoadRequestRef.current += 1;
    deferredLoadRequestRef.current += 1;
    homeDashboardRequestRef.current += 1;
    lobbyMetadataRequestRef.current += 1;
    lobbyPrizeMetadataRequestRef.current += 1;
    officialEventDeepLinkRequestRef.current += 1;
    lobbyNavigationRequestRef.current += 1;
    lobbyMutationInFlightRef.current = false;
    authenticatedUserIdRef.current = null;
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('activeLobbyId');
    sessionStorage.removeItem('activeTournamentId');
    setMatches([]);
    setTeams([]);
    setLeaderboard([]);
    setAllPredictions([]);
    setLobbies([]);
    setHomeDashboardSummaries([]);
    setHomeMembershipItems([]);
    setProductFeatureFlags({});
    setOnboardingState(null);
    setOfficialEventCard(null);
    setActiveOfficialEventId(null);
    setOfficialProductLoading(false);
    setOfficialProductError('');
    officialProductRequestRef.current += 1;
    setHomeDashboardError('');
    setHomeMembershipError('');
    setHomeDashboardLoading(false);
    setHomeMembershipLoading(false);
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

  // Clerk establishes identity; the RPC returns the separate internal player UUID.
  useEffect(() => {
    if (!clerkSession.ready) return;
    if (!clerkSession.signedIn || !clerkSession.subject) {
      clearAuthenticatedState();
      setAuthStatus('signed_out');
      return;
    }
    if (authenticatedUserIdRef.current === clerkSession.subject) return;

    let active = true;
    const requestId = ++authSyncRequestRef.current;
    setAuthStatus('initializing');
    setError('');
    void bootstrapMyAccount(languageRef.current).then(async profile => {
      const profileLocale = normalizeLocale(profile.locale);
      if (!profile.needs_profile_completion) await loadLocaleResources(profileLocale);
      if (!active || requestId !== authSyncRequestRef.current) return;
      authenticatedUserIdRef.current = clerkSession.subject;
      setUser(profile);
      // An unfinished profile keeps the visitor's chosen language for onboarding.
      if (!profile.needs_profile_completion) await setLang(profileLocale);
      if (!active || requestId !== authSyncRequestRef.current) return;
      setAuthStatus(profile.needs_profile_completion ? 'profile_onboarding' : 'authenticated');
    }).catch((failure: unknown) => {
      if (!active || requestId !== authSyncRequestRef.current) return;
      authenticatedUserIdRef.current = null;
      setUser(null);
      setError(failure instanceof Error ? failure.message : translate(languageRef.current, "app.unableToLoadYourAccount"));
      setAuthStatus('auth_error');
      setLoading(false);
    });
    return () => { active = false; };
  }, [clerkSession.ready, clerkSession.signedIn, clerkSession.subject, authRetry, clearAuthenticatedState]);

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

  const replaceLobbyCollection = useCallback((nextLobbies: Lobby[]) => {
    setLobbies(previous => preserveLobbyPrizeMetadata(previous, nextLobbies));
  }, []);

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
      replaceLobbyCollection(res.lobbies);
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
      setError(e?.message || translate(lang, "app.unableToRefreshTheData"));
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
      replaceLobbyCollection(critical.lobbies);
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
        setDeferredError(e?.message || translate(lang, "app.unableToLoadStandingsAndStatistics"));
      } finally {
        if (deferredLoadRequestRef.current === deferredRequestId) {
          setDeferredLoading(false);
        }
      }
    } catch (e: any) {
      if (criticalLoadRequestRef.current !== criticalRequestId) return;
      console.error("critical data load error:", e);
      setError(e?.message || translate(lang, "app.unableToRefreshTheData"));
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
    if (updates.member_count !== undefined && updates.member_count !== null) {
      setHomeDashboardSummaries(prev => prev.map(summary => (
        summary.lobby_id === lobbyId
          ? { ...summary, member_count: updates.member_count as number }
          : summary
      )));
    }
  };

  const refreshLobbyMetadata = useCallback(async () => {
    if (!user) return;
    const requestId = ++lobbyMetadataRequestRef.current;
    const nextLobbies = await fetchUserLobbies(user.id);
    if (requestId !== lobbyMetadataRequestRef.current) return;
    replaceLobbyCollection(nextLobbies);
  }, [replaceLobbyCollection, user]);

  const loadHomeDashboard = useCallback(async ({
    refreshLobbyCollection = false
  }: {
    refreshLobbyCollection?: boolean
  } = {}) => {
    if (!user) return;

    const requestId = homeDashboardRequestRef.current + 1;
    homeDashboardRequestRef.current = requestId;
    setHomeDashboardLoading(true);
    setHomeDashboardError('');
    setHomeMembershipLoading(true);
    setHomeMembershipError('');

    const [dashboardResult, membershipResult, lobbyCollectionResult] = await Promise.allSettled([
      fetchHomeDashboard(user.id, lobbies),
      fetchHomeMembershipState(),
      refreshLobbyCollection
        ? fetchUserLobbies(user.id)
        : Promise.resolve<Lobby[] | null>(null)
    ]);

    if (homeDashboardRequestRef.current !== requestId) return;

    if (dashboardResult.status === 'fulfilled') {
      setHomeDashboardSummaries(dashboardResult.value.summaries);
    } else {
      console.error('home dashboard load error:', dashboardResult.reason);
      setHomeDashboardError(dashboardResult.reason?.message || translate(languageRef.current, "app.unableToLoadPendingPredictions"));
    }

    if (membershipResult.status === 'fulfilled') {
      setHomeMembershipItems(membershipResult.value);
      const hasNewlyApprovedLobby = membershipResult.value.some(item => (
        item.item_type === 'join_request' &&
        item.request_status === 'approved' &&
        !lobbies.some(lobby => lobby.id === item.lobby_id)
      ));

      if (hasNewlyApprovedLobby && !refreshLobbyCollection) {
        try {
          const refreshedLobbies = await fetchUserLobbies(user.id);
          if (homeDashboardRequestRef.current === requestId) {
            replaceLobbyCollection(refreshedLobbies);
          }
        } catch (refreshError) {
          console.error('approved lobby refresh error:', refreshError);
        }
      }
    } else {
      console.error('membership dashboard load error:', membershipResult.reason);
      setHomeMembershipError(membershipResult.reason?.message || translate(languageRef.current, "app.unableToLoadMembershipStatus"));
    }

    if (lobbyCollectionResult.status === 'fulfilled') {
      if (lobbyCollectionResult.value) {
        skipNextHomeLoadAfterLobbyRefreshRef.current = true;
        replaceLobbyCollection(lobbyCollectionResult.value);
      }
    } else {
      console.error('lobby collection refresh error:', lobbyCollectionResult.reason);
      setHomeDashboardError(currentError => (
        currentError || translate(languageRef.current, "app.unableToRefreshYourLobbies")
      ));
    }

    if (homeDashboardRequestRef.current === requestId) {
      setHomeDashboardLoading(false);
      setHomeMembershipLoading(false);
    }
  }, [user, lobbies, replaceLobbyCollection]);

  const refreshHomeAfterMembershipMutation = useCallback(async () => {
    if (!shouldRefreshHomeMembership({
      trigger: 'local-mutation',
      hasAuthenticatedUser: Boolean(user),
      loading,
      refreshing: homeDashboardLoading || homeMembershipLoading,
      activeLobbyId,
      activeTab: tab,
      visibilityState: document.visibilityState
    })) return;

    await loadHomeDashboard({ refreshLobbyCollection: true });
  }, [
    activeLobbyId,
    homeDashboardLoading,
    homeMembershipLoading,
    loadHomeDashboard,
    loading,
    tab,
    user
  ]);

  const runGuardedHomeRefresh = useCallback(() => {
    if (homeExternalRefreshInFlightRef.current) return;

    homeExternalRefreshInFlightRef.current = true;
    void loadHomeDashboard({ refreshLobbyCollection: true }).finally(() => {
      homeExternalRefreshInFlightRef.current = false;
    });
  }, [loadHomeDashboard]);

  useEffect(() => {
    if (!user || loading) return;
    if (activeLobbyId) {
      homeDashboardRequestRef.current += 1;
      setHomeDashboardLoading(false);
      setHomeMembershipLoading(false);
      return;
    }
    if (skipNextHomeLoadAfterLobbyRefreshRef.current) {
      skipNextHomeLoadAfterLobbyRefreshRef.current = false;
      return;
    }
    void loadHomeDashboard();
  }, [user, loading, activeLobbyId, loadHomeDashboard]);

  useEffect(() => {
    const refreshVisibleHome = (trigger: 'focus' | 'visibility') => {
      if (!shouldRefreshHomeMembership({
        trigger,
        hasAuthenticatedUser: Boolean(user),
        loading,
        refreshing: homeDashboardLoading || homeMembershipLoading,
        activeLobbyId,
        activeTab: tab,
        visibilityState: document.visibilityState
      })) return;
      runGuardedHomeRefresh();
    };

    const handleFocus = () => refreshVisibleHome('focus');
    const handleVisibilityChange = () => refreshVisibleHome('visibility');

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    activeLobbyId,
    homeDashboardLoading,
    homeMembershipLoading,
    loadHomeDashboard,
    loading,
    runGuardedHomeRefresh,
    tab,
    user
  ]);

  const returnFromProfile = () => {
    const refreshHome = shouldRefreshHomeMembership({
      trigger: 'home-return',
      hasAuthenticatedUser: Boolean(user),
      loading,
      refreshing: homeDashboardLoading || homeMembershipLoading,
      activeLobbyId,
      activeTab: 'matches',
      visibilityState: document.visibilityState
    });

    setTab('matches');
    if (refreshHome) runGuardedHomeRefresh();
  };

  const goHome = () => {
    lobbyNavigationRequestRef.current += 1;
    lobbyMutationInFlightRef.current = false;
    setIsLobbyMutationSubmitting(false);
    setPendingLobbyNavigation(null);
    setHomeDashboardLoading(true);
    setHomeDashboardError('');
    setHomeMembershipLoading(true);
    setHomeMembershipError('');
    setEntryOrigin('normal-tournament-navigation');
    setMatchFilter('all');
    setActiveTournamentId(null);
    setActiveLobbyId(null);
    setTab('matches');
    window.scrollTo({ top: 0 });
  };

  const handleMembershipEnded = (lobbyId: string) => {
    setLobbies(prev => prev.filter(lobby => lobby.id !== lobbyId));
    setHomeDashboardSummaries(prev => prev.filter(summary => summary.lobby_id !== lobbyId));
    setHomeMembershipItems(prev => prev.filter(item => item.lobby_id !== lobbyId));
    if (activeLobbyId === lobbyId) {
      goHome();
    }
  };

  const handleCancelHomeJoinRequest = async (requestId: string) => {
    await cancelLobbyJoinRequest(requestId);
    setHomeMembershipItems(prev => prev.filter(item => item.request_id !== requestId));
    await refreshHomeAfterMembershipMutation();
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

  const openHomeContext = (
    summary: Pick<HomeDashboardSummary, 'lobby_id' | 'lobby_name' | 'tournament_id'>,
    showOnlyMissing: boolean,
    destination: 'matches' | 'results' = 'matches'
  ) => {
    lobbyNavigationRequestRef.current += 1;
    lobbyMutationInFlightRef.current = false;
    setIsLobbyMutationSubmitting(false);
    setPendingLobbyNavigation(null);
    setEntryOrigin('direct-home-action');
    setActiveLobbyId(summary.lobby_id);
    setActiveLobbyName(summary.lobby_name);
    setActiveTournamentId(summary.tournament_id);
    setMatchFilter(showOnlyMissing ? 'untipped' : 'all');
    setTab(destination);
    window.scrollTo({ top: 0 });
  };

  const publicEntry = usePublicPlay({
    enabled: !getInviteCodeFromLocation(window.location.pathname, window.location.search) && !officialEventSlugInput,
    authenticated: authStatus === 'authenticated' && Boolean(user),
    subject: clerkSession.subject || null,
    onJoined: (participation, competition) => {
      // This navigation selects both IDs atomically; don't clear its tournament
      // in the older lobby-only selection effect.
      previousActiveLobbyIdRef.current = participation.lobby_id;
      openHomeContext({
        lobby_id: participation.lobby_id,
        lobby_name: competition.name,
        tournament_id: participation.tournament_id,
      }, true, competition.status === 'closed' ? 'results' : 'matches');
    },
  });

  const clearInviteAddress = () => {
    if (getInviteCodeFromLocation(window.location.pathname, window.location.search)) {
      window.history.replaceState({}, '', '/');
    }
  };

  const persistOnboardingState = async (
    status: OnboardingState['status'],
    completionPath: OnboardingState['completion_path'] = null
  ) => {
    if (!isProductFeatureEnabled(productFeatureFlags, 'onboarding_first_tip_enabled')) {
      return null;
    }
    const nextState = await updateMyOnboardingState({
      version: onboardingState?.onboarding_version || 1,
      status,
      variantKey: onboardingState?.variant_key || 'control',
      completionPath
    });
    setOnboardingState(nextState);
    return nextState;
  };

  const completeOnboardingAfterLobbyPath = async (
    path: 'invite' | 'own_lobby'
  ) => {
    if (onboardingState?.status === 'completed') return;
    try {
      await persistOnboardingState('completed', path);
    } catch (onboardingError) {
      console.warn('Lobby succeeded but onboarding completion could not be recorded.', onboardingError);
    }
  };

  const handleOnboardingSkip = async () => {
    setOfficialProductLoading(true);
    setOfficialProductError('');
    try {
      await persistOnboardingState('skipped');
    } catch (onboardingError: any) {
      setOfficialProductError(onboardingError?.message || translate(lang, "app.unableToSkipOnboarding"));
    } finally {
      setOfficialProductLoading(false);
    }
  };

  const handleOnboardingLobbyChoice = async (mode: 'join' | 'create') => {
    setOfficialProductLoading(true);
    setOfficialProductError('');
    try {
      await persistOnboardingState('skipped');
      setLobbyFormActive(mode);
      setLobbyError('');
      setLobbySuccess('');
      window.scrollTo({ top: 0 });
    } catch (onboardingError: any) {
      setOfficialProductError(onboardingError?.message || translate(lang, "app.unableToFinishOnboarding"));
    } finally {
      setOfficialProductLoading(false);
    }
  };

  const handleOpenOfficialEvent = async (event: OfficialEventCard) => {
    if (officialProductLoading) return;
    setOfficialProductError('');
    setActiveOfficialEventId(event.event_id);
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
      const hydratedLobby = {
        ...result.hydratedLobby,
        ...(result.targetLobby.prizes_enabled !== undefined
          ? { prizes_enabled: result.targetLobby.prizes_enabled }
          : {}),
        ...(result.targetLobby.prize_entries !== undefined
          ? { prize_entries: result.targetLobby.prize_entries }
          : {})
      };
      setMatches(data.matches);
      setTeams(data.teams);
      setLeaderboard(data.leaderboard);
      setAllPredictions(data.allPredictions);
      replaceLobbyCollection(data.lobbies.map(lobby => (
        lobby.id === hydratedLobby.id ? hydratedLobby : lobby
      )));
      setLoadedDataContext({
        lobbyId: hydratedLobby.id,
        tournamentId: null
      });
      syncUserFromLeaderboard(data.leaderboard);

      skipNextInitialDataLoadRef.current = true;
      setEntryOrigin('lobby-detail');
      setActiveTournamentId(null);
      setActiveLobbyName(hydratedLobby.name);
      setTab('matches');
      setActiveLobbyId(hydratedLobby.id);
      setPendingLobbyNavigation(null);
      setLobbyFormActive('none');
      if (action === 'create') {
        setLobbySuccess(translate(lang, 'lobby.created', { name: hydratedLobby.name, code: hydratedLobby.join_code }));
        setNewLobbyName('');
        setNewLobbyShortDescription('');
        setNewLobbyLongDescription('');
        setNewLobbyJoinPolicy('open');
        setNewLobbyPrizesEnabled(false);
        setNewLobbyPrizeEntries([
          { position: 1, label: '' },
          { position: 2, label: '' },
          { position: 3, label: '' }
        ]);
      } else {
        setLobbySuccess(translate(lang, 'lobby.joined', { name: hydratedLobby.name }));
        setJoinCodeInput('');
        clearInviteAddress();
      }
      await completeOnboardingAfterLobbyPath(action === 'create' ? 'own_lobby' : 'invite');
      window.scrollTo({ top: 0 });
      return hydratedLobby;
    } catch (navigationError: any) {
      if (lobbyNavigationRequestRef.current !== requestId) return null;

      if (action === 'join' && navigationError instanceof LobbyJoinPendingError) {
        setPendingLobbyNavigation(null);
        setLobbyFormActive('none');
        setJoinCodeInput('');
        clearInviteAddress();
        setLobbySuccess(translate(lang, 'lobby.requestPending', { name: navigationError.lobbyName }));
        setHomeMembershipLoading(true);
        void loadHomeDashboard({ refreshLobbyCollection: true });
        await completeOnboardingAfterLobbyPath('invite');
        return null;
      }

      const message = navigationError?.message || (
        action === 'create'
          ? translate(lang, "app.unableToCreateTheLobby")
          : translate(lang, "app.unableToJoinTheLobby")
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

  const handleCompleteProfileOnboarding = async (displayName: string) => {
    const profile = await completeMyProfile(displayName, avatarData.emoji, avatarData.bg, lang);
    if (profile.needs_profile_completion) throw new Error(translate(lang, "app.pleaseFinishYourProfile"));
    setUser(profile);
    setError('');
    setAuthStatus('authenticated');
  };

  const handleSaveProfileName = async (displayName: string) => {
    if (!user) return;
    const profile = await completeMyProfile(displayName, user.avatar_emoji || '😀', user.avatar_bg || '#fee2e2', lang);
    setUser(previous => previous ? { ...previous, ...profile } : previous);
    setLeaderboard(previous => previous.map(player => player.id === profile.id ? { ...player, username: profile.username } : player));
  };

  const handleChangeLanguage = async (nextLanguage: Locale) => {
    if (!user) return;
    await loadLocaleResources(nextLanguage);
    const profile = await completeMyProfile(user.display_name || user.username, user.avatar_emoji || '😀', user.avatar_bg || '#fee2e2', nextLanguage);
    setUser(previous => previous ? { ...previous, ...profile } : previous);
    await setLang(nextLanguage);
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutError('');

    try {
      await clerkSession.logout();
      publicEntry.clearPending();
      clearAuthenticatedState();
      setAuthStatus('signed_out');
    } catch (logoutFailure: any) {
      setLogoutError(
        logoutFailure?.message ||
        (translate(lang, "app.logoutFailedPleaseTryAgain"))
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
      alert(translate(lang, 'admin.resultSaved', { count: `${result.updated_predictions_count}/${result.expected_predictions_count}` }));
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
        translate(lang, 'admin.confirmChampion', { name: champion?.name || preview.selected_champion?.name || teamId }) + '\n\n' +
        translate(lang, 'admin.totalPicks', { count: summary.longterm_predictions ?? 0 }) + '\n' +
        translate(lang, 'admin.tenPoints', { count: summary.users_receiving_10 ?? 0 }) + '\n' +
        translate(lang, 'admin.zeroPoints', { count: summary.users_receiving_0 ?? 0 }) + '\n' +
        translate(lang, 'admin.changedRows', { count: summary.rows_that_would_change ?? 0 })
      );

      if (!confirmed) return;

      const result = await setWinnerDB(teamId, tournamentId, { confirm: true });
      await fetchAll();
      setChampionMsg(
        translate(lang, 'admin.championConfirmed', { name: result.selected_champion?.name || champion?.name || teamId }) + ' ' +
        translate(lang, 'admin.championAwarded', { count: result.summary?.users_receiving_10 ?? 0 })
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

  const handleSaveAvatar = async (nextEmoji = avatarData.emoji, nextBg = avatarData.bg) => {
    if (!user) return;
    setAvatarMsg('');
    setAvatarError('');

    try {
      const profile = await completeMyProfile(user.display_name || user.username, nextEmoji, nextBg, lang);
      const updatedUser = { ...user, ...profile };
      setUser(updatedUser);
      setAvatarData({ emoji: nextEmoji, bg: nextBg });
      setAvatarMsg(translate(lang, "app.avatarSaved"));
      setLeaderboard(prev => prev.map(player => (
        player.id === user.id
          ? { ...player, avatar_emoji: nextEmoji, avatar_bg: nextBg }
          : player
      )));
    } catch (err: any) {
      setAvatarError(err.message || (translate(lang, "app.couldNotSaveAvatar")));
    }
  };

  const leaderboardWithStreaks = useMemo(() => {
    const isHockey = isHockeyTournament(activeTournamentId, tournamentCatalog.find(t => t.id === activeTournamentId)?.sport_id);

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
  const showFirstTipOnboarding = shouldShowFirstTipOnboarding({
    enabled: isProductFeatureEnabled(productFeatureFlags, 'onboarding_first_tip_enabled'),
    hasInvite: Boolean(joinCodeInput || officialEventSlugInput),
    lobbies,
    state: onboardingState
  });

  if (publicEntry.route && (authStatus === 'authenticated' || !publicEntry.authRequested && !clerkSession.signedIn)) {
    return <PublicPlayScreen
      lang={lang} competitions={publicEntry.competitions} selectedSlug={publicEntry.route.slug}
      loading={publicEntry.loading} loadFailed={publicEntry.loadFailed}
      joinFailed={publicEntry.joinFailed} joining={publicEntry.joining}
      signedIn={authStatus === 'authenticated'} onStart={publicEntry.start}
      onSelect={publicEntry.navigate} onRetry={publicEntry.retry}
      onHome={() => { publicEntry.leave(); if (user) goHome(); }}
      onLanguageChange={authStatus === 'authenticated' ? handleChangeLanguage : setLang}
    />;
  }

  if (authStatus !== 'authenticated' || !user) {
    return (
      <AuthScreen
        status={authStatus}
        lang={lang}
        username={user?.display_name || ''}
        error={error || logoutError}
        invitePending={Boolean(joinCodeInput || officialEventSlugInput)}
        continuationLabel={publicEntry.route?.slug ? translate(lang, 'publicPlay.continue', {
          competition: publicEntry.competitions.find(item => item.slug === publicEntry.route?.slug)?.name || publicEntry.route.slug,
        }) : undefined}
        onBack={publicEntry.route ? publicEntry.cancelAuthentication : undefined}
        signedIn={clerkSession.signedIn}
        busy={isLoggingOut}
        onRetry={() => setAuthRetry(previous => previous + 1)}
        onLogout={handleLogout}
        onLanguageChange={setLang}
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

  const isOnboardingContextPending = Boolean(
    lobbies.length === 0
    && !joinCodeInput
    && (
      !productFeatureFlagsReady
      || (
        isProductFeatureEnabled(productFeatureFlags, 'onboarding_first_tip_enabled')
        && onboardingState === null
      )
    )
  );

  if (isOnboardingContextPending) {
    return (
      <AuthenticatedAppSkeleton
        t={t}
        error={officialProductError}
        onRetry={() => void loadOfficialProductContext()}
      />
    );
  }

  if (showFirstTipOnboarding) {
    return (
      <FirstTipOnboarding
        event={officialEventCard}
        busy={officialProductLoading}
        error={officialProductError}
        onStart={async () => {
          setOfficialProductLoading(true);
          setOfficialProductError('');
          try {
            await persistOnboardingState('started');
          } catch (onboardingError: any) {
            setOfficialProductError(
              onboardingError?.message || translate(lang, "app.unableToStartOnboarding")
            );
            throw onboardingError;
          } finally {
            setOfficialProductLoading(false);
          }
        }}
        onSkip={handleOnboardingSkip}
        onInvite={() => handleOnboardingLobbyChoice('join')}
        onCreateLobby={() => handleOnboardingLobbyChoice('create')}
        onStartEvent={async eventId => {
          const event = officialEventCard;
          if (!event || event.event_id !== eventId) return;
          await handleOpenOfficialEvent(event);
        }}
      />
    );
  }

  if (activeOfficialEventId) {
    return (
      <Suspense fallback={<AuthenticatedAppSkeleton t={t} error="" onRetry={() => undefined} />}>
        <LazyOfficialEventView
          eventId={activeOfficialEventId}
          onBack={() => {
            setActiveOfficialEventId(null);
            void loadOfficialProductContext();
            window.scrollTo({ top: 0 });
          }}
          onCreateLobby={() => {
            setActiveOfficialEventId(null);
            goHome();
            setLobbyFormActive('create');
          }}
          onFirstPredictionSaved={async () => {
            if (onboardingState?.status === 'completed') return;
            await persistOnboardingState('completed', 'start_event');
          }}
          onJoined={async () => {
            const refreshedEvent = await loadOfficialProductContext();
            if (!shouldShowOfficialEventOnHome(refreshedEvent)) {
              throw new Error(
                translate(lang, "app.youHaveJoinedButHomeCouldNotRefreshPlease")
              );
            }
            setLobbyFormActive('none');
            setActiveOfficialEventId(null);
            goHome();
          }}
          commercialEnabled={isProductFeatureEnabled(productFeatureFlags, 'official_event_commercial_enabled')}
          resultsEnabled={isProductFeatureEnabled(productFeatureFlags, 'official_event_results_enabled')}
          hasOwnedLobby={lobbies.some(lobby => lobby.owner_id === user.id)}
          username={user.username || translate(lang, "app.tipster")}
        />
      </Suspense>
    );
  }

  if (tab === 'profile') {
    return (
      <div className="min-h-screen bg-slate-50 pb-24 max-w-lg mx-auto shadow-2xl transition-colors duration-300 animate-fade-in">
        <header className="bg-white p-6 sticky top-0 z-50 border-b border-slate-100 transition-colors">
          <div className="flex justify-between items-center mr-1">
            <div className="flex items-center gap-3">
              <button
                onClick={returnFromProfile}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors"
                title={translate(lang, "app.back")}
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
              <div>
                <h1 className="text-2xl font-black text-slate-900 leading-none tracking-tighter italic uppercase transition-colors">{t.profile}</h1>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  {translate(lang, "app.globalAccount")}
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
                accountEmail={clerkSession.email}
                onManageAccount={clerkSession.manageAccount}
                onSaveProfileName={handleSaveProfileName}
                currentUserStats={currentUserStats}
                currentUserRank={currentUserRank}
                currentUserLeaderGap={currentUserLeaderGap}
                logoutError={logoutError}
                isLoggingOut={isLoggingOut}
                avatarData={avatarData}
                showAvatarEditor={showAvatarEditor}
                setShowAvatarEditor={setShowAvatarEditor}
                avatarMsg={avatarMsg}
                avatarError={avatarError}
                onSaveAvatar={handleSaveAvatar}
                onLogout={handleLogout}
                onChangeLanguage={handleChangeLanguage}
                UserAvatar={UserAvatar}
                communityEnabled={isProductFeatureEnabled(productFeatureFlags, 'public_profiles_enabled')}
                badgesEnabled={isProductFeatureEnabled(productFeatureFlags, 'badges_enabled')}
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
      ? translate(lang, "app.unableToLoadTheLobbyRetryOrReturnHome")
      : translate(lang, "app.unableToLoadTheTournamentRetryOrReturnHome");

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

  if (activeLobby && activeTournamentId && isMmaTournament(activeTournamentId)) {
    return <Suspense fallback={<AuthenticatedAppSkeleton t={t} error="" onRetry={() => undefined} />}>
      <LazyMmaEventView lobbyId={activeLobby.id} lobbyName={activeLobby.name} tournamentId={activeTournamentId}
        userId={user.id} lang={lang} onBack={() => setActiveTournamentId(null)}
        initialFilter={tab === 'results' ? 'results' : matchFilter === 'untipped' ? 'missing' : 'all'}
        onPredictionSaved={() => void loadHomeDashboard()} />
    </Suspense>;
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
          {publicEntry.competitions.length > 0 ? <div className="px-4 pt-5 sm:px-6">
              <button type="button" onClick={() => { setJoinCodeInput(''); setLobbyFormActive('none'); publicEntry.navigate(null); }}
              className="w-full rounded-2xl border border-[#24618C]/20 bg-[#eaf3fa] p-4 text-left text-sm font-bold text-[#24618C] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#24618C]">
              {translate(lang, 'publicPlay.title')} <span aria-hidden="true">→</span>
            </button>
          </div> : null}
          <HomeDashboard
            lang={lang}
            lobbies={lobbies}
            summaries={homeDashboardSummaries}
            summariesLoading={homeDashboardLoading}
            summariesError={homeDashboardError}
            membershipItems={homeMembershipItems}
            membershipLoading={homeMembershipLoading}
            membershipError={homeMembershipError}
            officialEvents={officialEventCard ? [officialEventCard] : []}
            officialEventBusy={officialProductLoading}
            officialEventsEnabled={isProductFeatureEnabled(
              productFeatureFlags,
              'official_events_enabled'
            )}
            officialEventCommercialEnabled={isProductFeatureEnabled(
              productFeatureFlags,
              'official_event_commercial_enabled'
            )}
            addLobbyMode={lobbyFormActive}
            onRetrySummaries={() => void loadHomeDashboard()}
            onCancelJoinRequest={handleCancelHomeJoinRequest}
            onOpenContext={openHomeContext}
            onOpenLobby={openLobbyDetail}
            onOpenOfficialEvent={event => void handleOpenOfficialEvent(event)}
            onSetAddLobbyMode={mode => {
              setLobbyFormActive(mode);
              setLobbyError('');
              setLobbySuccess('');
            }}
          />
          <div className="px-4 pb-6 sm:px-6">
            {lobbyPrizeLoadError && (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] font-semibold leading-relaxed text-amber-900"
              >
                {lobbyPrizeLoadError}
              </p>
            )}
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
                      setLobbyError(translate(lang, "app.enterALobbyName"));
                      return;
                    }
                    if (!tournamentCatalog.some(item => item.id === newLobbyTournament)) {
                      setLobbyError(translate(lang, "app.selectAnAvailableCompetition"));
                      return;
                    }
                    let prizeSelection: {
                      enabled: boolean;
                      entries: LobbyPrizeEntry[];
                    } | undefined;
                    if (privateLobbyPrizesEnabled) {
                      try {
                        prizeSelection = prepareLobbyPrizeSelection({
                          enabled: newLobbyPrizesEnabled,
                          entries: newLobbyPrizeEntries
                        });
                      } catch (prizeError: any) {
                        setLobbyError(prizeError?.message || translate(lang, "app.checkThePrizeSettings"));
                        return;
                      }
                    }
                    await navigateAfterLobbyMutation(
                      'create',
                      () => createLobby(
                        newLobbyName.trim(),
                        newLobbyTournament,
                        'public',
                        newLobbyShortDescription,
                        newLobbyLongDescription,
                        newLobbyJoinPolicy,
                        prizeSelection
                      )
                    );
                  }} className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-wider">{translate(lang, "app.createALobby")}</h4>
                    <div>
                      <label className="block text-[9px] text-slate-400 font-bold uppercase mb-1">{translate(lang, "app.lobbyName")}</label>
                      <input 
                        type="text" required value={newLobbyName} onChange={e => setNewLobbyName(e.target.value)}
                        disabled={isLobbyMutationSubmitting}
                        className="w-full p-2.5 bg-slate-50 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-red-600 font-semibold"
                        placeholder={translate(lang, "app.forExampleWorkFriends")}
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-slate-400 font-bold uppercase mb-1">{translate(lang, "app.aboutThisLobby")}</label>
                      <input 
                        type="text"
                        value={newLobbyShortDescription}
                        onChange={e => setNewLobbyShortDescription(e.target.value)}
                        disabled={isLobbyMutationSubmitting}
                        className="w-full p-2.5 bg-slate-50 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-red-600 font-semibold"
                        placeholder={translate(lang, "app.whoIsPlayingTogether")}
                        maxLength={120}
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-slate-400 font-bold uppercase mb-1">{translate(lang, "app.lobbyInformation")}</label>
                      <textarea
                        value={newLobbyLongDescription}
                        onChange={e => setNewLobbyLongDescription(e.target.value)}
                        disabled={isLobbyMutationSubmitting}
                        className="w-full min-h-[88px] p-2.5 bg-slate-50 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-red-600 font-medium resize-y"
                        placeholder={translate(lang, "app.optionalInformationForLobbyMembers")}
                      />
                    </div>
                    <TournamentSetup catalog={tournamentCatalog} value={newLobbyTournament} onChange={setNewLobbyTournament}
                      disabled={isLobbyMutationSubmitting} lang={lang} error={catalogError} />
                    <fieldset disabled={isLobbyMutationSubmitting}>
                      <legend className="block text-[9px] text-slate-400 font-bold uppercase mb-1">{translate(lang, "app.joiningPolicy")}</legend>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <label className={`rounded-xl border p-3 ${newLobbyJoinPolicy === 'open' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
                          <span className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="join-policy"
                              value="open"
                              checked={newLobbyJoinPolicy === 'open'}
                              onChange={() => setNewLobbyJoinPolicy('open')}
                            />
                            <span className="text-[10px] font-black uppercase text-slate-700">{translate(lang, "app.joinImmediately")}</span>
                          </span>
                          <span className="mt-1 block text-[10px] font-medium leading-relaxed text-slate-500">
                            {translate(lang, "app.anyoneWithTheCodeCanJoinImmediately")}</span>
                        </label>
                        <label className={`rounded-xl border p-3 ${newLobbyJoinPolicy === 'approval_required' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
                          <span className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="join-policy"
                              value="approval_required"
                              checked={newLobbyJoinPolicy === 'approval_required'}
                              onChange={() => setNewLobbyJoinPolicy('approval_required')}
                            />
                            <span className="text-[10px] font-black uppercase text-slate-700">{translate(lang, "lobbyMembersDialog.approvalRequired")}</span>
                          </span>
                          <span className="mt-1 block text-[10px] font-medium leading-relaxed text-slate-500">
                            {translate(lang, "app.theOwnerOrAnAdminMustApproveTheRequest")}</span>
                        </label>
                      </div>
                    </fieldset>
                    {privateLobbyPrizesEnabled && (
                      <fieldset
                        disabled={isLobbyMutationSubmitting}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                      >
                        <legend className="px-1 text-[9px] font-black uppercase tracking-wider text-slate-500">
                          {translate(lang, "app.whatAreWePlayingFor")}</legend>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          {([
                            [false, 'Bez cen'],
                            [true, 'Hrajeme o ceny']
                          ] as const).map(([enabled, label]) => (
                            <label
                              key={label}
                              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 ${
                                newLobbyPrizesEnabled === enabled
                                  ? 'border-red-200 bg-white text-slate-900 shadow-sm'
                                  : 'border-transparent bg-transparent text-slate-500'
                              }`}
                            >
                              <input
                                type="radio"
                                name="lobby-prizes"
                                checked={newLobbyPrizesEnabled === enabled}
                                onChange={() => setNewLobbyPrizesEnabled(enabled)}
                              />
                              <span className="text-[10px] font-black uppercase">{label}</span>
                            </label>
                          ))}
                        </div>

                        {newLobbyPrizesEnabled && (
                          <div className="mt-3 space-y-2">
                            <div className="flex items-center gap-2 text-slate-700">
                              <Gift className="h-4 w-4 text-amber-700" aria-hidden="true" />
                              <p className="text-[10px] font-black uppercase">{translate(lang, "app.prizesByPosition")}</p>
                            </div>
                            {newLobbyPrizeEntries.map((entry, index) => (
                              <label
                                key={entry.position}
                                className="grid grid-cols-[68px_1fr] items-center gap-2"
                              >
                                <span className="text-[10px] font-black text-slate-500">
                                  {translate(lang, 'common.place', { position: index + 1 })}</span>
                                <input
                                  type="text"
                                  value={entry.label}
                                  maxLength={120}
                                  onChange={event => setNewLobbyPrizeEntries(previous => previous.map(
                                    (item, itemIndex) => itemIndex === index
                                      ? { ...item, label: event.target.value }
                                      : item
                                  ))}
                                  className="min-h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                                  placeholder={index === 0 ? translate(lang, "app.forExampleAGiftVoucher") : translate(lang, "app.optional")}
                                />
                              </label>
                            ))}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                aria-label={translate(lang, "app.addAnotherPrize")}
                                disabled={newLobbyPrizeEntries.length >= MAX_LOBBY_PRIZES}
                                onClick={() => setNewLobbyPrizeEntries(previous => [
                                  ...previous,
                                  { position: previous.length + 1, label: '' }
                                ])}
                                className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[9px] font-black uppercase text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-40"
                              >
                                <Plus className="h-4 w-4" aria-hidden="true" />
                                {translate(lang, "app.addAnotherPrize")}</button>
                              <button
                                type="button"
                                aria-label={translate(lang, "app.removeLastPrize")}
                                disabled={newLobbyPrizeEntries.length <= 1}
                                onClick={() => setNewLobbyPrizeEntries(previous => previous.slice(0, -1))}
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-40"
                              >
                                <Minus className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </div>
                            <p className="text-[9px] font-medium leading-relaxed text-slate-500">
                              {translate(lang, "app.prizesAreProvidedByTheLobbyOrganizerFanPredictor")}</p>
                          </div>
                        )}
                      </fieldset>
                    )}
                    <button
                      type="submit"
                      disabled={isLobbyMutationSubmitting}
                      className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-wait text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-colors active:scale-95 transition-transform cursor-pointer"
                    >
                      {isLobbyMutationSubmitting ? translate(lang, "app.creatingLobby") : translate(lang, "app.createLobby")}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    setLobbyError(""); setLobbySuccess("");
                    if (lobbyMutationInFlightRef.current) return;
                    if (!joinCodeInput.trim()) {
                      setLobbyError(translate(lang, "app.enterAnInvitationCode"));
                      return;
                    }
                    await navigateAfterLobbyMutation(
                      'join',
                      () => joinLobbyByCode(joinCodeInput.trim())
                    );
                  }} className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-wider font-semibold">{translate(lang, "app.joinALobby")}</h4>
                    <div>
                      <label className="block text-[9px] text-slate-400 font-bold uppercase mb-1">{translate(lang, "app.invitationCode")}</label>
                      <input 
                        type="text" required value={joinCodeInput} onChange={e => setJoinCodeInput(e.target.value)}
                        disabled={isLobbyMutationSubmitting}
                        className="w-full p-2.5 bg-slate-50 text-xs rounded-xl border border-slate-200 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-red-600 uppercase"
                        placeholder={translate(lang, "app.eG9ye6gwmr")}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isLobbyMutationSubmitting}
                      className="w-full py-2.5 bg-fan-primary hover:bg-fan-primary-hover disabled:bg-slate-200 disabled:cursor-wait text-fan-snow text-[10px] font-black uppercase tracking-wider rounded-xl transition-colors active:scale-95 transition-transform cursor-pointer"
                    >
                      {isLobbyMutationSubmitting ? translate(lang, "officialEventView.joining") : translate(lang, "app.join")}
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
                title={translate(lang, "app.backToLobby")}
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
            ) : activeLobbyId ? (
              <button 
                onClick={goHome}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors"
                title={translate(lang, "app.backToLobbies")}
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
                tournamentCatalog={tournamentCatalog}
                lobby={activeLobby}
                user={{ ...user, username: user.username || '' }}
                lang={lang as Locale}
                onSelectTournament={id => {
                  setEntryOrigin('lobby-detail');
                  setActiveTournamentId(id);
                  setTab('matches');
                }}
                onRefresh={(updatedLobby) => {
                  if (updatedLobby) {
                    updateLocalLobby(activeLobby.id, updatedLobby);
                  } else {
                    void refreshLobbyMetadata();
                  }
                }}
                onLobbyDeleted={() => {
                  setLobbies(previous => previous.filter(lobby => lobby.id !== activeLobby.id));
                  setHomeDashboardSummaries(previous => previous.filter(summary => summary.lobby_id !== activeLobby.id));
                  setActiveLobbyId(null);
                  setActiveTournamentId(null);
                }}
                onMembershipEnded={handleMembershipEnded}
                onMembershipMutation={refreshHomeAfterMembershipMutation}
                membersCount={activeLobby.member_count ?? (deferredLoading ? undefined : leaderboard.length)}
                tournamentStats={tournamentStats}
                communityProfilesEnabled={isProductFeatureEnabled(productFeatureFlags, 'public_profiles_enabled')}
                shareEnabled={isProductFeatureEnabled(productFeatureFlags, 'share_cards_enabled')}
                tournamentManagementEnabled={isProductFeatureEnabled(productFeatureFlags, 'tournament_management_enabled')}
                privateLobbyPrizesEnabled={isProductFeatureEnabled(productFeatureFlags, 'private_lobby_prizes_enabled')}
                UserAvatar={UserAvatar}
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
                    ? 'bg-fan-primary text-fan-snow shadow-lg shadow-fan-soft'
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
              {scheduledMatchesForView.slice(0, visibleMatchCount).map(m => (
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
                   lang={lang}
                 />
              ))}
              {scheduledMatchesForView.length > visibleMatchCount && (
                <button type="button" onClick={() => setVisibleMatchCount(n => n + 30)} className="mb-5 w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-600">
                  {translate(lang, "app.moreMatches")} ({visibleMatchCount}/{scheduledMatchesForView.length})
                </button>
              )}
              {scheduledMatchesForView.length === 0 && (
                <div className="rounded-3xl border border-slate-100 bg-white px-5 py-10 text-center shadow-sm">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-400">
                    {matchFilter === 'untipped' ? <CheckCircle2 className="h-6 w-6 text-emerald-500" /> : <Calendar className="h-6 w-6" />}
                  </span>
                  <h3 className="mt-4 text-base font-black text-slate-900">
                    {activeTournamentIsCompleted
                      ? (translate(lang, "app.tournamentCompleted"))
                      : matchFilter === 'untipped'
                        ? (translate(lang, "app.allDone"))
                        : t.noUpcoming}
                  </h3>
                  <p className="mx-auto mt-2 max-w-[290px] text-sm font-medium leading-relaxed text-slate-500">
                    {activeTournamentIsCompleted
                      ? (translate(lang, "app.allMatchesHaveResultsSeeHowTheTournamentFinished"))
                      : matchFilter === 'untipped'
                        ? (translate(lang, "app.youHavePredictedEveryOpenMatch"))
                        : (translate(lang, "app.theNextMatchWillAppearHereAsSoonAs"))}
                  </p>
                  {(activeTournamentIsCompleted || matchFilter === 'untipped') && (
                    <button
                      type="button"
                      onClick={() => {
                        if (activeTournamentIsCompleted) {
                          setTab('results');
                        } else {
                          setMatchFilter('all');
                        }
                      }}
                      className="mt-5 min-h-11 rounded-xl bg-slate-900 px-4 text-[10px] font-black uppercase tracking-wider text-white transition-transform duration-150 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none"
                    >
                      {activeTournamentIsCompleted
                        ? (translate(lang, "app.viewResults"))
                        : (translate(lang, "app.viewAllMatches"))}
                    </button>
                  )}
                </div>
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
              {finishedMatchesForView.slice(0, visibleMatchCount).map(m => (
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
                   lang={lang}
                 />
               ))}
              {finishedMatchesForView.length > visibleMatchCount && (
                <button type="button" onClick={() => setVisibleMatchCount(n => n + 30)} className="mb-5 w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-600">
                  {translate(lang, "app.moreResults")} ({visibleMatchCount}/{finishedMatchesForView.length})
                </button>
              )}
               {finishedMatchesForView.length === 0 && (
                <div className="rounded-3xl border border-slate-100 bg-white px-5 py-10 text-center shadow-sm">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-slate-200" />
                  <h3 className="mt-4 text-base font-black text-slate-900">
                    {translate(lang, "app.waitingForTheFirstResult")}
                  </h3>
                  <p className="mx-auto mt-2 max-w-[290px] text-sm font-medium leading-relaxed text-slate-500">{t.noResults}</p>
                </div>
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
                  lobbyId={activeLobbyId || ''}
                  communityProfilesEnabled={isProductFeatureEnabled(productFeatureFlags, 'public_profiles_enabled')}
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
                  lang={lang}
                  operationsEnabled={isProductFeatureEnabled(productFeatureFlags, 'admin_operations_enabled')}
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
        <button onClick={() => setTab('matches')} className={`flex flex-col items-center gap-1 transition-all ${tab === 'matches' ? 'text-fan-primary scale-110' : 'text-slate-400'}`}>
          <Calendar className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">{t.matches}</span>
        </button>
        <button onClick={() => setTab('results')} className={`flex flex-col items-center gap-1 transition-all ${tab === 'results' ? 'text-fan-primary scale-110' : 'text-slate-400'}`}>
          <CheckCircle2 className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">{t.results}</span>
        </button>
        <button onClick={() => setTab('leaderboard')} className={`flex flex-col items-center gap-1 transition-all ${tab === 'leaderboard' ? 'text-fan-primary scale-110' : 'text-slate-400'}`}>
          <TrophyIcon className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">{t.rank}</span>
        </button>
        <button onClick={() => setTab('winner')} className={`flex flex-col items-center gap-1 transition-all ${tab === 'winner' ? 'text-fan-primary scale-110' : 'text-slate-400'}`}>
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
