import React, { useEffect, useMemo, useState } from 'react';
import { Award, EyeOff, X } from 'lucide-react';
import type { BadgeOverview, CommunityProfile, Player } from '../types.ts';
import { getFeaturedBadges } from '../lib/betaPolish.ts';
import { fetchCommunityProfile, fetchUserBadges } from '../lib/productFeatures.ts';

type UserAvatarComponent = React.ComponentType<{
  player?: Pick<Player, 'username' | 'avatar_emoji' | 'avatar_bg'> | null;
  size?: 'sm' | 'md' | 'lg';
}>;

export default function PlayerProfileDialog({
  userId,
  lobbyId,
  lang,
  onClose,
  UserAvatar
}: {
  userId: string;
  lobbyId?: string;
  lang: 'cz' | 'en';
  onClose: () => void;
  UserAvatar: UserAvatarComponent;
}) {
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [badges, setBadges] = useState<BadgeOverview>({ badges: [], progress: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const featuredBadges = useMemo(() => getFeaturedBadges(badges.badges), [badges.badges]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    setProfile(null);
    setBadges({ badges: [], progress: [] });
    void fetchCommunityProfile(userId, lobbyId)
      .then(async nextProfile => {
        if (!current) return;
        setProfile(nextProfile);
        if (nextProfile?.is_public) {
          const nextBadges = await fetchUserBadges(userId);
          if (current) setBadges(nextBadges);
        }
      })
      .catch((reason: any) => {
        if (current) setError(reason?.message || (lang === 'cz' ? 'Profil se nepodařilo načíst.' : 'Profile could not be loaded.'));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [lang, lobbyId, userId]);

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/40 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label={lang === 'cz' ? 'Profil hráče' : 'Player profile'} className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">{lang === 'cz' ? 'Profil hráče' : 'Player profile'}</h2>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-500" aria-label={lang === 'cz' ? 'Zavřít' : 'Close'}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {loading ? (
          <div className="mt-5 h-56 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none" />
        ) : error || !profile?.visible || !profile.profile ? (
          <p className="mt-5 rounded-2xl bg-slate-50 p-5 text-center text-sm font-semibold text-slate-500">{error || (lang === 'cz' ? 'Profil není dostupný.' : 'Profile is unavailable.')}</p>
        ) : (
          <>
            <div className="mt-4 flex flex-col items-center text-center">
              <UserAvatar player={profile.profile} size="lg" />
              <h3 className="mt-3 text-xl font-black text-slate-900">{profile.profile.username}</h3>
              {profile.scope === 'lobby' && (
                <p className="mt-2 flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-500">
                  <EyeOff className="h-3.5 w-3.5" />
                  {lang === 'cz' ? 'Soukromý profil · lobby identita' : 'Private profile · lobby identity'}
                </p>
              )}
              {profile.profile.bio && <p className="mt-4 text-sm leading-relaxed text-slate-600">{profile.profile.bio}</p>}
            </div>
            {profile.stats && (
              <div className="mt-5 grid grid-cols-2 gap-2">
                {[
                  [lang === 'cz' ? 'Tipy' : 'Predictions', profile.stats.predictions_total],
                  [lang === 'cz' ? 'Přesné výsledky' : 'Exact results', profile.stats.exact_predictions],
                  [lang === 'cz' ? 'Body celkem' : 'Total points', profile.stats.match_points + profile.stats.longterm_points],
                  [lang === 'cz' ? 'Dokončené soutěže' : 'Completed competitions', profile.stats.completed_tournaments]
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[9px] font-black uppercase text-slate-400">{label}</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{value}</p>
                  </div>
                ))}
              </div>
            )}
            {featuredBadges.length > 0 && (
              <div className="mt-5">
                <h4 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400"><Award className="h-4 w-4" /> {lang === 'cz' ? 'Vybrané odznaky' : 'Featured badges'}</h4>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {featuredBadges.map(badge => (
                    <div key={`${badge.key}:${badge.context_id}`} className="rounded-2xl bg-amber-50 p-3 text-center">
                      <span className="text-2xl">{badge.icon}</span>
                      <p className="mt-1 text-[10px] font-black text-slate-800">{badge.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
