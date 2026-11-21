import { translate, type Locale } from '../i18n/index.ts';
import React, { useEffect, useState } from 'react';
import { Check, Copy, Download, QrCode, Share2, X } from 'lucide-react';
import { buildInviteUrl, createQrDataUrl, renderShareCard, shareOrCopy } from '../lib/sharing.ts';

export default function InviteShareDialog({
  lobbyName,
  joinCode,
  lang,
  onClose
}: {
  lobbyName: string;
  joinCode: string;
  lang: Locale;
  onClose: () => void;
}) {
  const inviteUrl = buildInviteUrl(joinCode, window.location.origin);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!qrOpen || qrDataUrl || qrFailed) return;
    let current = true;
    void createQrDataUrl(inviteUrl)
      .then(url => {
        if (current) setQrDataUrl(url);
      })
      .catch(() => {
        if (current) setQrFailed(true);
      });
    return () => {
      current = false;
    };
  }, [inviteUrl, qrOpen, qrDataUrl, qrFailed]);

  const copyLink = async () => {
    setError('');
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      setError(translate(lang, "inviteShareDialog.sharingFailed"));
    }
  };

  const share = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await shareOrCopy({
        title: `Tipovačka · ${lobbyName}`,
        text: translate(lang, "inviteShareDialog.joinTheLobby", { value1: lobbyName }),
        url: inviteUrl
      });
      setCopied(result === 'copied');
    } catch (reason: any) {
      if (reason?.name !== 'AbortError') {
        setError(translate(lang, "inviteShareDialog.sharingFailed"));
      }
    } finally {
      setBusy(false);
    }
  };

  const downloadCard = async () => {
    setBusy(true);
    setError('');
    try {
      const blob = await renderShareCard({
        type: 'lobby_invitation',
        title: lobbyName,
        subtitle: translate(lang, "inviteShareDialog.joinOurPredictionLeague"),
        stats: [{ label: translate(lang, "inviteShareDialog.lobbyCode"), value: joinCode }],
        context: inviteUrl
      });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `tipovacka-${joinCode.toLowerCase()}.png`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setError(translate(lang, "inviteShareDialog.cardDownloadFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/40 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label={translate(lang, "inviteShareDialog.inviteToLobby")} className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-black text-slate-900"><QrCode className="h-5 w-5 text-red-600" /> {translate(lang, "inviteShareDialog.inviteToLobby")}</h2>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-500" aria-label={translate(lang, "homeDashboard.close")}><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-1 text-sm font-semibold text-slate-500">{lobbyName}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void copyLink()} disabled={busy} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-fan-primary px-3 py-2 text-xs font-black text-fan-snow disabled:opacity-50">
            {copied ? <Check aria-hidden="true" className="h-4 w-4 shrink-0" /> : <Copy aria-hidden="true" className="h-4 w-4 shrink-0" />}
            <span aria-live="polite">{translate(lang, copied ? "officialEventSeasonResult.linkCopied" : "inviteShareDialog.copyLink")}</span>
          </button>
          <button type="button" onClick={share} disabled={busy} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50"><Share2 className="h-4 w-4 shrink-0" /> {translate(lang, "inviteShareDialog.share")}</button>
        </div>
        <p className="mt-3 text-xs font-semibold text-slate-600">{translate(lang, "inviteShareDialog.lobbyCode")}: <code className="break-all font-bold">{joinCode}</code></p>
        <details className="mt-3 rounded-xl bg-slate-50 px-3" onToggle={event => setQrOpen(event.currentTarget.open)}>
          <summary className="min-h-11 cursor-pointer py-3 text-xs font-bold text-slate-700">{translate(lang, "inviteShareDialog.lobbyInvitationQr")}</summary>
          {qrDataUrl
            ? <img src={qrDataUrl} alt={translate(lang, "inviteShareDialog.lobbyInvitationQr")} className="mx-auto mb-3 aspect-square w-full max-w-56 rounded-xl" />
            : qrFailed
              ? <p role="alert" className="pb-3 text-xs text-red-700">{translate(lang, "inviteShareDialog.qrCodeCouldNotBeCreated")}</p>
              : <div className="mx-auto mb-3 aspect-square w-full max-w-56 animate-pulse rounded-xl bg-slate-200 motion-reduce:animate-none" />}
        </details>
        <button type="button" onClick={downloadCard} disabled={busy} className="mt-2 flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-bold text-slate-700 disabled:opacity-50"><Download className="h-4 w-4 shrink-0" /> {translate(lang, "inviteShareDialog.card")}</button>
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}
      </section>
    </div>
  );
}
