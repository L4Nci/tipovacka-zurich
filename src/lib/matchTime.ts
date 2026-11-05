export const MATCH_TIME_ZONE = 'Europe/Prague';
export function formatMatchKickoff(value: string, lang: 'cz' | 'en' = 'cz') {
  return new Intl.DateTimeFormat(lang === 'cz' ? 'cs-CZ' : 'en-GB', {
    timeZone: MATCH_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(value));
}
export function pragueCalendarDay(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MATCH_TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(date);
  const n = (key: string) => Number(parts.find(part => part.type === key)?.value);
  return Date.UTC(n('year'), n('month') - 1, n('day')) / 86_400_000;
}
