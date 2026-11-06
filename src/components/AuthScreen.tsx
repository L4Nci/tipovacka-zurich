import { translate, locales, supportedLocales, type Locale } from '../i18n/index.ts';
import { SignIn, SignUp } from '@clerk/react';
import { useState, type ReactNode } from 'react';
import { Trophy } from 'lucide-react';
import type { AuthStatus } from '../types.ts';

type AuthScreenProps = {
  status: AuthStatus;
  lang: Locale;
  username: string;
  error: string;
  invitePending: boolean;
  signedIn: boolean;
  busy: boolean;
  onRetry: () => void;
  onLogout: () => Promise<void>;
  onLanguageChange: (language: Locale) => void;
  onCompleteProfileOnboarding: (displayName: string) => Promise<void>;
};

const clerkAppearance = {
  variables: { colorPrimary: '#dc2626', borderRadius: '1rem' },
  elements: { rootBox: 'w-full', cardBox: 'w-full shadow-none', card: 'w-full shadow-none border-0 p-0' },
};

export default function AuthScreen({
  status, lang, username, error, invitePending, signedIn, busy,
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
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600 text-white"><Trophy className="h-8 w-8" /></div>
        <h1 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">Fan Tipovačka</h1>
        <p className="mt-2 text-xs font-bold text-red-600">{translate(lang, "authScreen.predictMatchesBeatYourFriends")}</p>
      </div>
      <div className="mb-5 flex justify-center gap-4 text-xs font-bold">
        {supportedLocales.map(locale => <button key={locale} type="button" lang={locale} aria-pressed={lang === locale}
          onClick={() => onLanguageChange(locale)} className={lang === locale ? 'text-red-600' : 'text-slate-400'}>{locales[locale].label}</button>)}
      </div>
      {invitePending ? (
        <p className="mb-5 rounded-2xl bg-red-50 p-3 text-center text-xs font-semibold leading-relaxed text-red-700">
          {translate(lang, "authScreen.yourInvitationIsSavedAfterSignInAndProfile")}
        </p>
      ) : null}
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
            <input required minLength={2} maxLength={40} autoComplete="nickname" value={displayName} onChange={event => setDisplayName(event.target.value)} className="mt-2 w-full rounded-2xl bg-slate-50 p-4 text-sm outline-none focus:ring-2 focus:ring-red-600" />
          </label>
          <button type="submit" disabled={saving || busy} className="min-h-12 w-full rounded-2xl bg-red-600 text-xs font-black text-white disabled:opacity-60">{saving ? (translate(lang, "authScreen.saving")) : (translate(lang, "authScreen.continue"))}</button>
        </form>
      ) : signedIn ? (
        <div className="space-y-3 text-center">
          <h2 className="text-lg font-black text-slate-900">{translate(lang, "authScreen.yourAccountCouldNotBePrepared")}</h2>
          <p className="text-xs leading-relaxed text-slate-500">{translate(lang, "authScreen.youAreStillSignedInPleaseTryLoadingYour")}</p>
          <button type="button" onClick={onRetry} disabled={busy} className="min-h-12 w-full rounded-2xl bg-red-600 text-xs font-black text-white disabled:opacity-60">{translate(lang, "authScreen.tryAgain")}</button>
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
  return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><div className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-6 shadow-xl sm:p-8">{children}</div></div>;
}
