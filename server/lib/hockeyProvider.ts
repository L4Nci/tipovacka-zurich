import { load } from 'cheerio';
import { clubCrestUrl } from '../../src/lib/teamAssets.ts';

export const HOCKEY_COMPETITIONS = {
  NHL: { tournamentId: 'nhl-2026-27', provider: 'nhl-web', clubs: 32, regular: 1344 },
  ELH: { tournamentId: 'czech-extraliga-2026-27', provider: 'hokej-cz', clubs: 14, regular: 364 },
} as const;
export type HockeyCompetition = keyof typeof HOCKEY_COMPETITIONS;
export type HockeyCache = Map<string, any>;
export const NHL_CLUBS = 'ANA BOS BUF CAR CBJ CGY CHI COL DAL DET EDM FLA LAK MIN MTL NJD NSH NYI NYR OTT PHI PIT SEA SJS STL TBL TOR UTA VAN VGK WPG WSH'.split(' ');
export class HockeyProviderError extends Error {}
const fail = (message: string): never => { throw new HockeyProviderError(message); };
const positive = (n: unknown) => Number.isSafeInteger(n) && Number(n) > 0;
const goals = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= 99;
const utc = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T.+Z$/.test(s) && Number.isFinite(Date.parse(s));
const stable = (o: any): string => o && typeof o === 'object'
  ? Array.isArray(o) ? `[${o.map(stable).join(',')}]` : `{${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`
  : JSON.stringify(o);

export async function readHockeySource(url: string, transport: typeof fetch = fetch) {
  const origin = new URL(url).origin;
  for (let redirects = 0; redirects < 3; redirects++) {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !['api-web.nhle.com', 'www.hokej.cz'].includes(u.hostname)
      || u.origin !== origin || u.port || u.username || u.password) fail('Unexpected hockey source.');
    let response: Response;
    try {
      response = await transport(u.href, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(12000),
        headers: { accept: u.hostname === 'api-web.nhle.com' ? 'application/json' : 'text/html,application/json', 'user-agent': 'Tipovacka/1.0 (private prediction pilot)' }, cache: 'no-store' });
    } catch { return fail(`Hockey source connection failed (${u.hostname}).`); }
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.get('location')) {
      url = new URL(response.headers.get('location')!, u).href;
      continue;
    }
    if (!response.ok) fail(`Hockey source unavailable (${response.status}).`);
    return response.text();
  }
  return fail('Too many hockey source redirects.');
}

export async function mapLimit<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await work(items[i]); }
  }));
  return results;
}

function gameRow(id: string, home: string, away: string, kickoff: string, stage: string, matchday: number | null,
  status: string, facts: any, now: Date, cache: HockeyCache) {
  if (!utc(kickoff) || home === away || !['scheduled', 'live', 'finished'].includes(status)) fail('Invalid hockey fixture.');
  const final = facts.fullTime;
  if (status === 'finished' && (!goals(final?.home) || !goals(final?.away) || final.home === final.away || Date.parse(kickoff) > +now)) fail('Invalid final hockey score.');
  facts = { ...facts, kickoff };
  const previous = cache.get(id);
  // A previously verified identical source snapshot can repair local scores/points without inventing a new revision.
  const revision = previous && stable(previous.provider_score) === stable(facts)
    ? previous.provider_updated_at : now.toISOString();
  return { id, provider_match_id: id.split('-match-')[1], home_id: home, away_id: away,
    kickoff, stage, matchday, status, provider_status: status === 'finished' ? 'FINISHED' : status === 'live' ? 'LIVE' : facts.timed === false ? 'SCHEDULED' : 'TIMED',
    provider_updated_at: revision, provider_score: facts,
    home_score: status === 'finished' ? final.home : null, away_score: status === 'finished' ? final.away : null, scores: [] as any[] };
}

export function normalizeNhlSchedules(schedules: { club: string; payload: any }[], now = new Date(), cache: HockeyCache = new Map()) {
  if (schedules.length !== 32 || new Set(schedules.map(s => s.club)).size !== 32
    || schedules.some(s => !NHL_CLUBS.includes(s.club))) fail('NHL roster is incomplete.');
  const clubs = new Map<string, any>(); const matches: any[] = []; const seen = new Set<number>();
  for (const { club, payload } of schedules) {
    if (!Array.isArray(payload?.games)) fail('NHL schedule is incomplete.');
    const regular = payload.games.filter((g: any) => g.gameType === 2);
    if (regular.length !== 84 || regular.filter((g: any) => g.homeTeam?.abbrev === club).length !== 42
      || regular.some((g: any) => g.season !== 20262027 || ![g.homeTeam?.abbrev, g.awayTeam?.abbrev].includes(club))) fail('NHL 84-game schedule failed validation.');
    for (const g of payload.games.filter((g: any) => [2, 3].includes(g.gameType) && g.homeTeam?.abbrev === club)) {
      if (!positive(g.id) || seen.has(g.id) || g.season !== 20262027 || !String(g.id).startsWith(`20260${g.gameType}`)
        || !utc(g.startTimeUTC) || !['FUT', 'PRE', 'LIVE', 'CRIT', 'FINAL', 'OFF'].includes(g.gameState)
        || !['OK', 'PPD', 'CNCL', 'TBD'].includes(g.gameScheduleState)) fail('Invalid NHL game identity or status.');
      seen.add(g.id);
      for (const t of [g.homeTeam, g.awayTeam]) {
        if (!positive(t.id) || !NHL_CLUBS.includes(t.abbrev) || !t.placeName?.default || !t.commonName?.default) fail('Invalid NHL club.');
        const id = `nhl-team-${t.id}`;
        const name = `${t.placeName.default} ${t.commonName.default}`;
        if (clubs.has(id) && clubs.get(id).name !== name) fail('Conflicting NHL club identity.');
        clubs.set(id, { id, name, short_name: t.abbrev, logo_url: clubCrestUrl(t.logo) });
      }
      const finished = ['FINAL', 'OFF'].includes(g.gameState);
      const period = g.gameOutcome?.lastPeriodType || g.periodDescriptor?.periodType;
      if (finished && !['REG', 'OT', 'SO'].includes(period)) fail('NHL final period is missing.');
      const status = finished ? 'finished' : ['LIVE', 'CRIT'].includes(g.gameState) ? 'live' : 'scheduled';
      const facts = { source: 'nhl-web', season: 20262027, game_type: g.gameType, game_state: g.gameState,
        schedule_state: g.gameScheduleState, timed: g.gameScheduleState === 'OK',
        duration: finished ? ({ REG: 'REGULAR', OT: 'OVERTIME', SO: 'SHOOTOUT' } as any)[period] : null,
        fullTime: finished ? { home: g.homeTeam.score, away: g.awayTeam.score } : null };
      matches.push(gameRow(`nhl-match-${g.id}`, `nhl-team-${g.homeTeam.id}`, `nhl-team-${g.awayTeam.id}`,
        g.startTimeUTC, g.gameType === 2 ? 'Regular Season' : 'Playoffs', null, status, facts, now, cache));
    }
  }
  if (clubs.size !== 32 || matches.filter(m => m.stage === 'Regular Season').length !== 1344 || matches.length > 1449) fail('NHL catalog is incomplete.');
  return { competition: 'NHL', season: 2026, scoring_rule: 'hockey-final-v1', clubs: [...clubs.values()], matches, awaiting_fixtures: [] };
}

/** Convert a published Prague wall time, rejecting nonexistent/ambiguous clock-change times. */
export function pragueKickoff(day: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) fail('Hockey kickoff is unresolved.');
  const base = Date.parse(`${day}T${time}:00Z`);
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const candidates = [1, 2].map(offset => new Date(base - offset * 3600000)).filter(d => {
    if (!Number.isFinite(+d)) return false;
    const parts = Object.fromEntries(formatter.formatToParts(d).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}` === day && `${parts.hour}:${parts.minute}` === time;
  });
  if (candidates.length !== 1) fail('Hockey kickoff is ambiguous or invalid.');
  return candidates[0].toISOString();
}

export function parseElhDetail(html: string, id: string, day: string) {
  const $ = load(html);
  const heading = $('.container.page.match .heading').first().text().replace(/\s+/g, ' ');
  const date = heading.match(/(\d{1,2})\.(\d{1,2})\.(202[67])\s+(\d{1,2}:\d{2})/);
  if (!heading.includes('Tipsport extraliga') || !date
    || `${date[3]}-${date[2].padStart(2, '0')}-${date[1].padStart(2, '0')}` !== day
    || $('link[rel="canonical"]').attr('href') !== `https://www.hokej.cz/zapas/${id}`) fail('ELH detail identity or kickoff mismatch.');
  const home = $('.match-score .team-home a').first().attr('href')?.match(/\/klub\/[^/]+\/(\d+)/)?.[1];
  const away = $('.match-score .team-visiting a').first().attr('href')?.match(/\/klub\/[^/]+\/(\d+)/)?.[1];
  const score = $('#snippet-matchOverview-score .score');
  const description = score.find('> div > span').first().text().trim().toLowerCase();
  const finished = /^konec(?: po (?:s\.n\.|prodloužení))?$/.test(description);
  if (finished && ![score.find('> .home').text(), score.find('> .visiting').text()].every(s => /^\d{1,2}$/.test(s.trim()))) fail('Invalid ELH detail score.');
  return { kickoff: pragueKickoff(day, date[4].padStart(5, '0')), home, away, finished,
    duration: description === 'konec po s.n.' ? 'SHOOTOUT' : description.includes('prodloužení') ? 'OVERTIME' : 'REGULAR',
    fullTime: finished ? { home: Number(score.find('> .home').text()), away: Number(score.find('> .visiting').text()) } : null };
}

export async function normalizeElhSeason(html: string, events: any, detail: (id: string) => Promise<string>, now = new Date(), cache: HockeyCache = new Map()) {
  const $ = load(html);
  if ($('#frm-matchList-filter-form-season option[selected]').attr('value') !== '2026'
    || $('#frm-matchList-filter-form-competition option[selected]').text().trim() !== 'Tipsport extraliga'
    || !Array.isArray(events)) fail('Wrong ELH season or competition.');
  const clubs = new Map<string, any>();
  $('#frm-matchList-filter-form-team option').each((_, e) => {
    const id = $(e).attr('value'); if (id && /^[1-9]\d*$/.test(id)) clubs.set(`hokej-cz-team-${id}`, { id: `hokej-cz-team-${id}`, name: $(e).text().trim(), short_name: '', logo_url: null });
  });
  if (clubs.size !== 14 || new Set([...clubs.values()].map(c => c.name)).size !== 14) fail('ELH club catalog is incomplete.');
  const byName = new Map([...clubs.values()].map(c => [c.name, c]));
  const dates = new Map<string, string>();
  for (const event of events) {
    const id = typeof event.url === 'string' ? event.url.match(/^\/zapas\/([1-9]\d*)$/)?.[1] : null;
    if (!id || dates.has(id) || !/^202[67]-\d{2}-\d{2}$/.test(event.start)) fail('Invalid ELH calendar.');
    dates.set(id, event.start);
  }
  const rows = $('tr[data-href^="/zapas/"]').toArray();
  if (rows.length !== 364 || dates.size !== 364) fail('ELH 52-round schedule is incomplete.');
  const seen = new Set<string>(); const rounds = new Map<number, number>(); const appearances = new Map<string, number>();
  const awaiting: string[] = [];
  const matches = await mapLimit(rows, 3, async row => {
    const el = $(row), id = el.attr('data-href')!.match(/^\/zapas\/([1-9]\d*)$/)?.[1];
    const roundText = el.closest('.showcase-matches').prev('h2').text().trim();
    const round = Number(roundText.match(/^(\d+)\. kolo$/)?.[1]);
    if (!id || seen.has(id) || !dates.has(id) || !Number.isInteger(round) || round < 1 || round > 52) fail('Invalid ELH fixture identity/round.');
    seen.add(id); rounds.set(round, (rounds.get(round) || 0) + 1);
    const teams = el.find('.preview__name--long').toArray().map(e => byName.get($(e).text().trim()));
    if (teams.length !== 2 || !teams[0] || !teams[1] || teams[0].id === teams[1].id) fail('Unknown ELH club.');
    const [home, away] = teams;
    for (let i = 0; i < 2; i++) {
      appearances.set(teams[i].id, (appearances.get(teams[i].id) || 0) + 1);
      teams[i].short_name = el.find('.preview__name--short').eq(i).text().trim();
      const image = el.find('.preview__logo img').eq(i).attr('src');
      if (image) { const u = new URL(image, 'https://www.hokej.cz');
        const file = u.pathname === '/min.php' ? u.searchParams.get('file') : u.pathname;
        teams[i].logo_url = clubCrestUrl(`https://www.hokej.cz${file}`); }
    }
    const day = dates.get(id)!;
    const listScores = el.find('.preview__score > span').toArray().map(e => $(e).text().trim());
    const fingerprint = stable({ day, home: home.id, away: away.id, scores: listScores,
      period: el.find('.preview__period').text().replace(/\s+/g, ' ').trim(), outcome: el.find('.dot').text().trim() });
    const old = cache.get(`hokej-cz-match-${id}`);
    let kickoff: string, status: string, facts: any;
    if (old?.provider_score?.list_fingerprint === fingerprint && old.provider_score.fullTime && utc(old.provider_score.kickoff)) {
      kickoff = old.provider_score.kickoff; status = 'finished'; facts = old.provider_score;
    } else if (listScores.length) {
      const verified = parseElhDetail(await detail(id), id, day);
      if (`hokej-cz-team-${verified.home}` !== home.id || `hokej-cz-team-${verified.away}` !== away.id) fail('ELH detail teams disagree with schedule.');
      kickoff = verified.kickoff; status = verified.finished ? 'finished' : 'live';
      if (verified.finished && (Number(listScores[0]) !== verified.fullTime!.home || Number(listScores[1]) !== verified.fullTime!.away)) fail('ELH list/detail scores disagree; retry.');
      facts = { source: 'hokej-cz', season: 2026, duration: verified.finished ? verified.duration : null, fullTime: verified.fullTime,
        list_fingerprint: verified.finished ? fingerprint : null, timed: true };
    } else {
      const time = el.find('.preview__desktop .col-1_3').last().text().trim();
      if (!/^\d{2}:\d{2}$/.test(time)) { awaiting.push(id); return null; }
      kickoff = pragueKickoff(day, time); status = 'scheduled';
      facts = { source: 'hokej-cz', season: 2026, duration: null, fullTime: null, list_fingerprint: null, timed: true };
    }
    return gameRow(`hokej-cz-match-${id}`, home.id, away.id, kickoff, 'Regular Season', round, status, facts, now, cache);
  });
  if (rounds.size !== 52 || [...rounds.values()].some(n => n !== 7) || [...appearances.values()].some(n => n !== 52)) fail('Unbalanced ELH schedule.');
  return { competition: 'ELH', season: 2026, scoring_rule: 'hockey-final-v1', clubs: [...clubs.values()], matches: matches.filter(Boolean), awaiting_fixtures: awaiting };
}
