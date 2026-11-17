import { translate, locales, supportedLocales, type Locale } from '../i18n/index.ts';
import { SignIn, SignUp } from '@clerk/react';
import { useState, type ReactNode } from 'react';
import { BrandMark } from './BrandMark.tsx';
import type { AuthStatus } from '../types.ts';
import './AuthScreen.css';

type AuthScreenProps = {
  status: AuthStatus;
  lang: Locale;
  username: string;
  error: string;
  invitePending: boolean;
  continuationLabel?: string;
  onBack?: () => void;
  signedIn: boolean;
  busy: boolean;
  onRetry: () => void;
  onLogout: () => Promise<void>;
  onLanguageChange: (language: Locale) => Promise<void>;
  onCompleteProfileOnboarding: (displayName: string) => Promise<void>;
};

const clerkAppearance = {
  variables: {
    colorPrimary: '#24618C',
    colorPrimaryForeground: '#FEFDFE',
    colorForeground: '#0F172A',
    colorMutedForeground: '#475569',
    colorBackground: '#FEFDFE',
    colorInput: '#FEFDFE',
    colorInputForeground: '#0F172A',
    colorRing: '#24618C',
    fontFamily: '"Fan Inter", sans-serif',
    fontFamilyButtons: '"Fan Inter", sans-serif',
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'auth-clerk-root',
    cardBox: 'auth-clerk-cardbox',
    card: 'auth-clerk-card',
    footer: 'auth-clerk-footer',
    formButtonPrimary: 'auth-clerk-primary',
    formFieldInput: 'auth-clerk-input',
    socialButtonsBlockButton: 'auth-clerk-social',
    footerActionLink: 'auth-clerk-link',
  },
};

export default function AuthScreen({
  status, lang, username, error, invitePending, continuationLabel, onBack, signedIn, busy,
  onRetry, onLogout, onLanguageChange, onCompleteProfileOnboarding,
}: AuthScreenProps) {
  const [displayName, setDisplayName] = useState(username);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState('');
  // Keep invitation query/path on both provider navigation and OAuth callbacks.
  const returnUrl = new URL(window.location.href);
  returnUrl.hash = '';
  returnUrl.searchParams.delete('account');
  const signInUrl = new URL(returnUrl);
  const signUpUrl = new URL(returnUrl);
  signUpUrl.searchParams.set('account', 'sign-up');
  const registering = new URLSearchParams(window.location.search).get('account') === 'sign-up';

  return (
    <AuthShell>
      <div className="auth-brand mb-6 flex flex-col items-center text-center">
        <BrandMark className="mb-4 h-14 w-14" />
        <h1 className="auth-wordmark"><span>Fan</span> Tipovačka</h1>
        <p className="auth-tagline mt-2 text-sm font-semibold">{translate(lang, "authScreen.predictMatchesBeatYourFriends")}</p>
      </div>
      <div className="auth-languages mb-5 flex justify-center gap-2 text-sm font-semibold">
        {supportedLocales.map(locale => <button key={locale} type="button" lang={locale} aria-pressed={lang === locale}
          onClick={() => { void onLanguageChange(locale).catch(() => setLocalError(translate(lang, 'locale.loadError'))); }}>{locales[locale].label}</button>)}
      </div>
      {continuationLabel || invitePending ? (
        <p className="auth-invite mb-5 rounded-2xl p-3 text-center text-sm font-semibold leading-relaxed">
          {continuationLabel || translate(lang, "authScreen.yourInvitationIsSavedAfterSignInAndProfile")}
        </p>
      ) : null}
      {onBack && !signedIn ? <button type="button" onClick={onBack} className="mb-4 min-h-11 w-full text-sm font-semibold text-[#24618C]">
        ← {translate(lang, 'publicPlay.title')}
      </button> : null}
      {status === 'initializing' ? (
        <p className="py-6 text-center text-sm text-slate-500" role="status">{translate(lang, "authScreen.preparingYourAccount")}</p>
      ) : status === 'profile_onboarding' ? (
        <form className="space-y-4" onSubmit={async event => {
          event.preventDefault();
          setSaving(true);
          setLocalError('');
          try {
            await onCompleteProfileOnboarding(displayName);
          } catch (failure: unknown) {
            setLocalError(failure instanceof Error ? failure.message : (translate(lang, "authScreen.unableToSaveYourProfile")));
          } finally { setSaving(false); }
        }}>
          <h2 className="text-center text-xl font-black text-slate-900">{translate(lang, "authScreen.whatShouldWeCallYou")}</h2>
          <p className="text-center text-xs leading-relaxed text-slate-500">{translate(lang, "authScreen.otherPlayersWillSeeThisNameYouCanChange")}</p>
          <label className="block text-xs font-bold text-slate-600">
            {translate(lang, "authScreen.displayName")}
            <input required minLength={2} maxLength={40} autoComplete="nickname" value={displayName} onChange={event => setDisplayName(event.target.value)} className="auth-name-input mt-2 w-full rounded-xl p-4 text-base" />
          </label>
          <button type="submit" disabled={saving || busy} className="auth-primary min-h-12 w-full rounded-xl text-sm font-semibold disabled:opacity-60">{saving ? (translate(lang, "authScreen.saving")) : (translate(lang, "authScreen.continue"))}</button>
        </form>
      ) : signedIn ? (
        <div className="space-y-3 text-center">
          <h2 className="text-lg font-black text-slate-900">{translate(lang, "authScreen.yourAccountCouldNotBePrepared")}</h2>
          <p className="text-xs leading-relaxed text-slate-500">{translate(lang, "authScreen.youAreStillSignedInPleaseTryLoadingYour")}</p>
          <button type="button" onClick={onRetry} disabled={busy} className="auth-primary min-h-12 w-full rounded-xl text-sm font-semibold disabled:opacity-60">{translate(lang, "authScreen.tryAgain")}</button>
        </div>
      ) : registering ? (
        <SignUp routing="hash" signInUrl={signInUrl.href} forceRedirectUrl={returnUrl.href} appearance={clerkAppearance} />
      ) : (
        <SignIn routing="hash" signUpUrl={signUpUrl.href} forceRedirectUrl={returnUrl.href} signUpForceRedirectUrl={returnUrl.href} appearance={clerkAppearance} />
      )}
      {(localError || error) ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-center text-xs font-bold text-red-600" role="alert">{localError || error}</p> : null}
      {signedIn ? <button type="button" disabled={busy || saving} onClick={() => void onLogout()} className="mt-5 min-h-10 w-full text-xs font-bold text-slate-500 disabled:opacity-60">{busy ? (translate(lang, "authScreen.signingOut")) : (translate(lang, "authScreen.signOut"))}</button> : null}
    </AuthShell>
  );
}

function AuthShell({ children }: { children: ReactNode }) {
  return <div className="auth-screen flex min-h-screen items-center justify-center p-4"><div className="auth-panel w-full max-w-md rounded-3xl p-6 sm:p-8">{children}</div></div>;
}
