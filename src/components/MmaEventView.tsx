import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, RefreshCw, Trophy } from 'lucide-react';
import { canPredictMmaFight, MMA_PILOT_EVENTS, type MmaFight, type MmaPrediction, type MmaFighter } from '../lib/mma.ts';
import { fetchMmaLobby, saveMmaPrediction, type MmaLobbyData } from '../lib/mmaDb.ts';
import { MATCH_TIME_ZONE } from '../lib/matchTime.ts';

const dateLabel = (value: string, lang: 'cz' | 'en') => new Intl.DateTimeFormat(lang === 'cz' ? 'cs-CZ' : 'en-GB', {
  day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: MATCH_TIME_ZONE,
}).format(new Date(value));
const stateLabel = (fight: MmaFight, lang: 'cz' | 'en') => {
  const cs = lang === 'cz';
  if (fight.status === 'cancelled') return cs ? 'Zrušeno · bez bodů' : 'Cancelled · no points';
  if (fight.status === 'draw') return cs ? 'Remíza · bez bodů' : 'Draw · no points';
  if (fight.status === 'void') return 'No contest · ' + (cs ? 'bez bodů' : 'no points');
  if (fight.status === 'awaiting_result') return cs ? 'Čekáme na ověřený výsledek' : 'Awaiting verified result';
  return fight.status === 'finished' ? (cs ? 'Výsledek' : 'Result') : (cs ? 'Připraveno k tipu' : 'Ready to predict');
};

export function MmaFightCard({ fight, fighters, prediction, open, busy, lang, onSave }: {
  key?: string; fight: MmaFight; fighters: Map<number, MmaFighter>; prediction?: MmaPrediction;
  open: boolean; busy: boolean; lang: 'cz' | 'en'; onSave: (winner: number) => Promise<void>;
}) {
  const validPick = prediction?.lineup_version === fight.lineup_version;
  const [selected, setSelected] = useState<number | null>(validPick ? prediction!.predicted_winner_id : null);
  useEffect(() => {
    setSelected(prediction?.lineup_version === fight.lineup_version ? prediction.predicted_winner_id : null);
  }, [fight.id, fight.lineup_version, prediction?.predicted_winner_id, prediction?.lineup_version]);
  const cs = lang === 'cz';
  const a = fight.fighter_a_id === null ? undefined : fighters.get(fight.fighter_a_id);
  const b = fight.fighter_b_id === null ? undefined : fighters.get(fight.fighter_b_id);
  const winner = fight.winner_fighter_id === null ? undefined : fighters.get(fight.winner_fighter_id);
  const saved = validPick && prediction?.predicted_winner_id === selected;
  const section = fight.card_section === 'main' ? (cs ? 'Hlavní karta' : 'Main card')
    : fight.card_section === 'early_prelims' ? 'Early prelims' : fight.card_section === 'prelims' ? 'Prelims'
      : (cs ? 'Zařazení se upřesňuje' : 'Card section to be confirmed');
  return <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
      <span>{section} · {fight.weight_class || 'MMA'}</span>
      <span>{fight.scheduled_rounds ? fight.scheduled_rounds + (cs ? (fight.scheduled_rounds === 3 ? ' kola' : ' kol') : ' rounds') : ''}</span>
    </div>
    <fieldset disabled={!open || busy} className="grid grid-cols-2 gap-3">
      <legend className="sr-only">{cs ? 'Vyber vítěze duelu' : 'Pick the bout winner'}</legend>
      {[a, b].map((person, index) => <button key={index} type="button" aria-pressed={Boolean(person && selected === person.id)}
        onClick={() => person && setSelected(person.id)}
        className={'min-h-24 rounded-xl border-2 p-3 text-center transition-colors disabled:cursor-default ' +
          (person && selected === person.id ? 'border-red-600 bg-red-50 text-slate-950' : 'border-slate-100 bg-slate-50 text-slate-700')}>
        {person?.country_code && <span className="mb-2 block text-[10px] font-bold text-slate-400">{person.country_code}</span>}
        <span className="block text-sm font-black leading-snug">{person?.name || (cs ? 'Soupeř bude potvrzen' : 'Opponent to be confirmed')}</span>
      </button>)}
    </fieldset>
    {fight.status !== 'scheduled' ? <p className="mt-4 text-sm font-bold text-slate-700">
      {winner ? (cs ? 'Vítěz: ' : 'Winner: ') + winner.name : stateLabel(fight, lang)}
      {fight.method && <span className="mt-1 block text-xs font-normal text-slate-500">{fight.method}{fight.finish_round ? ' · ' + fight.finish_round + (cs ? '. kolo' : ' round') : ''}</span>}
    </p> : open ? <>
      {prediction && !validPick && <p className="mt-3 text-xs font-bold text-amber-700">{cs ? 'Změnilo se obsazení duelu. Vyber znovu.' : 'The bout lineup changed. Pick again.'}</p>}
      <button type="button" disabled={selected === null || busy || saved} onClick={() => selected !== null && void onSave(selected)}
        className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white disabled:bg-slate-100 disabled:text-slate-400">
        {saved && <CheckCircle2 className="h-4 w-4" />}
        {busy ? (cs ? 'Ukládám…' : 'Saving…') : saved ? (cs ? 'Tip uložen' : 'Prediction saved')
          : prediction ? (cs ? 'Aktualizovat tip' : 'Update prediction') : (cs ? 'Uložit tip' : 'Save prediction')}
      </button>
    </> : <p className="mt-4 text-xs font-semibold text-slate-500">{cs ? 'Tipování je uzamčené.' : 'Predictions are locked.'}</p>}
    {prediction && fight.status !== 'scheduled' && <p className="mt-3 text-xs font-bold text-slate-500">
      {cs ? 'Tvůj tip: ' : 'Your pick: '}{fighters.get(prediction.predicted_winner_id)?.name || '—'}
      {' · ' + prediction.points_earned + (cs ? ' b.' : ' pts')}
    </p>}
  </article>;
}

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
  const people = new Map<number, MmaFighter>((data?.fighters ?? []).map(person => [person.id, person] as const));
  const picks = new Map<string, MmaPrediction>((data?.predictions ?? []).map(pick => [pick.fight_id, pick] as const));
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
  return <div className="mx-auto min-h-screen max-w-lg bg-slate-50 pb-12 shadow-xl">
    <header className="sticky top-0 z-30 border-b border-slate-100 bg-white p-4">
      <button onClick={onBack} className="mb-3 flex min-h-10 items-center gap-2 text-xs font-bold text-slate-500">
        <ArrowLeft className="h-4 w-4" />{lobbyName}
      </button>
      <h1 className="text-2xl font-black italic tracking-tight text-slate-950">{title}</h1>
    </header>
    <main className="space-y-4 p-4">
      <section className="rounded-2xl border border-slate-100 bg-white p-4 text-xs leading-relaxed text-slate-600">
        <p className="font-black text-slate-900">{cs ? 'Tipuj vítěze každého duelu. Správný tip = 1 bod.' : 'Pick each bout winner. Correct pick = 1 point.'}</p>
        <p className="mt-1">{cs ? 'Remíza, no contest a zrušený duel jsou bez bodů. Celá karta se zamyká při prvním zápase.' : 'Draws, no contests and cancelled bouts award no points. All picks lock at the first bout.'}</p>
        {data && <div className="mt-3 space-y-1">
          <p className="font-bold text-red-600">{cs ? 'Uzávěrka karty: ' : 'Card deadline: '}{dateLabel(data.event.lock_time_utc, lang)}</p>
          {data.event.main_card_at && <p>{cs ? 'Hlavní karta: ' : 'Main card: '}{dateLabel(data.event.main_card_at, lang)}</p>}
          <p className="text-[10px] text-slate-400">{cs ? 'Časy jsou uvedené pro Prahu.' : 'Times are shown in Prague time.'}</p>
        </div>}
      </section>
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'missing', 'results'] as const).map(value => <button key={value} onClick={() => setFilter(value)}
          className={'min-h-10 rounded-full px-4 text-xs font-bold ' + (filter === value ? 'bg-red-600 text-white' : 'border border-slate-200 bg-white text-slate-500')}>
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
