import type { Lobby } from '../types.ts';

export type LobbyNavigationAction = 'create' | 'join';

export type LobbyNavigationViewState =
  | 'home'
  | 'pending'
  | 'lobby'
  | 'tournament'
  | 'missing-lobby'
  | 'missing-tournament';

type LobbyNavigationRefreshData = {
  lobbies: Lobby[];
};

type RunLobbyNavigationTransitionOptions<TData extends LobbyNavigationRefreshData> = {
  requestId: number;
  isCurrent: (requestId: number) => boolean;
  mutate: () => Promise<Lobby>;
  refresh: (lobbyId: string) => Promise<TData>;
  onTarget: (lobby: Lobby) => void;
};

export type LobbyNavigationTransitionResult<TData extends LobbyNavigationRefreshData> =
  | {
      status: 'ready';
      targetLobby: Lobby;
      hydratedLobby: Lobby;
      data: TData;
    }
  | {
      status: 'stale';
    };

export const canStartLobbyNavigation = (
  mutationInFlight: boolean,
  pendingStatus?: 'loading' | 'error'
) => !mutationInFlight && pendingStatus !== 'loading';

export const hasLobbyTournament = (lobby: Lobby | undefined, tournamentId: string | null) => {
  if (!tournamentId) return true;
  if (!lobby) return false;
  if (lobby.tournament_id === tournamentId) return true;
  return Boolean(lobby.tournaments?.some(tournament => tournament.tournament_id === tournamentId));
};

export const getLobbyNavigationViewState = ({
  activeLobbyId,
  activeLobby,
  activeTournamentId,
  pendingLobbyId
}: {
  activeLobbyId: string | null;
  activeLobby: Lobby | undefined;
  activeTournamentId: string | null;
  pendingLobbyId: string | null;
}): LobbyNavigationViewState => {
  if (pendingLobbyId) return 'pending';
  if (!activeLobbyId) return 'home';
  if (!activeLobby) return 'missing-lobby';
  if (!activeTournamentId) return 'lobby';
  return hasLobbyTournament(activeLobby, activeTournamentId) ? 'tournament' : 'missing-tournament';
};

export const runLobbyNavigationTransition = async <TData extends LobbyNavigationRefreshData>({
  requestId,
  isCurrent,
  mutate,
  refresh,
  onTarget
}: RunLobbyNavigationTransitionOptions<TData>): Promise<LobbyNavigationTransitionResult<TData>> => {
  const targetLobby = await mutate();
  if (!isCurrent(requestId)) return { status: 'stale' };

  onTarget(targetLobby);
  const data = await refresh(targetLobby.id);
  if (!isCurrent(requestId)) return { status: 'stale' };

  const hydratedLobby = data.lobbies.find(lobby => lobby.id === targetLobby.id);
  if (!hydratedLobby) {
    throw new Error('Lobby vznikla, ale nepodařilo se načíst její aktuální data.');
  }

  return {
    status: 'ready',
    targetLobby,
    hydratedLobby,
    data
  };
};
