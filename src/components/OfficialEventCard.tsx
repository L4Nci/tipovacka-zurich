import { ArrowRight, CheckCircle2, Gift, ShieldCheck, Users } from 'lucide-react';
import { formatTipsterCount } from '../lib/homeDashboard.ts';
import type { OfficialEventCard as OfficialEventCardType } from '../types.ts';

type OfficialEventCardProps = {
  key?: string;
  event: OfficialEventCardType;
  commercialEnabled: boolean;
  busy?: boolean;
  eagerCover?: boolean;
  onOpen: (event: OfficialEventCardType) => void;
};

const getOfficialEventCover = (coverKey: string | null) => {
  const normalized = String(coverKey || '').toLowerCase();
  return normalized.includes('hockey') || normalized.includes('ice')
    ? '/lobby-covers/ice-community.jpg'
    : '/lobby-covers/stadium-community.jpg';
};

const formatDeadline = (value: string | null | undefined) => {
  if (!value) return null;
  return new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Prague'
  }).format(new Date(value));
};

export function OfficialEventCard({
  event,
  commercialEnabled,
  busy = false,
  eagerCover = false,
  onOpen
}: OfficialEventCardProps) {
  const isCompleted = event.status === 'completed';
  const isActionable = event.is_participating && event.actionable_match_count > 0;
  const status = isCompleted
    ? 'Turnaj ukončen'
    : event.actionable_match_count > 0
      ? `${event.actionable_match_count} zápasy čekají`
      : event.open_match_count > 0
        ? 'Všechny otevřené zápasy máš tipnuté'
        : 'Další zápasy zatím nejsou otevřené';
  const cta = isCompleted
    ? 'Zobrazit výsledky'
    : !event.is_participating
      ? 'Zapojit se'
      : isActionable
        ? 'Tipovat'
        : 'Zobrazit turnaj';
  const deadline = formatDeadline(event.next_match?.lock_time_utc);
  const cardHeight = isCompleted ? 'min-h-[236px]' : 'min-h-[264px]';
  const ctaStyle = isActionable
    ? 'border border-red-600 bg-red-600 text-white shadow-sm hover:bg-red-700'
    : isCompleted
      ? 'border border-slate-300 bg-white/75 text-slate-900 shadow-none backdrop-blur-sm hover:bg-white'
      : 'border border-slate-950 bg-slate-950 text-white shadow-sm hover:bg-slate-800';

  return (
    <article className={`group relative ${cardHeight} overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none`}>
      <img
        src={getOfficialEventCover(event.cover_key)}
        alt=""
        aria-hidden="true"
        loading={eagerCover ? 'eager' : 'lazy'}
        className="absolute inset-0 h-full w-full object-cover opacity-[0.32]"
      />
      <div className="absolute inset-0 bg-white/10" aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-r from-white via-white/85 to-white/30" aria-hidden="true" />
      <button
        type="button"
        onClick={() => onOpen(event)}
        aria-label={`Otevřít oficiální turnaj ${event.name}`}
        className="absolute inset-0 z-10 cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-500"
      />

      <div className={`pointer-events-none relative z-20 flex ${cardHeight} flex-col p-5`}>
        <div className="min-w-0 max-w-[88%]">
          <h3 className="break-words text-xl font-black uppercase leading-tight text-slate-950">
            {event.name}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] font-black uppercase tracking-[0.12em] text-red-600">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Oficiální
            </span>
            {typeof event.participant_count === 'number' && (
              <span className="inline-flex items-center gap-1 text-slate-500">
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                {formatTipsterCount(event.participant_count, 'cz')}
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 flex max-w-[88%] flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold leading-snug text-slate-600">
          {commercialEnabled && event.partner_name && <span>S partnerem {event.partner_name}</span>}
          {commercialEnabled && event.has_prizes && (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <Gift className="h-4 w-4" aria-hidden="true" />
              Hraje se o ceny
            </span>
          )}
        </div>

        <div className="mt-auto pt-6">
          <p className={`text-base font-black ${isActionable ? 'text-red-600' : 'text-slate-900'}`}>
            {status}
          </p>
          {!isCompleted && deadline && (
            <p className="mt-1 text-xs font-semibold text-slate-500">Uzávěrka {deadline}</p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={clickEvent => {
              clickEvent.stopPropagation();
              onOpen(event);
            }}
            aria-label={`${cta}: ${event.name}`}
            className={`pointer-events-auto mt-5 inline-flex min-h-11 max-w-full items-center justify-center gap-2 self-start rounded-xl px-4 text-[10px] font-black uppercase tracking-wider transition-[transform,background-color,border-color] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none ${ctaStyle}`}
          >
            {isCompleted && <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            {busy ? 'Načítám' : cta}
            {!busy && !isCompleted && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </article>
  );
}
