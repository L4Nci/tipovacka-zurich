import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPublicCompetitions, joinPublicCompetition, type PublicCompetition, type PublicCompetitionJoin } from './publicCompetitions.ts';
import { forgetPublicJoin, publicPlayPath, publicPlayRoute, readPublicJoin, rememberPublicJoin } from './publicPlayIntent.ts';

type JoinedCompetition = Exclude<PublicCompetitionJoin, { membership_state: 'removed' }>;
const storage = () => { try { return window.sessionStorage; } catch { return undefined; } };
const pendingJoin = (slug: string | null, subject: string | null) => {
  const store = storage();
  return store ? readPublicJoin(store, slug, subject) : null;
};
const clearPending = () => { const store = storage(); if (store) forgetPublicJoin(store); };

/** Public metadata is read-only. Only an explicit CTA creates a join intent. */
export function usePublicPlay({ enabled, authenticated, subject, onJoined }: {
  enabled: boolean;
  authenticated: boolean;
  subject: string | null;
  onJoined: (participation: JoinedCompetition, competition: PublicCompetition) => void;
}) {
  const [route, setRoute] = useState(() => publicPlayRoute(window.location.pathname));
  const [authRequested, setAuthRequested] = useState(() => Boolean(
    new URLSearchParams(window.location.search).get('account') || pendingJoin(route?.slug ?? null, subject)
  ));
  const [competitions, setCompetitions] = useState<PublicCompetition[]>([]);
  const [loading, setLoading] = useState(Boolean(enabled && (route || authenticated)));
  const [loadFailed, setLoadFailed] = useState(false);
  const [joinFailed, setJoinFailed] = useState(false);
  const [joining, setJoining] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const requestRef = useRef(0);
  const mountedRef = useRef(false);
  const inFlightRef = useRef(false);
  const identityRef = useRef(subject);
  const routeRef = useRef(route?.slug);
  const onJoinedRef = useRef(onJoined);
  onJoinedRef.current = onJoined;
  identityRef.current = subject;
  routeRef.current = route?.slug;
  const previousSubjectRef = useRef(subject);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      // The Clerk provider remounts the app when its subject changes. A stale
      // instance must never navigate the new account when its RPC resolves.
      mountedRef.current = false;
      requestRef.current += 1;
      inFlightRef.current = false;
    };
  }, []);

  const navigate = useCallback((slug: string | null, { replace = false } = {}) => {
    requestRef.current += 1;
    inFlightRef.current = false;
    clearPending();
    setJoining(false);
    setJoinFailed(false);
    setAuthRequested(false);
    window.history[replace ? 'replaceState' : 'pushState']({}, '', publicPlayPath(slug));
    setRoute({ slug });
    window.scrollTo({ top: 0 });
  }, []);

  const leave = useCallback(() => {
    requestRef.current += 1;
    inFlightRef.current = false;
    clearPending();
    setJoining(false);
    setJoinFailed(false);
    setAuthRequested(false);
    window.history.pushState({}, '', '/');
    setRoute(null);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onPop = () => {
      requestRef.current += 1;
      inFlightRef.current = false;
      clearPending();
      setJoining(false);
      setJoinFailed(false);
      setAuthRequested(false);
      setRoute(publicPlayRoute(window.location.pathname));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const previous = previousSubjectRef.current;
    // The initial null -> Clerk subject is the intended OAuth continuation.
    // A subsequent account switch or logout must cancel it.
    if (previous && previous !== subject) {
      requestRef.current += 1;
      inFlightRef.current = false;
      clearPending();
      setJoining(false);
      setAuthRequested(false);
    }
    previousSubjectRef.current = subject;
  }, [subject]);

  useEffect(() => {
    if (!enabled || !subject || !route?.slug) return;
    const pending = pendingJoin(route.slug, subject);
    const store = storage();
    // Bind at the first verified identity, before bootstrap or profile entry.
    // A different account must not consume an earlier visitor's continuation.
    if (pending?.subject === null && store) rememberPublicJoin(store, pending.slug, subject, pending.createdAt);
  }, [enabled, subject, route?.slug]);

  useEffect(() => {
    if (!enabled || !route && !authenticated) return;
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    void fetchPublicCompetitions().then(rows => {
      if (active) setCompetitions(rows);
    }).catch(() => {
      if (active) { setCompetitions([]); setLoadFailed(true); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [enabled, Boolean(route), authenticated, attempt]);

  const join = useCallback(async (competition: PublicCompetition) => {
    if (!enabled || !authenticated || !subject || inFlightRef.current) return;
    const requestId = ++requestRef.current;
    inFlightRef.current = true;
    setJoining(true);
    setJoinFailed(false);
    const isCurrent = () => mountedRef.current && requestRef.current === requestId && identityRef.current === subject && routeRef.current === competition.slug;
    // Bind an anonymous OAuth continuation before awaiting anything. Keep it
    // until the result so StrictMode/remount recovery can repeat idempotently,
    // while a different account can never inherit it.
    const store = storage();
    if (store) rememberPublicJoin(store, competition.slug, subject);
    try {
      const result = await joinPublicCompetition(competition.slug);
      if (!isCurrent()) return;
      clearPending();
      if (result.membership_state === 'removed') throw new Error('Participation unavailable.');
      setAuthRequested(false);
      window.history.replaceState({}, '', '/');
      setRoute(null);
      onJoinedRef.current(result, competition);
    } catch {
      if (isCurrent()) { clearPending(); setJoinFailed(true); setAuthRequested(false); }
    } finally {
      if (mountedRef.current && requestRef.current === requestId) { inFlightRef.current = false; setJoining(false); }
    }
  }, [enabled, authenticated, subject]);

  const start = useCallback((competition: PublicCompetition) => {
    if (joining) return;
    // Keep the card path across SignIn/SignUp/provider callbacks.
    window.history.replaceState({}, '', publicPlayPath(competition.slug));
    routeRef.current = competition.slug;
    setRoute({ slug: competition.slug });
    setJoinFailed(false);
    if (authenticated) { void join(competition); return; }
    const store = storage();
    if (store) rememberPublicJoin(store, competition.slug, subject);
    setAuthRequested(true);
    window.history.replaceState({}, '', `${publicPlayPath(competition.slug)}?account=sign-up`);
  }, [authenticated, join, joining, subject]);

  useEffect(() => {
    if (!enabled || !authenticated || !subject || loading || !route?.slug) return;
    const competition = competitions.find(item => item.slug === route.slug);
    if (competition && pendingJoin(route.slug, subject)) void join(competition);
  }, [enabled, authenticated, subject, loading, competitions, route?.slug, join]);

  return {
    route: enabled ? route : null, competitions, loading, loadFailed, joinFailed, joining, authRequested,
    navigate, leave, start,
    retry: () => setAttempt(value => value + 1),
    cancelAuthentication: () => { clearPending(); setAuthRequested(false); window.history.replaceState({}, '', publicPlayPath(route?.slug ?? null)); },
    clearPending,
  };
}
