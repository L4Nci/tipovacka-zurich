# FANTIP — Stripe integrační plán, 12. listopadu 2026

> Navazující stav po vlastníkově žádosti o přípravu „na klíč“:
> [implementace, skutečné sandbox ověření a aktivační podmínky](stripe-sandbox-readiness-2026-11-12.md).
> Tento dokument zachycuje dřívější plánovací krok; jeho tehdejší „nezapojené“
> inventáře nejsou současný stav runtime.

**Výsledek:** Stripe MCP i `stripe_implementation_planner` v novém chatu fungují.
Plánovač potvrdil hosted Checkout; stávající lokální moduly lze dále rozšířit.
Před zapojením HTTP runtime je nutné doplnit evidenci jednotlivých zaplacených
období, zotavení po chybách a povinnou vazbu na FanTip sandbox. Platby ani P0/P1
tím nejsou hotové.

Tento krok mění pouze tento dokument. Nevytváří Stripe objekty, nezapisuje do DB,
neaplikuje migraci a nezapíná prodej. Zachovává sdílený checkout včetně
`product-evolution-preview`; nevzniká worktree ani další beta DB.
Navazuje na [předání MCP](stripe-mcp-handoff-2026-11-10.md),
[schválený billing kontrakt](billing-contract.md) a
[pravidla projektu](../PROJECT_RULES.md). Starší předání popisuje nedostupnost
nástrojů v původním chatu; následující záznam je novější ověření v tomto chatu.

## 1. Co bylo skutečně zavoláno

1. Registr nástrojů nového chatu obsahoval
   `mcp__stripe__stripe_implementation_planner` i read-only Stripe nástroje.
2. `mcp__stripe__list_available_accounts_or_orgs({})` úspěšně vrátil jediný účet:
   **FanTip sandbox**, `stripe_context=acct_1UQsnbC66ykHzmj6`, `livemode=false`.
   To ověřuje dostupnost vybraného MCP prostředí. Neověřuje backendový API klíč.
3. První volání `stripe_implementation_planner` s tímto kontextem a
   `livemode=false` dostalo celý produktový a technický brief: soukromou
   [landing](https://fan-tipovacka-landing-v1.l4nci.chatgpt.site/#sports),
   oba intervaly, Clerk/Supabase/Express/Netlify, stávající nezapojené moduly,
   požadovanou izolaci TEST a zákaz externích zápisů. Vrátilo rozhodovací stromy
   a `guide_id=iguide_61VkIBQs0j0Hvyihj41C66ykHzmj6`.
4. Druhé volání použilo **tento skutečně vrácený** `guide_id`, `accept=true`,
   `message` s vysvětlením voleb a následující `selected_leaf_nodes`:
   - `no_subs_hosted_managed_payments_eligibility` — web, kódová integrace,
     přesměrování na hosted Checkout, bez Managed Payments;
   - `no_subs_pricing_volume_thresholds` — pevná osobní cena;
   - `no_subs_billing_collect_payment_info` — Free základ bez karty,
     VIP upgrade s platbou předem, žádný VIP trial;
   - `no_subs_lifecycle_customize_or_ubb` — Customer Portal;
   - `no_subs_recovery_custom_logic` — doporučení nativní obnovy plateb,
     bez vlastní inkasní smyčky.
5. Odpověď druhého volání: `status="accepted"`,
   `integration_shape={"checkout_type":"hosted","provider":"checkout_studio","origin_context":"web"}`.
   `provider` je metadata odpovědi plánovače, ne nová aplikační architektura
   nebo vytvořený projekt. Odpověď odkázala na dokumentaci vybraných větví;
   nevygenerovala audit našich souborů ani níže uvedený detailní návrh.

Daňová větev zůstala výslovně nerozhodnutá: neznáme konečného prodejce,
země ani registrace, proto jsme nevybrali tvrzení „žádné daňové povinnosti“.
Sales-led větev se na samoobslužný VIP nevztahuje. Plánovač přesto přijal
uvedené integrační volby. Smart Retries/e-maily jsou doporučení pro další
konfiguraci, dnes nebyly zapnuty. Proběhlo také read-only vyhledání Stripe
dokumentace pro Billing/invoice proof a ověření oficiálních dokumentačních stránek.

Instalace ani OAuth přihlášení se neopakovaly. Fallback
`npx skills add https://docs.stripe.com` nebyl potřeba a nebyl spuštěn.
OAuth tokeny ani keychain se nečetly; backendové credentials se neinspektovaly,
nevypisovaly ani neukládaly.
GitHub hledání Issues v `L4Nci/tipovacka-zurich` pro `Stripe`, `VIP` a `billing`
nevrátilo související Issue; žádné se nevytvářelo ani neuzavíralo.

## 2. Zachovaný produkt a integrační volby

| Nabídka | Účtovaná částka | Stripe minor units | Perioda |
| --- | --- | --- | --- |
| `fan_vip_monthly` | 49 Kč měsíčně | `4900`, `czk` | `month`, počet 1 |
| `fan_vip_annual` | 499 Kč za 12 měsíců | `49900`, `czk` | `year`, počet 1 |

Jeden osobní `fan_vip`, shodné funkce v obou intervalech. První vlastní lobby
a pozvaní hráči jsou zdarma, bez pětičlenného paywallu. VIP zahrnuje připravené
profilové/lobby skiny, vlastní nebo sdílené bodování a více vlastních lobby;
přesná VIP kvóta zůstává otevřená. Žádná osobní bodová výhoda, sázky, vklady,
placený vstup o ceny, payouts, Connect ani samostatně prodávaný permanentní skin.
Prodávat lze až implementované a přijaté funkce.

Cílová integrace zůstává **Payments + Billing + hosted Checkout + Customer
Portal**. Billing řeší obnovování předplatného; nevzniká vlastní opakované
strhávání přes PaymentIntents. To odpovídá vybraným větvím plánovače a
[Stripe průvodci předplatným](https://docs.stripe.com/billing/subscriptions/build-subscriptions?payment-ui=checkout&ui=stripe-hosted).
Pro pozdější sandbox katalog navrhujeme jeden trvalý Product a dvě recurring
Prices, mapované výhradně serverem. Dnes se žádný z těchto objektů nevytváří.

Zachovat SDK `stripe@23.1.0` a explicitní API `2026-10-28.endive`.
Instalované SDK hlásí stejnou verzi API; ta je i v
[oficiálním Endive changelogu](https://docs.stripe.com/changelog/endive).
Starší údaj o Clover v lokálním Stripe skillu není důvod k downgrade.
Plánovač doporučil flexible billing mode. V dalším bloku jej nastavit explicitně
přes `subscription_data.billing_mode.type='flexible'`, které instalované SDK
podporuje; současný adaptér tuto volbu neposílá. Dostupnost API odpovídá
[požadavkům flexible mode](https://docs.stripe.com/billing/subscriptions/billing-mode).

První sandbox scénář zůstává úzký: quantity 1, platba předem, žádné trialy,
promo kódy, slevy, změny intervalu, prorace ani dodatečné SKU. Daňově neutrální
testovací fixture není rozhodnutí o daňovém režimu prodeje. Karta a podporované
Apple Pay/Google Pay patří do pozdějšího ověření skutečného Checkout na vhodném
zařízení; jejich zobrazení a úspěch zatím ověřeny nejsou. Adaptér už používá
Endive parametr `allowed_payment_method_types: ['card']`; nevracet odstraněný
`payment_method_types`. Viz
[změna Checkout API](https://docs.stripe.com/changelog/endive/2026-09-30/remove-payment-method-types-checkout-sessions).

## 3. Rozdíly proti současnému kódu

Odkazy a řádky níže zachycují stav tohoto rozpracovaného checkoutu při revizi.
Jde o kontrolu zdrojů a offline testů, nikoli o ověřené chování hosted Stripe/DB.

| Oblast | Co už existuje | Co chybí / důsledek |
| --- | --- | --- |
| Autorita nabídky | [billingPolicy.ts](../server/lib/billingPolicy.ts), ř. 28–42: neměnné ceny/intervaly. Gateway znovu bere nabídku z allowlistu, ř. 181–196. | HTTP orchestrátor musí odvodit kupujícího ze session; samotný gateway důvěřuje serverovému volajícímu. |
| Katalog | [stripeTestGateway.ts](../server/lib/stripeTestGateway.ts), ř. 192–196: bezpečně sestavené inline `price_data`/`product_data`. | Na každou Session vzniká inline katalog. Trvalý Product/dvě Prices jsou doporučené zjednodušení správy a přesné vazby ID, ne tvrzení, že inline ceny samy o sobě jsou nebezpečné. |
| Účet a mode | Gateway, ř. 108–109, 141–146: načítá účet a kontroluje `livemode=false` u objektů. | `expectedAccountId` je volitelný. Prefix `sk_test_` nerozliší FanTip sandbox od legacy Test mode; runtime jej musí vyžadovat a porovnat se skutečným účtem. |
| Checkout idempotence | [SQL kandidát](../supabase/migrations/20261110195526_billing_test_sandbox.sql), ř. 119–138: zámek kupujícího, jeden neměnný intent přes retry/taby/intervaly. Ř. 87–96: stabilní klíč z uloženého UUID. | Chybí orchestrace vytvoření customer/Session, obnova po nejasném síťovém výsledku a práce po vypršení provider idempotency klíče. Klientské `requestId` samo neposkytuje durable garanci. |
| Nový nákup | SQL, ř. 131–133: i `completed` intent blokuje další nákup. | Blokuje ho navždy; po kanonickém ukončení a doběhnutí zaplaceného období není cesta k opětovnému nákupu. Rozdílný požadovaný interval se nesmí tiše změnit na starý. |
| Podpis | Gateway, ř. 210–217: skutečné SDK ověřuje raw Buffer a podpis s tolerancí 300 s, odmítá live/Connect/context události. | HTTP adaptér chybí. V [server.ts](../server.ts), ř. 60 je globální `express.json()`; webhook raw route musí být před ním. Netlify musí použít původní dekódované bajty. |
| Důkaz úhrady | Gateway, ř. 236–319: Checkout → Subscription → Invoice/line → InvoicePayment → PaymentIntent → captured Charge; kontrola vazeb, cen a konečných dat. | **Bere pouze `subscription.latest_invoice`**, ř. 266, a vyžaduje shodu s aktuální item periodou, ř. 284–285. Novější nezaplacená faktura může zastínit dříve platné zaplacení. |
| Uchování zaplacených období | SQL, ř. 263–285: TEST snapshot s konečným obdobím, limity 32/370 dní jako obrana vstupu. | Ř. 288–293 ukládají jeden přepisovaný outcome na kupujícího. `pending/requires_review` s null snapshotem může přepsat dřívější důkaz; chybí historie faktur/plateb a oddělení diagnostiky od nároku. |
| Refund/dispute | Gateway, ř. 304–307: plný refund daného Charge vrací refunded; částečný refund/spor jde k revizi. | Refund/dispute mapování nyní dohledá zákazníka, ale neuchovává dotčenou invoice/payment vazbu pro historii. Starý refund nesmí odebrat novější nezávisle zaplacené období. |
| Dedup a souběh | SQL, ř. 205–233, 237–301: `(account_id,event_id)`, fingerprint, buyer-wide lease/verze, atomické dokončení. | Dobré základy, ale chybí scheduler/claim seznam pro retry a recovery. SQL testy simulují souběh postupně; není doložen test více připojení. |
| TEST izolace | Soukromé `billing_test_private`, klientům odebraná práva, service-only RPC; [store](../server/lib/billingTestStore.ts) je tenký adaptér. | DB syntakticky přijme více account ID; očekávaný FanTip účet musí vynutit server. Normální readers `public.subscriptions` nemají mode dimenzi: žádný TEST zápis do nich. |
| UI a routes | [billingTest.ts](../src/lib/billingTest.ts), ř. 67–108 a [BillingTestScreen.tsx](../src/components/BillingTestScreen.tsx): token po akci, identity fencing, povolené Stripe origins, viditelný roční součet, žádný checkout při mountu. | `/api/billing/test/{checkout,status,portal}` neexistují; screen není připojený do App. Chybí vykreslená i end-to-end kontrola. `createPortal` zatím používá default konfiguraci místo výslovně omezené sandbox konfigurace. |

Dosavadní [identity foundation](billing-foundation-readiness-2026-11-10.md)
už řeší vazbu subscriptions → interní Clerk profil. Historický zdroj
`018_entitlements_foundation.sql` není aktuální hosted definice resolveru;
neobnovovat native UUID přihlášení ani znovu neaplikovat celou starou migraci.

## 4. Konkrétní návrh rozšíření existujících modulů

### Kupující a jeden otevřený nákup

Budoucí checkout/status/portal endpointy ověří Clerk bearer přes existující
`resolveClerkPlayerId`; nedovolí klientovi dodat UUID kupujícího, customer ID,
provider Price ID, částku, roli ani libovolnou návratovou URL. Interní sandbox
vstup navíc použije serverový gate a allowlist testerů. Rate limit a `no-store`
patří do společného handleru pro Express i Netlify.

Server nejprve rezervuje account/player intent, potom vytvoří či obnoví customer
se stabilním uloženým idempotency klíčem a immutable parametry. Po jeho bindingu
vytvoří/obnoví Session s dalším stabilním klíčem odvozeným od intentu. Timeout
nesmí vygenerovat nový klíč. Dva taby se stejnou nabídkou obnoví stejnou Session;
požadavek jiného intervalu vrátí explicitní konflikt a aktuální volbu, nikoli
přesměrování na jinou cenu. Klient tomuto konfliktu musí umět srozumitelně rozumět.

Stripe v1 idempotency nenahrazuje aplikační ledger: klíče mohou být po nejméně
24 hodinách odstraněny. Při dlouho nejasném výsledku nejprve dohledat kanonické
objekty a metadata intentu, projít příslušné stránky výsledků; pokud jednoznačné
spárování není možné, zastavit nový nákup a předat k revizi. Žádné automatické
znovuvytvoření po timeoutu. Viz
[Stripe idempotency](https://docs.stripe.com/api/idempotent_requests).

Otevřený checkout lze nahradit až po potvrzení expirace přesně vázané Session.
Dokončený intent archivovat pro nový nákup teprve po kanonickém terminálním stavu
předplatného, kontrole dalších aktivních/rozpracovaných subscription a doběhnutí
zaplaceného období. Zachovat historii i unique ochranu před dvěma aktivními
nákupy. Změny intervalu za běhu zatím blokovat; jejich pravidla nejsou přijatá.

### Faktura financuje konkrétní konečné období

Rozšířit stejný soukromý ledger o evidenci funding periods a vazby
`account → customer/player → subscription → invoice/line → invoice_payment →
payment_intent → charge`. Uložit serverem ověřené offer/Price ID, currency,
částku, `starts_at`, `ends_at`, stav reverzace a čas posledního ověření.
Jedinečnost invoice/line a payment vazeb musí zabránit dvojímu připsání téhož
období. Současný outcome zůstane diagnostickým stavem, nikoli jediným důkazem
platby. SQL struktura ověří konzistenci; pravost faktů ověřuje gateway.

Pro první úzký scénář zachovat přísný důkaz: `invoice.status=paid`, správný
customer/subscription/allowlisted Price, jediná očekávaná neprorovaná položka,
úplná správná úhrada přes InvoicePayment → úspěšný PaymentIntent → skutečně
captured Charge. Pouhý `active`, `checkout.session.completed`, redirect,
nulová faktura nebo ruční označení faktury za zaplacenou nestačí. Kombinované,
částečné, kreditní či off-Stripe platby poslat k revizi; nepovažovat je
automaticky za nákup této nabídky. Současné API spojuje platby s fakturami
přes InvoicePayment a podporuje více plateb, viz
[změna invoice API](https://docs.stripe.com/changelog/basil/2025-03-31/add-support-for-multiple-partial-payments-on-invoices).

Období brát z ověřené položky příslušné faktury, ne z data příchodu webhooku,
`now + 30/365 dní` ani pouze z aktuální periody subscription. Roční nabídka
znamená 12 kalendářních měsíců podle Stripe; SQL limity 32/370 nejsou výpočet
prodeje. Starší financovanou fakturu musí jít znovu ověřit, i když current period
a `latest_invoice` už odkazují jinam. `pending`, chyba fetch nebo revize novější
faktury nesmějí smazat dřívější stále platné období.

Sandbox eligibility se počítá při každém čtení serverovým časem:
`starts_at <= now < ends_at`, pouze z ověřeného funding period bez refundu/chargebacku.
Nespojovat nesouvislá období do domnělého nepřerušeného nároku. Zrušení obnovy
nebo failed renewal zachová přístup do legitimní zaplacené hranice; žádný
schválený grace period není. Expirace musí fungovat i bez dalšího webhooku.
Výsledek je výhradně **TEST stav**, nikdy normální VIP, role či herní capability.

Plný refund nebo prokázaný chargeback přiřadit pouze ke konkrétnímu funding
payment/period. Refund lednové platby nesmí odebrat nezávisle zaplacený únor.
Částečné refundy, otevřené spory a jejich vyřešení vést odděleně k revizi;
nejde o schválení nové automatické refund politiky. Nový grant ze sporných faktů
nevytvářet, jiné prokázané období nepřepisovat. Dnešní gateway rozpozná dispute,
ale nedokládá celý cyklus chargeback/lost/won; ten vyžaduje doplnění i testy.

### Webhook, souběh a obnova

Express raw webhook route musí předcházet `express.json()`. Netlify handler
převede `isBase64Encoded` body na Buffer, jinak použije původní UTF-8 body;
nikdy nezpětně neserializuje rozparsovaný JSON. Ověřit podpis, toleranci času,
account/mode a podporovaný formát před jakýmkoli zápisem. SDK musí kontrolovat
kanonický účet proti povinnému `acct_1UQsnbC66ykHzmj6`; signing secret patří
ke konkrétnímu endpointu téhož sandboxu. MCP OAuth není backend credential.
Požadavek na původní bajty potvrzuje
[Stripe webhook dokumentace](https://docs.stripe.com/webhooks#verify-webhook-signatures-with-official-libraries).

Zachovat nynější snapshot-event adaptér; budoucí endpoint musí mít kompatibilní
payload/API kontrakt. Thin event formát nynější `event.data.object` handler
nepodporuje a nesmí se mu tiše připojit. Pro první endpoint zvolit snapshot
události s ověřenou verzí; případný přechod na thin events je samostatná změna.

Oddělit levné ověření podpisu/uložení inboxu od síťového dohledávání kupujícího.
Současný `verifyWebhook` u refund/sporu dohledává Charge ještě před ledgerem;
výpadek tak zatím spoléhá na opakované doručení. Rozšířený inbox uloží ověřené
event ID, typ, dotčené object/charge/invoice ID, účet, mode a stabilní fingerprint,
včetně zatím nespárovaných událostí. Nepotřebuje logovat raw payload, podpis,
Checkout URL ani osobní údaje. Duplicitní ID s jiným obsahem vyvolá konflikt.

Po durable přijetí může endpoint odpovědět 2xx pouze tehdy, když uloženou práci
spolehlivě převezme worker. Před existencí takové obnovy musí relevantní
nedokončená/mapping/busy situace vracet retryable chybu; nesmí se potichu ztratit.
Ověřené nepodporované typy lze bezpečně ignorovat. Minimální pozdější odběr:
Checkout completed/expired/async success/failure, subscription created/updated/
deleted, invoice paid/payment_failed/payment_action_required, refund změny a
dispute created/updated/closed. Přesné názvy a payloady ověřit při přípravě
endpointu; události jsou podněty k fetchi, nikoli přímé příkazy k VIP.

Rozšířit existující service-only RPC o claim/list retry práce, `next_attempt_at`,
backoff, poslední bezpečný error code a převzetí expirovaného lease. Při claimu
získat buyer lease/verzi, potom načíst kanonické fakty, a v jedné transakci
ověřit fencing token a zapsat funding period, diagnostiku i dokončení eventu.
Starý worker po vypršení lease nic nepřepíše; dlouhý fetch prodlouží lease nebo
bezpečně retryuje. Události různých ID pro tutéž fakturu se potkají na invoice/
payment unique ochraně. Stripe negarantuje pořadí a timestamps nejsou totální
pořadí, viz [event ordering](https://docs.stripe.com/webhooks#event-ordering).

Obnova musí zvládnout pád po vytvoření customer/Session, po přijetí eventu,
po fetchi i po DB commitu před 2xx. Doplnit omezený servisní reconciliation
průchod pro rozpracované intent/subscription a nedávné dotčené faktury včetně
pagination. Stejnou cestu může vyvolat přihlášený vlastník přes status s rate
limitem; nesmí být jediným mechanismem obnovy. Scheduler lze později připojit
jako malou chráněnou operaci, bez admin dashboardu nebo změn sportovního syncu.

Portal endpoint odvodí customer ze stejného ověřeného kupujícího, použije
serverovou návratovou URL a konkrétní sandbox configuration ID. Konfigurace má
v prvním scénáři umožnit správu platební metody a cancellation na konci období,
bez změn intervalu/promo/trial/pause. Nepřebírat nezkontrolovaný default.
Portal konfigurace jsou oddělené podle prostředí a lze je volit při vytvoření
session, viz [Customer Portal](https://docs.stripe.com/customer-management/integrate-customer-portal).

## 5. Nejbližší implementační blok a přejímka

**Další blok: lokálně opravit gateway + soukromý ledger a přidat společný
orchestrátor s mocked providerem.** Zachovat stávající názvy/moduly, rozšířit
jejich kontrakty a testy. Nejprve povinný účet a allowlisted Price konfigurace,
funding periods, bezpečné opětovné nákupy a durable retry; pak HTTP adaptéry
pro Express/Netlify pod vypnutým test gate. App navigace ani prodej se tím
automaticky nezapínají. Hosted SQL apply a první skutečný sandbox průchod
jsou následující oddělené kroky, dnes neprovedené.

Přejímací scénáře pro tento blok:

- Měsíc i rok; odmítnutí podvrženého buyer/Price/částky/return URL a cizího
  customeru. Ověřené Clerk A/B oddělení, disabled identity a nepřihlášený vstup.
- Dva současné taby, dvě skutečná DB připojení, timeout před/po Stripe vytvoření,
  opakování po 24 hodinách, nezměněné parametry a žádná duplicitní subscription.
  Konflikt intervalů, kanonická expirace a bezpečný opětovný nákup po ukončení.
- Podepsané původní body v Express i Netlify/base64; mutace, chybějící/starý
  podpis, chybný účet, legacy Test mode, live a Connect/context se odmítnou.
- Renewal a opožděné/duplicitní události ve všech pořadích, včetně stejného
  `created`. Nová unpaid invoice nesmaže starší platné zaplacení; jiné event ID
  téže invoice nevytvoří další funding period.
- Cancellation před koncem, hranice `ends_at`, výpadek API/DB, expirovaný lease,
  zastaralý worker, restart inboxu a ztracený webhook. Reconciliation výsledek
  musí být stejný jako po bezchybném doručení.
- Refund aktuálního i starého funding payment, částečný refund, otevřený a
  vyřešený dispute; žádná reverzace nesouvisejícího období.
- SQL rollback suite i skutečný souběh; klienti nemají privátní přístup.
  Obyčejné entitlement readers stále nevrátí TEST VIP. Plné kontrolní otisky
  herních/subscription tabulek zůstanou stejné po odrolovaných fixturech.
- Vykreslené interní UI: výběr intervalu, roční součet 499 Kč, čekající webhook,
  retry, konflikt intervalu, odhlášení/přepnutí účtu a návrat z portálu.
  Při mountu ani úspěšném redirectu nevzniká nákup nebo grant.

Pozdější skutečný sandbox průchod ověří tento seznam znovu nad odpovídajícími
Stripe objekty, nikoli jen mocky. Přítomnost SDK nebo zelený build takový
průchod nenahrazuje.

## 6. Ověření v tomto kroku a součinnost vlastníka

Provedeno 12. listopadu 2026:

- policy + gateway: **24/24** testů prošlo;
  `node --import tsx --test server/lib/billingPolicy.test.ts server/lib/stripeTestGateway.test.ts`;
- klient: **11/11** prošlo;
  `node --import tsx --test src/lib/billingTest.test.ts`;
- `npm run lint` a `npm run build`: prošly; build hlásí warnings o Node
  deprecation, smíšeném importu Clerk lokalizací a velikosti chunku;
- `git diff --check`: prošlo; samostatná kontrola nového dokumentu přes
  `git diff --no-index --check` nehlásí whitespace chyby. Relativní odkazy
  v dokumentu míří na existující soubory.

Provider odpovědi v testech jsou mockované, podpis ověřuje skutečné Stripe SDK.
SQL suite se nyní nespouštěla; její úplný dřívější úspěch není doložen.
Hosted sandbox migrace zůstává podle předání neaplikovaná; nyní se hosted DB
nečetla ani neověřoval její aktuální migration list. Render UI, skutečná karta/
wallet, webhook delivery, Customer Portal a podepsaný Clerk E2E průchod zde
ověřeny nebyly. MCP account listing není důkaz funkčního backendového klíče.

**Pro další lokální source/mock blok není potřeba opakovat přihlášení ani
žádat o cenové rozhodnutí.** Před skutečným sandbox průchodem bude potřeba
ověřit dostupný serverový API klíč FanTip sandboxu lokálně bez vypsání hodnoty
a správný signing secret budoucího endpointu. Dnešní MCP Read přístup dovoluje
plánování/čtení; pro pozdější katalog/portal/webhook objekty musí být zvolen
konkrétní oprávněný způsob zápisu, například vlastník v Dashboardu nebo
odpovídající omezený backendový přístup. Dnes se oprávnění nemění.

Před prodejem vlastník doplní přesnou VIP lobby kvótu a konečný obsah nabídky,
prodejce a země/daňový režim, viditelné podmínky obnovy/zrušení/změny intervalu,
refund/dispute politiku a vzhled/kapacity po expiraci. Zůstávají také produkční
doména/Clerk, obchodní texty a komerční práva ke sportovním datům/fotografiím
uvedené v [billing kontraktu](billing-contract.md). Tyto otevřené body nebrání
lokální bezpečnostní práci, ale nelze je domýšlet jako přijatý finální prodej.

Změněný zdrojový soubor tohoto kroku: pouze
`docs/stripe-integration-plan-2026-11-12.md`. Žádný commit, push, merge, deploy,
nákup, live aktivace, normální VIP grant ani změna herních dat neproběhly.
Kontrola otisků původních rozpracovaných souborů zachytila navíc souběžnou změnu
MCP handoffu z jiného chatu; tento krok ji neupravoval ani nevracel. Ostatní
původní soubory včetně product-evolution-preview zůstaly podle otisků stejné.
