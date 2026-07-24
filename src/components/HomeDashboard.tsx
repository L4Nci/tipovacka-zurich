import { useState, type ReactNode } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Plus,
  RotateCw,
  Trophy,
  Users
} from 'lucide-react';
import type { Lobby, MembershipHomeItem } from '../types.ts';
import {
  classifyHomeDashboardSummary,
  getAttentionHomeDashboardSummaries,
  getLobbyCompetitionStatus,
  sortHomeDashboardSummaries,
  type HomeDashboardCardState,
  type HomeDashboardSummary
} from '../lib/homeDashboard.ts';

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
  onOpenContext: (summary: HomeDashboardSummary, showOnlyMissing: boolean) => void;
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

  if (items.length === 0) return null;

  return (
    <section className="mb-6 space-y-2" aria-label={lang === 'cz' ? 'Stav členství' : 'Membership status'}>
      {actionError && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-[10px] font-bold text-red-600">{actionError}</p>
      )}
      {items.map(item => {
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
    <div className="h-2.5 w-2/3 rounded bg-slate-100" />
    <div className="mt-2 h-2 w-1/2 rounded bg-slate-100" />
    <div className="mt-5 h-10 w-full rounded-xl bg-slate-100" />
  </div>
);

const ContextCard = ({
  summary,
  lang,
  attention = false,
  onOpenContext,
  onOpenLobby
}: {
  key?: string;
  summary: HomeDashboardSummary;
  lang: 'cz' | 'en';
  attention?: boolean;
  onOpenContext: (summary: HomeDashboardSummary, showOnlyMissing: boolean) => void;
  onOpenLobby: (summary: HomeDashboardSummary) => void;
}) => {
  const copy = getCardCopy(summary, lang);
  const relevantLock = copy.state === 'actionable'
    ? summary.next_actionable_lock_time
    : summary.next_missing_lock_time;
  const timeLabel = formatLockTime(relevantLock, lang);

  return (
    <article className={`rounded-2xl border bg-white shadow-sm ${attention ? 'border-red-100 p-5 shadow-red-100/60' : 'border-slate-100 p-4'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-black uppercase text-red-600">{summary.tournament_name}</p>
          <h3 className="mt-1 truncate text-base font-black uppercase text-slate-900">{summary.lobby_name}</h3>
        </div>
        {attention ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <Clock3 className="h-4 w-4" />
          </span>
        ) : (
          <Trophy className="h-4 w-4 shrink-0 text-slate-300" />
        )}
      </div>

      <p className={`mt-4 font-black ${copy.state === 'actionable' ? 'text-red-600' : 'text-slate-700'} ${attention ? 'text-lg' : 'text-sm'}`}>
        {copy.status}
      </p>
      {timeLabel && <p className="mt-1 text-[11px] font-semibold text-slate-400">{timeLabel}</p>}

      <div className={`mt-4 flex items-center gap-2 ${attention ? '' : 'justify-between'}`}>
        <button
          type="button"
          onClick={() => {
            if (copy.state === 'owner_attention' || copy.state === 'inactive') {
              onOpenLobby(summary);
              return;
            }
            onOpenContext(summary, copy.missing);
          }}
          className={`${attention ? 'flex-1 bg-red-600 text-white shadow-md shadow-red-100' : 'bg-slate-900 text-white'} min-h-11 rounded-xl px-4 text-[10px] font-black uppercase tracking-wider active:scale-[0.98]`}
        >
          {copy.cta}
        </button>
        {attention && (
          <button
            type="button"
            onClick={() => onOpenLobby(summary)}
            className="min-h-11 rounded-xl px-3 text-[10px] font-black uppercase text-slate-500"
          >
            {lang === 'cz' ? 'Detail lobby' : 'Lobby detail'}
          </button>
        )}
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
  const attention = getAttentionHomeDashboardSummaries(summaries);
  const activeContexts = sortHomeDashboardSummaries(summaries);
  const allContextsComplete = activeContexts.length > 0 && activeContexts.every(summary => (
    classifyHomeDashboardSummary(summary) === 'all_predicted'
  ));
  const openLobbyFromSummary = (summary: HomeDashboardSummary) => {
    const lobby = lobbies.find(item => item.id === summary.lobby_id);
    if (lobby) onOpenLobby(lobby);
  };
  const getLobbyStatusLabel = (lobby: Lobby) => {
    const status = getLobbyCompetitionStatus(lobby.id, summaries, lobby.tournaments || []);
    if (status.activeCount > 0) {
      if (lang === 'en') return `${status.activeCount} active ${status.activeCount === 1 ? 'tournament' : 'tournaments'}`;
      if (status.activeCount === 1) return '1 aktivní turnaj';
      if (status.activeCount >= 2 && status.activeCount <= 4) return `${status.activeCount} aktivní turnaje`;
      return `${status.activeCount} aktivních turnajů`;
    }
    if (status.completedCount > 0) {
      if (lang === 'en') return `${status.completedCount} completed ${status.completedCount === 1 ? 'tournament' : 'tournaments'}`;
      if (status.completedCount === 1) return '1 dokončený turnaj';
      if (status.completedCount >= 2 && status.completedCount <= 4) return `${status.completedCount} dokončené turnaje`;
      return `${status.completedCount} dokončených turnajů`;
    }
    return lang === 'cz' ? 'Čeká na nový turnaj' : 'Waiting for a new tournament';
  };
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
      {membershipNotices}
      {(summariesLoading || attention.length > 0 || allContextsComplete) && (
        <section>
          <h2 className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            {lang === 'cz' ? 'Potřebuje tvoji pozornost' : 'Needs your attention'}
          </h2>
          <div className="space-y-3">
            {summariesLoading ? (
              <DashboardSkeleton />
            ) : attention.length > 0 ? (
              attention.map(summary => (
                <ContextCard
                  key={`${summary.lobby_id}:${summary.tournament_id}:attention`}
                  summary={summary}
                  lang={lang}
                  attention
                  onOpenContext={onOpenContext}
                  onOpenLobby={openLobbyFromSummary}
                />
              ))
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <p className="text-xs font-black">{lang === 'cz' ? 'Vše máš tipnuto' : 'All predictions complete'}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {(summariesLoading || summariesError || activeContexts.length > 0) && (
      <section className="mt-7">
        <h2 className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
          {lang === 'cz' ? 'Tvoje tipovačky' : 'Your competitions'}
        </h2>
        {summariesLoading ? (
          <div className="space-y-3"><DashboardSkeleton compact /><DashboardSkeleton compact /></div>
        ) : summariesError ? (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="text-xs font-black text-amber-800">{lang === 'cz' ? 'Akční přehled se nepodařilo načíst.' : 'The action overview could not be loaded.'}</p>
                <p className="mt-1 text-[10px] font-semibold text-amber-700">{lang === 'cz' ? 'Tvoje lobby zůstávají dostupné níže.' : 'Your lobbies remain available below.'}</p>
              </div>
            </div>
            <button type="button" onClick={onRetrySummaries} className="mt-3 flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 text-[10px] font-black uppercase text-amber-700">
              <RotateCw className="h-3.5 w-3.5" /> {lang === 'cz' ? 'Zkusit znovu' : 'Retry'}
            </button>
          </div>
        ) : activeContexts.length > 0 ? (
          <div className="space-y-3">
            {activeContexts.map(summary => (
              <ContextCard
                key={`${summary.lobby_id}:${summary.tournament_id}`}
                summary={summary}
                lang={lang}
                onOpenContext={onOpenContext}
                onOpenLobby={openLobbyFromSummary}
              />
            ))}
          </div>
        ) : null}
      </section>
      )}

      <section className="mt-7">
        <h2 className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
          {lang === 'cz' ? 'Tvoje lobby' : 'Your lobbies'}
        </h2>
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          {lobbies.map((lobby, index) => (
            <button
              key={lobby.id}
              type="button"
              onClick={() => onOpenLobby(lobby)}
              className={`flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left ${index > 0 ? 'border-t border-slate-100' : ''}`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-black uppercase text-slate-800">{lobby.name}</p>
                <div className="mt-1 flex items-center gap-2 text-[9px] font-bold uppercase text-slate-400">
                  <span>{lobby.is_owner ? 'Owner' : lobby.lobby_role === 'admin' ? 'Admin' : (lang === 'cz' ? 'Člen' : 'Member')}</span>
                  {lobby.member_count !== null && lobby.member_count !== undefined && (
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {lobby.member_count}</span>
                  )}
                </div>
                {!summariesLoading && !summariesError && (
                  <p className="mt-1 truncate text-[9px] font-semibold text-slate-400">
                    {getLobbyStatusLabel(lobby)}
                  </p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
            </button>
          ))}
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
