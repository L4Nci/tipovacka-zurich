import { useState } from 'react';
import {
  ArrowRight,
  Check,
  Gift,
  Minus,
  Plus,
  ShieldCheck,
  Trophy,
  Users
} from 'lucide-react';
import { LobbyPrizePanel } from './LobbyPrizePanel.tsx';
import { OfficialEventSeasonResultCard } from './OfficialEventSeasonResult.tsx';
import { HomeDashboard, type AddLobbyMode } from './HomeDashboard.tsx';
import type { HomeDashboardSummary } from '../lib/homeDashboard.ts';
import type {
  Lobby,
  LobbyPrizeEntry,
  OfficialEventCard,
  OfficialEventSeasonResult
} from '../types.ts';

type PreviewScreen = 'home' | 'create' | 'lobby' | 'event' | 'result';

const seasonResult: OfficialEventSeasonResult = {
  event_id: 'preview-event',
  slug: 'premier-league-2026-27',
  event_name: 'Premier League 2026/27',
  partner_name: 'Partner ligy',
  accent_color: '#DC2626',
  position: 548,
  participant_count: 14283,
  top_percent: 4,
  better_than_percent: 96,
  total_points: 184,
  exact_hits: 12,
  saved_predictions: 76,
  evaluated_predictions: 76,
  result_is_final: true,
  prize_eligibility: 'pending_review',
  badges: [{
    id: 'preview-badge',
    name: 'TOP 10 %',
    description: 'Patříš mezi nejlepší desetinu eventu.',
    icon: 'Award',
    rule_type: 'top_10_percent',
    featured_position: null
  }],
  qualifying_prizes: []
};

const getPreviewScreen = (): PreviewScreen => {
  const requested = new URLSearchParams(window.location.search).get('view');
  return requested === 'home' || requested === 'create' || requested === 'lobby' || requested === 'result'
    ? requested
    : 'event';
};

const PreviewEventIdentity = ({ compact = false }: { compact?: boolean }) => (
  <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <img
      src="/lobby-covers/stadium-community.jpg"
      alt=""
      aria-hidden="true"
      className="absolute inset-0 h-full w-full object-cover opacity-[0.28]"
    />
    <div className="absolute inset-0 bg-gradient-to-r from-white via-white/90 to-white/35" aria-hidden="true" />
    <div className={`relative ${compact ? 'p-4' : 'min-h-48 p-5'} flex flex-col justify-end`}>
      <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-red-600">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Oficiální turnaj
      </p>
      <h1 className={`${compact ? 'mt-1 text-lg' : 'mt-2 text-2xl'} max-w-sm font-black leading-tight text-slate-950`}>
        Premier League 2026/27
      </h1>
      {!compact && (
        <>
          <p className="mt-2 max-w-sm text-xs font-semibold leading-relaxed text-slate-600">
            Veřejná sezonní tipovačka s partnerem ligy.
          </p>
          <p className="mt-3 text-[9px] font-black uppercase text-slate-500">S partnerem Partner ligy</p>
        </>
      )}
    </div>
  </section>
);

const previewLobby: Lobby = {
  id: 'preview-lobby',
  name: 'Fotbaloví experti',
  owner_id: 'preview-owner',
  tournament_id: 'preview-tournament',
  join_code: 'PREVIEW',
  visibility: 'private',
  is_owner: true,
  lobby_role: 'owner',
  member_count: 11,
  tournament_name: 'FIFA World Cup 2026'
};

const previewSummary: HomeDashboardSummary = {
  lobby_id: previewLobby.id,
  lobby_name: previewLobby.name,
  lobby_role: 'owner',
  member_count: 11,
  tournament_id: 'preview-tournament',
  tournament_name: 'FIFA World Cup 2026',
  tournament_status: 'active',
  is_completed: false,
  actionable_match_count: 2,
  next_actionable_lock_time: new Date(Date.now() + 3_600_000).toISOString(),
  next_missing_lock_time: new Date(Date.now() + 3_600_000).toISOString(),
  all_known_unlocked_predicted: false,
  schedule_state: 'ready',
  requires_owner_attention: false
};

const previewOfficialEvent: OfficialEventCard = {
  event_id: 'preview-event',
  slug: 'premier-league-2026-27',
  name: 'Premier League 2026/27',
  description: 'Veřejná sezonní tipovačka.',
  cover_key: 'stadium-community',
  status: 'active',
  featured: true,
  onboarding_eligible: true,
  is_participating: false,
  participation_status: null,
  actionable_match_count: 3,
  open_match_count: 3,
  next_match: null,
  partner_name: 'Partner ligy',
  has_prizes: true
};

function HomeArchitecturePreview() {
  const [mode, setMode] = useState<AddLobbyMode>('none');
  const joined = new URLSearchParams(window.location.search).get('joined') === '1';
  const officialEvent: OfficialEventCard = {
    ...previewOfficialEvent,
    is_participating: joined,
    participation_status: joined ? 'active' : null,
    participant_count: 627,
    next_match: {
      id: 'preview-match',
      lock_time_utc: new Date(Date.now() + 3_600_000).toISOString(),
      home_name: 'Arsenal',
      away_name: 'Liverpool'
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-slate-50 shadow-2xl">
      <header className="border-b border-slate-100 bg-white p-6">
        <h1 className="text-2xl font-black italic leading-none tracking-tighter text-slate-900">FAN TIPOVAČKA</h1>
      </header>
      <HomeDashboard
        lang="cz"
        lobbies={[previewLobby]}
        summaries={[previewSummary]}
        summariesLoading={false}
        summariesError=""
        membershipItems={[]}
        membershipLoading={false}
        membershipError=""
        officialEvents={[officialEvent]}
        officialEventBusy={false}
        officialEventsEnabled
        officialEventCommercialEnabled
        addLobbyMode={mode}
        onRetrySummaries={() => undefined}
        onCancelJoinRequest={async () => undefined}
        onOpenContext={() => undefined}
        onOpenLobby={() => undefined}
        onOpenOfficialEvent={() => {
          window.location.search = 'view=event';
        }}
        onSetAddLobbyMode={setMode}
      />
    </div>
  );
}

function LobbyPrizePreview() {
  const [enabled, setEnabled] = useState(true);
  const [entries, setEntries] = useState<LobbyPrizeEntry[]>([
    { position: 1, label: '500 Kč' },
    { position: 2, label: 'Poukaz do restaurace' },
    { position: 3, label: 'Basa limonády' }
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-5 bg-slate-50 p-4 pb-24">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div
          className="min-h-44 bg-cover bg-center p-5"
          style={{
            backgroundImage: [
              'linear-gradient(90deg, rgba(255,255,255,.98) 0%, rgba(255,255,255,.86) 50%, rgba(255,255,255,.22) 100%)',
              'url(/lobby-covers/stadium-community.jpg)'
            ].join(',')
          }}
        >
          <p className="text-xs font-black text-red-600">SOUKROMÁ LOBBY</p>
          <h1 className="mt-2 max-w-xs text-2xl font-black text-slate-950">
            Fotbaloví experti
          </h1>
          <p className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-600">
            <Users className="h-4 w-4" aria-hidden="true" /> 11 tipérů
          </p>
        </div>
      </section>

      <LobbyPrizePanel
        lobbyId="preview-lobby"
        enabled={enabled}
        entries={entries}
        canEdit
        lang="cz"
        savePrizes={async (_lobbyId, nextEnabled, nextEntries) => ({
          enabled: nextEnabled,
          entries: nextEntries
        })}
        onSaved={(nextEnabled, nextEntries) => {
          setEnabled(nextEnabled);
          setEntries(nextEntries);
        }}
      />
    </main>
  );
}

function CreateLobbyPrizePreview() {
  const [prizesEnabled, setPrizesEnabled] = useState(false);
  const [entries, setEntries] = useState<LobbyPrizeEntry[]>([
    { position: 1, label: '' },
    { position: 2, label: '' },
    { position: 3, label: '' }
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-slate-50 p-4 pb-24">
      <form className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-[10px] font-black uppercase tracking-wider text-slate-700">
          Vytvořit novou lobby
        </h1>
        <label className="block">
          <span className="mb-1 block text-[9px] font-bold uppercase text-slate-400">Název lobby</span>
          <input
            type="text"
            defaultValue="Liga z práce"
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold"
          />
        </label>
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <legend className="px-1 text-[9px] font-black uppercase tracking-wider text-slate-500">
            O co hrajeme?
          </legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {([
              [false, 'Bez cen'],
              [true, 'Hrajeme o ceny']
            ] as const).map(([enabled, label]) => (
              <label
                key={label}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 ${
                  prizesEnabled === enabled
                    ? 'border-red-200 bg-white text-slate-900 shadow-sm'
                    : 'border-transparent text-slate-500'
                }`}
              >
                <input
                  type="radio"
                  name="preview-lobby-prizes"
                  checked={prizesEnabled === enabled}
                  onChange={() => setPrizesEnabled(enabled)}
                />
                <span className="text-[10px] font-black uppercase">{label}</span>
              </label>
            ))}
          </div>
          {prizesEnabled && (
            <div className="mt-3 space-y-2">
              {entries.map((entry, index) => (
                <label key={entry.position} className="grid grid-cols-[68px_1fr] items-center gap-2">
                  <span className="text-[10px] font-black text-slate-500">{index + 1}. místo</span>
                  <input
                    type="text"
                    value={entry.label}
                    maxLength={120}
                    onChange={event => setEntries(previous => previous.map((item, itemIndex) => (
                      itemIndex === index ? { ...item, label: event.target.value } : item
                    )))}
                    className="min-h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold"
                    placeholder={index === 0 ? 'Např. 500 Kč' : 'Volitelné'}
                  />
                </label>
              ))}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={entries.length >= 10}
                  onClick={() => setEntries(previous => [
                    ...previous,
                    { position: previous.length + 1, label: '' }
                  ])}
                  className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[9px] font-black uppercase text-slate-700 disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" /> Přidat další cenu
                </button>
                <button
                  type="button"
                  aria-label="Odebrat poslední cenu"
                  disabled={entries.length <= 1}
                  onClick={() => setEntries(previous => previous.slice(0, -1))}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 disabled:opacity-40"
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <p className="text-[9px] font-medium leading-relaxed text-slate-500">
                Ceny zajišťuje správce lobby. Tipovačka je nedrží, neověřuje ani negarantuje.
              </p>
            </div>
          )}
        </fieldset>
        <button type="button" className="min-h-11 w-full rounded-xl bg-slate-950 text-[10px] font-black uppercase text-white">
          Založit lobby
        </button>
      </form>
    </main>
  );
}

function OfficialEventPreview() {
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [declaredAge, setDeclaredAge] = useState(false);
  const [joined, setJoined] = useState(false);
  const [homeScore, setHomeScore] = useState(2);
  const [awayScore, setAwayScore] = useState(1);
  const [saved, setSaved] = useState(false);

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-slate-50 p-4 pb-24">
      <div className="space-y-5">
        <PreviewEventIdentity />
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-amber-700" aria-hidden="true" />
            <h2 className="text-base font-black text-slate-950">O co se hraje</h2>
          </div>
          <ol className="mt-4 space-y-3 text-sm">
            <li className="flex gap-3"><strong>1. místo</strong><span>Víkendový fotbalový zájezd</span></li>
            <li className="flex gap-3"><strong>2.–3.</strong><span>Oficiální ligový dres</span></li>
          </ol>
        </section>

        {!joined ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-slate-700" aria-hidden="true" />
              <div>
                <h2 className="text-base font-black text-slate-950">Zapojit se do turnaje</h2>
                <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
                  Výsledky určuje tipování. Způsobilost k ceně se ověřuje zvlášť.
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
              <label className="flex items-start gap-3 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={acceptedRules}
                  onChange={event => setAcceptedRules(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-red-600"
                />
                <span>Souhlasím s pravidly tohoto turnaje.</span>
              </label>
              <label className="flex items-start gap-3 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={declaredAge}
                  onChange={event => setDeclaredAge(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-red-600"
                />
                <span>Potvrzuji, že mi je alespoň 18 let.</span>
              </label>
            </div>
            <button
              type="button"
              disabled={!acceptedRules || !declaredAge}
              onClick={() => setJoined(true)}
              className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-xs font-black text-white disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
            >
              Zapojit se <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black text-slate-500">NEJBLIŽŠÍ OTEVŘENÝ ZÁPAS</p>
              <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <strong className="text-center text-sm">Česko</strong>
                <div className="flex items-center gap-2">
                  {([
                    ['home', homeScore, setHomeScore],
                    ['away', awayScore, setAwayScore]
                  ] as const).map(([side, score, setScore]) => (
                    <div key={side} className="grid grid-cols-1 gap-1">
                      <button
                        type="button"
                        aria-label={`Zvýšit ${side === 'home' ? 'domácí' : 'hostující'} skóre`}
                        onClick={() => setScore(score + 1)}
                        className="flex h-8 w-11 items-center justify-center rounded-lg bg-slate-100"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <span className="text-center text-2xl font-black">{score}</span>
                      <button
                        type="button"
                        aria-label={`Snížit ${side === 'home' ? 'domácí' : 'hostující'} skóre`}
                        onClick={() => setScore(Math.max(0, score - 1))}
                        className="flex h-8 w-11 items-center justify-center rounded-lg bg-slate-100"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <strong className="text-center text-sm">Německo</strong>
              </div>
              <button
                type="button"
                onClick={() => setSaved(true)}
                className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-xs font-black text-white"
              >
                {saved ? <><Check className="h-4 w-4" /> První tip je doma</> : 'Uložit tip'}
              </button>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-slate-500">PRŮBĚŽNÉ POŘADÍ</p>
                  <h2 className="mt-1 text-lg font-black text-slate-950">627 tipérů</h2>
                </div>
                <Trophy className="h-6 w-6 text-amber-600" aria-hidden="true" />
              </div>
              <div className="mt-4 divide-y divide-slate-100 text-sm">
                {[
                  ['1.', 'Marek', '43 b.'],
                  ['2.', 'Klára', '41 b.'],
                  ['3.', 'David', '39 b.'],
                  ['184.', 'Viktor', '22 b.']
                ].map(([position, name, points]) => (
                  <div key={position} className={`flex min-h-11 items-center gap-3 ${position === '184.' ? 'font-black text-red-600' : 'font-semibold text-slate-700'}`}>
                    <span className="w-10">{position}</span>
                    <span className="flex-1">{name}</span>
                    <span>{points}</span>
                  </div>
                ))}
              </div>
            </section>

            {saved && (
              <button
                type="button"
                className="min-h-12 w-full rounded-xl border border-slate-300 bg-white text-xs font-black text-slate-800"
              >
                Založit vlastní tipovačku
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function ResultPreview() {
  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-4 bg-slate-50 p-4 pb-24">
      <PreviewEventIdentity compact />
      <OfficialEventSeasonResultCard result={seasonResult} username="Viktor" />
      <button
        type="button"
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-xs font-black text-white"
      >
        Založit vlastní lobby <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </main>
  );
}

export default function ProductEvolutionPreview() {
  const screen = getPreviewScreen();

  return (
    <div className="min-h-screen bg-slate-200">
      {screen === 'home' && <HomeArchitecturePreview />}
      {screen === 'create' && <CreateLobbyPrizePreview />}
      {screen === 'lobby' && <LobbyPrizePreview />}
      {screen === 'event' && <OfficialEventPreview />}
      {screen === 'result' && <ResultPreview />}
    </div>
  );
}
