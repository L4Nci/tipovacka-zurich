import { createHash } from 'node:crypto';
import { MMA_PILOT_EVENTS, MMA_PROVIDER_METHODS, mmaTournamentId, type MmaFightStatus, type MmaProviderMethod } from '../../src/lib/mma.ts';

export class MmaProviderError extends Error {}
export class MmaCardPendingError extends MmaProviderError {}
const fail = (message: string): never => { throw new MmaProviderError(message); };
const object = (value: any) => value && typeof value === 'object' && !Array.isArray(value);
const positiveId = (value: any) => Number.isSafeInteger(value) && value > 0;
function utc(value: any, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !/Z$/.test(value) || !Number.isFinite(Date.parse(value))) fail('MMA source has an invalid UTC timestamp.');
  return new Date(value).toISOString();
}
function fighter(value: any) {
  if (value === null) return null;
  if (!object(value) || !positiveId(value.id) || typeof value.name !== 'string'
    || !value.name.trim() || value.name.length > 120) fail('MMA fighter identity is invalid.');
  const code = value.country_code;
  if (code !== null && (typeof code !== 'string' || !/^[A-Z]{2}$/.test(code))) fail('MMA country code is invalid.');
  return { id: value.id as number, name: value.name.trim() as string, country_code: code as string | null };
}

export function normalizeMmaEvent(payload: any, providerId: number, observedAt = new Date()) {
  const config = MMA_PILOT_EVENTS.find(event => event.providerId === providerId);
  if (!positiveId(providerId) || !object(payload) || payload.id !== providerId || payload.org !== 'ufc' || payload.sport !== 'mma'
    || typeof payload.slug !== 'string' || !/^[a-z0-9-]{1,120}$/.test(payload.slug)
    || typeof payload.title !== 'string' || !payload.title.trim() || payload.title.length > 200
    || !['announced', 'scheduled', 'live', 'completed', 'cancelled', 'postponed'].includes(payload.status)
    || (!config && !isUfcMainEvent(payload))
    || !Array.isArray(payload.card) || payload.card.length > 40) fail('MMA event is outside the UFC scope.');
  if (!payload.card.length) {
    if (['announced', 'scheduled'].includes(payload.status)) throw new MmaCardPendingError('UFC bouts have not been published yet.');
    fail('MMA card is incomplete.');
  }
  const starts = utc(payload.starts_at)!;
  // A legitimate postponement stays under the same provider ID. Original identity/date are pinned at bootstrap.
  const event = { tournament_id: mmaTournamentId(providerId), provider_event_id: providerId, provider_slug: payload.slug,
    name: config?.label ?? payload.title.trim(), org: 'ufc', sport: 'mma', starts_at: starts, main_card_at: utc(payload.main_card_at, true), status: payload.status as string };
  if (event.main_card_at && Date.parse(event.main_card_at) < Date.parse(starts)) fail('MMA main card precedes the first bell.');
  const fighters = new Map<number, ReturnType<typeof fighter>>();
  const ids = new Set<number>();
  const fights = payload.card.map((raw: any, index: number) => {
    if (!object(raw) || !positiveId(raw.id) || ids.has(raw.id) || raw.sport !== 'mma'
      || ![null, 'announced', 'confirmed', 'cancelled', 'completed', 'no_contest'].includes(raw.status)) fail('MMA fight identity or state is invalid.');
    ids.add(raw.id);
    const a = fighter(raw.fighter_a); const b = fighter(raw.fighter_b);
    if (a && b && a.id === b.id) fail('MMA fight has the same fighter in both corners.');
    for (const person of [a, b]) {
      if (!person) continue;
      const previous = fighters.get(person.id);
      if (previous && JSON.stringify(previous) !== JSON.stringify(person)) fail('MMA fighter has conflicting identity facts.');
      fighters.set(person.id, person);
    }
    const result = raw.result;
    if (result !== null && !object(result)) fail('MMA result is invalid.');
    const method = result?.method_normalized ?? null;
    if (method !== null && !MMA_PROVIDER_METHODS.includes(method)) fail('MMA finish method is invalid.');
    const winner = result?.winner_fighter_id ?? null;
    if (winner !== null && (!positiveId(winner) || !a || !b || (winner !== a.id && winner !== b.id))) fail('MMA winner is not a fighter in this bout.');
    let status: MmaFightStatus = 'scheduled';
    if (raw.status === 'cancelled') status = 'cancelled';
    else if (raw.status === 'no_contest' || result?.method_normalized === 'no_contest') status = 'void';
    else if (raw.status === 'completed') status = method === 'draw' ? 'draw' : winner !== null ? 'finished' : 'awaiting_result';
    else if (winner !== null || method !== null) fail('MMA pending fight carries a result.');
    if (status !== 'finished' && winner !== null) fail('MMA void/cancelled fight carries a winner.');
    if ((status === 'void' && method !== null && method !== 'no_contest')
      || (status === 'draw' && method !== null && method !== 'draw')) fail('MMA finish contradicts the bout outcome.');
    const order = raw.ordering ?? index + 1;
    if (!Number.isInteger(order) || order < 1 || order > 100
      || (raw.scheduled_rounds !== null && ![3, 5].includes(raw.scheduled_rounds))
      || (result?.round != null && (!Number.isInteger(result.round) || result.round < 1 || result.round > 5))) fail('MMA rounds or card order are invalid.');
    const section = raw.card_section ?? 'unknown';
    if (!['main', 'prelims', 'early_prelims', 'unknown'].includes(section)) fail('MMA card section is invalid.');
    return { id: 'ufcal-fight-' + raw.id, provider_fight_id: raw.id as number,
      fighter_a_id: a?.id ?? null, fighter_b_id: b?.id ?? null, ordering: order as number,
      card_section: section as string, weight_class: typeof raw.weight_class === 'string' ? raw.weight_class.slice(0, 120) : null,
      scheduled_rounds: raw.scheduled_rounds as number | null, status,
      winner_fighter_id: status === 'finished' ? winner as number : null,
      method: typeof result?.method === 'string' ? result.method.slice(0, 120) : null,
      method_normalized: method as MmaProviderMethod | null, finish_round: result?.round ?? null };
  }).sort((a: any, b: any) => a.provider_fight_id - b.provider_fight_id);
  const people = [...fighters.values()].sort((a, b) => a!.id - b!.id);
  if (!people.length || !Number.isFinite(observedAt.getTime())) fail('MMA observation is invalid.');
  const facts = { event, fighters: people, fights };
  return { ...facts, observed_at: observedAt.toISOString(),
    snapshot_hash: createHash('sha256').update(JSON.stringify(facts)).digest('hex') };
}
export type MmaBatch = ReturnType<typeof normalizeMmaEvent>;

export async function readMmaEvent(providerId: number, key: string, transport: typeof fetch = fetch): Promise<MmaBatch> {
  if (!positiveId(providerId)) fail('MMA event identity is invalid.');
  if (!key.trim()) fail('MMA provider key is not configured.');
  try {
    const response = await transport('https://api.ufcalendar.com/v1/events/' + providerId, {
      method: 'GET', headers: { authorization: 'Bearer ' + key.trim() }, redirect: 'error', signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) fail('MMA provider request failed (HTTP ' + response.status + ').');
    const text = await response.text();
    if (text.length > 2_000_000) fail('MMA provider response is too large.');
    let envelope: any; try { envelope = JSON.parse(text); } catch { fail('MMA provider returned invalid JSON.'); }
    if (!object(envelope) || !object(envelope.data) || envelope.error) fail('MMA provider response is invalid.');
    return normalizeMmaEvent(envelope.data, providerId);
  } catch (error) {
    if (error instanceof MmaProviderError) throw error;
    // Transport/provider errors may reflect the key. Never log or return their text.
    throw new MmaProviderError('MMA provider is unavailable or the response could not be verified.');
  }
}

function isUfcMainEvent(value: any) {
  // UFCalendar's UFC organization also contains development shows. Keep the main UFC calendar only.
  return typeof value.slug === 'string' && /^ufc(?:-|$)/.test(value.slug)
    && typeof value.title === 'string' && /\bUFC\b/i.test(value.title)
    && !/\b(DWCS|contender|ultimate fighter|road to ufc|power slap)\b/i.test(value.title + ' ' + value.slug.replaceAll('-', ' '));
}

export function normalizeMmaCalendar(envelope: any, now = new Date()) {
  const start = Date.parse(now.toISOString().slice(0, 10) + 'T00:00:00Z');
  if (!object(envelope) || !Array.isArray(envelope.data) || envelope.data.length > 100
    || envelope.error || envelope.meta?.pagination?.has_more !== false) fail('UFC calendar is incomplete.');
  const ids = new Set<number>();
  return envelope.data.flatMap((raw: any) => {
    if (!object(raw) || !positiveId(raw.id) || ids.has(raw.id) || raw.org !== 'ufc' || raw.sport !== 'mma'
      || typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 200
      || typeof raw.slug !== 'string' || !/^[a-z0-9-]{1,120}$/.test(raw.slug)
      || !['announced', 'scheduled', 'live', 'completed', 'cancelled', 'postponed'].includes(raw.status)) fail('UFC calendar identity is invalid.');
    ids.add(raw.id);
    const starts = utc(raw.starts_at)!;
    const time = Date.parse(starts);
    if (time < start - 86400_000 || time >= start + 43 * 86400_000) fail('UFC calendar date is outside the discovery window.');
    return isUfcMainEvent(raw) && ['announced', 'scheduled', 'live'].includes(raw.status)
      ? [{ provider_event_id: raw.id as number, starts_at: starts, org: 'ufc', sport: 'mma' }] : [];
  });
}

export async function readMmaCalendar(key: string, transport: typeof fetch = fetch, now = new Date()) {
  if (!key.trim()) fail('MMA provider key is not configured.');
  const today = Date.parse(now.toISOString().slice(0, 10) + 'T00:00:00Z');
  const from = new Date(today - 86400_000).toISOString().slice(0, 10);
  const to = new Date(today + 42 * 86400_000).toISOString().slice(0, 10);
  try {
    const response = await transport('https://api.ufcalendar.com/v1/events?org=ufc&from=' + from + '&to=' + to + '&order=asc&limit=100', {
      headers: { authorization: 'Bearer ' + key.trim() }, redirect: 'error', signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) fail('UFC calendar request failed (HTTP ' + response.status + ').');
    const text = await response.text();
    if (text.length > 2_000_000) fail('UFC calendar response is too large.');
    return normalizeMmaCalendar(JSON.parse(text), now);
  } catch (error) {
    if (error instanceof MmaProviderError) throw error;
    throw new MmaProviderError('UFC calendar is unavailable or could not be verified.');
  }
}
