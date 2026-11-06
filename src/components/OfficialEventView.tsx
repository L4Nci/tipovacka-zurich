import { translate, pluralMessage } from '../i18n/index.ts';
import { useLocale } from '../i18n/LocaleProvider.tsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Gift,
  Minus,
  Plus,
  ShieldCheck,
  Trophy
} from 'lucide-react';
import {
  acceptOfficialEventTermsAndJoin,
  fetchOfficialEventDetail,
  fetchOfficialEventLeaderboard,
  fetchOfficialEventSeasonResult,
  joinOfficialEvent,
  saveOfficialEventPrediction
} from '../lib/officialEvents.ts';
import { getFirstPredictableOfficialEventMatch } from '../lib/officialEventsState.ts';
import { shouldShowLobbyMakerCta } from '../lib/productEvolution.ts';
import type {
  OfficialEventDetail,
  OfficialEventLeaderboard,
  OfficialEventMatch,
  OfficialEventSeasonResult
} from '../types.ts';
import { OfficialEventSeasonResultCard } from './OfficialEventSeasonResult.tsx';

type OfficialEventViewProps = {
  eventId: string;
  onBack: () => void;
  onCreateLobby: () => void;
  onFirstPredictionSaved: () => Promise<void>;
  onJoined: () => Promise<void>;
  commercialEnabled: boolean;
  resultsEnabled: boolean;
  hasOwnedLobby: boolean;
  username: string;
};

const getOfficialEventCover = (coverKey: string | null) => {
  const normalized = String(coverKey || '').toLowerCase();
  if (normalized.includes('hockey') || normalized.includes('ice')) {
    return '/lobby-covers/ice-community.jpg';
  }
  if (normalized.includes('community') || normalized.includes('clubhouse')) {
    return '/lobby-covers/community-clubhouse.jpg';
  }
  return '/lobby-covers/stadium-community.jpg';
};

export default function OfficialEventView({
  eventId,
  onBack,
  onCreateLobby,
  onFirstPredictionSaved,
  onJoined,
  commercialEnabled,
  resultsEnabled,
  hasOwnedLobby,
  username
}: OfficialEventViewProps) {
  const { locale: lang } = useLocale();
  const languageRef = useRef(lang);
  useEffect(() => { languageRef.current = lang; }, [lang]);
  const [detail, setDetail] = useState<OfficialEventDetail | null>(null);
  const [leaderboard, setLeaderboard] = useState<OfficialEventLeaderboard | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, { home: number; away: number }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMatchId, setSavedMatchId] = useState<string | null>(null);
  const [seasonResult, setSeasonResult] = useState<OfficialEventSeasonResult | null>(null);
  const [joining, setJoining] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [declaredAgeEligible, setDeclaredAgeEligible] = useState(false);
  const [declaredRegionEligible, setDeclaredRegionEligible] = useState(false);
  const [viewedLeaderboard, setViewedLeaderboard] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextDetail, nextLeaderboard, nextSeasonResult] = await Promise.all([
        fetchOfficialEventDetail(eventId),
        fetchOfficialEventLeaderboard(eventId),
        resultsEnabled ? fetchOfficialEventSeasonResult(eventId) : Promise.resolve(null)
      ]);
      setDetail(nextDetail);
      setLeaderboard(nextLeaderboard);
      setSeasonResult(nextSeasonResult);
      if (nextLeaderboard) setViewedLeaderboard(true);
      if (nextDetail) {
        const first = getFirstPredictableOfficialEventMatch(nextDetail.matches);
        setSelectedMatchId(current => current || first?.id || nextDetail.matches[0]?.id || null);
        setScores(Object.fromEntries(nextDetail.matches.map(match => [
          match.id,
          {
            home: match.predicted_home_score ?? 0,
            away: match.predicted_away_score ?? 0
          }
        ])));
      }
    } catch (loadError: any) {
      setError(loadError?.message || translate(languageRef.current, "officialEventView.unableToLoadTheEvent"));
    } finally {
      setLoading(false);
    }
  }, [eventId, resultsEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedMatch = useMemo(
    () => detail?.matches.find(match => match.id === selectedMatchId) || null,
    [detail, selectedMatchId]
  );

  const updateScore = (match: OfficialEventMatch, side: 'home' | 'away', delta: number) => {
    if (!match.can_predict || saving) return;
    setScores(previous => {
      const current = previous[match.id] || { home: 0, away: 0 };
      return {
        ...previous,
        [match.id]: {
          ...current,
          [side]: Math.max(0, current[side] + delta)
        }
      };
    });
  };

  const save = async () => {
    if (!selectedMatch?.can_predict) return;
    const score = scores[selectedMatch.id] || { home: 0, away: 0 };
    setSaving(true);
    setError('');
    try {
      await saveOfficialEventPrediction({
        eventId,
        matchId: selectedMatch.id,
        homeScore: score.home,
        awayScore: score.away
      });
      try {
        await onFirstPredictionSaved();
      } catch (onboardingError) {
        console.warn('Prediction saved but onboarding completion could not be recorded.', onboardingError);
      }
      setSavedMatchId(selectedMatch.id);
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || translate(lang, "officialEventView.unableToSaveThePrediction"));
    } finally {
      setSaving(false);
    }
  };

  const join = async () => {
    if (!detail || joining) return;
    setJoining(true);
    setError('');
    try {
      const terms = detail.terms;
      if (terms && terms.version > 0) {
        await acceptOfficialEventTermsAndJoin({
          eventId,
          accepted: acceptedTerms,
          declaredAgeEligible: terms.minimum_age ? declaredAgeEligible : true,
          declaredRegionEligible: terms.eligible_regions?.length ? declaredRegionEligible : true
        });
      } else {
        await joinOfficialEvent(eventId);
      }
      await onJoined();
    } catch (joinError: any) {
      setError(joinError?.message || translate(lang, "officialEventView.unableToJoinTheEvent"));
    } finally {
      setJoining(false);
    }
  };

  if (loading && !detail) {
    return (
      <main className="mx-auto min-h-screen max-w-lg bg-slate-50 p-5">
        <div className="h-9 w-40 animate-pulse rounded-xl bg-slate-200" />
        <div className="mt-6 h-72 animate-pulse rounded-2xl bg-white" />
      </main>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-slate-50 pb-24">
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-100 bg-white p-4">
        <button type="button" onClick={onBack} aria-label={translate(lang, "officialEventView.backToHome")} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700"><ArrowLeft className="h-4 w-4" /></button>
        <div>
          <p className="text-[9px] font-black uppercase text-red-600">{translate(lang, "officialEventView.officialTournament")}</p>
          <h1 className="text-lg font-black text-slate-950">{detail?.name || translate(lang, "officialEventView.officialTournament")}</h1>
        </div>
      </header>

      <main className="space-y-5 p-4">
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</p>}

        {detail && (
          <section className="relative min-h-48 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <img
              src={getOfficialEventCover(detail.cover_key)}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover opacity-[0.3]"
            />
            <div className="absolute inset-0 bg-white/10" aria-hidden="true" />
            <div className="absolute inset-0 bg-gradient-to-r from-white via-white/90 to-white/35" aria-hidden="true" />
            <div
              className="absolute inset-x-0 top-0 h-1"
              style={{ backgroundColor: detail.accent_color || '#DC2626' }}
              aria-hidden="true"
            />
            <div className="relative flex min-h-48 max-w-[88%] flex-col justify-end p-5">
              <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-red-600">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {translate(lang, "officialEventView.officialTournament")}</p>
              <h2 className="mt-2 break-words text-2xl font-black leading-tight text-slate-950">
                {detail.name}
              </h2>
              {detail.description && (
                <p className="mt-2 max-w-sm text-xs font-semibold leading-relaxed text-slate-600">
                  {detail.description}
                </p>
              )}
              {commercialEnabled && detail.partner?.name && (
                <div className="mt-3 flex items-center gap-2">
                  {detail.partner.logo_url && (
                    <img
                      src={detail.partner.logo_url}
                      alt=""
                      aria-hidden="true"
                      className="h-6 max-w-20 object-contain"
                    />
                  )}
                  <p className="text-[9px] font-black uppercase text-slate-500">
                    {translate(lang, "officialEventCard.withAPartner")}{detail.partner.name}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {commercialEnabled && detail && (
          (detail.prizes?.length || 0) > 0 || Boolean(detail.partner?.text)
        ) && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="h-1" style={{ backgroundColor: detail.accent_color || '#DC2626' }} />
            <div className="p-5">
              {(detail.prizes?.length || 0) > 0 && (
                <div>
                  <div className="flex items-center gap-2 text-slate-900">
                    <Gift className="h-4 w-4" aria-hidden="true" />
                    <h2 className="text-xs font-black uppercase">{translate(lang, "officialEventView.prizes")}</h2>
                  </div>
                  <ol className="mt-3 space-y-2">
                    {detail.prizes?.map(prize => (
                      <li key={prize.id || `${prize.rank_from}-${prize.title}`} className="flex gap-3 text-xs">
                        <span className="w-16 shrink-0 font-black text-slate-500">
                          {prize.rank_from === prize.rank_to
                            ? translate(lang, 'common.place', { position: prize.rank_from })
                            : `${prize.rank_from}.–${prize.rank_to}.`}
                        </span>
                        <span className="font-semibold text-slate-900">{prize.title}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {(detail.prizes?.length || 0) === 0 && detail.partner?.text && (
                <p className="text-xs font-semibold leading-relaxed text-slate-600">
                  {detail.partner.text}
                </p>
              )}
            </div>
          </section>
        )}

        {detail && detail.participation_status !== 'active' && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">{translate(lang, "officialEventView.joinTheTournament")}</h2>
            <p className="mt-2 text-xs font-medium leading-relaxed text-slate-500">
              {translate(lang, "officialEventView.youJoinAfterConfirmingPicksAndPointsAreSeparate")}</p>

            {detail.terms && detail.terms.version > 0 && (
              <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
                {detail.terms.summary && <p className="text-xs font-semibold leading-relaxed text-slate-700">{detail.terms.summary}</p>}
                <label className="flex items-start gap-3 text-xs font-semibold text-slate-700">
                  <input type="checkbox" checked={acceptedTerms} onChange={event => setAcceptedTerms(event.target.checked)} className="mt-0.5 h-4 w-4 accent-red-600" />
                  <span>{translate(lang, "officialEventView.iAgreeToThisTournamentSRules")}</span>
                </label>
                {detail.terms.minimum_age && (
                  <label className="flex items-start gap-3 text-xs font-semibold text-slate-700">
                    <input type="checkbox" checked={declaredAgeEligible} onChange={event => setDeclaredAgeEligible(event.target.checked)} className="mt-0.5 h-4 w-4 accent-red-600" />
                    <span>{translate(lang, 'official.ageConfirmation', { age: detail.terms.minimum_age })}</span>
                  </label>
                )}
                {(detail.terms.eligible_regions?.length || 0) > 0 && (
                  <label className="flex items-start gap-3 text-xs font-semibold text-slate-700">
                    <input type="checkbox" checked={declaredRegionEligible} onChange={event => setDeclaredRegionEligible(event.target.checked)} className="mt-0.5 h-4 w-4 accent-red-600" />
                    <span>{translate(lang, "officialEventView.iConfirmIMeetTheCompetitionSLocationRequirements")}</span>
                  </label>
                )}
                {detail.terms.url && (
                  <a href={detail.terms.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2">
                    {translate(lang, "officialEventView.fullRules")}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                )}
              </div>
            )}

            <button
              type="button"
              disabled={joining || Boolean(
                detail.terms &&
                detail.terms.version > 0 &&
                (
                  !acceptedTerms ||
                  (detail.terms.minimum_age && !declaredAgeEligible) ||
                  ((detail.terms.eligible_regions?.length || 0) > 0 && !declaredRegionEligible)
                )
              )}
              onClick={() => void join()}
              className="mt-4 min-h-12 w-full rounded-xl bg-red-600 px-4 text-[10px] font-black uppercase text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {joining ? translate(lang, "officialEventView.joining") : translate(lang, "officialEventCard.join")}
            </button>
          </section>
        )}

        {seasonResult && resultsEnabled && (
          <OfficialEventSeasonResultCard result={seasonResult} username={username} />
        )}

        {detail?.participation_status === 'active' && selectedMatch && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">{translate(lang, "officialEventView.nextOpenMatch")}</p>
            <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              {(['home', 'away'] as const).map((side, index) => {
                const name = side === 'home' ? selectedMatch.home_name : selectedMatch.away_name;
                const score = scores[selectedMatch.id]?.[side] ?? 0;
                return (
                  <div key={side} className={index === 1 ? 'col-start-3' : ''}>
                    <p className="min-h-8 text-center text-xs font-black text-slate-900">{name}</p>
                    <div className="mt-3 flex items-center justify-center gap-2">
                      <button type="button" aria-label={translate(lang, 'common.decreaseScore', { name })} disabled={!selectedMatch.can_predict || saving} onClick={() => updateScore(selectedMatch, side, -1)} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 disabled:opacity-40"><Minus className="h-4 w-4" /></button>
                      <span className="w-7 text-center text-3xl font-black tabular-nums">{score}</span>
                      <button type="button" aria-label={translate(lang, 'common.increaseScore', { name })} disabled={!selectedMatch.can_predict || saving} onClick={() => updateScore(selectedMatch, side, 1)} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
                    </div>
                  </div>
                );
              })}
              <span className="col-start-2 row-start-1 pt-9 text-xl font-black text-slate-300">:</span>
            </div>
            {selectedMatch.can_predict && (
              <button type="button" disabled={saving} onClick={() => void save()} className="mt-6 min-h-12 w-full rounded-xl bg-red-600 px-4 text-[10px] font-black uppercase tracking-wider text-white disabled:opacity-50">
                {saving ? translate(lang, "authScreen.saving") : translate(lang, "mmaFightCard.savePrediction")}
              </button>
            )}
            {savedMatchId === selectedMatch.id && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-black text-emerald-700">
                <Check className="h-4 w-4" /> {translate(lang, "officialEventView.yourFirstPredictionIsIn")}</div>
            )}
          </section>
        )}

        {detail?.participation_status === 'active' && !selectedMatch && !seasonResult && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
            <Trophy className="mx-auto h-7 w-7 text-slate-400" />
            <h2 className="mt-3 text-base font-black text-slate-900">{translate(lang, "officialEventView.noMatchesAreOpenRightNow")}</h2>
            <p className="mt-2 text-xs font-medium text-slate-500">{translate(lang, "officialEventView.theNextAvailablePredictionWillAppearHere")}</p>
          </section>
        )}

        {leaderboard && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">{translate(lang, "officialEventView.standings")}</p>
                <h2 className="mt-1 text-lg font-black text-slate-950">
                  {leaderboard.current_position
                    ? translate(lang, 'official.position', { position: leaderboard.current_position, count: leaderboard.participant_count })
                    : pluralMessage(lang, 'tipsters', leaderboard.participant_count)}
                </h2>
              </div>
              {leaderboard.current_position && leaderboard.current_position > 1 && (
                <p className="text-right text-[10px] font-bold text-slate-500">
                  {translate(lang, "officialEventView.toTheNextPosition")}<br />{leaderboard.points_to_next} {translate(lang, 'pts')}
                </p>
              )}
            </div>
            <div className="mt-4 divide-y divide-slate-100">
              {leaderboard.rows.map(row => (
                <div key={`${row.position}-${row.username}`} className={`flex min-h-11 items-center gap-3 py-2 ${row.is_current_user ? 'font-black text-red-600' : 'font-semibold text-slate-700'}`}>
                  <span className="w-7 text-xs tabular-nums">{row.position}.</span>
                  <span className="min-w-0 flex-1 truncate text-xs">{row.username}</span>
                  <span className="text-xs tabular-nums">{row.total_points} {translate(lang, 'pts')}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {shouldShowLobbyMakerCta({
          hasOwnedLobby,
          savedPrediction: Boolean(savedMatchId),
          viewedLeaderboard,
          completedEvent: Boolean(seasonResult)
        }) && (
          <button type="button" onClick={onCreateLobby} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white text-[10px] font-black uppercase tracking-wider text-slate-800">
            {translate(lang, "officialEventView.createYourOwnPredictionLeague")}</button>
        )}
      </main>
    </div>
  );
}
