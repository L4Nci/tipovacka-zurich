import assert from 'node:assert/strict';
import type { Lobby } from '../types.ts';
import {
  canStartLobbyNavigation,
  getLobbyNavigationViewState,
  runLobbyNavigationTransition
} from './lobbyNavigation.ts';

const lobby = (id: string, overrides: Partial<Lobby> = {}): Lobby => ({
  id,
  name: `Lobby ${id}`,
  owner_id: 'owner-1',
  tournament_id: 'world-cup',
  join_code: 'LOBBY-CODE',
  visibility: 'public',
  lobby_role: 'owner',
  is_owner: true,
  member_count: 1,
  tournaments: [{
    lobby_id: id,
    tournament_id: 'world-cup',
    status: 'active'
  }],
  ...overrides
});

const immediate = await runLobbyNavigationTransition({
  requestId: 1,
  isCurrent: requestId => requestId === 1,
  mutate: async () => lobby('created'),
  refresh: async () => ({ lobbies: [lobby('created')] }),
  onTarget: () => undefined
});
assert.equal(immediate.status, 'ready');
if (immediate.status === 'ready') {
  assert.equal(immediate.hydratedLobby.member_count, 1);
}

let releaseDelayedRefresh: (() => void) | undefined;
const delayedRefresh = new Promise<void>(resolve => {
  releaseDelayedRefresh = resolve;
});
let delayedTarget: Lobby | null = null;
const delayedPromise = runLobbyNavigationTransition({
  requestId: 2,
  isCurrent: requestId => requestId === 2,
  mutate: async () => lobby('delayed'),
  refresh: async () => {
    await delayedRefresh;
    return { lobbies: [lobby('delayed')] };
  },
  onTarget: target => {
    delayedTarget = target;
  }
});
await Promise.resolve();
assert.equal(delayedTarget?.id, 'delayed');
assert.equal(getLobbyNavigationViewState({
  activeLobbyId: null,
  activeLobby: undefined,
  activeTournamentId: null,
  pendingLobbyId: delayedTarget?.id ?? null
}), 'pending');
releaseDelayedRefresh?.();
const delayedResult = await delayedPromise;
assert.equal(delayedResult.status, 'ready');
if (delayedResult.status === 'ready') {
  assert.equal(getLobbyNavigationViewState({
    activeLobbyId: delayedResult.hydratedLobby.id,
    activeLobby: delayedResult.hydratedLobby,
    activeTournamentId: null,
    pendingLobbyId: null
  }), 'lobby');
}

await assert.rejects(
  runLobbyNavigationTransition({
    requestId: 3,
    isCurrent: requestId => requestId === 3,
    mutate: async () => lobby('refresh-failure'),
    refresh: async () => {
      throw new Error('refresh failed');
    },
    onTarget: () => undefined
  }),
  /refresh failed/
);

await assert.rejects(
  runLobbyNavigationTransition({
    requestId: 31,
    isCurrent: requestId => requestId === 31,
    mutate: async () => lobby('join-refresh-failure', { lobby_role: 'member', is_owner: false }),
    refresh: async () => {
      throw new Error('join refresh failed');
    },
    onTarget: () => undefined
  }),
  /join refresh failed/
);

let currentRequestId = 5;
const stale = await runLobbyNavigationTransition({
  requestId: 4,
  isCurrent: requestId => requestId === currentRequestId,
  mutate: async () => lobby('stale'),
  refresh: async () => ({ lobbies: [lobby('stale')] }),
  onTarget: () => undefined
});
assert.equal(stale.status, 'stale');
currentRequestId = 4;

let staleAfterRefreshCurrent = 6;
const staleAfterRefresh = await runLobbyNavigationTransition({
  requestId: 6,
  isCurrent: requestId => requestId === staleAfterRefreshCurrent,
  mutate: async () => lobby('stale-after-refresh'),
  refresh: async () => {
    staleAfterRefreshCurrent = 7;
    return { lobbies: [lobby('stale-after-refresh')] };
  },
  onTarget: () => undefined
});
assert.equal(staleAfterRefresh.status, 'stale');

await assert.rejects(
  runLobbyNavigationTransition({
    requestId: 8,
    isCurrent: requestId => requestId === 8,
    mutate: async () => lobby('missing'),
    refresh: async () => ({ lobbies: [] }),
    onTarget: () => undefined
  }),
  /nepodařilo se načíst/
);

let invalidRefreshCalled = false;
await assert.rejects(
  runLobbyNavigationTransition({
    requestId: 9,
    isCurrent: requestId => requestId === 9,
    mutate: async () => {
      throw new Error('Žádná lobby s tímto kódem neexistuje.');
    },
    refresh: async () => {
      invalidRefreshCalled = true;
      return { lobbies: [] };
    },
    onTarget: () => undefined
  }),
  /Žádná lobby/
);
assert.equal(invalidRefreshCalled, false);

const duplicateJoin = await runLobbyNavigationTransition({
  requestId: 10,
  isCurrent: requestId => requestId === 10,
  mutate: async () => lobby('existing', { lobby_role: 'member', is_owner: false }),
  refresh: async () => ({ lobbies: [lobby('existing', { lobby_role: 'member', is_owner: false })] }),
  onTarget: () => undefined
});
assert.equal(duplicateJoin.status, 'ready');

assert.equal(canStartLobbyNavigation(false), true);
assert.equal(canStartLobbyNavigation(true), false);
assert.equal(canStartLobbyNavigation(false, 'loading'), false);
assert.equal(canStartLobbyNavigation(false, 'error'), true);

assert.equal(getLobbyNavigationViewState({
  activeLobbyId: 'missing',
  activeLobby: undefined,
  activeTournamentId: null,
  pendingLobbyId: null
}), 'missing-lobby');
assert.equal(getLobbyNavigationViewState({
  activeLobbyId: 'created',
  activeLobby: lobby('created'),
  activeTournamentId: 'unknown-tournament',
  pendingLobbyId: null
}), 'missing-tournament');
assert.equal(getLobbyNavigationViewState({
  activeLobbyId: 'created',
  activeLobby: lobby('created'),
  activeTournamentId: null,
  pendingLobbyId: null
}), 'lobby');
assert.equal(getLobbyNavigationViewState({
  activeLobbyId: 'created',
  activeLobby: lobby('created'),
  activeTournamentId: 'world-cup',
  pendingLobbyId: null
}), 'tournament');

console.log('Lobby navigation scenarios passed.');
