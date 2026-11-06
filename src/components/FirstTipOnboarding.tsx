import { translate } from '../i18n/index.ts';
import { useLocale } from '../i18n/LocaleProvider.tsx';
import { useState } from 'react';
import { Check, ChevronRight, Minus, Plus, Ticket, Trophy, Users } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { OfficialEventCard } from '../types.ts';
import { isOfficialEventPlayable } from '../lib/officialEventsState.ts';

type FirstTipOnboardingProps = {
  event: OfficialEventCard | null;
  busy: boolean;
  error: string;
  onStart: () => Promise<void>;
  onSkip: () => Promise<void>;
  onInvite: () => Promise<void>;
  onCreateLobby: () => Promise<void>;
  onStartEvent: (eventId: string) => Promise<void>;
};

export function FirstTipOnboarding({
  event,
  busy,
  error,
  onStart,
  onSkip,
  onInvite,
  onCreateLobby,
  onStartEvent
}: FirstTipOnboardingProps) {
  const { locale: lang } = useLocale();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [homeScore, setHomeScore] = useState(2);
  const [awayScore, setAwayScore] = useState(1);
  const [demoChanged, setDemoChanged] = useState(false);
  const reducedMotion = useReducedMotion();

  const transition = reducedMotion ? { duration: 0 } : { duration: 0.2 };

  const adjustScore = (side: 'home' | 'away', delta: number) => {
    setDemoChanged(true);
    if (side === 'home') setHomeScore(value => Math.max(0, value + delta));
    else setAwayScore(value => Math.max(0, value + delta));
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col bg-white px-5 pb-8 pt-5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
          {step} / 3
        </span>
        <button
          type="button"
          onClick={() => void onSkip()}
          disabled={busy}
          className="min-h-10 px-2 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-900 disabled:opacity-50"
        >
          {translate(lang, "firstTipOnboarding.skip")}</button>
      </div>

      <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-100">
        <motion.div
          className="h-full rounded-full bg-red-600"
          animate={{ width: `${step * 33.333}%` }}
          transition={transition}
        />
      </div>

      <motion.section
        key={step}
        initial={reducedMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition}
        className="flex flex-1 flex-col justify-center py-10"
      >
        {step === 1 && (
          <>
            <div className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <Trophy className="h-7 w-7" />
            </div>
            <h1 className="max-w-sm text-4xl font-black leading-[1.03] tracking-tight text-slate-950">
              {translate(lang, "firstTipOnboarding.predictMatches")}<br />{translate(lang, "firstTipOnboarding.beatYourFriends")}</h1>
            <p className="mt-5 max-w-sm text-sm font-medium leading-relaxed text-slate-600">
              {translate(lang, "firstTipOnboarding.privateCompetitionsForYourGroupPlayForPointsAnd")}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void onStart().then(() => setStep(2)).catch(() => undefined);
              }}
              className="mt-9 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-red-100"
            >
              {translate(lang, "firstTipOnboarding.letSGo")}<ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-600">{translate(lang, "firstTipOnboarding.practicePrediction")}</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{translate(lang, "firstTipOnboarding.tryYourFirstPrediction")}</h1>

            <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="text-center">
                  <p className="text-xs font-black text-slate-900">{translate(lang, "firstTipOnboarding.czechia")}</p>
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <button type="button" aria-label={translate(lang, "firstTipOnboarding.decreaseCzechiaScore")} onClick={() => adjustScore('home', -1)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm"><Minus className="h-4 w-4" /></button>
                    <span className="w-8 text-3xl font-black tabular-nums text-slate-950">{homeScore}</span>
                    <button type="button" aria-label={translate(lang, "firstTipOnboarding.increaseCzechiaScore")} onClick={() => adjustScore('home', 1)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm"><Plus className="h-4 w-4" /></button>
                  </div>
                </div>
                <span className="pt-7 text-lg font-black text-slate-300">:</span>
                <div className="text-center">
                  <p className="text-xs font-black text-slate-900">{translate(lang, "firstTipOnboarding.germany")}</p>
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <button type="button" aria-label={translate(lang, "firstTipOnboarding.decreaseGermanyScore")} onClick={() => adjustScore('away', -1)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm"><Minus className="h-4 w-4" /></button>
                    <span className="w-8 text-3xl font-black tabular-nums text-slate-950">{awayScore}</span>
                    <button type="button" aria-label={translate(lang, "firstTipOnboarding.increaseGermanyScore")} onClick={() => adjustScore('away', 1)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm"><Plus className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            </div>

            <ul className="mt-6 space-y-3 text-xs font-semibold text-slate-600">
              {[translate(lang, "firstTipOnboarding.exactScore5Points"), translate(lang, "firstTipOnboarding.correctWinner2Points"), translate(lang, "firstTipOnboarding.changeYourPickUntilTheDeadline")].map(item => (
                <li key={item} className="flex items-center gap-3">
                  <Check className="h-4 w-4 text-emerald-600" /> {item}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={!demoChanged}
              className="mt-8 min-h-13 w-full rounded-xl bg-slate-950 px-5 text-xs font-black uppercase tracking-wider text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              {translate(lang, "firstTipOnboarding.tryAPrediction")}</button>
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-600">{translate(lang, "firstTipOnboarding.lastStep")}</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{translate(lang, "firstTipOnboarding.whereDoYouWantToPlay")}</h1>
            <div className="mt-7 space-y-3">
              <button type="button" disabled={busy} onClick={() => void onInvite()} className="flex min-h-16 w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm disabled:opacity-50">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600"><Ticket className="h-5 w-5" /></span>
                <span><strong className="block text-sm text-slate-950">{translate(lang, "firstTipOnboarding.iHaveAnInvitation")}</strong><small className="mt-1 block text-[11px] font-medium text-slate-500">{translate(lang, "firstTipOnboarding.enterYourGroupSCode")}</small></span>
              </button>
              <button type="button" disabled={busy} onClick={() => void onCreateLobby()} className="flex min-h-16 w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm disabled:opacity-50">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><Users className="h-5 w-5" /></span>
                <span><strong className="block text-sm text-slate-950">{translate(lang, "firstTipOnboarding.createALobby")}</strong><small className="mt-1 block text-[11px] font-medium text-slate-500">{translate(lang, "firstTipOnboarding.inviteYourFriendsAndPlayTogether")}</small></span>
              </button>
              {isOfficialEventPlayable(event) && event && (
                <button type="button" disabled={busy} onClick={() => void onStartEvent(event.event_id)} className="flex min-h-16 w-full items-center gap-4 rounded-2xl bg-slate-950 p-4 text-left text-white shadow-lg disabled:opacity-50">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10"><Trophy className="h-5 w-5" /></span>
                  <span><strong className="block text-sm">{translate(lang, "firstTipOnboarding.tryItFirst")}</strong><small className="mt-1 block text-[11px] font-medium text-slate-300">{event.name} · {event.open_match_count} {translate(lang, "firstTipOnboarding.openMatches")}</small></span>
                </button>
              )}
            </div>
            {error && <p role="alert" className="mt-4 text-xs font-semibold text-red-600">{error}</p>}
          </>
        )}
      </motion.section>
    </main>
  );
}
