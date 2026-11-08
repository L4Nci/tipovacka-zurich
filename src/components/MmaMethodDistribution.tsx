import { translate, type Locale } from '../i18n/index.ts';
import type { summarizeMmaMethods } from '../lib/mmaPredictions.ts';
import { formatMmaMethod } from '../i18n/sports.ts';

const colors = ['#b45309', '#7c3aed', '#0369a1'];

export function MmaMethodDistribution({ distribution, lang }: {
  distribution: ReturnType<typeof summarizeMmaMethods>; lang: Locale;
}) {
  const segments = distribution.segments.map(segment => ({ ...segment, label: formatMmaMethod(segment.method, lang) }));
  return <div className="px-1" role="img" aria-label={translate(lang, 'mmaMethod.distribution') + ': '
    + segments.map(segment => segment.label + ': ' + segment.percent + '%').join(', ')}>
    <div className="mb-1.5 grid grid-cols-3 gap-2 px-1 text-[9px] font-black">
      {segments.map((segment, index) => <span key={segment.method} style={{ color: colors[index] }}
        className={index === 0 ? 'text-left' : index === 1 ? 'text-center' : 'text-right'}>
        <span className="block text-[8px] uppercase text-slate-400">{segment.label}</span>{segment.percent}%
      </span>)}
    </div>
    <div className="flex h-3 overflow-hidden rounded-full bg-slate-200 shadow-inner ring-1 ring-slate-100">
      {segments.map((segment, index) => <div key={segment.method}
        style={{ width: segment.percent + '%', backgroundColor: colors[index] }}
        className="h-full transition-[width] duration-700 ease-out motion-reduce:transition-none" />)}
    </div>
  </div>;
}
