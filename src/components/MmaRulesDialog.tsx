import { translate, intlLocale, type Locale } from '../i18n/index.ts';
import { useEffect, useId, useRef } from 'react';
import { Info, X } from 'lucide-react';
import type { MmaEvent, MmaRulesVersion } from '../lib/mma.ts';
import { MATCH_TIME_ZONE } from '../lib/matchTime.ts';

export function formatMmaEventTime(value: string, lang: Locale) {
  return new Intl.DateTimeFormat(intlLocale(lang), {
    day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: MATCH_TIME_ZONE,
  }).format(new Date(value));
}

export function MmaRulesDialog({ open, event, lang, rulesVersion = event?.rules_version ?? 'mma-winner-v1', mixedRules = false, onClose }: {
  open: boolean; event?: MmaEvent | null; lang: Locale; rulesVersion?: MmaRulesVersion; mixedRules?: boolean; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const methodEnabled = rulesVersion === 'mma-winner-method-v2';
  useEffect(() => {
    if (!open) { if (dialog.current?.open) dialog.current.close(); return; }
    if (!dialog.current?.open) dialog.current?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      if (dialog.current?.open) dialog.current.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={onClose} onClose={onClose}
    onClick={e => {
      if (e.target !== e.currentTarget) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) onClose();
    }}
    className="m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-sm overflow-y-auto rounded-3xl border border-slate-100 bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/40 backdrop:backdrop-blur-sm">
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 id={titleId} className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500">
        <Info className="h-4 w-4" />{translate(lang, "mmaEventView.rulesAndScoring")}
      </h2>
      <button type="button" onClick={onClose} autoFocus aria-label={translate(lang, "mmaRulesDialog.closeRules")}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
        <X className="h-4 w-4" />
      </button>
    </div>
    <p className="mb-4 text-sm font-semibold leading-relaxed text-slate-600">{translate(lang, methodEnabled ? 'mmaMethod.rulesIntro' : 'mmaRulesDialog.pickTheWinnerOfEachBout')}</p>
    <div className="space-y-2">
      {(methodEnabled ? [
        [translate(lang, 'mmaMethod.bothCorrect'), translate(lang, 'mmaMethod.5Points')],
        [translate(lang, 'mmaMethod.winnerOnly'), translate(lang, 'mmaMethod.3Points')],
        [translate(lang, 'mmaMethod.methodOnly'), translate(lang, 'mmaRulesDialog.1Point')],
        [translate(lang, 'mmaMethod.neitherCorrect'), translate(lang, 'mmaRulesDialog.0Points')],
        [translate(lang, 'mmaRulesDialog.drawNoContestCancelledBout'), translate(lang, 'mmaRulesDialog.0Points')],
      ] : [
        [translate(lang, "mmaRulesDialog.correctWinner"), translate(lang, "mmaRulesDialog.1Point")],
        [translate(lang, "mmaRulesDialog.incorrectWinner"), translate(lang, "mmaRulesDialog.0Points")],
        [translate(lang, "mmaRulesDialog.drawNoContestCancelledBout"), translate(lang, "mmaRulesDialog.0Points")],
      ]).map(([label, points]) => <div key={label} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
        <span className="text-xs font-bold text-slate-700">{label}</span>
        <span className="shrink-0 rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-black text-white">{points}</span>
      </div>)}
    </div>
    <p className="mt-4 text-xs leading-relaxed text-slate-500">{translate(lang, "mmaRulesDialog.allPicksLockAtTheFirstBoutIncludingPrelims")}</p>
    <p className="mt-2 text-xs leading-relaxed text-slate-500">{translate(lang, methodEnabled ? 'mmaMethod.optionalHelp' : 'mmaRulesDialog.ifTheLineupChangesPickAgainMethodAndFinishing')}</p>
    {methodEnabled && <>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">{translate(lang, 'mmaMethod.dqRules')}</p>
      <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">{translate(lang, 'mmaMethod.example')}</p>
    </>}
    {mixedRules && <p className="mt-3 text-xs leading-relaxed text-slate-500">{translate(lang, 'mmaMethod.mixedRules')}</p>}
    {event && <div className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
      <p className="font-bold text-red-600">{translate(lang, "mmaEventView.cardDeadline")}{formatMmaEventTime(event.lock_time_utc, lang)}</p>
      {event.main_card_at && <p>{translate(lang, "mmaRulesDialog.mainCard")}{formatMmaEventTime(event.main_card_at, lang)}</p>}
      <p className="text-[10px] text-slate-400">{translate(lang, "mmaRulesDialog.timesAreShownInPragueTime")}</p>
    </div>}
  </dialog>;
}
