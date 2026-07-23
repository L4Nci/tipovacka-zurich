import { useState, type FormEvent, type ReactNode } from 'react';
import { KeyRound, Mail, Trophy } from 'lucide-react';
import { motion } from 'motion/react';
import type { AuthStatus } from '../types.ts';
import { authProviderConfig, type SupportedOAuthProvider } from '../lib/auth.ts';

type AuthScreenProps = {
  status: AuthStatus;
  registering: boolean;
  email: string;
  username: string;
  password: string;
  pendingEmail: string;
  error: string;
  onChange: (field: 'email' | 'username' | 'password', value: string) => void;
  onSubmit: (event: FormEvent) => Promise<void>;
  onToggleRegistering: () => void;
  onForgotPassword: (email: string) => Promise<void>;
  onOAuth: (provider: SupportedOAuthProvider) => Promise<void>;
  onResendConfirmation: () => Promise<void>;
  onBackToLogin: () => void;
  onFinishPasswordRecovery: (password: string) => Promise<void>;
  onCompleteProfileOnboarding: (username: string) => Promise<void>;
};

export default function AuthScreen({
  status,
  registering,
  email,
  username,
  password,
  pendingEmail,
  error,
  onChange,
  onSubmit,
  onToggleRegistering,
  onForgotPassword,
  onOAuth,
  onResendConfirmation,
  onBackToLogin,
  onFinishPasswordRecovery,
  onCompleteProfileOnboarding
}: AuthScreenProps) {
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirmation, setRecoveryConfirmation] = useState('');
  const [registrationConfirmation, setRegistrationConfirmation] = useState('');
  const [onboardingName, setOnboardingName] = useState(username);
  const [localError, setLocalError] = useState('');
  const [localBusy, setLocalBusy] = useState(false);
  const isBusy = localBusy || status === 'authenticating' || status === 'signing_up';

  const submitForgotPassword = async () => {
    setLocalError('');
    setLocalBusy(true);
    try {
      await onForgotPassword(email);
      setForgotSent(true);
    } catch (err: any) {
      setLocalError(err?.message || 'Odeslání odkazu se nezdařilo.');
    } finally {
      setLocalBusy(false);
    }
  };

  const submitRecovery = async (event: FormEvent) => {
    event.preventDefault();
    setLocalError('');
    if (recoveryPassword.length < 8) {
      setLocalError('Použij alespoň 8 znaků.');
      return;
    }
    if (recoveryPassword !== recoveryConfirmation) {
      setLocalError('Hesla se neshodují.');
      return;
    }

    setLocalBusy(true);
    try {
      await onFinishPasswordRecovery(recoveryPassword);
    } catch (err: any) {
      setLocalError(err?.message || 'Heslo se nepodařilo změnit.');
    } finally {
      setLocalBusy(false);
    }
  };

  const submitCredentials = async (event: FormEvent) => {
    setLocalError('');
    if (registering && password !== registrationConfirmation) {
      event.preventDefault();
      setLocalError('Hesla se neshodují.');
      return;
    }
    await onSubmit(event);
  };

  if (status === 'initializing') {
    return (
      <AuthShell branded>
        <div className="space-y-3" aria-label="Načítání přihlášení">
          <div className="h-12 rounded-2xl bg-slate-100" />
          <div className="h-12 rounded-2xl bg-slate-100" />
          <div className="h-12 rounded-2xl bg-slate-200" />
        </div>
      </AuthShell>
    );
  }

  if (status === 'email_confirmation_pending') {
    return (
      <AuthShell>
        <Mail className="mx-auto h-10 w-10 text-red-600" />
        <h2 className="mt-5 text-center text-xl font-black text-slate-900">Zkontroluj svůj e-mail</h2>
        <p className="mt-2 text-center text-xs font-medium leading-relaxed text-slate-500">
          Potvrzovací odkaz jsme poslali na <strong className="text-slate-700">{pendingEmail}</strong>.
          Po potvrzení se vrať do Tipovačky.
        </p>
        <button
          type="button"
          disabled={localBusy}
          onClick={async () => {
            setLocalBusy(true);
            setLocalError('');
            try {
              await onResendConfirmation();
            } catch (err: any) {
              setLocalError(err?.message || 'Potvrzovací e-mail se nepodařilo poslat.');
            } finally {
              setLocalBusy(false);
            }
          }}
          className="mt-6 min-h-12 w-full rounded-2xl border border-slate-200 bg-white text-xs font-black uppercase text-slate-700 disabled:opacity-60"
        >
          {localBusy ? 'Odesílám...' : 'Poslat odkaz znovu'}
        </button>
        <button type="button" onClick={onBackToLogin} className="mt-4 w-full text-xs font-black uppercase text-slate-400">
          Zpět na přihlášení
        </button>
        {(localError || error) && <AuthError message={localError || error} />}
      </AuthShell>
    );
  }

  if (status === 'password_recovery') {
    return (
      <AuthShell>
        <KeyRound className="mx-auto h-10 w-10 text-red-600" />
        <h2 className="mt-5 text-center text-xl font-black text-slate-900">Nastav nové heslo</h2>
        <form onSubmit={submitRecovery} className="mt-6 space-y-4">
          <AuthInput
            label="Nové heslo"
            type="password"
            value={recoveryPassword}
            onChange={setRecoveryPassword}
            autoComplete="new-password"
            hint="Alespoň 8 znaků; ideálně použij správce hesel."
          />
          <AuthInput
            label="Potvrzení hesla"
            type="password"
            value={recoveryConfirmation}
            onChange={setRecoveryConfirmation}
            autoComplete="new-password"
          />
          {(localError || error) && <AuthError message={localError || error} />}
          <button disabled={localBusy} type="submit" className="min-h-12 w-full rounded-2xl bg-red-600 text-xs font-black uppercase text-white shadow-lg shadow-red-100 disabled:opacity-60">
            {localBusy ? 'Ukládám...' : 'Uložit nové heslo'}
          </button>
        </form>
      </AuthShell>
    );
  }

  if (status === 'profile_onboarding') {
    return (
      <AuthShell>
        <h2 className="text-center text-xl font-black text-slate-900">Jak ti máme říkat?</h2>
        <p className="mt-2 text-center text-xs font-medium leading-relaxed text-slate-500">
          Tohle jméno uvidí ostatní hráči v Tipovačce.
        </p>
        <form
          className="mt-6 space-y-4"
          onSubmit={async event => {
            event.preventDefault();
            setLocalBusy(true);
            setLocalError('');
            try {
              await onCompleteProfileOnboarding(onboardingName);
            } catch (err: any) {
              setLocalError(err?.message || 'Profil se nepodařilo dokončit.');
            } finally {
              setLocalBusy(false);
            }
          }}
        >
          <AuthInput label="Zobrazované jméno" type="text" value={onboardingName} onChange={setOnboardingName} autoComplete="nickname" />
          {(localError || error) && <AuthError message={localError || error} />}
          <button disabled={localBusy} type="submit" className="min-h-12 w-full rounded-2xl bg-red-600 text-xs font-black uppercase text-white disabled:opacity-60">
            {localBusy ? 'Ukládám...' : 'Pokračovat'}
          </button>
        </form>
      </AuthShell>
    );
  }

  if (showForgotPassword) {
    return (
      <AuthShell>
        <Mail className="mx-auto h-10 w-10 text-red-600" />
        <h2 className="mt-5 text-center text-xl font-black text-slate-900">Obnovit heslo</h2>
        {forgotSent ? (
          <p className="mt-4 text-center text-xs font-medium leading-relaxed text-slate-500">
            Pokud účet s tímto e-mailem existuje, poslali jsme ti odkaz pro změnu hesla.
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            <AuthInput label="E-mail" type="email" value={email} onChange={value => onChange('email', value)} autoComplete="email" />
            {(localError || error) && <AuthError message={localError || error} />}
            <button disabled={localBusy} type="button" onClick={submitForgotPassword} className="min-h-12 w-full rounded-2xl bg-red-600 text-xs font-black uppercase text-white disabled:opacity-60">
              {localBusy ? 'Odesílám...' : 'Poslat odkaz'}
            </button>
          </div>
        )}
        <button type="button" onClick={() => { setShowForgotPassword(false); setForgotSent(false); setLocalError(''); }} className="mt-5 w-full text-xs font-black uppercase text-slate-400">
          Zpět na přihlášení
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell branded>
      {(authProviderConfig.google || authProviderConfig.apple) && (
        <div className="space-y-2">
          {authProviderConfig.google && (
            <button type="button" disabled={isBusy} onClick={() => onOAuth('google')} className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white text-xs font-black text-slate-800 disabled:opacity-60">
              Pokračovat přes Google
            </button>
          )}
          {authProviderConfig.apple && (
            <button type="button" disabled={isBusy} onClick={() => onOAuth('apple')} className="min-h-12 w-full rounded-2xl bg-slate-950 text-xs font-black text-white disabled:opacity-60">
              Pokračovat přes Apple
            </button>
          )}
          <div className="flex items-center gap-3 py-2">
            <span className="h-px flex-1 bg-slate-100" />
            <span className="text-[9px] font-black uppercase text-slate-300">nebo</span>
            <span className="h-px flex-1 bg-slate-100" />
          </div>
        </div>
      )}

      <form onSubmit={submitCredentials} className="space-y-4">
        {registering && (
          <AuthInput label="Zobrazované jméno" type="text" value={username} onChange={value => onChange('username', value)} autoComplete="nickname" />
        )}
        <AuthInput label="E-mail" type="email" value={email} onChange={value => onChange('email', value)} autoComplete="email" />
        <AuthInput
          label="Heslo"
          type="password"
          value={password}
          onChange={value => onChange('password', value)}
          autoComplete={registering ? 'new-password' : 'current-password'}
          hint={registering ? 'Alespoň 8 znaků; ideálně použij správce hesel.' : undefined}
        />
        {registering && (
          <AuthInput
            label="Potvrzení hesla"
            type="password"
            value={registrationConfirmation}
            onChange={setRegistrationConfirmation}
            autoComplete="new-password"
          />
        )}
        {(localError || error) && <AuthError message={localError || error} />}
        <button type="submit" disabled={isBusy} className="min-h-12 w-full rounded-2xl bg-red-600 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-red-100 disabled:cursor-not-allowed disabled:opacity-60">
          {isBusy ? (registering ? 'Registruji...' : 'Ověřuji...') : registering ? 'Registrovat se' : 'Přihlásit se'}
        </button>
        {!registering && (
          <button type="button" onClick={() => setShowForgotPassword(true)} className="w-full text-xs font-bold text-slate-500">
            Zapomněl/a jsem heslo
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setLocalError('');
            setRegistrationConfirmation('');
            onChange('password', '');
            onToggleRegistering();
          }}
          className="w-full text-xs font-black uppercase tracking-wide text-red-600"
        >
          {registering ? 'Máš účet? Přihlas se' : 'Nemáš účet? Zaregistrovat se'}
        </button>
      </form>
    </AuthShell>
  );
}

function AuthShell({ children, branded = false }: { children: ReactNode; branded?: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm rounded-[40px] border border-slate-100 bg-white p-8 shadow-2xl">
        {branded && (
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-5 flex h-16 w-16 rotate-3 items-center justify-center rounded-3xl bg-red-600 shadow-lg shadow-red-100">
              <Trophy className="h-9 w-9 text-white" />
            </div>
            <h1 className="text-2xl font-black uppercase italic leading-none tracking-tighter text-slate-900">Fan Tipovačka</h1>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-red-600">Unofficial fan predictor</p>
          </div>
        )}
        {children}
      </motion.div>
    </div>
  );
}

function AuthInput({
  label,
  type,
  value,
  onChange,
  autoComplete,
  hint
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  hint?: string;
}) {
  return (
    <label className="block text-xs font-bold uppercase text-slate-500">
      {label}
      <input
        required
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        autoComplete={autoComplete}
        className="mt-1 w-full rounded-2xl border-none bg-slate-50 p-4 font-semibold normal-case text-slate-800 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-red-600"
      />
      {hint && <span className="mt-1.5 block text-[9px] font-medium normal-case leading-relaxed text-slate-400">{hint}</span>}
    </label>
  );
}

function AuthError({ message }: { message: string }) {
  return <p className="mt-3 rounded-2xl bg-red-50 p-3 text-center text-xs font-bold text-red-600">{message}</p>;
}
