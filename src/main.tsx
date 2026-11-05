import {StrictMode, Suspense, lazy} from 'react';
import {createRoot} from 'react-dom/client';
import { AppClerkProvider } from './lib/clerkSession.tsx';
import './index.css';

// Do not evaluate data modules or start requests before configuration is explicit.
const App = lazy(() => import('./App.tsx'));
const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
const configurationReady = Boolean(clerkKey && /^pk_(test|live)_/.test(clerkKey))
  && Boolean(import.meta.env.VITE_SUPABASE_URL?.trim())
  && Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY?.trim());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {configurationReady ? (
      <AppClerkProvider publishableKey={clerkKey!}>
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center" role="status">Načítám Tipovačku… / Loading…</div>}>
          <App />
        </Suspense>
      </AppClerkProvider>
    ) : (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md space-y-3 rounded-3xl bg-white p-8 shadow-sm" role="alert">
          <h1 className="text-xl font-black text-slate-900">Přihlášení zatím není nakonfigurované</h1>
          <p className="text-sm text-slate-600">Přihlášení bude dostupné po dokončení nastavení aplikace.</p>
          <p className="text-sm text-slate-600" lang="en">Sign-in is not configured yet. Clerk and Supabase configuration is required.</p>
        </div>
      </main>
    )}
  </StrictMode>,
);
