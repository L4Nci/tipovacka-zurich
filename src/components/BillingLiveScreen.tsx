import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createBillingLiveClient, BillingTestError, type BillingLiveOffer, type BillingTestOfferKey, type BillingTestStatus } from '../lib/billingTest.ts';
import { useLocale } from '../i18n/LocaleProvider.tsx';
import { BrandMark } from './BrandMark.tsx';
import './BillingTestScreen.css';

const labels = {
  cs: ['Zpět do hry','Načíst nabídku','Měsíčně','Ročně','Celkem 499 Kč za 12 měsíců','Souhlasím s podmínkami nabídky a opakovanou platbou.','Pokračovat k platbě','Obnovit stav','Spravovat předplatné','Podmínky','Soukromí','Vrácení platby','Nabídka zatím není dostupná.','Pracuji…','Zaplacené období do','Požadavek se nepodařil. Obnov stav před dalším pokusem.','Obnova předplatného je zastavena.'],
  en: ['Back to game','Load offer','Monthly','Annual','Total CZK 499 for 12 months','I accept the offer terms and recurring payment.','Continue to checkout','Refresh status','Manage subscription','Terms','Privacy','Refunds','The offer is not available yet.','Working…','Paid through','Request failed. Refresh status before retrying.','Subscription renewal is stopped.'],
  de: ['Zurück zum Spiel','Angebot laden','Monatlich','Jährlich','Gesamt 499 CZK für 12 Monate','Ich akzeptiere die Angebotsbedingungen und die wiederkehrende Zahlung.','Zur Zahlung','Status aktualisieren','Abonnement verwalten','Bedingungen','Datenschutz','Erstattung','Das Angebot ist noch nicht verfügbar.','Wird bearbeitet…','Bezahlt bis','Anfrage fehlgeschlagen. Vor erneutem Versuch Status aktualisieren.','Die Verlängerung ist gestoppt.'],
  pl: ['Powrót do gry','Wczytaj ofertę','Miesięcznie','Rocznie','Łącznie 499 CZK za 12 miesięcy','Akceptuję warunki oferty i płatność cykliczną.','Przejdź do płatności','Odśwież status','Zarządzaj subskrypcją','Warunki','Prywatność','Zwroty','Oferta nie jest jeszcze dostępna.','Pracujemy…','Opłacono do','Żądanie nie powiodło się. Przed ponowną próbą odśwież status.','Odnowienie subskrypcji zatrzymane.'],
  sk: ['Späť do hry','Načítať ponuku','Mesačne','Ročne','Spolu 499 Kč za 12 mesiacov','Súhlasím s podmienkami ponuky a opakovanou platbou.','Pokračovať k platbe','Obnoviť stav','Spravovať predplatné','Podmienky','Súkromie','Vrátenie platby','Ponuka zatiaľ nie je dostupná.','Pracujem…','Zaplatené obdobie do','Požiadavka zlyhala. Pred ďalším pokusom obnov stav.','Obnova predplatného je zastavená.'],
};
const stateText = {
  cs: { not_started:'Zatím bez předplatného.',checkout_open:'Platba je rozpracovaná.',pending:'Čekáme na ověření platby.',paid:'Úhrada potvrzena.',unpaid:'Úhrada neproběhla.',expired:'Zaplacené období skončilo.',cancelled:'Předplatné bylo zrušeno.',refunded:'Úhrada byla vrácena.',review:'Platba vyžaduje kontrolu.' },
  en: { not_started:'No subscription yet.',checkout_open:'Checkout is open.',pending:'Waiting for payment verification.',paid:'Payment confirmed.',unpaid:'Payment failed.',expired:'Paid period ended.',cancelled:'Subscription cancelled.',refunded:'Payment refunded.',review:'Payment requires review.' },
  de: { not_started:'Noch kein Abonnement.',checkout_open:'Zahlung ist geöffnet.',pending:'Zahlung wird geprüft.',paid:'Zahlung bestätigt.',unpaid:'Zahlung fehlgeschlagen.',expired:'Bezahlter Zeitraum abgelaufen.',cancelled:'Abonnement gekündigt.',refunded:'Zahlung erstattet.',review:'Zahlung muss geprüft werden.' },
  pl: { not_started:'Brak subskrypcji.',checkout_open:'Płatność jest otwarta.',pending:'Czekamy na weryfikację płatności.',paid:'Płatność potwierdzona.',unpaid:'Płatność nie powiodła się.',expired:'Opłacony okres się skończył.',cancelled:'Subskrypcja anulowana.',refunded:'Płatność została zwrócona.',review:'Płatność wymaga sprawdzenia.' },
  sk: { not_started:'Zatiaľ bez predplatného.',checkout_open:'Platba je rozpracovaná.',pending:'Čakáme na overenie platby.',paid:'Úhrada potvrdená.',unpaid:'Úhrada neprebehla.',expired:'Zaplatené obdobie skončilo.',cancelled:'Predplatné bolo zrušené.',refunded:'Úhrada bola vrátená.',review:'Platba vyžaduje kontrolu.' },
};
const quotaText = { cs:'Vlastní lobby v tomto VIP',en:'Owned lobbies included',de:'Enthaltene eigene Lobbys',pl:'Własne lobby w pakiecie',sk:'Vlastné lobby v tomto VIP' };

/** Buyer copy comes from the server's accepted immutable offer, never draft marketing. */
export function BillingLiveScreen({ subject, getAccessToken, refreshOnReturn = false }: {
  subject: string; getAccessToken: () => Promise<string | null>; refreshOnReturn?: boolean;
}) {
  const { locale } = useLocale(); const text = labels[locale];
  const currentSubject = useRef(subject); currentSubject.current = subject;
  const tokenGetter = useRef(getAccessToken); tokenGetter.current = getAccessToken;
  const clientRef = useRef<ReturnType<typeof createBillingLiveClient> | null>(null);
  const [offer, setOffer] = useState<BillingLiveOffer | null>(null);
  const [choice, setChoice] = useState<BillingTestOfferKey>('fan_vip_monthly');
  const [accepted, setAccepted] = useState(false); const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false); const [status, setStatus] = useState<BillingTestStatus | null>(null);
  const [conflict, setConflict] = useState<BillingTestOfferKey | null>(null);
  const attempt = useRef<{ offer: BillingTestOfferKey; id: string } | null>(null);
  const alive = useRef(true); const running = useRef(false);
  useLayoutEffect(() => {
    alive.current = true; running.current = false;
    setOffer(null); setStatus(null); setAccepted(false); setBusy(false); setFailed(false); setConflict(null); attempt.current = null;
    const client = createBillingLiveClient({ subject, getAccessToken: () => tokenGetter.current(), getCurrentSubject: () => currentSubject.current });
    clientRef.current = client;
    return () => { alive.current = false; client.dispose(); if (clientRef.current === client) clientRef.current = null; };
  }, [subject]);
  async function run(action: 'offer' | 'status' | 'checkout' | 'portal') {
    const client = clientRef.current;
    if (!client || running.current) return; running.current = true; setBusy(true); setFailed(false); setConflict(null);
    const current = () => alive.current && clientRef.current === client && currentSubject.current === subject;
    try {
      if (action === 'offer') { const next = await client.offer(); if (current()) { setOffer(next); setAccepted(false); } }
      else if (action === 'status') { const next = await client.status(); if (current()) setStatus(next); }
      else {
        let url: string;
        if (action === 'checkout') {
          if (!offer || !accepted) return;
          if (attempt.current?.offer !== choice) attempt.current = { offer: choice, id: crypto.randomUUID() };
          url = await client.checkout(choice, attempt.current.id, offer.version);
        } else url = await client.portal();
        if (current()) window.location.assign(url);
      }
    } catch (error) {
      if (current()) { setFailed(true); if (error instanceof BillingTestError) setConflict(error.offerKey); }
    } finally { if (current()) { running.current = false; setBusy(false); } }
  }
  useEffect(() => { if (refreshOnReturn) void run('status'); }, [refreshOnReturn]);
  return <main className="billing-test" lang={locale}>
    <header className="billing-test-header"><BrandMark /><strong>Fan VIP</strong><a className="billing-test-back" href="/">{text[0]}</a></header>
    <section className="billing-test-body"><h1>Fan VIP</h1>
      {!offer ? <div className="billing-test-card"><p>{text[12]}</p><button className="billing-test-primary" disabled={busy} onClick={() => void run('offer')}>{busy ? text[13] : text[1]}</button></div> :
        <div className="billing-test-card"><p>{offer.summary}</p><p>{quotaText[locale]}: {offer.ownedLobbyQuota}</p><p>{offer.renewalSummary}</p><p>{offer.cancellationSummary}</p>
          <fieldset className="billing-test-offers" disabled={busy}>
            <legend className="sr-only">Fan VIP</legend>
            {(['fan_vip_monthly','fan_vip_annual'] as const).map(key => <label key={key} className={`billing-test-offer ${choice === key ? 'is-selected' : ''}`}>
              <input type="radio" name="vip-offer" checked={choice === key} onChange={() => { setChoice(key); setAccepted(false); attempt.current = null; }} />
              <span><strong>{key === 'fan_vip_monthly' ? '49 Kč' : '499 Kč'}</strong><span>{key === 'fan_vip_monthly' ? text[2] : text[3]}</span></span>
            </label>)}
          </fieldset>
          {choice === 'fan_vip_annual' ? <p>{text[4]}</p> : null}
          <p><a href={offer.termsUrl} target="_blank" rel="noopener noreferrer">{text[9]}</a> · <a href={offer.privacyUrl} target="_blank" rel="noopener noreferrer">{text[10]}</a> · <a href={offer.refundUrl} target="_blank" rel="noopener noreferrer">{text[11]}</a></p>
          <label><input type="checkbox" checked={accepted} disabled={busy} onChange={event => setAccepted(event.target.checked)} /> {text[5]}</label>
          <p>{offer.seller} · {offer.supportEmail}</p>
          <button className="billing-test-primary" disabled={busy || !accepted} onClick={() => void run('checkout')}>{busy ? text[13] : text[6]}</button>
        </div>}
      {failed ? <p className="billing-test-error" role="alert">{text[15]}</p> : null}
      {conflict ? <button className="billing-test-secondary" onClick={() => { setChoice(conflict); setAccepted(false); setConflict(null); attempt.current = null; }}>
        {conflict === 'fan_vip_monthly' ? `${text[2]} ·49 Kč` : `${text[3]} ·499 Kč`}
      </button> : null}
      <section className="billing-test-card"><p role="status">{status ? stateText[locale][status.state] : ''}</p>
        {status?.paidUntil ? <p>{text[14]}: <time dateTime={status.paidUntil}>{new Date(status.paidUntil).toLocaleString(locale)}</time></p> : null}
        {status?.renewalStopped ? <p>{text[16]}</p> : null}
        <button className="billing-test-secondary" disabled={busy} onClick={() => void run('status')}>{text[7]}</button>
        {status?.canManage ? <button className="billing-test-secondary" disabled={busy} onClick={() => void run('portal')}>{text[8]}</button> : null}
      </section>
    </section>
  </main>;
}
