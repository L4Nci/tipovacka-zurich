import assert from 'node:assert/strict';
import test from 'node:test';
import { NHL_CLUBS, normalizeNhlSchedules, normalizeElhSeason, parseElhDetail, pragueKickoff, readHockeySource, HockeyProviderError } from './hockeyProvider.ts';

const now = new Date('2026-11-05T20:00:00Z');
function nhl() {
  const schedules = NHL_CLUBS.map(club => ({ club, payload: { games: [] as any[] } }));
  const team = (i: number) => ({ id: i + 1, abbrev: NHL_CLUBS[i], placeName: { default: NHL_CLUBS[i] }, commonName: { default: 'Club' }, logo: `https://assets.nhle.com/logos/nhl/svg/${NHL_CLUBS[i]}_light.svg` });
  for (let round = 0; round < 84; round++) for (let i = 0; i < 16; i++) {
    const a = i, b = 16 + (i + round) % 16, home = round % 2 ? b : a, away = round % 2 ? a : b;
    const game = { id: 2026020001 + round * 16 + i, season: 20262027, gameType: 2,
      homeTeam: team(home), awayTeam: team(away), startTimeUTC: '2026-11-24T00:00:00Z',
      gameState: 'FUT', gameScheduleState: 'OK', periodDescriptor: { periodType: 'REG' } };
    schedules[home].payload.games.push(game); schedules[away].payload.games.push(game);
  }
  return schedules;
}
test('NHL validates all 1,344 fixtures, stable identities, 84 games and 42 home games per club', () => {
  const schedules = nhl(), batch = normalizeNhlSchedules(schedules, now);
  assert.equal(batch.matches.length, 1344); assert.equal(batch.clubs.length, 32);
  assert(batch.matches.every(m => m.home_score === null && m.provider_status === 'TIMED'));
  schedules[0].payload.games.pop(); assert.throws(() => normalizeNhlSchedules(schedules, now));
});
test('NHL shootouts use official final score and unchanged facts repair local state', () => {
  const schedules = nhl(); const game: any = schedules[0].payload.games[0];
  Object.assign(game, { gameState: 'OFF', startTimeUTC: '2026-11-01T00:00:00Z', gameOutcome: { lastPeriodType: 'SO' } });
  game.homeTeam.score = 3; game.awayTeam.score = 2;
  const first = normalizeNhlSchedules(schedules, now).matches.find(m => m.id === `nhl-match-${game.id}`)!;
  assert.equal(first.home_score, 3); assert.equal(first.provider_score.duration, 'SHOOTOUT');
  const cache = new Map([[first.id, { ...first, home_score: 99 }]]);
  const second = normalizeNhlSchedules(schedules, new Date(+now + 60000), cache).matches.find(m => m.id === first.id)!;
  assert.equal(second.home_score, 3); assert.equal(second.provider_updated_at, first.provider_updated_at);
  game.awayTeam.score = 3; assert.throws(() => normalizeNhlSchedules(schedules, now));
});
test('NHL includes published playoff fixtures and rejects unknown states and teams', () => {
  const s = nhl(); const g = structuredClone(s[0].payload.games[0]);
  Object.assign(g, { id: 2026030111, gameType: 3 }); s[0].payload.games.push(g);
  assert.equal(normalizeNhlSchedules(s, now).matches.filter(m => m.stage === 'Playoffs').length, 1);
  g.gameState = 'UNKNOWN'; assert.throws(() => normalizeNhlSchedules(s, now));
});
test('Prague conversion handles winter, summer and rejects ambiguous clocks or malformed dates', () => {
  assert.equal(pragueKickoff('2026-11-01', '15:00'), '2026-11-01T14:00:00.000Z');
  assert.equal(pragueKickoff('2026-09-15', '18:00'), '2026-09-15T16:00:00.000Z');
  for (const [d,t] of [['2026-10-25','02:30'],['2026-03-29','02:30'],['2026-02-30','18:00'],['2026-11-05','25:00']]) assert.throws(() => pragueKickoff(d,t));
});
function elh() {
  const events: any[] = []; let html = '<select id="frm-matchList-filter-form-season"><option selected value="2026">2026-2027</option></select><select id="frm-matchList-filter-form-competition"><option selected>Tipsport extraliga</option></select>';
  html += '<select id="frm-matchList-filter-form-team">' + Array.from({ length: 14 }, (_,i) => `<option value="${i+1}">Club ${i+1}</option>`).join('') + '</select>';
  for(let r=0;r<52;r++) { html += `<h2>${r+1}. kolo</h2><div class="showcase-matches"><table>`;
    for(let i=0;i<7;i++) { const id = r*7+i+1;
      events.push({ url: `/zapas/${id}`, start: id === 1 ? '2026-11-01' : '2026-11-24' });
      html += `<tr data-href="/zapas/${id}"><td><span class="preview__name--long">Club ${i+1}</span><span class="preview__name--short">C${i+1}</span></td>`
        + (id === 1 ? '<td class="preview__score"><span>2</span></td><td class="preview__period">NE 01. 11. (1:0, 0:1, 0:0 - 0:0 - 1:0)</td><td class="preview__score"><span>1</span></td><span class="dot">SN</span>' : '<td class="preview__desktop"><span class="col-1_3">18:00</span></td>')
        + `<td><span class="preview__name--long">Club ${8+(i+r)%7}</span><span class="preview__name--short">C${8+(i+r)%7}</span></td></tr>`;
    } html += '</table></div>';
  }
  return { html, events };
}
const detail = `<link rel="canonical" href="https://www.hokej.cz/zapas/1"><div class="container page match"><div class="heading">Tipsport extraliga 1.11.2026 15:00</div><div class="match-score"><div class="team-home"><a href="/klub/club/1"></a></div><div class="team-visiting"><a href="/klub/club/8"></a></div></div></div><div id="snippet-matchOverview-score"><div class="score"><span class="home">2</span><span class="visiting">1</span><div><span>konec po s.n.</span></div></div></div>`;
test('ELH reads 364 fixtures and verifies final scores in match details, then reuses identical verified snapshots', async () => {
  const input = elh(); let calls = 0;
  const first = await normalizeElhSeason(input.html, input.events, async () => { calls++; return detail; }, now);
  assert.equal(first.matches.length, 364); assert.equal(first.clubs.length, 14); assert.equal(calls, 1);
  const game = first.matches[0]!; assert.equal(game.home_score, 2); assert.equal(game.provider_score.duration, 'SHOOTOUT');
  assert.equal(game.kickoff, '2026-11-01T14:00:00.000Z');
  const cache = new Map([[game.id, { ...game, home_score: 99 }]]);
  const second = await normalizeElhSeason(input.html, input.events, async () => { throw new Error('Identical detail should be cached.'); }, now, cache);
  assert.equal(second.matches[0]!.home_score, 2);
  await assert.rejects(() => normalizeElhSeason(input.html, input.events.slice(1), async () => detail, now));
});
test('ELH rejects wrong identity or date and distinguishes a live score from the final', () => {
  assert.throws(() => parseElhDetail(detail, '2', '2026-11-01'));
  assert.throws(() => parseElhDetail(detail, '1', '2026-11-02'));
  assert.equal(parseElhDetail(detail.replace('konec po s.n.', '3. třetina'), '1', '2026-11-01').finished, false);
});
test('hockey fetcher follows only bounded same-origin redirects without credentials', async () => {
  let calls = 0;
  const transport: any = async (_url: string, opts: any) => { calls++; assert.equal(opts.method,'GET'); assert.equal(opts.headers.authorization, undefined); return new Response('', {status:302,headers:{location:'https://evil.invalid/leak'}}); };
  await assert.rejects(() => readHockeySource('https://www.hokej.cz/tipsport-extraliga/zapasy', transport));
  assert.equal(calls,1);
  await assert.rejects(() => readHockeySource('http://www.hokej.cz/no', transport));
});
test('source diagnostics expose only controlled status messages, never reflected response or transport text', async () => {
  await assert.rejects(() => readHockeySource('https://www.hokej.cz/tipsport-extraliga/zapasy', async () => new Response('reflected-private-value',{status:403})),
    (e: any) => e instanceof HockeyProviderError && e.message === 'Hockey source unavailable (403).');
  await assert.rejects(() => readHockeySource('https://www.hokej.cz/tipsport-extraliga/zapasy', async () => { throw new Error('reflected-private-value'); }),
    (e: any) => e instanceof HockeyProviderError && !e.message.includes('reflected-private-value'));
});
