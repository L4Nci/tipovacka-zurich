export function clubCrestUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'crests.football-data.org'
      && !url.port && !url.username && !url.password && !url.search && !url.hash
      && /^\/[1-9][0-9]*\.(png|svg)$/.test(url.pathname) ? url.href : null;
  } catch { return null; }
}
