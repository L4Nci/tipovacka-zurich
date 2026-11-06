import { translate, normalizeLocale, type LocaleInput } from '../i18n/index.ts';
import { useEffect, useState } from 'react';
import { Gift, Minus, Plus, Save } from 'lucide-react';
import { setLobbyPrizesSecure } from '../lib/productFeatures.ts';
import {
  formatPrizePosition,
  MAX_LOBBY_PRIZES,
  normalizeLobbyPrizeEntries,
  prepareLobbyPrizeSelection
} from '../lib/productEvolution.ts';
import type { LobbyPrizeEntry } from '../types.ts';

type LobbyPrizePanelProps = {
  lobbyId: string;
  enabled: boolean;
  entries: LobbyPrizeEntry[];
  canEdit: boolean;
  lang: LocaleInput;
  onSaved: (enabled: boolean, entries: LobbyPrizeEntry[]) => void;
  savePrizes?: (
    lobbyId: string,
    enabled: boolean,
    entries: LobbyPrizeEntry[]
  ) => Promise<{ enabled: boolean; entries: LobbyPrizeEntry[] }>;
};

export function LobbyPrizePanel({
  lobbyId,
  enabled,
  entries,
  canEdit,
  lang: requestedLocale,
  onSaved,
  savePrizes = setLobbyPrizesSecure
}: LobbyPrizePanelProps) {
  const lang = normalizeLocale(requestedLocale);
  const [draftEnabled, setDraftEnabled] = useState(enabled);
  const [draftEntries, setDraftEntries] = useState<LobbyPrizeEntry[]>(
    entries.length ? normalizeLobbyPrizeEntries(entries) : [
      { position: 1, label: '' },
      { position: 2, label: '' },
      { position: 3, label: '' }
    ]
  );
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setDraftEnabled(enabled);
    setDraftEntries(entries.length ? normalizeLobbyPrizeEntries(entries) : [
      { position: 1, label: '' },
      { position: 2, label: '' },
      { position: 3, label: '' }
    ]);
  }, [enabled, entries]);

  if (!enabled && !canEdit) return null;

  const save = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const selection = prepareLobbyPrizeSelection({
        enabled: draftEnabled,
        entries: draftEntries
      });
      const saved = await savePrizes(
        lobbyId,
        selection.enabled,
        selection.entries
      );
      onSaved(saved.enabled, saved.entries);
      setEditing(false);
      setSuccess(translate(lang, "lobbyPrizePanel.prizesSaved"));
    } catch (saveError: any) {
      setError(saveError?.message || (
        translate(lang, "lobbyPrizePanel.prizesCouldNotBeSaved")
      ));
    } finally {
      setSaving(false);
    }
  };

  const visibleEntries = enabled ? entries : [];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <Gift className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400">
              {translate(lang, "lobbyPrizePanel.whatWePlayFor")}
            </p>
            <h2 className="mt-1 text-base font-black text-slate-950">
              {enabled
                ? (translate(lang, "lobbyPrizePanel.lobbyPrizes"))
                : (translate(lang, "lobbyPrizePanel.prizesAreDisabled"))}
            </h2>
          </div>
        </div>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-10 rounded-xl border border-slate-200 px-3 text-[10px] font-black uppercase text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
          >
            {translate(lang, "lobbyPrizePanel.edit")}
          </button>
        )}
      </div>

      {!editing && visibleEntries.length > 0 && (
        <ol className="mt-5 space-y-3">
          {visibleEntries.map(entry => (
            <li key={entry.position} className="flex gap-3 text-sm">
              <span className="w-20 shrink-0 font-black text-slate-500">
                {formatPrizePosition(entry.position, lang)}
              </span>
              <span className="font-semibold text-slate-900">{entry.label}</span>
            </li>
          ))}
        </ol>
      )}

      {editing && (
        <div className="mt-5 space-y-4">
          <label className="flex min-h-11 items-center justify-between gap-4 rounded-xl bg-slate-50 px-4">
            <span className="text-xs font-black text-slate-800">
              {translate(lang, "lobbyPrizePanel.wePlayForPrizes")}
            </span>
            <input
              type="checkbox"
              checked={draftEnabled}
              onChange={event => setDraftEnabled(event.target.checked)}
              className="h-5 w-5 accent-red-600"
            />
          </label>

          {draftEnabled && (
            <div className="space-y-3">
              {draftEntries.map((entry, index) => (
                <label key={entry.position} className="grid grid-cols-[76px_1fr] items-center gap-3">
                  <span className="text-[10px] font-black uppercase text-slate-500">
                    {formatPrizePosition(index + 1, lang)}
                  </span>
                  <input
                    type="text"
                    value={entry.label}
                    maxLength={120}
                    onChange={event => setDraftEntries(previous => previous.map((item, itemIndex) => (
                      itemIndex === index ? { ...item, label: event.target.value } : item
                    )))}
                    className="min-h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                    placeholder={translate(lang, "lobbyPrizePanel.eGRestaurantVoucher")}
                  />
                </label>
              ))}
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-label={translate(lang, "lobbyPrizePanel.addPlacement")}
                  disabled={draftEntries.length >= MAX_LOBBY_PRIZES}
                  onClick={() => setDraftEntries(previous => [
                    ...previous,
                    { position: previous.length + 1, label: '' }
                  ])}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={translate(lang, "lobbyPrizePanel.removeLastPlacement")}
                  disabled={draftEntries.length <= 1}
                  onClick={() => setDraftEntries(previous => previous.slice(0, -1))}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-40"
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="min-h-11 flex-1 rounded-xl border border-slate-200 text-[10px] font-black uppercase text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
            >
              {translate(lang, "lobbyPrizePanel.cancel")}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 text-[10px] font-black uppercase text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-50"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {saving ? (translate(lang, "lobbyPrizePanel.saving")) : (translate(lang, "lobbyPrizePanel.save"))}
            </button>
          </div>
        </div>
      )}

      <p className="mt-4 text-[10px] font-medium leading-relaxed text-slate-400">
        {translate(lang, "lobbyPrizePanel.prizesAreProvidedByTheLobbyManagerTipovackaDoes")}
      </p>
      {error && <p role="alert" className="mt-3 text-xs font-semibold text-red-700">{error}</p>}
      {success && <p role="status" className="mt-3 text-xs font-semibold text-emerald-700">{success}</p>}
    </section>
  );
}
