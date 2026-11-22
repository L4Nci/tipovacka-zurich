import { translate, type Locale } from '../i18n/index.ts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Clock, Info, RefreshCw, Trophy } from 'lucide-react';
import { canPredictMmaFight, isMmaSeason, mmaEventName, type MmaFighter, type MmaFight, type MmaPrediction, type MmaMethod } from '../lib/mma.ts';
import { filterMmaSeason, mmaEventStandings, mmaResultEvents } from '../lib/mmaSeason.ts';
import { fetchMmaLobby, saveMmaPrediction, type MmaLobbyData, type MmaStanding } from '../lib/mmaDb.ts';
import { summarizeMmaPredictions } from '../lib/mmaPredictions.ts';
import { MmaFightCard } from './MmaFightCard.tsx';
import { MmaRulesDialog, formatMmaEventTime } from './MmaRulesDialog.tsx';
import { CompetitionBottomNav } from './CompetitionBottomNav.tsx';

export default function MmaEventView({ lobbyId, lobbyName, tournamentId, userId, lang, initialFilter = 'all', onBack, onPredictionSaved }: {
  lobbyId: string; lobbyName: string; tournamentId: string; userId: string; lang: Locale;
  initialFilter?: 'all' | 'missing' | 'results';
  onBack: () => void; onPredictionSaved: () => void;
}) {
  const [data, setData] = useState<MmaLobbyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [pickFilter, setPickFilter] = useState<'all' | 'missing'>(initialFilter === 'missing' ? 'missing' : 'all');
  const [section, setSection] = useState<'matches' | 'results' | 'leaderboard'>(initialFilter === 'results' ? 'results' : 'matches');
  const filter = section === 'results' ? 'results' : pickFilter;
  const [now, setNow] = useState(Date.now());
  const [showRules, setShowRules] = useState(false);
  const [eventFilter, setEventFilter] = useState('all');
  const [seasonStandings, setSeasonStandings] = useState(false);
  const requests = useRef(0);
  const load = useCallback(async () => {
    const request = ++requests.current;
    try {
      const next = await fetchMmaLobby(lobbyId, tournamentId, userId);
      if (request === requests.current) { setData(next); setError(''); }
    } catch {
      if (request === requests.current) setError(translate(lang, "mmaEventView.couldNotLoadMmaTryRefreshing"));
    } finally { if (request === requests.current) setLoading(false); }
  }, [lobbyId, tournamentId, userId, lang]);
  useEffect(() => {
    setData(null); setLoading(true); void load();
    return () => { requests.current++; };
  }, [load]);
  useEffect(() => { const interval = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(interval); }, []);
  useEffect(() => {
    setEventFilter('all'); setSeasonStandings(false);
    setPickFilter(initialFilter === 'missing' ? 'missing' : 'all');
    setSection(initialFilter === 'results' ? 'results' : 'matches');
  }, [lobbyId, tournamentId, initialFilter]);
  const events = useMemo(() => new Map((data?.events ?? []).map(event => [event.tournament_id, event])), [data?.events]);
  const people = useMemo(() => new Map<number, MmaFighter>((data?.fighters ?? []).map(person => [person.id, person] as const)), [data?.fighters]);
  const picks = useMemo(() => new Map<string, MmaPrediction>((data?.predictions ?? []).map(pick => [pick.fight_id, pick] as const)), [data?.predictions]);
  const members = useMemo(() => new Map<string, MmaStanding>((data?.standings ?? []).map(person => [person.user_id, person] as const)), [data?.standings]);
  const communityByFight = useMemo(() => {
    const grouped = new Map<string, MmaPrediction[]>();
    for (const pick of data?.lobbyPredictions ?? []) {
      const rows = grouped.get(pick.fight_id) ?? [];
      rows.push(pick); grouped.set(pick.fight_id, rows);
    }
    const active = new Set<string>(members.keys());
    return new Map<string, ReturnType<typeof summarizeMmaPredictions>>((data?.fights ?? []).map(fight =>
      [fight.id, summarizeMmaPredictions(lobbyId, fight, grouped.get(fight.id) ?? [], active)] as const));
  }, [data?.lobbyPredictions, data?.fights, members, lobbyId]);
  const missing = (fight: MmaFight) => events.has(fight.tournament_id)
    && canPredictMmaFight(events.get(fight.tournament_id)!, fight, now)
    && picks.get(fight.id)?.lineup_version !== fight.lineup_version;
  const resultEvents = useMemo(() => data ? mmaResultEvents(data.events, data.fights) : [], [data]);
  const visibleEvents = filter === 'results' ? resultEvents : data?.events ?? [];
  const visibleEventFilter = filter === 'results' && !resultEvents.some(event => event.tournament_id === eventFilter)
    ? 'all' : eventFilter;
  const rows = useMemo(() => data ? filterMmaSeason(data.events, data.fights, data.predictions, visibleEventFilter, filter, now) : [],
    [data, visibleEventFilter, filter, now]);
  const groups = visibleEvents.map(event => ({ event, fights: rows.filter(fight => fight.tournament_id === event.tournament_id) }))
    .filter(group => group.fights.length > 0);
  const title = isMmaSeason(tournamentId) ? 'UFC ' + tournamentId.slice(-4)
    : data?.events[0] ? mmaEventName(data.events[0]) : 'UFC';
  const selectedEvent = visibleEventFilter === 'all' ? (isMmaSeason(tournamentId) ? null : data?.events[0]) : events.get(visibleEventFilter);
  const standings = useMemo(() => !data ? [] : eventFilter === 'all' || seasonStandings ? data.standings
    : mmaEventStandings(lobbyId, eventFilter, data.standings, data.fights, data.lobbyPredictions), [data, eventFilter, seasonStandings, lobbyId]);
  const missingCount = (data?.fights ?? []).filter(fight => (eventFilter === 'all' || fight.tournament_id === eventFilter) && missing(fight)).length;
  const hasOpenFights = (data?.fights ?? []).some(fight => (eventFilter === 'all' || fight.tournament_id === eventFilter)
    && events.has(fight.tournament_id) && canPredictMmaFight(events.get(fight.tournament_id)!, fight, now));
  const save = async (fight: MmaFight, winner: number, method: MmaMethod | null) => {
    setSaving(fight.id); setError('');
    try { await saveMmaPrediction(lobbyId, userId, fight, winner, method, events.get(fight.tournament_id)?.rules_version); await load(); onPredictionSaved(); }
    catch (e: any) { setError(e.message === 'MMA_LINEUP_CHANGED'
      ? (translate(lang, "mmaEventView.theCardChangedRefreshAndPickAgain"))
      : (translate(lang, "mmaEventView.thePickWasNotSavedRefreshAndCheckThe"))); }
    finally { setSaving(null); }
  };
  return <div className="mx-auto min-h-screen max-w-lg bg-slate-50 pb-24 shadow-2xl">
    <header className="sticky top-0 z-50 border-b border-slate-100 bg-white p-6">
      <button onClick={onBack} className="mb-3 flex min-h-10 items-center gap-2 text-xs font-bold text-slate-500">
        <ArrowLeft className="h-4 w-4" />{lobbyName}
      </button>
      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-black italic tracking-tight text-slate-950">{title}</h1>
        <button type="button" onClick={() => setShowRules(true)} aria-haspopup="dialog" aria-expanded={showRules}
          aria-label={translate(lang, "mmaEventView.rulesAndScoring")}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-100 bg-white text-slate-500 shadow-sm transition-colors hover:border-slate-200 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fan-primary">
          <Info className="h-5 w-5" />
        </button>
      </div>
    </header>
    <MmaRulesDialog open={showRules} event={selectedEvent} lang={lang}
      rulesVersion={selectedEvent?.rules_version ?? (data?.events.some(event => event.rules_version === 'mma-winner-method-v2') ? 'mma-winner-method-v2' : 'mma-winner-v1')}
      mixedRules={!selectedEvent && new Set(data?.events.map(event => event.rules_version)).size > 1}
      onClose={() => setShowRules(false)} />
    <main className="space-y-4 p-4">
      {data && <label className="block space-y-2 text-xs font-bold text-slate-500">
        <span>{translate(lang, 'mmaSeason.eventFilter')}</span>
        <select value={visibleEventFilter} onChange={event => { setEventFilter(event.target.value); setSeasonStandings(false); }}
          className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800">
          <option value="all">{translate(lang, 'mmaSeason.allEvents')}</option>
          {visibleEvents.map(event => <option key={event.tournament_id} value={event.tournament_id}>{mmaEventName(event)}</option>)}
        </select>
      </label>}
      <div className="flex flex-wrap items-center gap-2">
        {section === 'matches' && (['all', 'missing'] as const).map(value => <button key={value} onClick={() => setPickFilter(value)}
          className={'min-h-11 rounded-full px-4 py-1.5 text-[10px] font-black transition-colors ' + (filter === value ? 'bg-fan-primary text-fan-snow shadow-lg shadow-fan-soft' : 'border border-slate-100 bg-white text-slate-500 hover:border-slate-200')}>
          {value === 'all' ? (translate(lang, 'mmaSeason.upcoming'))
            : (translate(lang, "app.missing")) + (data ? ' (' + missingCount + ')' : '')}
        </button>)}
        <button onClick={() => void load()} aria-label={translate(lang, "mmaEventView.refreshData")} className="ml-auto min-h-10 rounded-full bg-white px-3 text-slate-500"><RefreshCw className="h-4 w-4" /></button>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>}
      {loading && <p className="p-4 text-center text-sm text-slate-500">{translate(lang, "mmaEventView.loadingFightCard")}</p>}
      {section !== 'leaderboard' && !loading && data && rows.length === 0 && <p className="rounded-xl bg-white p-5 text-center text-sm font-bold text-slate-600">
        {filter === 'missing' ? translate(lang, hasOpenFights ? 'mmaEventView.allOpenBoutsHaveAPrediction' : 'mmaEventView.predictionsAreLockedResultsWillUpdateAutomatically')
          : filter === 'results' ? translate(lang, 'mmaEventView.noResultsYet') : translate(lang, 'mmaSeason.noUpcoming')}
      </p>}
      {section !== 'leaderboard' && data && groups.map(({ event, fights }) => <section key={event.tournament_id} className="space-y-4" aria-label={mmaEventName(event)}>
        <div className="space-y-1 px-1 pt-3">
          <h2 className="text-sm font-black text-slate-800">{mmaEventName(event)}</h2>
          {section === 'matches' && <p className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
            <Clock className="h-3 w-3 shrink-0" />{translate(lang, 'mmaEventView.cardDeadline')}{formatMmaEventTime(event.lock_time_utc, lang)}
          </p>}
        </div>
        {fights.map(fight => <MmaFightCard key={fight.id} fight={fight} fighters={people} prediction={picks.get(fight.id)}
        community={communityByFight.get(fight.id)} members={members} userId={userId}
        open={canPredictMmaFight(event, fight, now)} busy={saving !== null} lang={lang} rulesVersion={event.rules_version}
        onSave={(winner, method) => save(fight, winner, method)} />)}
      </section>)}
      {section === 'leaderboard' && data && <section className="rounded-2xl border border-slate-100 bg-white p-4">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-black text-slate-900"><Trophy className="h-4 w-4" />
          {translate(lang, isMmaSeason(tournamentId) && (eventFilter === 'all' || seasonStandings) ? 'mmaSeason.seasonStandings' : 'mmaSeason.eventStandings')}
        </h2>
        {selectedEvent && isMmaSeason(tournamentId) && <button type="button" onClick={() => setSeasonStandings(value => !value)}
          className="mb-4 min-h-10 rounded-full bg-slate-50 px-3 text-xs font-bold text-slate-600">
          {translate(lang, seasonStandings ? 'mmaSeason.showEventStandings' : 'mmaSeason.showSeasonStandings')}
        </button>}
        <ol className="space-y-3">{standings.map((person, index) => <li key={person.user_id}
          className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 truncate font-bold text-slate-700">{index + 1}. {person.avatar_emoji || ''} {person.username}{person.user_id === userId ? (translate(lang, "mmaEventView.you")) : ''}</span>
          <strong className="shrink-0 text-slate-950">{person.points} {translate(lang, "mmaEventView.pts")}</strong>
        </li>)}</ol>
        <p className="mt-4 text-[10px] text-slate-400">{translate(lang, "mmaEventView.resultsAndPointsUpdateAutomatically")}</p>
      </section>}
    </main>
    <CompetitionBottomNav active={section} items={[
      { id: 'matches', label: translate(lang, 'matches') },
      { id: 'results', label: translate(lang, 'results') },
      { id: 'leaderboard', label: translate(lang, 'rank') }
    ]} onSelect={next => {
      if (next === section) return;
      setSection(next);
      window.scrollTo({ top: 0 });
    }} />
  </div>;
}
