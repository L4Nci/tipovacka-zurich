import { translate, type Locale } from '../i18n/index.ts';
import { ScoringRulesPreview } from './ScoringRulesPreview.tsx';
import { isHockeyTournament } from '../lib/matchRules.ts';
import { isMmaTournament } from '../lib/mma.ts';

export function TournamentSetup({ catalog, value, onChange, disabled, lang, error }: {
  catalog: { id: string; name: string; sport_id: string }[];
  value: string; onChange: (id: string) => void; disabled: boolean; lang: Locale; error?: string;
}) {
  const hockey = isHockeyTournament(value, catalog.find(item => item.id === value)?.sport_id);
  const mma = isMmaTournament(value, catalog.find(item => item.id === value)?.sport_id);
  return <>
    <div>
      <label htmlFor="new-lobby-tournament" className="block text-[9px] text-slate-400 font-bold uppercase mb-1">{translate(lang, "tournamentSetup.competition")}</label>
      <select id="new-lobby-tournament" value={value} onChange={e => onChange(e.target.value)} disabled={disabled || catalog.length === 0}
        className="w-full p-2.5 bg-slate-50 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-red-600 font-bold text-slate-700">
        {catalog.length === 0 && <option value="">{translate(lang, "tournamentSetup.loadingCompetitions")}</option>}
        {catalog.map(item => <option key={item.id} value={item.id}>{item.sport_id === 'mma' ? 'MMA ·' : item.sport_id === 'hockey' ? '🏒' : '⚽'} {item.name}</option>)}
      </select>
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
    {value && !hockey && !mma && <ScoringRulesPreview lang={lang} />}
    {mma && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
      {translate(lang, "tournamentSetup.mmaPilotCorrectBoutWinner1PointDrawsNo")}
    </p>}
    {hockey && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
      {translate(lang, "tournamentSetup.hockeyFinalScoreIncludingOvertimeAndTheDecidingShootout")}
    </p>}
  </>;
}
