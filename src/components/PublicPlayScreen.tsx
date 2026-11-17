import { ArrowLeft, ArrowRight, Clock3, Users } from 'lucide-react';
import { useState } from 'react';
import { intlLocale, locales, supportedLocales, translate, type Locale } from '../i18n/index.ts';
import { formatTipsterCount } from '../lib/homeDashboard.ts';
import type { PublicCompetition } from '../lib/publicCompetitions.ts';
import { BrandMark } from './BrandMark.tsx';
import './PublicPlayScreen.css';

/** Props-only view: opening a card cannot create a profile, membership or pick. */
export function PublicPlayScreen({
  lang, competitions, selectedSlug, loading, loadFailed, joinFailed, joining,
  signedIn, onStart, onSelect, onRetry, onHome, onLanguageChange,
}: {
  lang: Locale;
  competitions: PublicCompetition[];
  selectedSlug: string | null;
  loading: boolean;
  loadFailed: boolean;
  joinFailed: boolean;
  joining: boolean;
  signedIn: boolean;
  onStart: (competition: PublicCompetition) => void;
  onSelect: (slug: string | null) => void;
  onRetry: () => void;
  onHome: () => void;
  onLanguageChange: (locale: Locale) => Promise<void>;
}) {
  const [languageFailed, setLanguageFailed] = useState(false);
  const visible = selectedSlug ? competitions.filter(item => item.slug === selectedSlug) : competitions;
  return <main className="public-play">
    <header className="public-play-header">
      <a href="/play" className="public-play-brand" onClick={event => { event.preventDefault(); onSelect(null); }}>
        <BrandMark /><span>Fan <strong>Tipovačka</strong></span>
      </a>
      <label className="public-play-language">
        <span className="sr-only">{translate(lang, 'langSelect')}</span>
        <select value={lang} onChange={event => {
          setLanguageFailed(false);
          void onLanguageChange(event.target.value as Locale).catch(() => setLanguageFailed(true));
        }}>
          {supportedLocales.map(locale => <option key={locale} value={locale} lang={locale}>{locales[locale].label}</option>)}
        </select>
      </label>
    </header>
    {languageFailed ? <p role="alert" className="public-play-join-error">{translate(lang, 'locale.loadError')}</p> : null}
    <section className="public-play-intro" aria-labelledby="public-play-title">
      <p className="public-play-eyebrow">{translate(lang, 'publicPlay.free')}</p>
      <h1 id="public-play-title">{translate(lang, 'publicPlay.title')}</h1>
      <p>{translate(lang, 'publicPlay.intro')}</p>
    </section>
    {visible.length > 0 && !loading && !loadFailed ? <p className="public-play-privacy">{translate(lang, 'publicPlay.sharedPicks')}</p> : null}
    <section className="public-play-catalog" aria-busy={loading || joining}>
      {loading ? <p role="status" className="public-play-notice">{translate(lang, 'publicPlay.loading')}</p> : loadFailed ? (
        <div className="public-play-notice" role="alert">
          <p>{translate(lang, 'publicPlay.error')}</p>
          <button type="button" onClick={onRetry}>{translate(lang, 'publicPlay.retry')}</button>
        </div>
      ) : visible.length === 0 ? (
        <p role="status" className="public-play-notice">{translate(lang, 'publicPlay.unavailable')}</p>
      ) : visible.map(competition => <article className="public-play-card" key={competition.slug}>
        <div className={`public-play-sport ${competition.format === 'mma' ? 'is-mma' : ''}`} aria-hidden="true">
          {competition.format === 'mma' ? 'MMA' : competition.sport_id === 'hockey' ? 'HK' : 'FC'}
        </div>
        <div className="public-play-card-body">
          <h2>{competition.name}</h2>
          {competition.tournament_name !== competition.name ? <p className="public-play-season">{competition.tournament_name}</p> : null}
          <div className="public-play-facts">
            {competition.participant_count > 0 ? <span><Users size={15} aria-hidden="true" />{formatTipsterCount(competition.participant_count, lang)}</span> : null}
            {competition.next_lock_at ? <span><Clock3 size={15} aria-hidden="true" /><time dateTime={competition.next_lock_at}>{new Intl.DateTimeFormat(intlLocale(lang), {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague', timeZoneName: 'short',
            }).format(new Date(competition.next_lock_at))}</time></span> : null}
          </div>
        </div>
        <button type="button" className="public-play-start" onClick={() => onStart(competition)} disabled={joining || competition.status === 'closed' && !competition.is_member}>
          {competition.status === 'closed' ? translate(lang, competition.is_member ? 'results' : 'publicPlay.noOpenPicks')
            : competition.is_member ? translate(lang, 'publicPlay.continue', { competition: competition.name }) : translate(lang, 'publicPlay.start')}
          {competition.status !== 'closed' || competition.is_member ? <ArrowRight size={19} aria-hidden="true" /> : null}
        </button>
      </article>)}
      {joinFailed ? <p role="alert" className="public-play-join-error">{translate(lang, 'publicPlay.joinError')}</p> : null}
      {joining ? <p role="status" className="public-play-progress">{translate(lang, 'publicPlay.loading')}</p> : null}
    </section>
    <footer className="public-play-footer">
      <button type="button" onClick={onHome} disabled={joining}>
        <ArrowLeft size={17} aria-hidden="true" />{translate(lang, signedIn ? 'publicPlay.home' : 'publicPlay.signIn')}
      </button>
    </footer>
  </main>;
}
