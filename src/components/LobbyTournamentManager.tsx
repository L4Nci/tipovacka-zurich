import React, { useEffect, useState } from 'react';
import { Archive, Plus, RefreshCcw, Trophy } from 'lucide-react';
import type { LobbyTournamentCatalogItem } from '../types.ts';
import {
  addTournamentToLobbySecure,
  fetchLobbyTournamentCatalog,
  setLobbyTournamentStatus
} from '../lib/productFeatures.ts';

export default function LobbyTournamentManager({
  lobbyId,
  lang,
  onChanged
}: {
  lobbyId: string;
  lang: 'cz' | 'en';
  onChanged: () => void;
}) {
  const [items, setItems] = useState<LobbyTournamentCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await fetchLobbyTournamentCatalog(lobbyId));
    } catch (reason: any) {
      setError(reason?.message || (lang === 'cz' ? 'Turnaje se nepodařilo načíst.' : 'Tournaments could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [lobbyId]);

  const mutate = async (
    item: LobbyTournamentCatalogItem,
    action: 'add' | 'archive' | 'activate'
  ) => {
    setActionId(item.tournament_id);
    setError('');
    setMessage('');
    try {
      if (action === 'add') {
        await addTournamentToLobbySecure(lobbyId, item.tournament_id);
      } else {
        await setLobbyTournamentStatus(lobbyId, item.tournament_id, action === 'archive' ? 'archived' : 'active');
      }
      await load();
      onChanged();
      setMessage(lang === 'cz' ? 'Turnaje byly aktualizovány.' : 'Tournaments updated.');
    } catch (reason: any) {
      setError(reason?.message || (lang === 'cz' ? 'Změnu se nepodařilo uložit.' : 'Change could not be saved.'));
    } finally {
      setActionId('');
    }
  };

  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400"><Trophy className="h-4 w-4" /> {lang === 'cz' ? 'Správa soutěží' : 'Competition management'}</h3>
          <p className="mt-1 text-[10px] font-semibold text-slate-400">{lang === 'cz' ? 'Přidej podporovaný turnaj nebo archivuj vztah s lobby.' : 'Add a supported tournament or archive its lobby relation.'}</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500" aria-label={lang === 'cz' ? 'Obnovit turnaje' : 'Refresh tournaments'}><RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} /></button>
      </div>
      {loading && items.length === 0 ? (
        <div className="mt-4 space-y-2">{[0, 1].map(item => <div key={item} className="h-16 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none" />)}</div>
      ) : (
        <div className="mt-4 space-y-2">
          {items.map(item => (
            <div key={item.tournament_id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-slate-800">{item.tournament_name}</p>
                <p className="mt-1 text-[10px] font-semibold text-slate-400">
                  {item.is_completed
                    ? (lang === 'cz' ? 'Dokončeno' : 'Completed')
                    : `${item.match_count} ${lang === 'cz' ? 'zápasů' : 'matches'}`}
                </p>
              </div>
              {!item.is_linked ? (
                <button type="button" onClick={() => void mutate(item, 'add')} disabled={Boolean(actionId)} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-3 text-[10px] font-black uppercase text-white disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> {lang === 'cz' ? 'Přidat' : 'Add'}</button>
              ) : item.relation_status === 'archived' ? (
                <button type="button" onClick={() => void mutate(item, 'activate')} disabled={Boolean(actionId)} className="min-h-10 shrink-0 rounded-xl bg-white px-3 text-[10px] font-black uppercase text-slate-600 disabled:opacity-50">{lang === 'cz' ? 'Aktivovat' : 'Activate'}</button>
              ) : (
                <button type="button" onClick={() => void mutate(item, 'archive')} disabled={Boolean(actionId)} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 text-[10px] font-black uppercase text-slate-500 disabled:opacity-50"><Archive className="h-3.5 w-3.5" /> {lang === 'cz' ? 'Archivovat' : 'Archive'}</button>
              )}
            </div>
          ))}
          {items.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-center text-xs font-semibold text-slate-500">{lang === 'cz' ? 'Žádné podporované turnaje.' : 'No supported tournaments.'}</p>}
        </div>
      )}
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}
      {message && <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{message}</p>}
    </section>
  );
}
