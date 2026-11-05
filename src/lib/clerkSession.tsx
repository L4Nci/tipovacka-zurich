import { ClerkProvider, useAuth, useClerk, useUser } from "@clerk/react";
import { createContext, Fragment, useCallback, useContext, useLayoutEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { bindClerkAccessTokenGetter, type ClerkAccessTokenGetter } from "./clerkSupabase.ts";

type GameSession = {
  ready: boolean;
  signedIn: boolean;
  subject: string | null;
  email: string | null;
  getAccessToken: ClerkAccessTokenGetter;
  logout: () => Promise<void>;
  manageAccount: () => void;
};

const GameSessionContext = createContext<GameSession | null>(null);

export function AppClerkProvider({ publishableKey, children }: { publishableKey: string; children: ReactNode }) {
  if (!publishableKey || !/^pk_(test|live)_/.test(publishableKey)) {
    throw new Error("Přihlášení vyžaduje platný Clerk publishable klíč.");
  }
  return (
    <ClerkProvider publishableKey={publishableKey} appearance={{ elements: { profileSection__danger: { display: 'none' } } }}>
      <ClerkSessionBridge>{children}</ClerkSessionBridge>
    </ClerkProvider>
  );
}

function ClerkSessionBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const getAccessToken = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return null;
    return getToken();
  }, [getToken, isLoaded, isSignedIn]);
  const [boundGetter, setBoundGetter] = useState<ClerkAccessTokenGetter | null>(null);

  useLayoutEffect(() => {
    const unbind = bindClerkAccessTokenGetter(getAccessToken);
    setBoundGetter(() => getAccessToken);
    return unbind;
  }, [getAccessToken]);

  const logout = useCallback(async () => { await signOut(); }, [signOut]);
  const manageAccount = useCallback(() => { openUserProfile(); }, [openUserProfile]);
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const session = useMemo<GameSession>(() => ({
    ready: isLoaded && boundGetter === getAccessToken,
    signedIn: Boolean(isSignedIn),
    subject: userId ?? null,
    email,
    getAccessToken,
    logout,
    manageAccount,
  }), [isLoaded, boundGetter, getAccessToken, isSignedIn, userId, email, logout, manageAccount]);

  return <GameSessionContext.Provider value={session}><Fragment key={userId ?? "signed-out"}>{children}</Fragment></GameSessionContext.Provider>;
}

export function useClerkGameSession() {
  const session = useContext(GameSessionContext);
  if (!session) throw new Error("Chybí Clerk session provider.");
  return session;
}
