import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, FlaskConical, RefreshCw } from 'lucide-react';
import { useLocale } from '../i18n/LocaleProvider.tsx';
import { intlLocale, type Locale } from '../i18n/index.ts';
import { BillingTestError, BillingTestStaleRequestError, createBillingTestClient,
  type BillingTestErrorCode, type BillingTestOfferKey, type BillingTestState, type BillingTestStatus } from '../lib/billingTest.ts';
import { BrandMark } from './BrandMark.tsx';
import './BillingTestScreen.css';

type BillingCopy = {
  back: string; title: string; sandbox: string; notice: string; offerIntro: string;
  monthly: string; annual: string; annualTotal: string; checkout: string; refresh: string;
  manage: string; working: string; status: string; unchecked: string; paidUntil: string;
  returnHint: string; renewalStopped: string; existingOffer: string; useExisting: string;
  states: Record<BillingTestState, string>; errors: Record<BillingTestErrorCode, string>;
};

/** Isolated test copy; adding it does not mutate the game's public sales catalogue. */
const copy: Record<Locale, BillingCopy> = {
  cs: {
    back: 'Zpět do hry', title: 'Test plateb', sandbox: 'Interní Stripe sandbox',
    notice: 'Bez skutečných peněz. Tento test neaktivuje VIP a nemění tipy, body ani členství v lobby.',
    offerIntro: 'Obě možnosti simulují stejný Fan VIP. Skutečné VIP funkce se zde nekupují.',
    monthly: 'za měsíc', annual: 'za rok', annualTotal: 'Celkem 499 Kč za 12 měsíců.',
    checkout: 'Otevřít testovací platbu', refresh: 'Obnovit stav', manage: 'Spravovat testovací předplatné',
    working: 'Pracuji…', status: 'Stav testu', unchecked: 'Stav zatím neověřen.', paidUntil: 'Testovací období do',
    returnHint: 'Po návratu ze Stripe obnov stav. Samotný návrat z platby nepotvrzuje její úhradu.',
    renewalStopped: 'Obnova testovacího předplatného je zastavena.',
    existingOffer: 'Již rozpracovaný interval', useExisting: 'Zvolit tento interval',
    states: { not_started: 'Zatím žádný test.', checkout_open: 'Testovací platba je otevřená.', pending: 'Čekáme na ověření simulované platby.',
      paid: 'Simulovaná úhrada potvrzena. Skutečné VIP zůstává vypnuté.', unpaid: 'Testovací úhrada neproběhla.', expired: 'Testovací období skončilo.',
      cancelled: 'Testovací předplatné je zrušené.', refunded: 'Simulovaná úhrada byla vrácena.', review: 'Test vyžaduje kontrolu; žádné skutečné VIP se neaktivuje.' },
    errors: { configuration: 'Stripe sandbox zatím není nakonfigurovaný. Test nyní nelze spustit.', signed_out: 'Přihlášení vypršelo. Přihlas se znovu.',
      forbidden: 'Tento test není pro aktuální účet dostupný.', busy: 'Probíhá jiný požadavek. Obnov stav a zkus to znovu.',
      offer_conflict: 'Pro účet už existuje jiný interval. Novou platbu jsme neotevřeli. Zkontroluj stav nebo výslovně zvol rozpracovaný interval.',
      rate_limited: 'Příliš mnoho požadavků. Zkus to za chvíli.', network: 'Spojení se nepodařilo. Před dalším pokusem obnov stav.',
      invalid_response: 'Test vrátil neplatnou odpověď. Pokračování jsme zastavili.', unavailable: 'Test plateb teď není dostupný. Zkus to později.' },
  },
  en: {
    back: 'Back to the game', title: 'Payment test', sandbox: 'Internal Stripe sandbox',
    notice: 'No real money. This test does not activate VIP or change picks, points or lobby membership.',
    offerIntro: 'Both options simulate the same Fan VIP. No real VIP features are being purchased here.',
    monthly: 'per month', annual: 'per year', annualTotal: 'Total: CZK 499 for 12 months.',
    checkout: 'Open test checkout', refresh: 'Refresh status', manage: 'Manage test subscription',
    working: 'Working…', status: 'Test status', unchecked: 'Status has not been checked yet.', paidUntil: 'Test period ends',
    returnHint: 'Refresh the status after returning from Stripe. Returning from checkout alone does not confirm payment.',
    renewalStopped: 'Test subscription renewal is stopped.',
    existingOffer: 'Existing checkout interval', useExisting: 'Choose this interval',
    states: { not_started: 'No test yet.', checkout_open: 'Test checkout is open.', pending: 'Waiting to verify the simulated payment.',
      paid: 'Simulated payment confirmed. Real VIP remains disabled.', unpaid: 'Test payment did not complete.', expired: 'The test period has ended.',
      cancelled: 'The test subscription is cancelled.', refunded: 'The simulated payment was refunded.', review: 'The test needs review; no real VIP will be activated.' },
    errors: { configuration: 'The Stripe sandbox is not configured yet. The test cannot start.', signed_out: 'Your session has expired. Sign in again.',
      forbidden: 'This test is not available for the current account.', busy: 'Another request is in progress. Refresh the status and try again.',
      offer_conflict: 'This account already has a different interval. No new checkout was opened. Check the status or explicitly choose the existing interval.',
      rate_limited: 'Too many requests. Try again shortly.', network: 'The connection failed. Refresh the status before trying again.',
      invalid_response: 'The test returned an invalid response. We stopped the action.', unavailable: 'Payment testing is unavailable right now. Try again later.' },
  },
  de: {
    back: 'Zurück zum Spiel', title: 'Zahlungstest', sandbox: 'Interne Stripe-Sandbox',
    notice: 'Kein echtes Geld. Dieser Test aktiviert kein VIP und ändert weder Tipps noch Punkte oder Lobby-Mitgliedschaften.',
    offerIntro: 'Beide Optionen simulieren dasselbe Fan VIP. Hier werden keine echten VIP-Funktionen gekauft.',
    monthly: 'pro Monat', annual: 'pro Jahr', annualTotal: 'Gesamt: 499 CZK für 12 Monate.',
    checkout: 'Testzahlung öffnen', refresh: 'Status aktualisieren', manage: 'Testabonnement verwalten',
    working: 'Wird bearbeitet…', status: 'Teststatus', unchecked: 'Der Status wurde noch nicht geprüft.', paidUntil: 'Testzeitraum endet am',
    returnHint: 'Aktualisiere nach der Rückkehr von Stripe den Status. Die Rückkehr allein bestätigt keine Zahlung.',
    renewalStopped: 'Die Verlängerung des Testabonnements ist gestoppt.',
    existingOffer: 'Bereits gewählter Zahlungszeitraum', useExisting: 'Diesen Zeitraum wählen',
    states: { not_started: 'Noch kein Test.', checkout_open: 'Die Testzahlung ist geöffnet.', pending: 'Die simulierte Zahlung wird geprüft.',
      paid: 'Simulierte Zahlung bestätigt. Echtes VIP bleibt deaktiviert.', unpaid: 'Die Testzahlung wurde nicht abgeschlossen.', expired: 'Der Testzeitraum ist abgelaufen.',
      cancelled: 'Das Testabonnement ist gekündigt.', refunded: 'Die simulierte Zahlung wurde erstattet.', review: 'Der Test muss geprüft werden; echtes VIP wird nicht aktiviert.' },
    errors: { configuration: 'Die Stripe-Sandbox ist noch nicht eingerichtet. Der Test kann nicht starten.', signed_out: 'Deine Sitzung ist abgelaufen. Melde dich erneut an.',
      forbidden: 'Dieser Test ist für das aktuelle Konto nicht verfügbar.', busy: 'Eine andere Anfrage läuft. Aktualisiere den Status und versuche es erneut.',
      offer_conflict: 'Für dieses Konto besteht bereits ein anderer Zeitraum. Es wurde keine neue Zahlung geöffnet. Prüfe den Status oder wähle den bestehenden Zeitraum ausdrücklich aus.',
      rate_limited: 'Zu viele Anfragen. Versuche es später erneut.', network: 'Die Verbindung ist fehlgeschlagen. Aktualisiere vor einem weiteren Versuch den Status.',
      invalid_response: 'Die Testantwort ist ungültig. Der Vorgang wurde gestoppt.', unavailable: 'Der Zahlungstest ist gerade nicht verfügbar. Versuche es später erneut.' },
  },
  pl: {
    back: 'Wróć do gry', title: 'Test płatności', sandbox: 'Wewnętrzny sandbox Stripe',
    notice: 'Bez prawdziwych pieniędzy. Ten test nie aktywuje VIP ani nie zmienia typów, punktów lub członkostwa w lobby.',
    offerIntro: 'Obie opcje symulują ten sam Fan VIP. Nie kupujesz tutaj prawdziwych funkcji VIP.',
    monthly: 'miesięcznie', annual: 'rocznie', annualTotal: 'Łącznie: 499 CZK za 12 miesięcy.',
    checkout: 'Otwórz płatność testową', refresh: 'Odśwież status', manage: 'Zarządzaj subskrypcją testową',
    working: 'Trwa przetwarzanie…', status: 'Status testu', unchecked: 'Status nie został jeszcze sprawdzony.', paidUntil: 'Okres testowy kończy się',
    returnHint: 'Po powrocie ze Stripe odśwież status. Sam powrót nie potwierdza płatności.',
    renewalStopped: 'Odnowienie subskrypcji testowej jest wyłączone.',
    existingOffer: 'Istniejący okres płatności', useExisting: 'Wybierz ten okres',
    states: { not_started: 'Jeszcze nie rozpoczęto testu.', checkout_open: 'Płatność testowa jest otwarta.', pending: 'Czekamy na weryfikację symulowanej płatności.',
      paid: 'Symulowana płatność potwierdzona. Prawdziwy VIP pozostaje wyłączony.', unpaid: 'Płatność testowa nie została zrealizowana.', expired: 'Okres testowy dobiegł końca.',
      cancelled: 'Subskrypcja testowa jest anulowana.', refunded: 'Symulowana płatność została zwrócona.', review: 'Test wymaga sprawdzenia; prawdziwy VIP nie zostanie aktywowany.' },
    errors: { configuration: 'Sandbox Stripe nie jest jeszcze skonfigurowany. Nie można rozpocząć testu.', signed_out: 'Sesja wygasła. Zaloguj się ponownie.',
      forbidden: 'Ten test nie jest dostępny dla bieżącego konta.', busy: 'Trwa inne żądanie. Odśwież status i spróbuj ponownie.',
      offer_conflict: 'To konto ma już inny okres płatności. Nie otwarto nowej płatności. Sprawdź status lub wyraźnie wybierz istniejący okres.',
      rate_limited: 'Zbyt wiele żądań. Spróbuj ponownie za chwilę.', network: 'Nie udało się połączyć. Przed kolejną próbą odśwież status.',
      invalid_response: 'Test zwrócił nieprawidłową odpowiedź. Działanie zostało zatrzymane.', unavailable: 'Test płatności jest teraz niedostępny. Spróbuj później.' },
  },
  sk: {
    back: 'Späť do hry', title: 'Test platieb', sandbox: 'Interný Stripe sandbox',
    notice: 'Bez skutočných peňazí. Tento test neaktivuje VIP a nemení tipy, body ani členstvo v lobby.',
    offerIntro: 'Obe možnosti simulujú rovnaký Fan VIP. Skutočné VIP funkcie sa tu nekupujú.',
    monthly: 'za mesiac', annual: 'za rok', annualTotal: 'Spolu 499 Kč za 12 mesiacov.',
    checkout: 'Otvoriť testovaciu platbu', refresh: 'Obnoviť stav', manage: 'Spravovať testovacie predplatné',
    working: 'Pracujem…', status: 'Stav testu', unchecked: 'Stav zatiaľ neoverený.', paidUntil: 'Testovacie obdobie do',
    returnHint: 'Po návrate zo Stripe obnov stav. Samotný návrat nepotvrdzuje úhradu.',
    renewalStopped: 'Obnova testovacieho predplatného je zastavená.',
    existingOffer: 'Už rozpracovaný interval', useExisting: 'Zvoliť tento interval',
    states: { not_started: 'Zatiaľ žiadny test.', checkout_open: 'Testovacia platba je otvorená.', pending: 'Čakáme na overenie simulovanej platby.',
      paid: 'Simulovaná úhrada potvrdená. Skutočné VIP zostáva vypnuté.', unpaid: 'Testovacia úhrada neprebehla.', expired: 'Testovacie obdobie sa skončilo.',
      cancelled: 'Testovacie predplatné je zrušené.', refunded: 'Simulovaná úhrada bola vrátená.', review: 'Test vyžaduje kontrolu; skutočné VIP sa neaktivuje.' },
    errors: { configuration: 'Stripe sandbox zatiaľ nie je nakonfigurovaný. Test nemožno spustiť.', signed_out: 'Prihlásenie vypršalo. Prihlás sa znova.',
      forbidden: 'Tento test nie je pre aktuálny účet dostupný.', busy: 'Prebieha iná požiadavka. Obnov stav a skús to znova.',
      offer_conflict: 'Pre účet už existuje iný interval. Novú platbu sme neotvorili. Skontroluj stav alebo výslovne zvoľ rozpracovaný interval.',
      rate_limited: 'Príliš veľa požiadaviek. Skús to o chvíľu.', network: 'Spojenie sa nepodarilo. Pred ďalším pokusom obnov stav.',
      invalid_response: 'Test vrátil neplatnú odpoveď. Pokračovanie sme zastavili.', unavailable: 'Test platieb teraz nie je dostupný. Skús to neskôr.' },
  },
};

export type BillingTestScreenProps = {
  subject: string;
  getAccessToken: () => Promise<string | null>;
  onExit: () => void;
  refreshOnReturn?: boolean;
};

/** A keyed account subtree immediately clears the previous identity's visible test state. */
export function BillingTestScreen(props: BillingTestScreenProps) {
  const { locale } = useLocale();
  return <BillingTestAccount key={props.subject} {...props} locale={locale} />;
}

function BillingTestAccount({ subject, getAccessToken, onExit, refreshOnReturn = false, locale }: BillingTestScreenProps & { key?: string; locale: Locale }) {
  const text = copy[locale];
  const [offer, setOffer] = useState<BillingTestOfferKey>('fan_vip_monthly');
  const [status, setStatus] = useState<BillingTestStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<BillingTestErrorCode | null>(null);
  const [conflictOffer, setConflictOffer] = useState<BillingTestOfferKey | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const busyRef = useRef(false);
  const tokenGetter = useRef(getAccessToken);
  const clientRef = useRef<ReturnType<typeof createBillingTestClient> | null>(null);
  const checkoutAttempt = useRef<{ offer: BillingTestOfferKey; requestId: string } | null>(null);

  useLayoutEffect(() => { tokenGetter.current = getAccessToken; }, [getAccessToken]);
  useLayoutEffect(() => {
    mounted.current = true;
    const client = createBillingTestClient({ subject, getAccessToken: () => tokenGetter.current(),
      getCurrentSubject: () => mounted.current ? subject : null });
    clientRef.current = client;
    return () => {
      mounted.current = false; generation.current++; busyRef.current = false;
      client.dispose(); if (clientRef.current === client) clientRef.current = null;
    };
  }, [subject]);

  async function perform(action: 'checkout' | 'status' | 'portal') {
    const client = clientRef.current;
    if (!mounted.current || !client || busyRef.current) return;
    busyRef.current = true;
    const request = ++generation.current;
    const current = () => mounted.current && clientRef.current === client && generation.current === request;
    setBusy(true); setError(null); setConflictOffer(null);
    try {
      if (action === 'status') {
        const next = await client.status();
        if (current()) setStatus(next);
      } else {
        let redirect: string;
        if (action === 'checkout') {
          // Keep a retry of an ambiguous network outcome on the same request ID.
          if (!checkoutAttempt.current || checkoutAttempt.current.offer !== offer) {
            checkoutAttempt.current = { offer, requestId: crypto.randomUUID() };
          }
          redirect = await client.checkout(offer, checkoutAttempt.current.requestId);
        } else { redirect = await client.portal(); }
        if (current()) window.location.assign(redirect);
      }
    } catch (failure) {
      if (current() && !(failure instanceof BillingTestStaleRequestError)) {
        setError(failure instanceof BillingTestError ? failure.code : 'unavailable');
        if (failure instanceof BillingTestError && failure.code === 'offer_conflict') setConflictOffer(failure.offerKey);
      }
    } finally {
      if (current()) { busyRef.current = false; setBusy(false); }
    }
  }

  // A return marker may request a fresh server status, never start a checkout
  // or establish payment authority from the URL. Normal entry stays request-free.
  useEffect(() => {
    if (refreshOnReturn) void perform('status');
  }, [subject, refreshOnReturn]);

  function exit() {
    mounted.current = false; generation.current++; clientRef.current?.dispose(); clientRef.current = null;
    onExit();
  }

  const money = (amount: number) => new Intl.NumberFormat(intlLocale(locale), { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(amount);
  return <main className="billing-test" lang={locale}>
    <header className="billing-test-header"><BrandMark /><span>Fan <strong>Tipovačka</strong></span>
      <button type="button" className="billing-test-back" onClick={exit}><ArrowLeft size={17} aria-hidden="true" />{text.back}</button>
    </header>
    <section className="billing-test-body" aria-labelledby="billing-test-title">
      <p className="billing-test-label"><FlaskConical size={17} aria-hidden="true" />{text.sandbox}</p>
      <h1 id="billing-test-title">{text.title}</h1>
      <p className="billing-test-notice">{text.notice}</p>
      <div className="billing-test-card" aria-busy={busy}>
        <p className="billing-test-intro">{text.offerIntro}</p>
        <fieldset className="billing-test-offers" disabled={busy}>
          <legend className="sr-only">Fan VIP</legend>
          {(['fan_vip_monthly', 'fan_vip_annual'] as const).map(key => <label key={key} className={`billing-test-offer ${offer === key ? 'is-selected' : ''}`}>
            <input type="radio" name="billing-test-offer" value={key} checked={offer === key} onChange={() => {
              if (busyRef.current) return;
              setOffer(key); checkoutAttempt.current = null; setError(null); setConflictOffer(null);
            }} />
            <span><strong>{money(key === 'fan_vip_monthly' ? 49 : 499)}</strong><span>{key === 'fan_vip_monthly' ? text.monthly : text.annual}</span></span>
          </label>)}
        </fieldset>
        {offer === 'fan_vip_annual' ? <p className="billing-test-total">{text.annualTotal}</p> : null}
        <button type="button" className="billing-test-primary" onClick={() => { void perform('checkout'); }} disabled={busy}>
          {busy ? text.working : text.checkout}<ExternalLink size={17} aria-hidden="true" />
        </button>
        {error ? <p className="billing-test-error" role="alert">{text.errors[error]}</p> : null}
        {conflictOffer ? <div className="billing-test-conflict">
          <p>{text.existingOffer}: <strong>{money(conflictOffer === 'fan_vip_monthly' ? 49 : 499)} {conflictOffer === 'fan_vip_monthly' ? text.monthly : text.annual}</strong></p>
          <button type="button" className="billing-test-secondary" disabled={busy} onClick={() => {
            setOffer(conflictOffer); checkoutAttempt.current = null; setError(null); setConflictOffer(null);
          }}>{text.useExisting}</button>
        </div> : null}
      </div>
      <section className="billing-test-card billing-test-status" aria-labelledby="billing-test-status-title">
        <h2 id="billing-test-status-title">{text.status}</h2>
        <p role="status" aria-live="polite">{status ? text.states[status.state] : text.unchecked}</p>
        {status?.paidUntil ? <p className="billing-test-period">{text.paidUntil}: <time dateTime={status.paidUntil}>{new Intl.DateTimeFormat(intlLocale(locale), {
          dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Prague',
        }).format(new Date(status.paidUntil))}</time></p> : null}
        {status?.renewalStopped ? <p className="billing-test-period">{text.renewalStopped}</p> : null}
        <p className="billing-test-hint">{text.returnHint}</p>
        <div className="billing-test-actions">
          <button type="button" className="billing-test-secondary" onClick={() => { void perform('status'); }} disabled={busy}>
            <RefreshCw size={16} aria-hidden="true" />{text.refresh}
          </button>
          {status?.canManage ? <button type="button" className="billing-test-secondary" onClick={() => { void perform('portal'); }} disabled={busy}>
            {text.manage}<ExternalLink size={16} aria-hidden="true" />
          </button> : null}
        </div>
      </section>
    </section>
  </main>;
}
