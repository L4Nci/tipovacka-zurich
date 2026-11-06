import { translate } from '../i18n/index.ts';
import { useLocale } from '../i18n/LocaleProvider.tsx';
import { useState } from 'react';
import { Award, Download, Share2 } from 'lucide-react';
import {
  buildOfficialEventShareUrl,
  getSeasonResultHeadline,
  getSeasonResultTier
} from '../lib/productEvolution.ts';
import { renderShareCard, shareOrCopy } from '../lib/sharing.ts';
import type { OfficialEventSeasonResult } from '../types.ts';

type OfficialEventSeasonResultProps = {
  result: OfficialEventSeasonResult;
  username: string;
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export function OfficialEventSeasonResultCard({
  result,
  username
}: OfficialEventSeasonResultProps) {
  const { locale: lang } = useLocale();
  const [sharing, setSharing] = useState(false);
  const [feedback, setFeedback] = useState('');
  const tier = getSeasonResultTier(result, lang);
  const headline = getSeasonResultHeadline(result, lang);

  const buildCard = () => renderShareCard({
    type: 'official_event_result',
    title: result.event_name,
    subtitle: headline,
    identity: username,
    accentColor: result.accent_color,
    partnerName: result.partner_name || undefined,
    stats: [
      ...(tier ? [{ label: translate(lang, "officialEventSeasonResult.result"), value: tier }] : []),
      { label: translate(lang, "profileCommunityPanel.points"), value: String(result.total_points) },
      { label: translate(lang, "officialEventSeasonResult.exactPicks"), value: String(result.exact_hits) },
      { label: translate(lang, "officialEventSeasonResult.savedPicks"), value: String(result.saved_predictions) }
    ],
    context: translate(lang, "officialEventSeasonResult.canYouDoBetterJoinFanPredictor")
  });

  const share = async () => {
    setSharing(true);
    setFeedback('');
    try {
      const outcome = await shareOrCopy({
        title: result.event_name,
        text: translate(lang, 'official.better', { headline }),
        url: buildOfficialEventShareUrl(result.slug, window.location.origin)
      });
      setFeedback(outcome === 'shared' ? translate(lang, "officialEventSeasonResult.resultShared") : translate(lang, "officialEventSeasonResult.linkCopied"));
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        setFeedback(translate(lang, "officialEventSeasonResult.unableToShare"));
      }
    } finally {
      setSharing(false);
    }
  };

  const download = async () => {
    setSharing(true);
    setFeedback('');
    try {
      const blob = await buildCard();
      downloadBlob(blob, `tipovacka-${result.slug}-vysledek.png`);
      setFeedback(translate(lang, "officialEventSeasonResult.cardDownloaded"));
    } catch {
      setFeedback(translate(lang, "officialEventSeasonResult.unableToPrepareTheCard"));
    } finally {
      setSharing(false);
    }
  };

  return (
    <section
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      style={{ borderTopColor: result.accent_color, borderTopWidth: 4 }}
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <Award className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase text-slate-400">
              {translate(lang, "officialEventSeasonResult.seasonResult")}</p>
            <h2 className="mt-1 text-xl font-black leading-tight text-slate-950">
              {headline}
            </h2>
            {tier && <p className="mt-2 text-sm font-black" style={{ color: result.accent_color }}>{tier}</p>}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-3 gap-2">
          {[
            [translate(lang, "profileCommunityPanel.points"), result.total_points],
            [translate(lang, "officialEventSeasonResult.exactPicks"), result.exact_hits],
            [translate(lang, "officialEventSeasonResult.saved"), result.saved_predictions]
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 px-3 py-3 text-center">
              <dt className="text-[8px] font-black uppercase text-slate-400">{label}</dt>
              <dd className="mt-1 text-lg font-black tabular-nums text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>

        {result.better_than_percent !== null && result.participant_count > 1 && (
          <p className="mt-4 text-xs font-semibold text-slate-600">
            {translate(lang, 'official.betterThan', { percent: result.better_than_percent })}</p>
        )}

        {result.badges.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {result.badges.map(badge => (
              <span key={badge.id} className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-black text-slate-700">
                {badge.name}
              </span>
            ))}
          </div>
        )}

        {result.qualifying_prizes.length > 0 && (
          <div className="mt-4 rounded-xl bg-amber-50 p-3">
            <p className="text-[9px] font-black uppercase text-amber-800">
              {translate(lang, "officialEventSeasonResult.provisionalPrizeEligibility")}</p>
            {result.qualifying_prizes.map(prize => (
              <p key={`${prize.rank_from}-${prize.title}`} className="mt-1 text-xs font-bold text-amber-950">
                {prize.title}
              </p>
            ))}
            <p className="mt-2 text-[10px] font-medium text-amber-800">
              {translate(lang, "officialEventSeasonResult.prizeDeliveryIsSubjectToEligibilityChecksAndThe")}</p>
          </div>
        )}

        {result.prize_eligibility === 'disqualified' && (
          <p role="status" className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">
            {translate(lang, "officialEventSeasonResult.yourSportsResultIsSavedButThisEntryIs")}</p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={sharing}
            onClick={() => void share()}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 text-[10px] font-black uppercase text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-50"
          >
            <Share2 className="h-4 w-4" aria-hidden="true" /> {translate(lang, "inviteShareDialog.share")}</button>
          <button
            type="button"
            disabled={sharing}
            onClick={() => void download()}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 text-[10px] font-black uppercase text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" /> {translate(lang, "officialEventSeasonResult.download")}</button>
        </div>
        {feedback && <p role="status" className="mt-3 text-center text-[10px] font-semibold text-slate-500">{feedback}</p>}
      </div>
    </section>
  );
}
