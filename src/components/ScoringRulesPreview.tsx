import { useId, useState } from 'react';
import { calculatePoints } from '../lib/scoring.ts';
import { previewScore, type FootballScoreMode, type RuleExample } from '../lib/rulePreview.ts';

export function ScoringRulesPreview({ lang = 'cz' }: { lang?: 'cz' | 'en' }) {
  const id = useId();
  const cz = lang === 'cz';
  const [mode, setMode] = useState<FootballScoreMode>('final');
  const [example, setExample] = useState<RuleExample>('penalties');
  const [home, setHome] = useState(2);
  const [away, setAway] = useState(1);
  const target = previewScore(mode, example);
  const points = calculatePoints(home, away, target.home, target.away);
  return <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
    <summary className="cursor-pointer font-bold text-slate-700">{cz ? 'Ukázka pravidel a bodování' : 'Scoring rules preview'}</summary>
    <div className="mt-3 space-y-3">
      <p className="text-slate-500">{cz ? 'Porovnej varianty. Tento náhled nemění pravidla rozehrané soutěže.' : 'Compare options. This preview does not change an ongoing competition.'}</p>
      <fieldset className="space-y-2">
        <legend className="mb-1 font-bold">{cz ? 'Jaké skóre tipujeme?' : 'Which score do we predict?'}</legend>
        {(['regulation', 'final'] as const).map(value => <label key={value} className="flex gap-2 items-start">
          <input type="radio" name={`${id}-score-mode`} value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-0.5 accent-red-600" />
          <span>{value === 'regulation' ? (cz ? '90 minut včetně nastavení — remíza je možná i v play-off' : '90 minutes including stoppage time — draws allowed in knockout games') : (cz ? 'Konečný výsledek — po prodloužení; při penaltách skóre rozstřelu' : 'Final score — after extra time; shootout score if penalties are played')}</span>
        </label>)}
      </fieldset>
      <label className="block font-bold">{cz ? 'Ukázkový zápas' : 'Example match'}
        <select value={example} onChange={event => setExample(event.target.value as RuleExample)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 font-normal">
          <option value="draw">{cz ? 'Remíza: po 90 minutách konec 1:1' : 'Draw: finishes 1:1 after 90 minutes'}</option>
          <option value="extra_time">{cz ? 'Prodloužení: 90 minut 1:1 → konec 2:1' : 'Extra time: 1:1 at 90 minutes → 2:1 final'}</option>
          <option value="penalties">{cz ? 'Penalty: 90 minut 1:1 → prodloužení 1:1 → rozstřel 4:3' : 'Penalties: 1:1 at 90 minutes → 1:1 after extra time → shootout 4:3'}</option>
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">{cz ? 'Tvůj tip' : 'Your prediction'}</span>
        <input aria-label={cz ? 'Ukázkový tip domácích' : 'Example home prediction'} type="number" min="0" max="99" value={home} onChange={e => setHome(Math.max(0, Math.min(99, Number(e.target.value) || 0)))} className="w-14 rounded-lg border border-slate-200 bg-white p-2 text-center" />
        <span>:</span>
        <input aria-label={cz ? 'Ukázkový tip hostů' : 'Example away prediction'} type="number" min="0" max="99" value={away} onChange={e => setAway(Math.max(0, Math.min(99, Number(e.target.value) || 0)))} className="w-14 rounded-lg border border-slate-200 bg-white p-2 text-center" />
      </div>
      <p aria-live="polite" className="rounded-lg bg-white p-3 font-bold text-slate-900">
        {cz ? 'Bodované skóre' : 'Scored result'}: {target.home}:{target.away} · {cz ? 'Získáš' : 'You earn'} {points} {cz ? 'b.' : 'pts'}
      </p>
      <p className="leading-relaxed text-slate-500">{cz ? 'Přesný výsledek 5 b. · vítěz a rozdíl 3 b. · vítěz 2 b. · jiná správná remíza 2 b. · jinak 0 b.' : 'Exact score 5 pts · winner and goal difference 3 pts · winner 2 pts · other correct draw 2 pts · otherwise 0 pts'}</p>
    </div>
  </details>;
}
