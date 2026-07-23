import type { Provider, User } from '@supabase/supabase-js';
import { supabase } from './supabase.ts';

export type SupportedOAuthProvider = Extract<Provider, 'google' | 'apple'>;

const enabled = (value: unknown) => String(value || '').toLowerCase() === 'true';

export const authProviderConfig = {
  google: enabled(import.meta.env.VITE_AUTH_GOOGLE_ENABLED),
  apple: enabled(import.meta.env.VITE_AUTH_APPLE_ENABLED)
};

export const getAuthRedirectUrl = (origin = window.location.origin) => {
  const trustedOrigin = new URL(origin);
  if (!['http:', 'https:'].includes(trustedOrigin.protocol)) {
    throw new Error('Neplatná adresa pro návrat z přihlášení.');
  }
  return `${trustedOrigin.origin}/`;
};

export const signInWithOAuthProvider = async (provider: SupportedOAuthProvider) => {
  if (!authProviderConfig[provider]) {
    throw new Error('Tento způsob přihlášení zatím není nakonfigurovaný.');
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: getAuthRedirectUrl()
    }
  });
  if (error) throw error;
};

export const requestPasswordReset = async (email: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes('@')) {
    throw new Error('Zadej platnou e-mailovou adresu.');
  }

  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: getAuthRedirectUrl()
  });
  if (error) {
    throw new Error('Odkaz se teď nepodařilo odeslat. Zkus to prosím později.');
  }
};

export const resendSignupConfirmation = async (email: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes('@')) {
    throw new Error('Zadej platnou e-mailovou adresu.');
  }

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: normalizedEmail,
    options: {
      emailRedirectTo: getAuthRedirectUrl()
    }
  });
  if (error) throw error;
};

export const getUserAuthProviders = (user: User) => {
  const providers = new Set<string>();
  const appProviders = user.app_metadata?.providers;
  if (Array.isArray(appProviders)) {
    appProviders.forEach(provider => providers.add(String(provider)));
  }
  user.identities?.forEach(identity => {
    if (identity.provider) providers.add(identity.provider);
  });
  return Array.from(providers);
};

export const isGeneratedProfileName = (username: string) => /^uzivatel_(?:[0-9a-f]{8}|[0-9a-f]{32})$/i.test(username.trim());

export const toFriendlyAuthError = (error: unknown) => {
  const message = String((error as { message?: string })?.message || '').toLowerCase();

  if (message.includes('invalid login credentials')) return 'E-mail nebo heslo není správné.';
  if (message.includes('email not confirmed')) return 'Nejdřív potvrď svůj e-mail.';
  if (message.includes('user already registered')) return 'Účet s tímto e-mailem už existuje.';
  if (message.includes('password should be')) return 'Heslo nesplňuje bezpečnostní požadavky.';
  if (message.includes('rate limit')) return 'Příliš mnoho pokusů. Zkus to prosím později.';
  if (message.includes('network') || message.includes('fetch')) return 'Nepodařilo se připojit. Zkontroluj připojení a zkus to znovu.';

  return (error as { message?: string })?.message || 'Přihlášení se nezdařilo.';
};
