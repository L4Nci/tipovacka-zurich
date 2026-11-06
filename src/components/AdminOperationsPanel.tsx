import { translate, type Locale } from '../i18n/index.ts';
import React, { useEffect, useState } from 'react';
import { Activity, RefreshCcw } from 'lucide-react';
import type { AdminOperationsSummary } from '../types.ts';
import { fetchAdminOperationsSummary } from '../lib/productFeatures.ts';

export default function AdminOperationsPanel({ lang }: { lang: Locale }) {
  const [summary, setSummary] = useState<AdminOperationsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setSummary(await fetchAdminOperationsSummary());
    } catch (reason: any) {
      setError(reason?.message || (translate(lang, "adminOperationsPanel.operationsOverviewIsUnavailable")));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="mb-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400"><Activity className="h-4 w-4" /> {translate(lang, "adminOperationsPanel.operations")}</h3>
        <button type="button" onClick={() => void load()} disabled={loading} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-500 disabled:opacity-50" aria-label={translate(lang, "adminOperationsPanel.refreshOverview")}><RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} /></button>
      </div>
      {loading && !summary ? (
        <div className="mt-4 grid grid-cols-2 gap-2">{[0, 1, 2, 3].map(item => <div key={item} className="h-16 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none" />)}</div>
      ) : error ? (
        <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-3 text-xs font-semibold text-red-600">{error}</p>
      ) : summary ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              [translate(lang, "adminOperationsPanel.users"), summary.users],
              [translate(lang, "adminOperationsPanel.lobbies"), summary.lobbies],
              [translate(lang, "adminOperationsPanel.activeMemberships"), summary.active_memberships],
              [translate(lang, "adminOperationsPanel.predictions7d"), summary.predictions_7d],
              [translate(lang, "adminOperationsPanel.requests"), summary.pending_join_requests],
              [translate(lang, "adminOperationsPanel.missingResults"), summary.locked_without_result],
              [translate(lang, "adminOperationsPanel.orphanMemberships"), summary.orphan_memberships],
              [translate(lang, "adminOperationsPanel.duplicates"), summary.duplicate_memberships]
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl bg-slate-50 p-3">
                <p className="text-[9px] font-black uppercase leading-tight text-slate-400">{label}</p>
                <p className="mt-1 text-xl font-black text-slate-900">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] font-semibold text-slate-400">
            {translate(lang, "adminOperationsPanel.aggregatedOperationsOnlyNoPersonalData")}
          </p>
        </>
      ) : null}
    </section>
  );
}
