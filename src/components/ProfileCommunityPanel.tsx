import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, BarChart3, Check, Eye, EyeOff, Save } from 'lucide-react';
import type { BadgeOverview, CommunityProfile } from '../types.ts';
import {
  fetchMyProfileOverview,
  fetchUserBadges,
  reconcileMyAchievements,
  setFeaturedBadges,
  updateMyCommunityProfile
} from '../lib/productFeatures.ts';
import { InlineNotice } from './ProductFeedback.tsx';

const emptyBadges: BadgeOverview = { badges: [], progress: [] };

export default function ProfileCommunityPanel({
  userId,
  lang,
  communityEnabled,
  badgesEnabled
}: {
  userId: string;
  lang: 'cz' | 'en';
  communityEnabled: boolean;
  badgesEnabled: boolean;
}) {
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [badges, setBadges] = useState<BadgeOverview>(emptyBadges);
  const [bio, setBio] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [nextProfile, nextBadges] = await Promise.all([
        communityEnabled ? fetchMyProfileOverview() : Promise.resolve(null),
        badgesEnabled
          ? reconcileMyAchievements().then(() => fetchUserBadges(userId))
          : Promise.resolve(emptyBadges)
      ]);
      setProfile(nextProfile);
      setBadges(nextBadges);
      setBio(nextProfile?.profile?.bio || '');
      setVisibility(nextProfile?.is_public ? 'public' : 'private');
    } catch (error: any) {
      setMessage({
        tone: 'error',
        text: error?.message || (lang === 'cz' ? 'Profilové údaje se nepodařilo načíst.' : 'Profile data could not be loaded.')
      });
    } finally {
      setLoading(false);
    }
  }, [badgesEnabled, communityEnabled, lang, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const featuredIds = useMemo(() => badges.badges
    .filter(badge => badge.featured_position && badge.id)
    .sort((a, b) => Number(a.featured_position) - Number(b.featured_position))
    .map(badge => badge.id as string), [badges.badges]);

  if (!communityEnabled && !badgesEnabled) return null;

  const saveProfile = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await updateMyCommunityProfile(bio, visibility);
      setBio(saved.bio || '');
      setVisibility(saved.profile_visibility);
      setProfile(previous => previous ? {
        ...previous,
        is_public: saved.profile_visibility === 'public',
        profile: previous.profile ? { ...previous.profile, bio: saved.bio } : previous.profile
      } : previous);
      setMessage({ tone: 'success', text: lang === 'cz' ? 'Profil byl uložen.' : 'Profile saved.' });
    } catch (error: any) {
      setMessage({ tone: 'error', text: error?.message || (lang === 'cz' ? 'Profil se nepodařilo uložit.' : 'Profile could not be saved.') });
    } finally {
      setSaving(false);
    }
  };

  const toggleFeatured = async (badgeId?: string) => {
    if (!badgeId) return;
    const next = featuredIds.includes(badgeId)
      ? featuredIds.filter(id => id !== badgeId)
      : [...featuredIds, badgeId].slice(0, 3);
    setSaving(true);
    try {
      await setFeaturedBadges(next);
      setBadges(await fetchUserBadges(userId));
    } catch (error: any) {
      setMessage({ tone: 'error', text: error?.message || (lang === 'cz' ? 'Výběr odznaků se nepodařilo uložit.' : 'Badge selection could not be saved.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {communityEnabled && (
        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
              <Eye className="h-4 w-4" />
              {lang === 'cz' ? 'Veřejný profil' : 'Public profile'}
            </h3>
            <span className="text-[10px] font-bold text-slate-400">{bio.length}/240</span>
          </div>
          {loading ? (
            <div className="mt-4 h-28 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none" />
          ) : (
            <div className="mt-4 space-y-3">
              <textarea
                value={bio}
                onChange={event => setBio(event.target.value.slice(0, 240))}
                maxLength={240}
                rows={3}
                placeholder={lang === 'cz' ? 'Krátce o sobě. Bez odkazů a HTML.' : 'A short bio. No links or HTML.'}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              />
              <button
                type="button"
                onClick={() => setVisibility(value => value === 'public' ? 'private' : 'public')}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 text-left"
              >
                <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  {visibility === 'public' ? <Eye className="h-4 w-4 text-emerald-600" /> : <EyeOff className="h-4 w-4 text-slate-400" />}
                  {visibility === 'public'
                    ? (lang === 'cz' ? 'Profil je veřejný' : 'Profile is public')
                    : (lang === 'cz' ? 'Profil je soukromý' : 'Profile is private')}
                </span>
                <span className={`h-6 w-11 rounded-full p-1 transition-colors ${visibility === 'public' ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                  <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${visibility === 'public' ? 'translate-x-5' : ''}`} />
                </span>
              </button>
              <button type="button" onClick={saveProfile} disabled={saving} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 text-xs font-black uppercase text-white disabled:opacity-50">
                <Save className="h-4 w-4" />
                {saving ? (lang === 'cz' ? 'Ukládám…' : 'Saving…') : (lang === 'cz' ? 'Uložit profil' : 'Save profile')}
              </button>
            </div>
          )}
          {profile?.stats && (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                [lang === 'cz' ? 'Tipy' : 'Predictions', profile.stats.predictions_total],
                [lang === 'cz' ? 'Přesné' : 'Exact', profile.stats.exact_predictions],
                [lang === 'cz' ? 'Body' : 'Points', profile.stats.match_points + profile.stats.longterm_points],
                [lang === 'cz' ? 'Soutěže' : 'Competitions', profile.stats.completed_tournaments]
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-[9px] font-black uppercase text-slate-400">{label}</p>
                  <p className="mt-1 text-lg font-black text-slate-900">{value}</p>
                </div>
              ))}
            </div>
          )}
          {message && <div className="mt-3"><InlineNotice tone={message.tone}>{message.text}</InlineNotice></div>}
        </section>
      )}

      {badgesEnabled && (
        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
            <Award className="h-4 w-4" />
            {lang === 'cz' ? 'Odznaky' : 'Badges'}
          </h3>
          {loading ? (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[0, 1, 2].map(item => <div key={item} className="h-24 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none" />)}
            </div>
          ) : badges.badges.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-5 text-center text-xs font-semibold text-slate-500">
              {lang === 'cz' ? 'Začni tipovat. První odznak přijde s prvním krokem.' : 'Start predicting. Your first badge follows your first step.'}
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {badges.badges.map(badge => {
                const featured = Boolean(badge.id && featuredIds.includes(badge.id));
                return (
                  <button
                    key={`${badge.key}:${badge.context_id}`}
                    type="button"
                    disabled={saving}
                    onClick={() => void toggleFeatured(badge.id)}
                    className={`relative min-h-28 rounded-2xl border p-3 text-left transition-colors ${featured ? 'border-amber-300 bg-amber-50' : 'border-slate-100 bg-slate-50'}`}
                  >
                    {featured && <Check className="absolute right-2 top-2 h-4 w-4 text-amber-600" />}
                    <span className="text-2xl" aria-hidden="true">{badge.icon}</span>
                    <p className="mt-2 text-xs font-black text-slate-900">{badge.name}</p>
                    <p className="mt-1 text-[10px] leading-snug text-slate-500">{badge.description}</p>
                  </button>
                );
              })}
            </div>
          )}
          <p className="mt-3 flex items-center gap-2 text-[10px] font-semibold text-slate-400">
            <BarChart3 className="h-3.5 w-3.5" />
            {lang === 'cz' ? 'Klepnutím vyber až 3 odznaky do profilu.' : 'Tap to feature up to 3 badges.'}
          </p>
        </section>
      )}
    </>
  );
}
