import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMmaLobbyData } from './mmaLobbyData.ts';

function fixtureClient(denyStandings = false) {
  const requests: { table: string; filters: any[]; ranges: number[][] }[] = [];
  const fighters = [{ id: 1, name: 'A', country_code: 'CZ' }, { id: 2, name: 'B', country_code: 'NZ' }];
  const picks = Array.from({ length: 1005 }, (_, index) => ({ lobby_id: 'kobra', fight_id: 'bout-a',
    user_id: 'member-' + index, predicted_winner_id: index % 2 ? 1 : 2, lineup_version: 1, points_earned: 0 }));
  const members = picks.map(row => ({ user_id: row.user_id, username: row.user_id,
    avatar_emoji: null, avatar_bg: null, points: '0', predictions_count: '1' }));
  const datasets = {
    mma_events: [{ tournament_id: 'ufc-334-2026' }],
    mma_fights: [{ id: 'bout-a', tournament_id: 'ufc-334-2026', fighter_a_id: 1, fighter_b_id: 2, ordering: 1 }],
    mma_fighters: fighters,
    mma_predictions: [...picks, { ...picks[0], lobby_id: 'private-other-lobby' }, { ...picks[0], fight_id: 'other-event-bout' }],
    standings: members,
  };
  class Query {
    request: typeof requests[number];
    constructor(public table: string) { this.request = { table, filters: [], ranges: [] }; requests.push(this.request); }
    select() { return this; }
    eq(key: string, value: any) { this.request.filters.push(['eq', key, value]); return this; }
    in(key: string, value: any[]) { this.request.filters.push(['in', key, value]); return this; }
    order() { return this; }
    result() {
      const error = this.table === 'standings' && denyStandings ? { code: '42501' } : null;
      return { error, data: (datasets[this.table] ?? []).filter(row => this.request.filters.every(([op, key, value]) =>
        op === 'eq' ? row[key] === value : value.includes(row[key]))) };
    }
    single() { const result = this.result(); return Promise.resolve({ ...result, data: result.data[0] }); }
    range(from: number, to: number) { this.request.ranges.push([from, to]); const result = this.result();
      return Promise.resolve({ ...result, data: result.data.slice(from, to + 1) }); }
    then(resolve: any, reject: any) { return Promise.resolve(this.result()).then(resolve, reject); }
  }
  return { requests, client: { from: (table: string) => new Query(table), rpc: (name: string, args: any) => {
    assert.equal(name, 'get_mma_lobby_leaderboard');
    assert.deepEqual(args, { p_lobby_id: 'kobra', p_tournament_id: 'ufc-334-2026' });
    return new Query('standings');
  } } as any };
}
test('community reads stay within the lobby/event, page beyond 1,000 and keep own picks separate', async () => {
  const { client, requests } = fixtureClient();
  const result = await loadMmaLobbyData(client, 'kobra', 'ufc-334-2026', 'member-0');
  assert.equal(result.lobbyPredictions.length, 1005);
  assert.equal(result.standings.length, 1005);
  assert.equal(result.predictions.length, 1);
  assert.equal(result.predictions[0].user_id, 'member-0');
  assert.equal(result.standings[0].points, 0);
  const query = requests.find(request => request.table === 'mma_predictions')!;
  assert.deepEqual(query.filters, [['eq', 'lobby_id', 'kobra'], ['in', 'fight_id', ['bout-a']]]);
  assert.equal(query.ranges.length, 2);
});
test('a failed membership check stops community prediction reads instead of showing partial stats', async () => {
  const { client, requests } = fixtureClient(true);
  await assert.rejects(loadMmaLobbyData(client, 'kobra', 'ufc-334-2026', 'member-0'), /MMA_LOBBY_LOAD_FAILED/);
  assert.equal(requests.some(request => request.table === 'mma_predictions'), false);
});
