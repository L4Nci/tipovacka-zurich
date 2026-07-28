import { useState, type ReactNode } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Plus,
  Trophy
} from 'lucide-react';
import type { Lobby, MembershipHomeItem } from '../types.ts';
import {
  classifyHomeDashboardSummary,
  formatTipsterCount,
  getPrimaryHomeDashboardSummaryForLobby,
  type HomeDashboardCardState,
  type HomeDashboardSummary
} from '../lib/homeDashboard.ts';
import { getLatestMembershipHomeItems } from '../lib/membership.ts';

export type AddLobbyMode = 'none' | 'menu' | 'create' | 'join';

type HomeDashboardProps = {
  lang: 'cz' | 'en';
  lobbies: Lobby[];
  summaries: HomeDashboardSummary[];
  summariesLoading: boolean;
  summariesError: string;
  membershipItems: MembershipHomeItem[];
  membershipLoading: boolean;
  membershipError: string;
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
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  const time = date.toLocaleTimeString(lang === 'cz' ? 'cs-CZ' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  });

  if (lang === 'cz') {
    if (dayDiff === 0) return `Uzávěrka dnes v ${time}`;
    if (dayDiff === 1) return `Uzávěrka zítra v ${time}`;
    return `Uzávěrka ${date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })} v ${time}`;
  }
  if (dayDiff === 0) return `Locks today at ${time}`;
  if (dayDiff === 1) return `Locks tomorrow at ${time}`;
  return `Locks ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} at ${time}`;
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
      cta: lang === 'cz' ? 'Zobrazit turnaj' : 'View tournament',
      missing: false
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
      : copy?.status || (
        lang === 'cz' ? 'Další turnaj zatím není vypsán' : 'The next tournament is not scheduled yet'
      );
  const ctaLabel = error
    ? (lang === 'cz' ? 'Zkusit znovu' : 'Retry')
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

export function HomeDashboard({
  lang,
  lobbies,
  summaries,
  summariesLoading,
  summariesError,
  membershipItems,
  membershipLoading,
  membershipError,
  addLobbyMode,
  addLobbyPanel,
  onRetrySummaries,
  onCancelJoinRequest,
  onOpenContext,
  onOpenLobby,
  onSetAddLobbyMode
}: HomeDashboardProps) {
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

  if (lobbies.length === 0) {
    return (
      <main className="flex flex-1 flex-col p-6">
        {membershipNotices}
        <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600">
            <Trophy className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-black text-slate-900">{lang === 'cz' ? 'Začni tipovat s ostatními' : 'Start predicting together'}</h2>
          <p className="mx-auto mt-2 max-w-[290px] text-xs font-medium leading-relaxed text-slate-500">
            {lang === 'cz'
              ? 'Připoj se do existující lobby pomocí kódu, nebo si založ vlastní.'
              : 'Join an existing lobby with a code, or create your own.'}
          </p>
          <div className="mt-7 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => onSetAddLobbyMode('join')} className="min-h-12 rounded-xl bg-red-600 px-4 text-[10px] font-black uppercase tracking-wider text-white shadow-md shadow-red-100">
              {lang === 'cz' ? 'Připojit se kódem' : 'Join with code'}
            </button>
            <button type="button" onClick={() => onSetAddLobbyMode('create')} className="min-h-12 rounded-xl border border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-wider text-slate-700">
              {lang === 'cz' ? 'Založit lobby' : 'Create lobby'}
            </button>
          </div>
          {addLobbyPanel && <div className="mt-4 w-full text-left">{addLobbyPanel}</div>}
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col p-4 sm:p-6">
      <section aria-labelledby="home-lobbies-title">
        <h2 className="mb-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
          <span id="home-lobbies-title">{lang === 'cz' ? 'Tvoje lobby' : 'Your lobbies'}</span>
        </h2>
        {membershipNotices}
        <div className="space-y-4">
          {lobbies.map((lobby, index) => {
            const summary = getPrimaryHomeDashboardSummaryForLobby(lobby.id, summaries) ||
              getCompletedLobbySummary(lobby);

            return (
              <LobbyWorldCard
                key={lobby.id}
                lobby={lobby}
                summary={summary}
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
        </div>
      </section>

      <section className="mt-6">
        <button
          type="button"
          onClick={() => onSetAddLobbyMode(addLobbyMode === 'none' ? 'menu' : 'none')}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-wider text-slate-600"
        >
          <Plus className="h-4 w-4" /> {lang === 'cz' ? 'Přidat lobby' : 'Add lobby'}
        </button>

        {addLobbyMode === 'menu' && (
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
            <button type="button" onClick={() => onSetAddLobbyMode('join')} className="min-h-11 rounded-xl bg-red-50 px-3 text-[9px] font-black uppercase text-red-600">
              {lang === 'cz' ? 'Připojit se kódem' : 'Join with code'}
            </button>
            <button type="button" onClick={() => onSetAddLobbyMode('create')} className="min-h-11 rounded-xl bg-slate-100 px-3 text-[9px] font-black uppercase text-slate-700">
              {lang === 'cz' ? 'Založit novou lobby' : 'Create new lobby'}
            </button>
          </div>
        )}
        {addLobbyPanel && <div className="mt-3">{addLobbyPanel}</div>}
      </section>
    </main>
  );
}
