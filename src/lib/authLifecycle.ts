export type AuthEventAction = 'password_recovery' | 'signed_out' | 'synchronize' | 'ignore';

export const getAuthEventAction = (
  event: string,
  hasSession: boolean,
  passwordRecoveryActive: boolean
): AuthEventAction => {
  if (event === 'PASSWORD_RECOVERY') return 'password_recovery';
  if (event === 'SIGNED_OUT' || !hasSession) return 'signed_out';
  if (passwordRecoveryActive) return 'ignore';
  if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return 'ignore';
  return 'synchronize';
};

export const getSignupOutcome = (hasSession: boolean) => (
  hasSession ? 'authenticated' as const : 'email_confirmation_pending' as const
);

