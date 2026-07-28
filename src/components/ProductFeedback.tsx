import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export function InlineNotice({
  tone,
  children,
  action
}: {
  tone: 'success' | 'error' | 'info';
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const toneClass = tone === 'success'
    ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
    : tone === 'error'
      ? 'border-red-100 bg-red-50 text-red-700'
      : 'border-slate-200 bg-slate-50 text-slate-600';
  const ToneIcon = tone === 'success'
    ? CheckCircle2
    : tone === 'error'
      ? AlertCircle
      : Info;

  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-xs font-semibold ${toneClass}`}>
      <span className="flex min-w-0 items-center gap-2">
        <ToneIcon className="h-4 w-4 shrink-0" />
        <span>{children}</span>
      </span>
      {action}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  busy = false,
  destructive = false,
  onConfirm,
  onClose
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/40 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${destructive ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-700'}`}>
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <h2 id="confirm-dialog-title" className="text-base font-black text-slate-900">{title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-500" aria-label={cancelLabel}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-xl bg-slate-100 px-4 text-xs font-black uppercase text-slate-600 disabled:opacity-50">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className={`min-h-11 rounded-xl px-4 text-xs font-black uppercase text-white disabled:opacity-50 ${destructive ? 'bg-red-600' : 'bg-slate-900'}`}>
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
