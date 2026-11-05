export function clubCrestUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const allowedPath = (url.hostname === 'crests.football-data.org' && /^\/[1-9][0-9]*\.(png|svg)$/.test(url.pathname))
      || (url.hostname === 'assets.nhle.com' && /^\/logos\/nhl\/svg\/[A-Z]{3}_(?:secondary_)?light\.svg$/.test(url.pathname))
      || (url.hostname === 'www.hokej.cz' && /^\/files\/logos\/[a-zA-Z0-9_-]+\.png$/.test(url.pathname));
    return url.protocol === 'https:' && allowedPath
      && !url.port && !url.username && !url.password && !url.search && !url.hash ? url.href : null;
  } catch { return null; }
}
