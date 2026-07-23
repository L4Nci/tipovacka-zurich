import { getAuthEventAction, getSignupOutcome } from './authLifecycle.ts';

const assertEqual = <T>(actual: T, expected: T, label: string) => {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
};

assertEqual(getSignupOutcome(false), 'email_confirmation_pending', 'signup without session');
assertEqual(getSignupOutcome(true), 'authenticated', 'signup with session');
assertEqual(getAuthEventAction('PASSWORD_RECOVERY', true, false), 'password_recovery', 'recovery callback');
assertEqual(getAuthEventAction('SIGNED_OUT', false, false), 'signed_out', 'signed out');
assertEqual(getAuthEventAction('INITIAL_SESSION', true, false), 'synchronize', 'initial session');
assertEqual(getAuthEventAction('SIGNED_IN', true, false), 'synchronize', 'OAuth/password sign in');
assertEqual(getAuthEventAction('TOKEN_REFRESHED', true, false), 'ignore', 'token refresh');
assertEqual(getAuthEventAction('USER_UPDATED', true, false), 'ignore', 'password update');
assertEqual(getAuthEventAction('SIGNED_IN', true, true), 'ignore', 'recovery session isolation');

console.log('Auth lifecycle scenarios passed.');

