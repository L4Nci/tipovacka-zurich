import type { UserBadge } from '../types.ts';

export const getFeaturedBadges = (badges: UserBadge[]): UserBadge[] => badges
  .filter(badge => Number(badge.featured_position) >= 1 && Number(badge.featured_position) <= 3)
  .sort((a, b) => Number(a.featured_position) - Number(b.featured_position))
  .slice(0, 3);
