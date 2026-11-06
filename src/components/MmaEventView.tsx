import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Clock, Info, RefreshCw, Trophy } from 'lucide-react';
import { canPredictMmaFight, MMA_PILOT_EVENTS, type MmaFighter, type MmaFight, type MmaPrediction } from '../lib/mma.ts';
import { fetchMmaLobby, saveMmaPrediction, type MmaLobbyData, type MmaStanding } from '../lib/mmaDb.ts';
import { summarizeMmaPredictions } from '../lib/mmaPredictions.ts';
import { MmaFightCard } from './MmaFightCard.tsx';
import { MmaRulesDialog, formatMmaEventTime } from './MmaRulesDialog.tsx';

export default function MmaEventView({ lobbyId, lobbyName, tournamentId, userId, lang, initialFilter = 'all', onBack, onPredictionSaved }: {
  lobbyId: string; lobbyName: string; tournamentId: string; userId: string; lang: 'cz' | 'en';
  initialFilter?: 'all' | 'missing' | 'results';
  onBack: () => void; onPredictionSaved: () => void;
}) {
  const [data, setData] = useState<MmaLobbyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'missing' | 'results'>(initialFilter);
  const [now, setNow] = useState(Date.now());
  const [showRules, setShowRules] = useState(false);
  const requests = useRef(0);
  const cs = lang === 'cz';
  const load = useCallback(async () => {
    const request = ++requests.current;
    try {
      const next = await fetchMmaLobby(lobbyId, tournamentId, userId);
      if (request === requests.current) { setData(next); setError(''); }
    } catch {
      if (request === requests.current) setError(lang === 'cz' ? 'MMA se nepodařilo načíst. Zkus obnovit data.' : 'Could not load MMA. Try refreshing.');
    } finally { if (request === requests.current) setLoading(false); }
  }, [lobbyId, tournamentId, userId, lang]);
  useEffect(() => {
    setData(null); setLoading(true); void load();
    return () => { requests.current++; };
  }, [load]);
  useEffect(() => { const interval = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(interval); }, []);
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
  const missing = (fight: MmaFight) => data && canPredictMmaFight(data.event, fight, now)
    && picks.get(fight.id)?.lineup_version !== fight.lineup_version;
  const rows = (data?.fights ?? []).filter(fight => filter === 'missing' ? missing(fight)
    : filter === 'results' ? fight.status !== 'scheduled' : true);
  const title = MMA_PILOT_EVENTS.find(event => event.tournamentId === tournamentId)?.label || 'UFC';
  const save = async (fight: MmaFight, winner: number) => {
    setSaving(fight.id); setError('');
    try { await saveMmaPrediction(lobbyId, userId, fight, winner); await load(); onPredictionSaved(); }
    catch (e: any) { setError(e.message === 'MMA_LINEUP_CHANGED'
      ? (cs ? 'Karta se změnila. Obnov data a vyber vítěze znovu.' : 'The card changed. Refresh and pick again.')
      : (cs ? 'Tip se neuložil. Obnov data a zkontroluj uzávěrku.' : 'The pick was not saved. Refresh and check the deadline.')); }
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
          aria-label={cs ? 'Pravidla a bodování' : 'Rules and scoring'}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-100 bg-white text-slate-400 shadow-sm transition-colors hover:border-slate-200 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
          <Info className="h-5 w-5" />
        </button>
      </div>
    </header>
    <MmaRulesDialog open={showRules} event={data?.event} lang={lang} onClose={() => setShowRules(false)} />
    <main className="space-y-4 p-4">
      {data && <p className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
        <Clock className="h-3 w-3 shrink-0" />
        <span>{cs ? 'Uzávěrka karty: ' : 'Card deadline: '}{formatMmaEventTime(data.event.lock_time_utc, lang)}</span>
      </p>}
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'missing', 'results'] as const).map(value => <button key={value} onClick={() => setFilter(value)}
          className={'min-h-10 rounded-full px-4 py-1.5 text-[10px] font-black transition-colors ' + (filter === value ? 'bg-red-600 text-white shadow-lg shadow-red-100' : 'border border-slate-100 bg-white text-slate-400 hover:border-slate-200')}>
          {value === 'all' ? (cs ? 'Vše' : 'All') : value === 'results' ? (cs ? 'Výsledky' : 'Results')
            : (cs ? 'Bez tipu' : 'Missing') + (data ? ' (' + data.fights.filter(missing).length + ')' : '')}
        </button>)}
        <button onClick={() => void load()} aria-label={cs ? 'Obnovit data' : 'Refresh data'} className="ml-auto min-h-10 rounded-full bg-white px-3 text-slate-500"><RefreshCw className="h-4 w-4" /></button>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>}
      {loading && <p className="p-4 text-center text-sm text-slate-500">{cs ? 'Načítám kartu…' : 'Loading fight card…'}</p>}
      {!loading && data && rows.length === 0 && <p className="rounded-xl bg-white p-5 text-center text-sm font-bold text-slate-600">
        {filter === 'missing' ? (Date.parse(data.event.lock_time_utc) <= now || !['announced', 'scheduled'].includes(data.event.status)
          ? (cs ? 'Tipování je uzamčené. Výsledky se doplní automaticky.' : 'Predictions are locked. Results will update automatically.')
          : (cs ? 'Všechny otevřené duely máš natipované.' : 'All open bouts have a prediction.'))
          : (cs ? 'Zatím tu nejsou výsledky.' : 'No results yet.')}
      </p>}
      {data && rows.map(fight => <MmaFightCard key={fight.id} fight={fight} fighters={people} prediction={picks.get(fight.id)}
        community={communityByFight.get(fight.id)} members={members} userId={userId}
        open={canPredictMmaFight(data.event, fight, now)} busy={saving !== null} lang={lang} onSave={winner => save(fight, winner)} />)}
      {data && <section className="rounded-2xl border border-slate-100 bg-white p-4">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-black text-slate-900"><Trophy className="h-4 w-4" />{cs ? 'Pořadí této lobby' : 'This lobby’s standings'}</h2>
        <ol className="space-y-3">{data.standings.map((person, index) => <li key={person.user_id}
          className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 truncate font-bold text-slate-700">{index + 1}. {person.avatar_emoji || ''} {person.username}{person.user_id === userId ? (cs ? ' (ty)' : ' (you)') : ''}</span>
          <strong className="shrink-0 text-slate-950">{person.points} {cs ? 'b.' : 'pts'}</strong>
        </li>)}</ol>
        <p className="mt-4 text-[10px] text-slate-400">{cs ? 'Výsledky a body se aktualizují automaticky.' : 'Results and points update automatically.'}</p>
      </section>}
    </main>
  </div>;
}
