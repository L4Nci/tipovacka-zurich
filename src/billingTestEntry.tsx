import { Component, StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './components/BillingTestScreen.css';

const root = createRoot(document.getElementById('root')!);
const copy = {
  cs: { title: 'Interní Stripe sandbox', signIn: 'Přihlas se účtem používaným ve hře. Přístup k testu ověří server.',
    loading: 'Ověřuji přihlášení…', signOut: 'Odhlásit a změnit účet', failed: 'Odhlášení se nepodařilo. Zkus to znovu.', account: 'Přihlášený testovací účet' },
  en: { title: 'Internal Stripe sandbox', signIn: 'Sign in with your game account. The server verifies access to this test.',
    loading: 'Checking your session…', signOut: 'Sign out and change account', failed: 'Sign-out failed. Try again.', account: 'Signed-in test account' },
  de: { title: 'Interne Stripe-Sandbox', signIn: 'Melde dich mit deinem Spielkonto an. Der Server prüft den Testzugang.',
    loading: 'Anmeldung wird geprüft…', signOut: 'Abmelden und Konto wechseln', failed: 'Abmeldung fehlgeschlagen. Versuche es erneut.', account: 'Angemeldetes Testkonto' },
  pl: { title: 'Wewnętrzny sandbox Stripe', signIn: 'Zaloguj się kontem używanym w grze. Serwer sprawdzi dostęp do testu.',
    loading: 'Sprawdzamy sesję…', signOut: 'Wyloguj i zmień konto', failed: 'Nie udało się wylogować. Spróbuj ponownie.', account: 'Zalogowane konto testowe' },
  sk: { title: 'Interný Stripe sandbox', signIn: 'Prihlás sa účtom používaným v hre. Prístup k testu overí server.',
    loading: 'Overujem prihlásenie…', signOut: 'Odhlásiť a zmeniť účet', failed: 'Odhlásenie sa nepodarilo. Skús to znova.', account: 'Prihlásený testovací účet' },
};

function Unavailable({ disabled }: { disabled: boolean }) {
  return <main className="billing-test-shell" lang="cs">
    <h1>Interní Stripe sandbox</h1>
    <p role="status">{disabled ? 'Interní test plateb je vypnutý.' : 'Interní test plateb nyní není dostupný.'}</p>
    <a href="/">Zpět do hry</a>
  </main>;
}

class BillingTestEntryBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  declare props: { children: ReactNode };
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Unavailable disabled={false} /> : this.props.children; }
}

async function startEnabledSandbox() {
  // Disabled builds never load Clerk or billing transports. The public flag
  // only controls this entry; the server separately verifies gates and identity.
  const [{ LocaleProvider, useLocale }, { AppClerkProvider, useClerkGameSession }, { SignIn }, { BillingTestScreen }] = await Promise.all([
    import('./i18n/LocaleProvider.tsx'), import('./lib/clerkSession.tsx'), import('@clerk/react'),
    import('./components/BillingTestScreen.tsx'),
  ]);
  const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
  if (!clerkKey || !/^pk_test_/.test(clerkKey)) {
    root.render(<Unavailable disabled={false} />);
    return;
  }
  const marker = new URLSearchParams(window.location.search).get('billing_return');
  const refreshOnReturn = marker === 'checkout' || marker === 'cancel' || marker === 'portal';

  // This component type is constructed once at entry startup, not during a
  // parent render. Clerk's existing keyed bridge owns identity changes.
  function BillingTestSession() {
    const session = useClerkGameSession();
    const { locale } = useLocale();
    const text = copy[locale];
    const [signingOut, setSigningOut] = useState(false);
    const [signOutFailed, setSignOutFailed] = useState(false);
    if (!session.ready || signingOut) return <main className="billing-test-shell" lang={locale}><p role="status">{text.loading}</p></main>;
    if (!session.signedIn || !session.subject) return <main className="billing-test-shell" lang={locale}>
      <h1>{text.title}</h1><p>{text.signIn}</p>
      <SignIn routing="hash" fallbackRedirectUrl="/billing-test.html" />
    </main>;
    return <>
      <div className="billing-test-session" lang={locale}>
        <span>{text.account}</span>
        <button type="button" onClick={async () => {
          // Unmount the billing account before awaiting logout: no late status
          // or redirect may survive an account-change action.
          setSignOutFailed(false); setSigningOut(true);
          try { await session.logout(); } catch { setSignOutFailed(true); }
          finally { setSigningOut(false); }
        }}>{text.signOut}</button>
        {signOutFailed ? <p role="alert">{text.failed}</p> : null}
      </div>
      <BillingTestScreen subject={session.subject} getAccessToken={session.getAccessToken}
        onExit={() => window.location.assign('/')} refreshOnReturn={refreshOnReturn} />
    </>;
  }

  root.render(<StrictMode><BillingTestEntryBoundary><LocaleProvider><AppClerkProvider publishableKey={clerkKey}>
    <BillingTestSession />
  </AppClerkProvider></LocaleProvider></BillingTestEntryBoundary></StrictMode>);
}

if (import.meta.env.VITE_BILLING_TEST_UI_ENABLED === 'true') {
  void startEnabledSandbox().catch(() => root.render(<Unavailable disabled={false} />));
} else {
  root.render(<Unavailable disabled />);
}
