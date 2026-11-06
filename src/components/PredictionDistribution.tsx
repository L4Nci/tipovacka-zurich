import { translate, type Locale } from '../i18n/index.ts';
type PredictionDistributionProps = {
  homeLabel: string;
  awayLabel: string;
  homePercent: number;
  awayPercent: number;
  drawPercent?: number;
  loading?: boolean;
  lang: Locale;
};

/** Saved lobby picks, not betting odds or an editable slider. */
export function PredictionDistribution({ homeLabel, awayLabel, homePercent, awayPercent, drawPercent,
  loading = false, lang }: PredictionDistributionProps) {
  const showDraw = drawPercent !== undefined;
  const drawLabel = translate(lang, "predictionDistribution.draw");
  const description = loading ? (translate(lang, "predictionDistribution.loadingPredictionDistribution"))
    : (translate(lang, "predictionDistribution.savedPredictions")) + [homeLabel + ': ' + homePercent + '%', ...(showDraw ? [drawLabel + ': ' + drawPercent + '%'] : []),
      awayLabel + ': ' + awayPercent + '%'].join(', ');
  return <div className="px-1 mb-1" role="img" aria-label={description}>
    <div className={`grid ${showDraw ? 'grid-cols-3' : 'grid-cols-2'} items-end gap-2 mb-1.5 px-1 text-[9px] font-black uppercase`}>
      <span className="min-w-0 text-left text-[#ce1126]">
        <span className="block truncate text-[8px] text-slate-400" title={homeLabel}>{homeLabel}</span>
        {loading ? '…' : `${homePercent}%`}
      </span>
      {showDraw && <span className="text-center text-[#1f2937]">
        <span className="block text-[8px] text-slate-400">{drawLabel}</span>
        {loading ? '…' : `${drawPercent}%`}
      </span>}
      <span className="min-w-0 text-right text-[#006847]">
        <span className="block truncate text-[8px] text-slate-400" title={awayLabel}>{awayLabel}</span>
        {loading ? '…' : `${awayPercent}%`}
      </span>
    </div>
    <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden flex shadow-inner ring-1 ring-slate-100">
      <div style={{ width: `${homePercent}%` }} className="h-full bg-[#ce1126] transition-[width] duration-700 ease-out motion-reduce:transition-none" />
      {showDraw && <div style={{ width: `${drawPercent}%` }} className="h-full bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.12)] transition-[width] duration-700 ease-out motion-reduce:transition-none" />}
      <div style={{ width: `${awayPercent}%` }} className="h-full bg-[#006847] transition-[width] duration-700 ease-out motion-reduce:transition-none" />
    </div>
  </div>;
}
