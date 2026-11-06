import { MATCH_TIME_ZONE, pragueCalendarDay } from '../lib/matchTime.ts';
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  KeyRound,
  Plus,
  Trophy,
  X
} from 'lucide-react';
import type { Lobby, MembershipHomeItem, OfficialEventCard as OfficialEventCardType } from '../types.ts';
import {
  classifyHomeDashboardSummary,
  formatTipsterCount,
  getPrimaryHomeDashboardSummaryForLobby,
  getLobbyPredictionAttention,
  type HomeDashboardCardState,
  type HomeDashboardSummary
} from '../lib/homeDashboard.ts';
import { getLatestMembershipHomeItems } from '../lib/membership.ts';
import {
  shouldShowOfficialEventInPicker,
  shouldShowOfficialEventOnHome
} from '../lib/officialEventsState.ts';
import { OfficialEventCard } from './OfficialEventCard.tsx';

export type AddLobbyMode = 'none' | 'menu' | 'create' | 'join' | 'official';

type HomeDashboardProps = {
  lang: 'cz' | 'en';
  lobbies: Lobby[];
  summaries: HomeDashboardSummary[];
  summariesLoading: boolean;
  summariesError: string;
  membershipItems: MembershipHomeItem[];
  membershipLoading: boolean;
  membershipError: string;
  officialEvents: OfficialEventCardType[];
  officialEventBusy: boolean;
  officialEventsEnabled: boolean;
  officialEventCommercialEnabled: boolean;
  addLobbyMode: AddLobbyMode;
  addLobbyPanel?: ReactNode;
  onRetrySummaries: () => void;
  onCancelJoinRequest: (requestId: string) => Promise<void>;
  onOpenContext: (
    summary: HomeDashboardSummary,
    showOnlyMissing: boolean,
    destination?: 'matches' | 'results'
  ) => void;
  onOpenLobby: (lobby: Lobby) => void;
  onOpenOfficialEvent: (event: OfficialEventCardType) => void;
  onSetAddLobbyMode: (mode: AddLobbyMode) => void;
};

const MembershipNotices = ({
  lang,
  items,
  loading,
  error,
  lobbies,
  onRetry,
  onOpenLobby,
  onCancelJoinRequest
}: {
  lang: 'cz' | 'en';
  items: MembershipHomeItem[];
  loading: boolean;
  error: string;
  lobbies: Lobby[];
  onRetry: () => void;
  onOpenLobby: (lobby: Lobby) => void;
  onCancelJoinRequest: (requestId: string) => Promise<void>;
}) => {
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const visibleItems = getLatestMembershipHomeItems(items);

  if (loading) {
    return (
      <section className="mb-6" aria-label={lang === 'cz' ? 'Stav členství' : 'Membership status'}>
        <DashboardSkeleton compact />
      </section>
    );
  }

  if (error) {
    return (
      <section className="mb-6 rounded-2xl border border-amber-100 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="flex-1 text-xs font-black text-amber-800">
            {lang === 'cz' ? 'Stav žádostí se nepodařilo načíst.' : 'Membership requests could not be loaded.'}
          </p>
          <button type="button" onClick={onRetry} className="text-[10px] font-black uppercase text-amber-700">
            {lang === 'cz' ? 'Zkusit znovu' : 'Retry'}
          </button>
        </div>
      </section>
    );
  }

  if (visibleItems.length === 0) return null;

  return (
    <section className="mb-6 space-y-2" aria-label={lang === 'cz' ? 'Stav členství' : 'Membership status'}>
      {actionError && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-[10px] font-bold text-red-600">{actionError}</p>
      )}
      {visibleItems.map(item => {
        const lobby = lobbies.find(candidate => candidate.id === item.lobby_id);
        const isPending = item.item_type === 'join_request' && item.request_status === 'pending';
        const isApproved = item.item_type === 'join_request' && item.request_status === 'approved';
        const isRejected = item.item_type === 'join_request' && item.request_status === 'rejected';
        const isManagement = item.item_type === 'management';
        const isRemoved = item.item_type === 'membership' && item.membership_status === 'removed';
        const label = isPending
          ? (lang === 'cz' ? 'Žádost čeká na schválení' : 'Request awaiting approval')
          : isApproved
            ? (lang === 'cz' ? 'Žádost schválena' : 'Request approved')
            : isRejected
              ? (lang === 'cz' ? 'Žádost zamítnuta' : 'Request rejected')
              : isManagement
                ? (item.pending_request_count === 1
                  ? (lang === 'cz' ? 'Nová žádost' : 'New request')
                  : (lang === 'cz' ? `${item.pending_request_count} nové žádosti` : `${item.pending_request_count} new requests`))
                : isRemoved
                  ? (lang === 'cz' ? 'Přístup do lobby byl odebrán' : 'Lobby access was removed')
                  : (lang === 'cz' ? 'Opustil/a jsi lobby' : 'You left the lobby');

        return (
          <div key={`${item.item_type}:${item.request_id || item.lobby_id}:${item.event_at}`} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-800">{item.lobby_name}</p>
                <p className={`mt-1 text-[10px] font-black uppercase ${isPending || isManagement ? 'text-amber-600' : isApproved ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {label}
                </p>
              </div>
              {isPending && item.request_id ? (
                <button
                  type="button"
                  disabled={cancellingId === item.request_id}
                  onClick={async () => {
                    setCancellingId(item.request_id);
                    setActionError('');
                    try {
                      await onCancelJoinRequest(item.request_id as string);
                    } catch {
                      setActionError(lang === 'cz' ? 'Žádost se nepodařilo zrušit.' : 'Could not cancel the request.');
                    } finally {
                      setCancellingId(null);
                    }
                  }}
                  className="min-h-9 shrink-0 rounded-lg px-2 text-[9px] font-black uppercase text-slate-500 disabled:opacity-50"
                >
                  {lang === 'cz' ? 'Zrušit žádost' : 'Cancel'}
                </button>
              ) : (isManagement || isApproved) && lobby ? (
                <button
                  type="button"
                  onClick={() => onOpenLobby(lobby)}
                  className="min-h-9 shrink-0 rounded-lg bg-slate-900 px-3 text-[9px] font-black uppercase text-white"
                >
                  {isManagement
                    ? (lang === 'cz' ? 'Vyžaduje správu' : 'Manage')
                    : (lang === 'cz' ? 'Otevřít lobby' : 'Open lobby')}
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </section>
  );
};

const formatLockTime = (value: string | null, lang: 'cz' | 'en') => {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  const now = new Date();
  const dayDiff = pragueCalendarDay(date) - pragueCalendarDay(now);
  const time = date.toLocaleTimeString(lang === 'cz' ? 'cs-CZ' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: MATCH_TIME_ZONE
  });

  if (lang === 'cz') {
    if (dayDiff === 0) return `Uzávěrka dnes v ${time}`;
    if (dayDiff === 1) return `Uzávěrka zítra v ${time}`;
    return `Uzávěrka ${date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', timeZone: MATCH_TIME_ZONE })} v ${time}`;
  }
  if (dayDiff === 0) return `Locks today at ${time}`;
  if (dayDiff === 1) return `Locks tomorrow at ${time}`;
  return `Locks ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: MATCH_TIME_ZONE })} at ${time}`;
};

const formatLaterStatus = (value: string | null, lang: 'cz' | 'en') => {
  if (!value) return lang === 'cz' ? 'Další tipování později' : 'More predictions later';
  const diffDays = Math.max(1, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));
  if (lang === 'en') return `Next predictions in ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`;
  if (diffDays === 1) return 'Další tipování za 1 den';
  if (diffDays >= 2 && diffDays <= 4) return `Další tipování za ${diffDays} dny`;
  return `Další tipování za ${diffDays} dní`;
};

const formatWaitingCount = (count: number, lang: 'cz' | 'en') => {
  if (lang === 'en') return `${count} ${count === 1 ? 'match is' : 'matches are'} waiting`;
  if (count === 1) return '1 zápas čeká';
  if (count >= 2 && count <= 4) return `${count} zápasy čekají`;
  return `${count} zápasů čeká`;
};

const getCardCopy = (summary: HomeDashboardSummary, lang: 'cz' | 'en') => {
  const state = classifyHomeDashboardSummary(summary);
  const copy: Record<HomeDashboardCardState, { status: string; cta: string; missing: boolean }> = {
    actionable: {
      status: formatWaitingCount(summary.actionable_match_count, lang),
      cta: lang === 'cz' ? 'Tipovat' : 'Predict',
      missing: true
    },
    all_predicted: {
      status: lang === 'cz' ? 'Vše máš tipnuto' : 'All predictions complete',
      cta: lang === 'cz' ? 'Zobrazit zápasy' : 'View matches',
      missing: false
    },
    later: {
      status: formatLaterStatus(summary.next_missing_lock_time, lang),
      cta: (summary.missing_match_count ?? 0) > 0 ? (lang === 'cz' ? 'Tipovat' : 'Predict')
        : (lang === 'cz' ? 'Zobrazit turnaj' : 'View tournament'),
      missing: (summary.missing_match_count ?? 0) > 0
    },
    schedule_pending: {
      status: lang === 'cz' ? 'Turnaj čeká na rozpis' : 'Tournament awaits schedule',
      cta: lang === 'cz' ? 'Detail turnaje' : 'Tournament detail',
      missing: false
    },
    waiting_results: {
      status: lang === 'cz' ? 'Čeká na výsledky' : 'Waiting for results',
      cta: lang === 'cz' ? 'Zobrazit turnaj' : 'View tournament',
      missing: false
    },
    completion_pending: {
      status: lang === 'cz' ? 'Čeká na uzavření turnaje' : 'Waiting for tournament close',
      cta: lang === 'cz' ? 'Detail turnaje' : 'Tournament detail',
      missing: false
    },
    owner_attention: {
      status: lang === 'cz' ? 'Vyžaduje správu' : 'Needs management',
      cta: lang === 'cz' ? 'Spravovat' : 'Manage',
      missing: false
    },
    ready: {
      status: lang === 'cz' ? 'Turnaj je připraven' : 'Tournament is ready',
      cta: lang === 'cz' ? 'Zobrazit turnaj' : 'View tournament',
      missing: false
    },
    completed: {
      status: lang === 'cz' ? 'Turnaj ukončen' : 'Tournament completed',
      cta: lang === 'cz' ? 'Zobrazit výsledky' : 'View results',
      missing: false
    },
    inactive: {
      status: lang === 'cz' ? 'Neaktivní turnaj' : 'Inactive tournament',
      cta: lang === 'cz' ? 'Detail lobby' : 'Lobby detail',
      missing: false
    }
  };
  return { state, ...copy[state] };
};

const DashboardSkeleton = ({ compact = false }: { compact?: boolean }) => (
  <div className={`rounded-2xl border border-slate-100 bg-white ${compact ? 'p-4' : 'p-5'} shadow-sm`} aria-hidden="true">
    <div className="h-2.5 w-2/3 rounded bg-slate-100 motion-safe:animate-pulse motion-reduce:animate-none" />
    <div className="mt-2 h-2 w-1/2 rounded bg-slate-100 motion-safe:animate-pulse motion-reduce:animate-none" />
    <div className="mt-5 h-10 w-full rounded-xl bg-slate-100 motion-safe:animate-pulse motion-reduce:animate-none" />
  </div>
);

const getSystemLobbyCover = (lobby: Lobby, summary: HomeDashboardSummary | null) => {
  const hash = Array.from(lobby.id).reduce((total, character) => total + character.charCodeAt(0), 0);
  const tournament = (lobby.tournaments || []).find(item => item.tournament_id === summary?.tournament_id)?.tournament;
  const sportId = String(tournament?.sport_id || '').toLowerCase();
  const src = sportId === 'hockey'
    ? '/lobby-covers/ice-community.jpg'
    : sportId === 'football'
      ? '/lobby-covers/stadium-community.jpg'
      : '/lobby-covers/community-clubhouse.jpg';

  return {
    src,
    position: ['center 48%', 'left 48%', 'right 48%'][hash % 3]
  };
};

const getCompletedLobbySummary = (lobby: Lobby): HomeDashboardSummary | null => {
  const relation = (lobby.tournaments || [])
    .filter(item => item.status === 'archived' || item.tournament?.status === 'finished')
    .slice()
    .sort((a, b) => (
      String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')) ||
      a.tournament_id.localeCompare(b.tournament_id)
    ))[0];

  if (!relation) return null;

  return {
    lobby_id: lobby.id,
    lobby_name: lobby.name,
    lobby_role: lobby.is_owner ? 'owner' : lobby.lobby_role || 'member',
    member_count: lobby.member_count || 0,
    tournament_id: relation.tournament_id,
    tournament_name: relation.tournament?.name || lobby.tournament_name || (relation.tournament_id === lobby.tournament_id ? lobby.tournament_name : null) || '',
    tournament_status: 'archived',
    is_completed: true,
    actionable_match_count: 0,
    next_actionable_lock_time: null,
    next_missing_lock_time: null,
    all_known_unlocked_predicted: false,
    schedule_state: 'completed',
    requires_owner_attention: false
  };
};

const LobbyWorldCard = ({
  lobby,
  summary,
  attention,
  lang,
  loading,
  error,
  eagerCover,
  onRetry,
  onOpenContext,
  onOpenLobby
}: {
  key?: string;
  lobby: Lobby;
  summary: HomeDashboardSummary | null;
  attention: ReturnType<typeof getLobbyPredictionAttention>;
  lang: 'cz' | 'en';
  loading: boolean;
  error: string;
  eagerCover: boolean;
  onRetry: () => void;
  onOpenContext: (
    summary: HomeDashboardSummary,
    showOnlyMissing: boolean,
    destination?: 'matches' | 'results'
  ) => void;
  onOpenLobby: (lobby: Lobby) => void;
}) => {
  const [coverLoaded, setCoverLoaded] = useState(false);
  const copy = summary ? getCardCopy(summary, lang) : null;
  const state = copy?.state;
  const cover = getSystemLobbyCover(lobby, summary);
  const relevantLock = state === 'actionable'
    ? summary?.next_actionable_lock_time
    : summary?.next_missing_lock_time;
  const timeLabel = formatLockTime(relevantLock || null, lang);
  const isActionable = state === 'actionable';
  const isCompleted = state === 'completed';
  const isQuietLobbyAction = !summary || state === 'owner_attention' || state === 'inactive';
  const tipsterLabel = formatTipsterCount(lobby.member_count || 0, lang);
  const tournamentLabel = summary?.tournament_name || (
    lang === 'cz' ? 'Bez aktivního turnaje' : 'No active tournament'
  );
  const statusLabel = loading
    ? null
    : error
      ? (lang === 'cz' ? 'Dění teď nejde načíst' : 'Live status is unavailable')
      : attention.missingCount > 0
        ? formatWaitingCount(attention.urgentCount || attention.missingCount, lang)
          + (lang === 'cz' ? ' na natipování' : ' for predictions')
          + (attention.urgentCount > 0 ? (lang === 'cz' ? ' do 48 hodin' : ' within 48 hours') : '')
        : copy?.status || (
        lang === 'cz' ? 'Další turnaj zatím není vypsán' : 'The next tournament is not scheduled yet'
      );
  const ctaLabel = error
    ? (lang === 'cz' ? 'Zkusit znovu' : 'Retry')
    : attention.contexts.length > 1 ? (lang === 'cz' ? 'Tipovat nejbližší soutěž' : 'Predict the next competition')
      : copy?.cta || (lang === 'cz' ? 'Otevřít lobby' : 'Open lobby');
  const cardHeight = isCompleted ? 'min-h-[236px]' : 'min-h-[264px]';
  const ctaStyle = isActionable
    ? 'border border-red-600 bg-red-600 text-white shadow-sm hover:bg-red-700'
    : isCompleted
      ? 'border border-slate-300 bg-white/75 text-slate-900 shadow-none backdrop-blur-sm hover:bg-white'
      : isQuietLobbyAction
        ? 'border border-slate-300 bg-white/65 text-slate-800 shadow-none backdrop-blur-sm hover:bg-white'
        : 'border border-slate-950 bg-slate-950 text-white shadow-sm hover:bg-slate-800';

  const handlePrimaryAction = () => {
    if (error) {
      onRetry();
      return;
    }
    if (!summary || state === 'owner_attention' || state === 'inactive') {
      onOpenLobby(lobby);
      return;
    }
    onOpenContext(summary, Boolean(copy?.missing), isCompleted ? 'results' : 'matches');
  };

  return (
    <article className={`group relative ${cardHeight} overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none`}>
      <img
        src={cover.src}
        alt=""
        aria-hidden="true"
        loading={eagerCover ? 'eager' : 'lazy'}
        onLoad={() => setCoverLoaded(true)}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 motion-reduce:transition-none ${
          coverLoaded ? 'opacity-[0.32]' : 'opacity-0'
        }`}
        style={{ objectPosition: cover.position }}
      />
      <div className="absolute inset-0 bg-white/10" aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-r from-white via-white/85 to-white/30" aria-hidden="true" />
      <button
        type="button"
        onClick={() => onOpenLobby(lobby)}
        aria-label={lang === 'cz' ? `Otevřít lobby ${lobby.name}` : `Open lobby ${lobby.name}`}
        className="absolute inset-0 z-10 cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-500"
      />

      <div className={`pointer-events-none relative z-20 flex ${cardHeight} flex-col p-5`}>
        <div className="min-w-0 max-w-[88%]">
          <h3 className="break-words text-xl font-black uppercase leading-tight text-slate-950">{lobby.name}</h3>
          <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            {tipsterLabel}
          </p>
        </div>

        <div className="mt-4 flex max-w-[88%] items-start gap-2 text-xs font-bold leading-snug text-slate-600">
          <Trophy className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="break-words">{tournamentLabel}</span>
        </div>

        <div className="mt-auto pt-6">
          {loading ? (
            <div aria-label={lang === 'cz' ? 'Načítání dění v lobby' : 'Loading lobby activity'}>
              <div className="h-5 w-3/5 rounded bg-slate-200/80 motion-safe:animate-pulse motion-reduce:animate-none" />
              <div className="mt-2 h-3 w-2/5 rounded bg-slate-200/70 motion-safe:animate-pulse motion-reduce:animate-none" />
            </div>
          ) : (
            <>
              <p className={`text-base font-black ${isActionable ? 'text-red-600' : 'text-slate-900'}`}>
                {statusLabel}
              </p>
              {timeLabel && <p className="mt-1 text-xs font-semibold text-slate-500">{timeLabel}</p>}
              {!error && attention.contexts.length > 1 && <div className="pointer-events-auto mt-3 space-y-2">
                {attention.contexts.map(context => <button key={context.tournament_id} type="button"
                  onClick={event => { event.stopPropagation(); onOpenContext(context, true, 'matches'); }}
                  aria-label={(lang === 'cz' ? 'Tipovat: ' : 'Predict: ') + lobby.name + ' · ' + context.tournament_name}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-left text-xs font-bold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                  <span className="min-w-0 break-words">{context.tournament_name}</span>
                  <span className="flex shrink-0 items-center gap-1 text-red-600">
                    {context.actionable_match_count || context.missing_match_count || 0}
                    <ChevronRight className="h-3 w-3" />
                  </span>
                </button>)}
              </div>}
            </>
          )}

          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              handlePrimaryAction();
            }}
            disabled={loading}
            aria-label={`${ctaLabel}: ${lobby.name}`}
            className={`pointer-events-auto mt-5 inline-flex min-h-11 max-w-full items-center justify-center gap-2 self-start rounded-xl px-4 text-[10px] font-black uppercase tracking-wider transition-[transform,background-color,border-color] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none ${ctaStyle}`}
          >
            {isCompleted && <CheckCircle2 className="h-4 w-4" />}
            {loading ? (lang === 'cz' ? 'Načítám' : 'Loading') : ctaLabel}
            {!loading && !isCompleted && <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </article>
  );
};

const AddLobbySheet = ({
  lang,
  mode,
  officialEvents,
  officialEventBusy,
  officialEventsEnabled,
  officialEventCommercialEnabled,
  onOpenOfficialEvent,
  onSetMode
}: {
  lang: 'cz' | 'en';
  mode: AddLobbyMode;
  officialEvents: OfficialEventCardType[];
  officialEventBusy: boolean;
  officialEventsEnabled: boolean;
  officialEventCommercialEnabled: boolean;
  onOpenOfficialEvent: (event: OfficialEventCardType) => void;
  onSetMode: (mode: AddLobbyMode) => void;
}) => {
  if (mode !== 'menu' && mode !== 'official') return null;

  const optionClassName = 'flex w-full items-center gap-3 border-b border-slate-100 px-4 py-4 text-left last:border-b-0 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-500';
  const pickerEvents = officialEvents.filter(shouldShowOfficialEventInPicker);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/35 sm:items-center sm:p-4"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onSetMode('none');
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-lobby-sheet-title"
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {mode === 'official' && (
              <button
                type="button"
                onClick={() => onSetMode('menu')}
                aria-label={lang === 'cz' ? 'Zpět na výběr' : 'Back to choices'}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <h2 id="add-lobby-sheet-title" className="truncate text-sm font-black text-slate-900">
              {mode === 'official'
                ? (lang === 'cz' ? 'Oficiální turnaje' : 'Official tournaments')
                : (lang === 'cz' ? 'Přidat lobby' : 'Add lobby')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onSetMode('none')}
            aria-label={lang === 'cz' ? 'Zavřít' : 'Close'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {mode === 'menu' ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <button type="button" onClick={() => onSetMode('join')} className={optionClassName}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <KeyRound className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-black text-slate-900">
                  {lang === 'cz' ? 'Připojit se kódem' : 'Join with a code'}
                </span>
                <span className="mt-1 block text-[10px] font-medium text-slate-500">
                  {lang === 'cz' ? 'Připojit se do lobby kamaráda.' : "Join a friend's lobby."}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onSetMode('create')} className={optionClassName}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <Plus className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-black text-slate-900">
                  {lang === 'cz' ? 'Založit lobby' : 'Create a lobby'}
                </span>
                <span className="mt-1 block text-[10px] font-medium text-slate-500">
                  {lang === 'cz' ? 'Soukromá lobby.' : 'A private lobby.'}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            </button>
            {officialEventsEnabled && (
              <button type="button" onClick={() => onSetMode('official')} className={optionClassName}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <Trophy className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-black text-slate-900">
                    {lang === 'cz' ? 'Oficiální turnaje' : 'Official tournaments'}
                  </span>
                  <span className="mt-1 block text-[10px] font-medium text-slate-500">
                    {lang === 'cz' ? 'Veřejné soutěže Tipovačky.' : 'Public Tipovačka competitions.'}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              </button>
            )}
          </div>
        ) : pickerEvents.length > 0 ? (
          <div className="space-y-4">
            {pickerEvents.map((event, index) => (
              <OfficialEventCard
                key={event.event_id}
                event={event}
                commercialEnabled={officialEventCommercialEnabled}
                busy={officialEventBusy}
                eagerCover={index === 0}
                onOpen={onOpenOfficialEvent}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center">
            <p className="text-xs font-black text-slate-700">
              {lang === 'cz' ? 'Teď není otevřený žádný turnaj.' : 'There is no open tournament right now.'}
            </p>
          </div>
        )}
      </section>
    </div>,
    document.body
  );
};

export function HomeDashboard({
  lang,
  lobbies,
  summaries,
  summariesLoading,
  summariesError,
  membershipItems,
  membershipLoading,
  membershipError,
  officialEvents,
  officialEventBusy,
  officialEventsEnabled,
  officialEventCommercialEnabled,
  addLobbyMode,
  addLobbyPanel,
  onRetrySummaries,
  onCancelJoinRequest,
  onOpenContext,
  onOpenLobby,
  onOpenOfficialEvent,
  onSetAddLobbyMode
}: HomeDashboardProps) {
  const homeOfficialEvents = officialEvents.filter(shouldShowOfficialEventOnHome);
  const hasHomeItems = lobbies.length > 0 || homeOfficialEvents.length > 0;
  const membershipNotices = (
    <MembershipNotices
      lang={lang}
      items={membershipItems}
      loading={membershipLoading}
      error={membershipError}
      lobbies={lobbies}
      onRetry={onRetrySummaries}
      onOpenLobby={onOpenLobby}
      onCancelJoinRequest={onCancelJoinRequest}
    />
  );

  return (
    <main className="flex flex-1 flex-col p-4 sm:p-6">
      <section aria-labelledby="home-lobbies-title">
        <h2 className="mb-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
          <span id="home-lobbies-title">{lang === 'cz' ? 'Tvoje lobby' : 'Your lobbies'}</span>
        </h2>
        {membershipNotices}
        {hasHomeItems ? (
          <div className="space-y-4">
            {lobbies.map((lobby, index) => {
              const attention = getLobbyPredictionAttention(lobby.id, summaries);
              const summary = attention.contexts[0] || getPrimaryHomeDashboardSummaryForLobby(lobby.id, summaries) ||
                getCompletedLobbySummary(lobby);

              return (
                <LobbyWorldCard
                  key={lobby.id}
                  lobby={lobby}
                  summary={summary}
                  attention={attention}
                  lang={lang}
                  loading={summariesLoading}
                  error={summariesError}
                  eagerCover={index === 0}
                  onRetry={onRetrySummaries}
                  onOpenContext={onOpenContext}
                  onOpenLobby={onOpenLobby}
                />
              );
            })}
            {homeOfficialEvents.map((event, index) => (
              <OfficialEventCard
                key={event.event_id}
                event={event}
                commercialEnabled={officialEventCommercialEnabled}
                busy={officialEventBusy}
                eagerCover={lobbies.length === 0 && index === 0}
                onOpen={onOpenOfficialEvent}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-7 text-center">
            <p className="text-xs font-black text-slate-700">
              {lang === 'cz' ? 'Zatím tu nemáš žádnou lobby.' : 'You do not have a lobby yet.'}
            </p>
          </div>
        )}
      </section>

      <section className="mt-6">
        <button
          type="button"
          onClick={() => onSetAddLobbyMode('menu')}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-wider text-slate-600"
        >
          <Plus className="h-4 w-4" /> {lang === 'cz' ? 'Přidat lobby' : 'Add lobby'}
        </button>

        {addLobbyPanel && <div className="mt-3">{addLobbyPanel}</div>}
      </section>

      <AddLobbySheet
        lang={lang}
        mode={addLobbyMode}
        officialEvents={officialEvents}
        officialEventBusy={officialEventBusy}
        officialEventsEnabled={officialEventsEnabled}
        officialEventCommercialEnabled={officialEventCommercialEnabled}
        onOpenOfficialEvent={onOpenOfficialEvent}
        onSetMode={onSetAddLobbyMode}
      />
    </main>
  );
}
