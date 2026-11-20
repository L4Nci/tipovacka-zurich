import { Calendar, CheckCircle2, ShieldCheck, Trophy } from 'lucide-react';

const icons = { matches: Calendar, results: CheckCircle2, leaderboard: Trophy, winner: Trophy, admin: ShieldCheck };
export type CompetitionTab = keyof typeof icons;

export function CompetitionBottomNav<T extends CompetitionTab>({ items, active, onSelect }: {
  items: { id: T; label: string }[];
  active: string;
  onSelect: (tab: T) => void;
}) {
  return <nav className="fixed bottom-0 left-0 right-0 z-50 mx-auto flex max-w-lg items-center justify-around rounded-t-[2rem] border-t border-slate-100 bg-white/80 px-2 py-3 backdrop-blur-lg">
    {items.map(({ id, label }) => {
      const Icon = icons[id];
      return <button key={id} type="button" aria-current={active === id ? 'page' : undefined} onClick={() => onSelect(id)}
        className={`flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 transition-colors motion-reduce:transition-none ${active === id ? (id === 'admin' ? 'text-red-600' : 'text-fan-primary') : 'text-slate-500'}`}>
        <Icon aria-hidden="true" className="h-6 w-6 shrink-0" />
        <span className="max-w-full break-words text-center text-[10px] font-bold uppercase">{label}</span>
      </button>;
    })}
  </nav>;
}
