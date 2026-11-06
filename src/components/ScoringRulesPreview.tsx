import { translate, type Locale } from '../i18n/index.ts';
import { useId, useState } from 'react';
import { calculatePoints } from '../lib/scoring.ts';
import { previewScore, type FootballScoreMode, type RuleExample } from '../lib/rulePreview.ts';

export function ScoringRulesPreview({ lang = 'cs' }: { lang?: Locale }) {
  const id = useId();
  const [mode, setMode] = useState<FootballScoreMode>('final');
  const [example, setExample] = useState<RuleExample>('penalties');
  const [home, setHome] = useState(2);
  const [away, setAway] = useState(1);
  const target = previewScore(mode, example);
  const points = calculatePoints(home, away, target.home, target.away);
  return <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
    <summary className="cursor-pointer font-bold text-slate-700">{translate(lang, "scoringRulesPreview.scoringRulesPreview")}</summary>
    <div className="mt-3 space-y-3">
      <p className="text-slate-500">{translate(lang, "scoringRulesPreview.compareOptionsThisPreviewDoesNotChangeAnOngoing")}</p>
      <fieldset className="space-y-2">
        <legend className="mb-1 font-bold">{translate(lang, "scoringRulesPreview.whichScoreDoWePredict")}</legend>
        {(['regulation', 'final'] as const).map(value => <label key={value} className="flex gap-2 items-start">
          <input type="radio" name={`${id}-score-mode`} value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-0.5 accent-red-600" />
          <span>{value === 'regulation' ? (translate(lang, "scoringRulesPreview.90MinutesIncludingStoppageTimeDrawsAllowedInKnockout")) : (translate(lang, "scoringRulesPreview.finalScoreAfterExtraTimeShootoutScoreIfPenalties"))}</span>
        </label>)}
      </fieldset>
      <label className="block font-bold">{translate(lang, "scoringRulesPreview.exampleMatch")}
        <select value={example} onChange={event => setExample(event.target.value as RuleExample)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 font-normal">
          <option value="draw">{translate(lang, "scoringRulesPreview.drawFinishes11After90Minutes")}</option>
          <option value="extra_time">{translate(lang, "scoringRulesPreview.extraTime11At90Minutes21")}</option>
          <option value="penalties">{translate(lang, "scoringRulesPreview.penalties11At90Minutes11After")}</option>
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">{translate(lang, "scoringRulesPreview.yourPrediction")}</span>
        <input aria-label={translate(lang, "scoringRulesPreview.exampleHomePrediction")} type="number" min="0" max="99" value={home} onChange={e => setHome(Math.max(0, Math.min(99, Number(e.target.value) || 0)))} className="w-14 rounded-lg border border-slate-200 bg-white p-2 text-center" />
        <span>:</span>
        <input aria-label={translate(lang, "scoringRulesPreview.exampleAwayPrediction")} type="number" min="0" max="99" value={away} onChange={e => setAway(Math.max(0, Math.min(99, Number(e.target.value) || 0)))} className="w-14 rounded-lg border border-slate-200 bg-white p-2 text-center" />
      </div>
      <p aria-live="polite" className="rounded-lg bg-white p-3 font-bold text-slate-900">
        {translate(lang, "scoringRulesPreview.scoredResult")}: {target.home}:{target.away} · {translate(lang, "scoringRulesPreview.youEarn")} {points} {translate(lang, "mmaEventView.pts")}
      </p>
      <p className="leading-relaxed text-slate-500">{translate(lang, "scoringRulesPreview.exactScore5PtsWinnerAndGoalDifference3")}</p>
    </div>
  </details>;
}
