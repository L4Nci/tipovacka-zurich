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
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    void createQrDataUrl(inviteUrl)
      .then(url => {
        if (current) setQrDataUrl(url);
      })
      .catch(() => {
        if (current) setError(translate(lang, "inviteShareDialog.qrCodeCouldNotBeCreated"));
      });
    return () => {
      current = false;
    };
  }, [inviteUrl, lang]);

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
        <div className="mt-4 flex min-h-64 items-center justify-center rounded-2xl bg-slate-50 p-4">
          {qrDataUrl
            ? <img src={qrDataUrl} alt={translate(lang, "inviteShareDialog.lobbyInvitationQr")} className="aspect-square w-full max-w-56 rounded-xl" />
            : <div className="h-48 w-48 animate-pulse rounded-xl bg-slate-200 motion-reduce:animate-none" />}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2">
          <code className="min-w-0 flex-1 truncate px-2 text-xs font-bold text-slate-600">{inviteUrl}</code>
          <button type="button" onClick={() => void navigator.clipboard.writeText(inviteUrl).then(() => setCopied(true))} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600" aria-label={translate(lang, "inviteShareDialog.copyLink")}>
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={share} disabled={busy} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-3 text-xs font-black uppercase text-white disabled:opacity-50"><Share2 className="h-4 w-4" /> {translate(lang, "inviteShareDialog.share")}</button>
          <button type="button" onClick={downloadCard} disabled={busy} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-black uppercase text-white disabled:opacity-50"><Download className="h-4 w-4" /> {translate(lang, "inviteShareDialog.card")}</button>
        </div>
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}
      </section>
    </div>
  );
}
