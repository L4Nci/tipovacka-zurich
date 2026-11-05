import assert from 'node:assert/strict';
import {
  buildOfficialEventShareUrl,
  getSeasonResultHeadline,
  getSeasonResultTier,
  isLobbyPrizeSchemaMismatch,
  mergeLobbyPrizeMetadata,
  normalizeLobbyPrizeEntries,
  prepareLobbyPrizeSelection,
  preserveLobbyPrizeMetadata,
  shouldShowLobbyMakerCta
} from './productEvolution.ts';
import type { Lobby } from '../types.ts';

assert.deepEqual(
  normalizeLobbyPrizeEntries([
    { position: 9, label: ' 500 Kč ' },
    { position: 4, label: ' Poukaz ' }
  ]),
  [
    { position: 1, label: '500 Kč' },
    { position: 2, label: 'Poukaz' }
  ]
);

assert.deepEqual(
  prepareLobbyPrizeSelection({
    enabled: true,
    entries: [
      { position: 1, label: ' 500 Kč ' },
      { position: 2, label: ' ' },
      { position: 3, label: 'Poukaz' }
    ]
  }),
  {
    enabled: true,
    entries: [
      { position: 1, label: '500 Kč' },
      { position: 2, label: 'Poukaz' }
    ]
  }
);
assert.throws(
  () => prepareLobbyPrizeSelection({
    enabled: true,
    entries: [{ position: 1, label: 'x'.repeat(121) }]
  }),
  /nejvýše 120 znaků/
);
assert.throws(
  () => prepareLobbyPrizeSelection({
    enabled: true,
    entries: [{ position: 1, label: '<b>Výhra</b>' }]
  }),
  /HTML/
);
assert.throws(
  () => prepareLobbyPrizeSelection({
    enabled: true,
    entries: [{ position: 1, label: ' ' }]
  }),
  /alespoň jednu cenu/
);

const baseLobby: Lobby = {
  id: 'stable-lobby',
  name: 'Původní lobby',
  owner_id: 'owner',
  tournament_id: 'tournament',
  join_code: 'CODE',
  visibility: 'private'
};
const enrichedLobby = mergeLobbyPrizeMetadata([baseLobby], [{
  id: baseLobby.id,
  prizes_enabled: true,
  prize_entries: [{ position: 1, label: 'Poukaz' }]
}]);
assert.equal(enrichedLobby.length, 1);
assert.equal(enrichedLobby[0].name, 'Původní lobby');
assert.equal(enrichedLobby[0].prizes_enabled, true);
assert.deepEqual(
  preserveLobbyPrizeMetadata(enrichedLobby, [{ ...baseLobby, name: 'Aktualizovaná lobby' }]),
  [{
    ...baseLobby,
    name: 'Aktualizovaná lobby',
    prizes_enabled: true,
    prize_entries: [{ position: 1, label: 'Poukaz' }]
  }]
);
assert.equal(
  isLobbyPrizeSchemaMismatch({
    code: '42703',
    message: 'column lobbies_1.prizes_enabled does not exist'
  }),
  true
);
assert.equal(
  isLobbyPrizeSchemaMismatch({ code: '42501', message: 'permission denied' }),
  false
);

assert.equal(
  getSeasonResultHeadline({ position: 548, participant_count: 14283 }),
  'Skončil jsi 548. z 14 283 tipérů.'
);
assert.equal(getSeasonResultTier({ position: 1, top_percent: 1 }), 'Vítěz eventu');
assert.equal(getSeasonResultTier({ position: 8, top_percent: 1 }), 'TOP 10');
assert.equal(getSeasonResultTier({ position: 32, top_percent: 1 }), 'TOP 1 %');
assert.equal(getSeasonResultTier({ position: 220, top_percent: 7 }), 'TOP 7 %');

assert.equal(shouldShowLobbyMakerCta({
  hasOwnedLobby: true,
  savedPrediction: true,
  viewedLeaderboard: true,
  completedEvent: true
}), false);
assert.equal(shouldShowLobbyMakerCta({
  hasOwnedLobby: false,
  savedPrediction: true,
  viewedLeaderboard: false,
  completedEvent: false
}), true);

assert.equal(
  buildOfficialEventShareUrl('premier-league-2026', 'https://tipovacka.example/'),
  'https://tipovacka.example/?event=premier-league-2026'
);

console.log('Product evolution scenarios passed.');
