import { createRoot } from 'react-dom/client';
import { Component, useState, type ReactNode } from 'react';
import './index.css';
import './components/BillingTestScreen.css';
const root = createRoot(document.getElementById('root')!);
const unavailable = <main className="billing-test-shell" lang="cs"><h1>Fan VIP</h1><p role="status">Předplatné zatím není dostupné.</p><a href="/">Zpět do hry</a></main>;
class BillingBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  declare props: { children: ReactNode };
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? unavailable : this.props.children; }
}
async function start() {
  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!/^pk_live_/.test(key ?? '')) { root.render(unavailable); return; }
  const [{ LocaleProvider }, { AppClerkProvider, useClerkGameSession }, { SignIn }, { BillingLiveScreen }] = await Promise.all([
    import('./i18n/LocaleProvider.tsx'), import('./lib/clerkSession.tsx'), import('@clerk/react'), import('./components/BillingLiveScreen.tsx'),
  ]);
  function Session() {
    const session = useClerkGameSession(); const [changing, setChanging] = useState(false); const [failed, setFailed] = useState(false);
    if (!session.ready || changing) return <main className="billing-test-shell"><p role="status">…</p></main>;
    if (!session.signedIn || !session.subject) return <main className="billing-test-shell"><h1>Fan VIP</h1><SignIn routing="hash" fallbackRedirectUrl="/billing.html" /></main>;
    const marker = new URLSearchParams(window.location.search).get('billing_return');
    return <><div className="billing-test-session"><button onClick={async () => { setChanging(true); setFailed(false); try { await session.logout(); } catch { setFailed(true); } finally { setChanging(false); } }}>Odhlásit / Sign out</button>{failed ? <p role="alert">Odhlášení se nepodařilo. / Sign-out failed.</p> : null}</div>
      <div key={session.subject}><BillingLiveScreen subject={session.subject} getAccessToken={session.getAccessToken}
        refreshOnReturn={marker === 'checkout' || marker === 'cancel' || marker === 'portal'} /></div></>;
  }
  root.render(<BillingBoundary><LocaleProvider><AppClerkProvider publishableKey={key}><Session /></AppClerkProvider></LocaleProvider></BillingBoundary>);
}
if (import.meta.env.VITE_BILLING_LIVE_UI_ENABLED === 'true') void start().catch(() => root.render(unavailable));
else root.render(unavailable);
