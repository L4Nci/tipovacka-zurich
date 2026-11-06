import { useEffect, useId, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import type { MmaFight, MmaPrediction, MmaFighter } from '../lib/mma.ts';
import type { MmaStanding } from '../lib/mmaLobbyData.ts';
import type { summarizeMmaPredictions } from '../lib/mmaPredictions.ts';
import { PredictionDistribution } from './PredictionDistribution.tsx';

export function MmaFightCard({ fight, fighters, prediction, community, members, userId, open, busy, lang, onSave }: {
  key?: string; fight: MmaFight; fighters: Map<number, MmaFighter>; prediction?: MmaPrediction;
  community: ReturnType<typeof summarizeMmaPredictions>; members: ReadonlyMap<string, MmaStanding>; userId: string;
  open: boolean; busy: boolean; lang: 'cz' | 'en'; onSave: (winner: number) => Promise<void>;
}) {
  const validPick = prediction?.lineup_version === fight.lineup_version;
  const [selected, setSelected] = useState<number | null>(validPick ? prediction!.predicted_winner_id : null);
  const [showOthers, setShowOthers] = useState(false);
  const othersId = useId();
  useEffect(() => {
    setSelected(prediction?.lineup_version === fight.lineup_version ? prediction.predicted_winner_id : null);
  }, [fight.id, fight.lineup_version, prediction?.predicted_winner_id, prediction?.lineup_version]);
  const cs = lang === 'cz';
  const a = fight.fighter_a_id === null ? undefined : fighters.get(fight.fighter_a_id);
  const b = fight.fighter_b_id === null ? undefined : fighters.get(fight.fighter_b_id);
  const winner = fight.winner_fighter_id === null ? undefined : fighters.get(fight.winner_fighter_id);
  const saved = validPick && prediction?.predicted_winner_id === selected;
  const otherCount = community.predictions.filter(pick => pick.user_id !== userId).length;
  const section = fight.card_section === 'main' ? (cs ? 'Hlavní karta' : 'Main card')
    : fight.card_section === 'early_prelims' ? 'Early prelims' : fight.card_section === 'prelims' ? 'Prelims'
      : (cs ? 'Zařazení se upřesňuje' : 'Card section to be confirmed');
  const state = fight.status === 'cancelled' ? (cs ? 'Zrušeno · bez bodů' : 'Cancelled · no points')
    : fight.status === 'draw' ? (cs ? 'Remíza · bez bodů' : 'Draw · no points')
      : fight.status === 'void' ? (cs ? 'No contest · bez bodů' : 'No contest · no points')
        : (cs ? 'Čekáme na ověřený výsledek' : 'Awaiting verified result');
  return <article className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase text-slate-400">
        <span>{fight.weight_class || 'MMA'}{fight.scheduled_rounds ? ' · ' + fight.scheduled_rounds + (cs ? (fight.scheduled_rounds === 3 ? ' kola' : ' kol') : ' rounds') : ''}</span>
        <span className="rounded-full bg-slate-50 px-2 py-0.5 tracking-tighter">{section}</span>
      </div>
      <fieldset disabled={!open || busy} className="grid grid-cols-2 gap-3">
        <legend className="sr-only">{cs ? 'Vyber vítěze duelu' : 'Pick the bout winner'}</legend>
        {[a, b].map((person, index) => <button key={index} type="button" aria-pressed={Boolean(person && selected === person.id)}
          onClick={() => person && setSelected(person.id)}
          className={'min-h-24 rounded-2xl border-2 p-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-default ' +
            (person && selected === person.id ? (index === 0 ? 'border-[#ce1126] bg-red-50 text-slate-950' : 'border-[#006847] bg-emerald-50 text-slate-950')
              : 'border-slate-100 bg-slate-50 text-slate-700')}>
          {person?.country_code && <span className="mb-2 block text-[10px] font-bold text-slate-400">{person.country_code}</span>}
          <span className="block text-sm font-black leading-snug">{person?.name || (cs ? 'Soupeř bude potvrzen' : 'Opponent to be confirmed')}</span>
        </button>)}
      </fieldset>
      <div className="mt-5">
        <PredictionDistribution homeLabel={a?.name || 'TBA'} awayLabel={b?.name || 'TBA'}
          homePercent={community.homePercent} awayPercent={community.awayPercent} lang={lang} />
      </div>
      {prediction && !validPick && <p className="mt-3 text-xs font-bold text-amber-700">{open
        ? (cs ? 'Změnilo se obsazení duelu. Vyber znovu.' : 'The bout lineup changed. Pick again.')
        : (cs ? 'Původní tip neplatí kvůli změně soupeře.' : 'The original pick is invalid after a lineup change.')}</p>}
      {fight.status !== 'scheduled' ? <p className="mt-4 text-sm font-bold text-slate-700">
        {winner ? (cs ? 'Vítěz: ' : 'Winner: ') + winner.name : state}
        {fight.method && <span className="mt-1 block text-xs font-normal text-slate-500">{fight.method}{fight.finish_round ? ' · ' + fight.finish_round + (cs ? '. kolo' : ' round') : ''}</span>}
      </p> : open ? <button type="button" disabled={selected === null || busy || saved} onClick={() => selected !== null && void onSave(selected)}
        className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white transition-colors disabled:bg-slate-100 disabled:text-slate-400">
        {saved && <CheckCircle2 className="h-4 w-4" />}
        {busy ? (cs ? 'Ukládám…' : 'Saving…') : saved ? (cs ? 'Tip uložen' : 'Prediction saved')
          : prediction ? (cs ? 'Aktualizovat tip' : 'Update prediction') : (cs ? 'Uložit tip' : 'Save prediction')}
      </button> : <p className="mt-4 text-xs font-semibold text-slate-500">{cs ? 'Tipování je uzamčené.' : 'Predictions are locked.'}</p>}
      {prediction && fight.status !== 'scheduled' && <p className="mt-3 text-xs font-bold text-slate-500">
        {cs ? 'Tvůj tip: ' : 'Your pick: '}{fighters.get(prediction.predicted_winner_id)?.name || '—'}
        {' · ' + prediction.points_earned + (cs ? ' b.' : ' pts')}
      </p>}
      <button type="button" onClick={() => setShowOthers(value => !value)} aria-expanded={showOthers} aria-controls={othersId}
        className="mt-4 flex min-h-10 w-full items-center justify-center gap-1 text-xs text-slate-400 transition-colors hover:text-slate-600">
        {showOthers ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {showOthers ? (cs ? 'Skrýt tipy ostatních' : 'Hide other picks') : (cs ? 'Zobrazit tipy ostatních' : 'Show other picks')}
        <span className="ml-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold">{otherCount}</span>
      </button>
    </div>
    <div id={othersId} hidden={!showOthers} className="border-t border-slate-100 bg-slate-50 p-4">
      {community.total === 0 ? <p className="text-center text-xs text-slate-400">{cs ? 'Zatím žádné tipy.' : 'No predictions yet.'}</p>
        : <ul className="flex flex-wrap justify-center gap-2">
          {community.predictions.map(pick => {
            const person = members.get(pick.user_id);
            const own = pick.user_id === userId;
            return <li key={pick.user_id} className={'flex min-w-20 max-w-36 flex-col items-center rounded-xl border bg-white px-3 py-2 ' +
              (own ? 'border-red-500 ring-2 ring-red-500' : 'border-slate-100')}>
              <div className="mb-1 flex items-center gap-1">
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white text-sm shadow-sm"
                  style={{ backgroundColor: person?.avatar_bg || '#fee2e2' }}>{person?.avatar_emoji || '😀'}</span>
                <span className={'max-w-16 truncate text-[9px] font-black uppercase ' + (own ? 'text-red-600' : 'text-slate-500')}
                  title={person?.username}>{own ? (cs ? 'Vy' : 'You') : person?.username}</span>
              </div>
              <span className="text-center text-xs font-bold leading-snug text-slate-700">{fighters.get(pick.predicted_winner_id)?.name}</span>
            </li>;
          })}
        </ul>}
    </div>
  </article>;
}
