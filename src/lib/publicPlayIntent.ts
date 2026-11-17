// Only public slugs are retained here. Private invite codes and full URLs never are.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KEY = 'fan.public-join.v1';
const MAX_AGE_MS = 30 * 60 * 1000;
const validSlug = (value: unknown): value is string => typeof value === 'string' && value.length <= 80 && SLUG.test(value);

export type PublicPlayRoute = { slug: string | null };
export type PendingPublicJoin = { version: 1; slug: string; createdAt: number; subject: string | null };
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function publicPlayRoute(pathname: string): PublicPlayRoute | null {
  if (/^\/play\/?$/.test(pathname)) return { slug: null };
  const match = /^\/play\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  return validSlug(match[1]) ? { slug: match[1] } : null;
}

export function publicPlayPath(slug: string | null = null): string {
  if (slug !== null && !validSlug(slug)) throw new Error('Invalid competition slug.');
  return slug ? `/play/${slug}` : '/play';
}

export function rememberPublicJoin(storage: StorageLike, slug: string, subject: string | null, now = Date.now()) {
  if (!validSlug(slug)) throw new Error('Invalid competition slug.');
  try { storage.setItem(KEY, JSON.stringify({ version: 1, slug, subject, createdAt: now })); } catch { /* A blocked store adds one confirmation after OAuth; it must not break login. */ }
}

export function readPublicJoin(storage: StorageLike, slug: string | null, subject: string | null, now = Date.now()): PendingPublicJoin | null {
  try {
    const item = JSON.parse(storage.getItem(KEY) || 'null') as Partial<PendingPublicJoin> | null;
    if (!item || item.version !== 1 || !validSlug(item.slug) || item.slug !== slug ||
        typeof item.createdAt !== 'number' || item.createdAt > now || now - item.createdAt > MAX_AGE_MS ||
        !(item.subject === null || typeof item.subject === 'string' && /^user_.+/.test(item.subject)) ||
        item.subject !== null && item.subject !== subject) return null;
    return item as PendingPublicJoin;
  } catch { return null; }
}

export function forgetPublicJoin(storage: StorageLike) {
  try { storage.removeItem(KEY); } catch { /* Storage can be blocked. */ }
}
