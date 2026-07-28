import { ArrowRight, EyeOff, Trophy } from 'lucide-react';
import type { OfficialEventCard as OfficialEventCardType } from '../types.ts';

type OfficialEventCardProps = {
  event: OfficialEventCardType;
  prominent: boolean;
  busy?: boolean;
  onOpen: (event: OfficialEventCardType) => void;
  onHide: (eventId: string) => void;
};

export function OfficialEventCard({
  event,
  prominent,
  busy = false,
  onOpen,
  onHide
}: OfficialEventCardProps) {
  const status = event.status === 'completed'
    ? 'Event ukončen'
    : event.actionable_match_count > 0
      ? `${event.actionable_match_count} zápasy čekají`
      : event.open_match_count > 0
        ? 'Všechny otevřené zápasy máš tipnuté'
        : 'Další zápasy zatím nejsou otevřené';
  const cta = event.status === 'completed'
    ? 'Zobrazit výsledky'
    : event.is_participating
      ? 'Tipovat'
      : 'Vstoupit do eventu';

  return (
    <article className={`relative overflow-hidden rounded-2xl border p-5 ${prominent ? 'border-slate-900 bg-slate-950 text-white shadow-xl' : 'border-slate-200 bg-white text-slate-950 shadow-sm'}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-[9px] font-black uppercase tracking-[0.2em] ${prominent ? 'text-red-300' : 'text-red-600'}`}>Oficiální event</p>
          <h2 className="mt-2 text-xl font-black tracking-tight">{event.name}</h2>
          {event.description && <p className={`mt-2 max-w-sm text-xs font-medium leading-relaxed ${prominent ? 'text-slate-300' : 'text-slate-500'}`}>{event.description}</p>}
        </div>
        <Trophy className={`h-6 w-6 shrink-0 ${prominent ? 'text-red-400' : 'text-red-600'}`} />
      </div>
      <p className={`mt-5 text-sm font-black ${prominent ? 'text-white' : 'text-slate-800'}`}>{status}</p>
      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onOpen(event)}
          className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-[10px] font-black uppercase tracking-wider disabled:opacity-50 ${prominent ? 'bg-red-600 text-white' : 'bg-slate-950 text-white'}`}
        >
          {cta} <ArrowRight className="h-4 w-4" />
        </button>
        {event.is_participating && (
          <button
            type="button"
            onClick={() => onHide(event.event_id)}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${prominent ? 'border-white/20 text-slate-300' : 'border-slate-200 text-slate-500'}`}
            aria-label="Skrýt oficiální event z Home"
          >
            <EyeOff className="h-4 w-4" />
          </button>
        )}
      </div>
    </article>
  );
}
