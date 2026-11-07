import { useState } from 'react';
import type { MmaFighter } from '../lib/mma.ts';
import { fighterInitials, safeMmaPortrait } from '../lib/mmaPortraits.ts';
import { translate, type Locale } from '../i18n/index.ts';

function PortraitImage({ src, initials }: { key?: string; src: string; initials: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <>{initials}</> : <img src={src} alt="" width={40} height={40} loading="lazy" decoding="async"
    referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full rounded-full object-cover object-[center_20%]" />;
}

export function MmaFighterPortrait({ fighter }: { fighter?: MmaFighter }) {
  const portrait = safeMmaPortrait(fighter?.portrait);
  const initials = fighterInitials(fighter?.name);
  return <span aria-hidden="true" className="relative mx-auto mb-1.5 flex h-10 w-10 items-center justify-center rounded-full bg-white text-xs font-black text-slate-400 ring-1 ring-slate-200">
    {portrait ? <PortraitImage key={portrait.url} src={portrait.url} initials={initials} /> : initials}
    {fighter?.country_code && <span className="absolute -bottom-1 -right-2 rounded border border-slate-100 bg-white px-1 text-[8px] leading-3 text-slate-500">{fighter.country_code}</span>}
  </span>;
}

export function MmaPortraitCredit({ fighter, lang }: { fighter?: MmaFighter; lang: Locale }) {
  const portrait = safeMmaPortrait(fighter?.portrait);
  if (!portrait) return <span aria-hidden="true" />;
  const linkClass = 'underline decoration-slate-300 underline-offset-2 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500';
  return <p className="min-w-0 text-center text-[9px] leading-relaxed text-slate-400 [overflow-wrap:anywhere]">
    {translate(lang, 'mmaPhoto.cropped')}{' '}
    <a href={portrait.source_page} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className={linkClass}>{portrait.artist}</a>
    {' · '}{portrait.license_url ? <a href={portrait.license_url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className={linkClass}>{portrait.license}</a> : portrait.license}
  </p>;
}
