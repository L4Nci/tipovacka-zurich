export const HOME_ACTION_WINDOW_HOURS = 48;

export type HomeDashboardScheduleState =
  | 'ready'
  | 'schedule_pending'
  | 'waiting_results'
  | 'completion_pending'
  | 'completed';

export type HomeDashboardSummary = {
  lobby_id: string;
  lobby_name: string;
  lobby_role: 'owner' | 'admin' | 'member';
  member_count: number;
  tournament_id: string;
  tournament_name: string;
  tournament_status: 'active' | 'archived';
  is_completed: boolean;
  actionable_match_count: number;
  next_actionable_lock_time: string | null;
  next_missing_lock_time: string | null;
  all_known_unlocked_predicted: boolean;
  schedule_state: HomeDashboardScheduleState;
  requires_owner_attention: boolean;
};

export type HomeDashboardContextInput = {
  lobby_id: string;
  lobby_name: string;
  lobby_role: 'owner' | 'admin' | 'member';
  member_count: number;
  tournament_id: string;
  tournament_name: string;
  tournament_status: 'active' | 'archived';
  actual_tournament_winner_id?: string | null;
};

export type HomeDashboardMatchInput = {
  id: string;
  tournament_id: string;
  home_participant_id: string;
  away_participant_id: string;
  lock_time_utc: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
};

export type HomeDashboardDisplayMatchInput = {
  status: string;
  home_team_id: string;
  away_team_id: string;
  start_time_utc: string;
  lock_time_utc?: string;
  predicted_home_score?: number | null;
};

export type HomeDashboardCardState =
  | 'actionable'
  | 'all_predicted'
  | 'later'
  | 'schedule_pending'
  | 'waiting_results'
  | 'completion_pending'
  | 'owner_attention'
  | 'ready'
  | 'completed'
  | 'inactive';

export const isKnownParticipantId = (participantId: string | null | undefined) => {
  const normalized = String(participantId || '').trim().toLowerCase();
  return normalized.length > 0 && !/(^|-)tba($|-)/.test(normalized);
};

export const isUntippedMatchForDisplay = (
  match: HomeDashboardDisplayMatchInput,
  nowMs = Date.now()
) => {
  const explicitLock = match.lock_time_utc ? new Date(match.lock_time_utc).getTime() : Number.NaN;
  const fallbackLock = new Date(match.start_time_utc).getTime() - 5 * 60 * 1000;
  const lockTime = Number.isFinite(explicitLock) ? explicitLock : fallbackLock;

  return match.status === 'scheduled' &&
    lockTime > nowMs &&
    isKnownParticipantId(match.home_team_id) &&
    isKnownParticipantId(match.away_team_id) &&
    (match.predicted_home_score === null || match.predicted_home_score === undefined);
};

export const summarizeHomeDashboardContext = (
  context: HomeDashboardContextInput,
  matches: HomeDashboardMatchInput[],
  predictedMatchIds: ReadonlySet<string>,
  nowMs = Date.now()
): HomeDashboardSummary => {
  const tournamentMatches = matches.filter(match => match.tournament_id === context.tournament_id);
  const unresolvedMatches = tournamentMatches.filter(match => (
    match.status !== 'finished' || match.home_score === null || match.away_score === null
  ));
  const isCompleted = Boolean(context.actual_tournament_winner_id) &&
    tournamentMatches.length > 0 &&
    unresolvedMatches.length === 0;

  const knownFutureMatches = tournamentMatches.filter(match => {
    const lockTime = new Date(match.lock_time_utc).getTime();
    return match.status === 'scheduled' &&
      Number.isFinite(lockTime) &&
      lockTime > nowMs &&
      isKnownParticipantId(match.home_participant_id) &&
      isKnownParticipantId(match.away_participant_id);
  });
  const missingFutureMatches = knownFutureMatches.filter(match => !predictedMatchIds.has(match.id));
  const actionWindowEnd = nowMs + HOME_ACTION_WINDOW_HOURS * 60 * 60 * 1000;
  const actionableMatches = missingFutureMatches.filter(match => (
    new Date(match.lock_time_utc).getTime() <= actionWindowEnd
  ));
  const byLockTime = (a: HomeDashboardMatchInput, b: HomeDashboardMatchInput) => (
    new Date(a.lock_time_utc).getTime() - new Date(b.lock_time_utc).getTime() || a.id.localeCompare(b.id)
  );
  const nextMissing = missingFutureMatches.slice().sort(byLockTime)[0];
  const nextActionable = actionableMatches.slice().sort(byLockTime)[0];

  let scheduleState: HomeDashboardScheduleState;
  if (isCompleted) {
    scheduleState = 'completed';
  } else if (knownFutureMatches.length > 0) {
    scheduleState = 'ready';
  } else if (tournamentMatches.length === 0 || tournamentMatches.some(match => (
    match.status === 'scheduled' &&
    (!isKnownParticipantId(match.home_participant_id) || !isKnownParticipantId(match.away_participant_id))
  ))) {
    scheduleState = 'schedule_pending';
  } else if (unresolvedMatches.length > 0) {
    scheduleState = 'waiting_results';
  } else {
    scheduleState = 'completion_pending';
  }

  const canManage = context.lobby_role === 'owner' || context.lobby_role === 'admin';

  return {
    lobby_id: context.lobby_id,
    lobby_name: context.lobby_name,
    lobby_role: context.lobby_role,
    member_count: context.member_count,
    tournament_id: context.tournament_id,
    tournament_name: context.tournament_name,
    tournament_status: context.tournament_status,
    is_completed: isCompleted,
    actionable_match_count: actionableMatches.length,
    next_actionable_lock_time: nextActionable?.lock_time_utc || null,
    next_missing_lock_time: nextMissing?.lock_time_utc || null,
    all_known_unlocked_predicted: knownFutureMatches.length > 0 && missingFutureMatches.length === 0,
    schedule_state: scheduleState,
    requires_owner_attention: canManage && (
      scheduleState === 'schedule_pending' || scheduleState === 'completion_pending'
    )
  };
};

export const classifyHomeDashboardSummary = (summary: HomeDashboardSummary): HomeDashboardCardState => {
  if (summary.is_completed || summary.schedule_state === 'completed') return 'completed';
  if (summary.tournament_status !== 'active') return 'inactive';
  if (summary.actionable_match_count > 0 && summary.next_actionable_lock_time) return 'actionable';
  if (summary.next_missing_lock_time) return 'later';
  if (summary.all_known_unlocked_predicted) return 'all_predicted';
  if (summary.requires_owner_attention) return 'owner_attention';
  return summary.schedule_state;
};

export const getActiveHomeDashboardSummaries = (summaries: HomeDashboardSummary[]) => (
  summaries.filter(summary => !summary.is_completed && summary.tournament_status === 'active')
);

export const getAttentionHomeDashboardSummaries = (summaries: HomeDashboardSummary[]) => (
  getActiveHomeDashboardSummaries(summaries)
    .filter(summary => classifyHomeDashboardSummary(summary) === 'actionable')
    .sort((a, b) => {
      const timeA = new Date(a.next_actionable_lock_time || 0).getTime();
      const timeB = new Date(b.next_actionable_lock_time || 0).getTime();
      return timeA - timeB ||
        a.tournament_name.localeCompare(b.tournament_name) ||
        a.lobby_name.localeCompare(b.lobby_name) ||
        a.lobby_id.localeCompare(b.lobby_id);
    })
);

export const sortHomeDashboardSummaries = (summaries: HomeDashboardSummary[]) => {
  const priority: Record<HomeDashboardCardState, number> = {
    actionable: 0,
    later: 1,
    all_predicted: 2,
    owner_attention: 3,
    ready: 4,
    schedule_pending: 5,
    waiting_results: 6,
    completion_pending: 7,
    completed: 8,
    inactive: 9
  };

  return getActiveHomeDashboardSummaries(summaries).slice().sort((a, b) => {
    const stateDiff = priority[classifyHomeDashboardSummary(a)] - priority[classifyHomeDashboardSummary(b)];
    if (stateDiff !== 0) return stateDiff;
    const timeA = new Date(a.next_actionable_lock_time || a.next_missing_lock_time || 0).getTime();
    const timeB = new Date(b.next_actionable_lock_time || b.next_missing_lock_time || 0).getTime();
    return timeA - timeB ||
      a.tournament_name.localeCompare(b.tournament_name) ||
      a.lobby_name.localeCompare(b.lobby_name) ||
      a.lobby_id.localeCompare(b.lobby_id);
  });
};

export const getLobbyCompetitionStatus = (
  lobbyId: string,
  summaries: HomeDashboardSummary[],
  relatedTournaments: Array<{ tournament_id: string; status: 'active' | 'archived' }> = []
) => {
  const lobbySummaries = summaries.filter(summary => summary.lobby_id === lobbyId);
  const activeTournamentIds = new Set(
    lobbySummaries
      .filter(summary => summary.tournament_status === 'active' && !summary.is_completed)
      .map(summary => summary.tournament_id)
  );
  const completedTournamentIds = new Set(
    lobbySummaries
      .filter(summary => summary.is_completed || summary.tournament_status === 'archived')
      .map(summary => summary.tournament_id)
  );

  relatedTournaments.forEach(relation => {
    if (relation.status === 'archived') completedTournamentIds.add(relation.tournament_id);
  });

  return {
    activeCount: activeTournamentIds.size,
    completedCount: completedTournamentIds.size
  };
};
