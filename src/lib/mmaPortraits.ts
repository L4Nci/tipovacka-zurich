export type MmaPortrait = {
  url: string; width: number | null; height: number | null;
  artist: string; license: string; license_url: string | null; source_page: string;
};

/** Only the provider's hashed Commons CDN assets and their original credits. */
export function safeMmaPortrait(value: unknown): MmaPortrait | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  if (typeof p.url !== 'string' || !/^https:\/\/d33t2v9cbr12gb\.cloudfront\.net\/commons\/[a-f0-9]{64}\.webp$/.test(p.url)
      || typeof p.artist !== 'string' || !p.artist.trim() || p.artist.length > 500 || /[<>\u0000-\u001f]/.test(p.artist)
      || typeof p.license !== 'string' || typeof p.source_page !== 'string' || p.source_page.length > 2000) return null;
  const dimension = (v: unknown) => v === null || (Number.isSafeInteger(v) && Number(v) > 0 && Number(v) <= 30000);
  if (!dimension(p.width) || !dimension(p.height)) return null;
  let source: URL; let license: URL | null = null;
  try {
    source = new URL(p.source_page);
    if (source.origin !== 'https://commons.wikimedia.org' || !source.pathname.startsWith('/wiki/File:')
        || source.username || source.password || source.search || source.hash) return null;
    if (p.license_url !== null) {
      if (typeof p.license_url !== 'string') return null;
      license = new URL(p.license_url);
      if (!['http:', 'https:'].includes(license.protocol) || license.hostname !== 'creativecommons.org'
          || license.port || license.username || license.password || license.search || license.hash) return null;
      license.protocol = 'https:';
    }
  } catch { return null; }
  const cc = /^CC BY(-SA)? (1\.0|2\.0|2\.5|3\.0|4\.0)$/.exec(p.license);
  const path = license?.pathname.replace(/\/$/, '');
  const allowed = cc ? path === `/licenses/by${cc[1] ? '-sa' : ''}/${cc[2]}`
    : /^(CC0|CC0 1\.0)$/.test(p.license) ? /^\/publicdomain\/zero\/1\.0(?:\/deed\.[a-z-]+)?$/.test(path ?? '')
      : p.license === 'Public domain' && (license === null || /^\/publicdomain\/mark\/1\.0(?:\/deed\.[a-z-]+)?$/.test(path ?? ''));
  if (!allowed) return null;
  return { url: p.url, width: p.width as number | null, height: p.height as number | null,
    artist: p.artist.trim(), license: p.license, license_url: license?.href ?? null, source_page: source.href };
}

export function fighterInitials(name: string | null | undefined): string {
  return (name?.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => Array.from(part)[0]).join('') || '?').toLocaleUpperCase();
}
