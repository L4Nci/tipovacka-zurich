import assert from 'node:assert/strict';
import type { UserBadge } from '../types.ts';
import { getFeaturedBadges } from './betaPolish.ts';

const badge = (key: string, featuredPosition?: number | null): UserBadge => ({
  key,
  name: key,
  description: key,
  icon: 'x',
  tier: 'bronze',
  context_type: 'global',
  context_id: '',
  awarded_at: '2026-01-01T00:00:00.000Z',
  featured_position: featuredPosition
});

const featured = getFeaturedBadges([
  badge('not-featured'),
  badge('third', 3),
  badge('first', 1),
  badge('invalid', 4),
  badge('second', 2)
]);

assert.deepEqual(
  featured.map(item => item.key),
  ['first', 'second', 'third'],
  'Public profiles should show only the three explicitly featured badges in position order.'
);

assert.deepEqual(
  getFeaturedBadges([badge('none'), badge('zero', 0)]),
  [],
  'A profile without featured badges should not render an empty badge section.'
);

console.log('Beta polish scenarios: 2/2 passed');
