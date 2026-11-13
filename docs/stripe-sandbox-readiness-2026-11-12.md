# FANTIP billing — implementace a aktivace, 12. listopadu 2026

Platební balík je implementovaný a jeho vymezená část je nasazená, s reálně
ověřenou sandbox platbou, refundem a doručeným webhookem. TEST běží pouze pro
interní allowlist. **Ostrý prodej ani běžné VIP nejsou aktivní.**
Tento záznam navazuje na [schválený kontrakt](billing-contract.md) a nahrazuje
stav implementace popsaný v [původním plánu](stripe-integration-plan-2026-11-12.md).
Neznamená dokončení P0/P1 ani přijetí placených funkcí vlastníkem.

## Co existuje

- Společný Stripe SDK engine, dvě pevně oddělené továrny TEST/Live a oddělené
  RPC/privátní ledger porty. TEST je svázaný s FanTip sandbox účtem
  `acct_1UQsnbC66ykHzmj6`; Live tuto hodnotu i testovací klíče odmítá.
- Jeden osobní `fan_vip`, 49 Kč měsíčně / 499 Kč ročně. První vlastní lobby a
  pozvaní hráči zůstávají zdarma. Žádná členská paywall hranice, Connect,
  samostatný skin produkt ani sportovní výhoda nevznikly.
- Hosted Checkout s pevnými Product/Price IDs, quantity 1 a flexible Billing;
  explicitně omezený Customer Portal. Buyer UUID bere HTTP server z ověřené
  Clerk session, nikoli z requestu. Return URL i nabídku určuje server.
- Durable customer/checkout idempotence, zotavení z nejasného provider výsledku,
  kanonické převzetí i již dokončené Session bez URL, odmítnutí nejasnosti po
  ochranné 23hodinové hranici místo vytvoření druhého nákupu.
- Samostatné financované období pro každou ověřenou invoice/line/payment/charge.
  Nezaplacená nová faktura nesmaže dříve zaplacené období. Expirace se počítá při
  čtení serverovým časem, včetně přesné horní hranice.
- Plný refund nebo kanonicky doložený plný prohraný spor zneplatní jen své
  financované období. Jediný přesně navázaný uzavřený spor `won` znovu dovolí
  ověřit původní platbu; samotný `charge.disputed` není konečný výsledek.
  Otevřené, částečné, vícenásobné a nejednoznačné spory zůstávají k revizi.
  Adaptér neposílá důkazy, neuzavírá spor ani automaticky nevrací peníze.
- Raw-byte webhook v Express před JSON parserem i Netlify/base64. Ověření
  podpisu a režimu, durable inbox včetně zatím nespárovaných událostí a PI-only
  refundů, event dedup, buyer lease/verze, fenced transakční dokončení a retry.
- Oddělený omezený recovery průchod pro inbox a pro ztracené webhooky, včetně
  rezervací bez uložené Session. Netlify má nasazené rozvrhy po 10 minutách;
  autorizovaný HTTP recovery průchod v nasazení prošel, skutečný naplánovaný
  běh zatím není doložený. Každý běh má
  malý limit práce kvůli časovému limitu scheduled funkcí; nejde o slíbené SLA.
- DB rate limity na kupujícího, interní tester allowlist, žádná platební akce
  při mountu. Samostatné `/billing-test.html` a `/billing.html`; hlavní App
  navigace, product-evolution-preview a herní výpočty se v této větvi neměnily.

Připravené HTTP cesty jsou `/api/billing/{test|live}/{checkout,status,portal,
webhook,reconcile}`; Live navíc poskytuje přihlášenému kupujícímu `offer`.
Express a Netlify volají stejný handler. `reconcile` vyžaduje vlastní bearer
secret; hráčský token jej nenahrazuje. Veřejné i interní UI/runtime gates jsou
pro Live **false**; interní TEST runtime gate je v Netlify zapnutý. Live body
vyžaduje také přesnou `acceptedOfferVersion`.

Příslušné platformní podklady:
[Stripe webhooky](https://docs.stripe.com/webhooks),
[idempotency](https://docs.stripe.com/api/idempotent_requests),
[Customer Portal](https://docs.stripe.com/customer-management/integrate-customer-portal),
[životní cyklus sporů](https://docs.stripe.com/disputes/how-disputes-work),
[kanonické navázání sporů](https://docs.stripe.com/disputes/api),
[Netlify scheduled functions](https://docs.netlify.com/build/functions/scheduled-functions/).
Obnovování předplatného obstarává Billing; recovery nepředstavuje vlastní
inkasní smyčku.

## Skutečné externí změny a důkazy

MCP planner byl v tomto chatu skutečně použit a přijal hosted větev, viz plán.
Pozdější Stripe MCP volání začala vracet `Authentication required`. OAuth,
keychain ani globální MCP konfigurace se neobcházely nebo nečetly. Pokračoval
oficiální SDK s odděleným již přítomným backendovým klíčem, jehož účet byl
ověřen jako přesný FanTip sandbox. Instalace ani přihlášení se neopakovaly.

V sandboxu vznikl katalog:

| Objekt | ID |
| --- | --- |
| Fan VIP Product | `prod_FanTipVipV1` |
| 49 Kč / month | `price_1Uazo3C66ykHzmj6Tb7JYwuo` |
| 499 Kč / year | `price_1Uazo3C66ykHzmj6ModO04Sq` |
| Omezený Portal | `bpc_1Uazo4C66ykHzmj6TdQy1iw0` |

Opakovatelné `scripts/stripe-sandbox-setup.mjs` bez `--apply` pouze čte.
S `--apply` je stále pevně omezené na tento sandbox, existující objekty dohledá
a odmítá konfliktní katalog. Nevytváří Live objekty, zákazníky ani platby.
Do ignorovaného lokálního `.env` byly přidány katalogové IDs, allowlist dříve
schváleného Clerk vlastníka a serverové TEST hodnoty. Potřebná konfigurace byla
poté importována do Netlify jako server-only prostředí. Hodnoty klíčů se
nevypisovaly ani nekopírovaly do repozitáře.

Skutečný sandbox smoke použil právě tento dříve schválený profil s aktivní
Clerk identitou; historický admin bez této identity byl vyloučen. Přes skutečné
serverové moduly a hosted TEST RPC vznikl jeden testovací Customer a Checkout.
Browser ověřil `livemode=false`, CZK4900 a banner Sandbox. Veřejná testovací
karta Stripe a fiktivní kontaktní údaje dokončily simulovanou platbu. Server
načetl a propojil kanonickou fakturu, InvoicePayment, PaymentIntent a captured
Charge; výsledkem bylo **TEST paid do 12.12.2026 17:45:59 UTC**.

Tento průchod odhalil skutečný Endive rozdíl: legacy `line.subscription` je
nullable, autoritativní vazba leží v
`line.parent.subscription_item_details.subscription`. Adaptér nyní vyžaduje
tento kanonický parent a odmítá konfliktní starý pointer. Regresní test používá
nullable staré pole. Nešlo o uvolnění buyer/price/period kontrol.

Skutečné zastavení obnovy na konci období zachovalo TEST paid-through access.
Poté uspěl plný sandbox refund CZK4900 a testovací subscription byla zrušena,
aby se dále neobnovovala. Finální soukromý funding má stav refunded; běžné VIP
nevzniklo. Závěrečné čtení skutečného service DTO potvrdilo `state=refunded`,
`paidUntil=null`, `renewalStopped=true`.
Čerstvá Portal session se vykreslila s označením Sandbox, testovací
Visa4242 a historií faktury. Předchozí krátkodobá session správně expirovala;
server vytváří čerstvý odkaz při každé management akci.

**Tohle není skutečná tržba, náklad nebo live zákazník.** Customer/subscription/
invoice/event IDs a session URLs se do tohoto dokumentu neexportují.
Produkční Clerk přihlášení tím ještě ověřeno není. Smoke volal moduly pro
vybraného vlastníka přímo; nenahrazuje skutečný signed-session HTTP průchod.
Skutečné doručení webhooku do nasazené Netlify funkce je doložené níže.

## Databáze a vypnutá Live příprava

TEST kandidát `20261110195526_billing_test_sandbox.sql` je v existujícím projektu
aplikovaný přes MCP jako hosted migration **`20261112152311 billing_test_sandbox`**.
Je to mapování zdrojového kandidáta na remote verzi, ne dva odlišné apply.
Nepouštět celý historický migration adresář ani jej slepě znovu neaplikovat.

Před apply byly uloženy definice/ACL subscriptions/readers a agregované otisky
běžných tabulek, bez exportu hráčských řádků. Hosted privátní rollback smoke
ověřil ACL, rezervaci, převzetí completed Session bez URL a opětovné zpracování
po uvolnění lease. Rozsáhlý hosted TEST suite nemá úspěšný výsledek: potvrzení
prvního pokusu expirovalo. Úplný suite prošel lokálně; nepřeznačovat jej za
úspěšný hosted běh.

Hosted postflight: **15 profiles, 1039 predictions, 0 běžných subscriptions**,
1 TEST customer a 1 refunded TEST funding. Žádný TEST RPC není spustitelný pro
anon/authenticated, service role přístup má. Obsahové otisky profiles,
predictions, subscriptions, plans, entitlements, plan_entitlements a lobby_members
zůstaly stejné. Otisk matches se mezitím změnil: jedna změna měla doloženou
provenanci `nhl-web` v 17:15:35 UTC. Jde o souběžný poskytovatelský sync; billing
moduly ani jejich persistentní SQL nemají zápis do matches/points/predictions.

Live schema se generuje z téže ledger logiky:

```sh
npm run billing:check-generated
node scripts/generate-billing-live-schema.mjs
```

Zdroj Live-only delta je `supabase/templates/billing_live_projection.sql`;
výsledkem je `20261112101432_billing_live_preparation.sql`. Generátor mění
namespace, mode a Session prefix a připojuje atomickou Live projekci; nejsou
udržované dvě ručně odlišné platební implementace.

Live delta přidává žádný seed nabídky ani grant. Má přijatý neměnný offer
kontrakt, samostatný enable flag, admission přesného intentu ještě před
Checkoutem a jedinečnou source vazbu grant → funding invoice/line. Dokončení
události a projekce do konečného `stripe_live` subscription intervalu jsou
jedna transakce. TEST fakta nesplní Live mode constraint. Deferred source
trigger brání i přímému osamocenému `stripe_live` grantu bez admitted financování.
Zastavení nových admissions neodebere zaplacené období a neblokuje opožděnou
první úhradu ani obnovu již admitted předplatného. Refund/review zasáhne jen
dotčený funding period, ne jinou samostatně zaplacenou fakturu.

**Historie z 12. listopadu: hosted Live apply byl blokovaný.** Automatická kontrola odmítla trvalou aplikaci
Live schématu, protože zahrnuje nové omezení a deferred trigger na běžných
subscriptions a souhlas s přípravou nepovažovala za dostatečně výslovný pro tuto
schema/security změnu. Neproběhl alternativní apply ani obcházení zamítnutí.
Historický postflight potvrdil, že `billing_live_private` tehdy neexistovalo.
Vlastník 13. listopadu migraci výslovně schválil a následně dal pokyn
„proveď“. Po opravě Live inbox mode defaultu a opakovaném lokálním rollback
testu byla aplikována ve stávajícím Supabase projektu jako hosted verze
`20261113085132 billing_live_preparation`. Po aplikaci je offer/policy 0,
grantů 0 a běžných subscriptions 0. Všechny soukromé Live tabulky mají RLS,
anon/authenticated nemají Live RPC oprávnění a otisky profiles, predictions,
plans, plan_entitlements a subscriptions se nezměnily. Hosted smoke odmítl
TEST event, uložil Live mode a skončil ROLLBACK bez trvalých událostí.

FanTip sandbox webhook endpoint `we_1UbGMYC66ykHzmj6cySVhlDA` je zapnutý
na `/api/billing/test/webhook` se snapshot API `2026-10-28.endive` a přesně
vybranými eventy. Signing secret je jen v ignorovaném `.env` a privátním
dočasném souboru a v serverovém Netlify prostředí; žádný veřejný asset jej
neobsahuje. Podepsaný replay skutečné události v publikované route prošel HTTP
200 a durable inbox ji dokončil jedním pokusem. Následující nová sandbox událost
`refund.updated` byla doručena přímo Stripe; provider hlásil
`pending_webhooks=0`, inbox dokončení jedním pokusem bez chyby. První doručení
odhalilo, že Endive Refund snapshot nemá `object.livemode`; adaptér nyní pro
Refund přijímá chybějící pole při zachování kontroly podpisu, accountu a mode
na eventu i kanonickém Charge. Chybné Refund mode a chybějící invoice mode
regresní test odmítá.

Izolovaný billing release se skládá nad skutečně publikovaným commitem
`d2e1bc644872d6484589e3dd32c2f165ce1a04f0`. Jeho 27 veřejných souborů
je převzatých a ověřených proti publikovaným SHA-1 otiskům; navíc jsou
připravené samostatné billing stránky/assets a nové billing funkce. Jedinou
změnou společných závislostí je Stripe SDK `23.1.0`. Stav rozpracované hlavní
aplikace se do tohoto release balíku nekopíruje. Veřejné assety prošly
kontrolou proti lokálním serverovým secret hodnotám bez nálezu. Všech 12 funkcí
včetně 4 billing funkcí se lokálně zabalilo. Přesný seznam a SHA-256 balíků je
v `/private/tmp/fantip-billing-20261113/release-review-manifest.json`.

**Aktuální nasazení 13. listopadu:** po obnovení limitu prošel import Netlify
prostředí a izolovaný billing release. Publikovaný deploy je
`6af6f29b6ff8ff48500fde06`. Původních 27 veřejných souborů včetně root
`index.html` má shodné otisky s dříve publikovanou verzí. TEST je povolen jen
pro dříve určeného vlastníka v serverovém allowlistu; nepřihlášený status,
checkout a portal vrací 401, chybný podpis webhooku 400 a Live offer 404.
Webhook skutečně dorazil a dokončil se. Autorizovaný TEST reconcile endpoint
vrátil HTTP 200 s nulovou frontou (`processed=0`, `retrying=0`); jeho serverový
secret se nevypisoval. Následný nákup přes produkční přihlášenou Clerk session
potvrzují snímek vlastníka a hosted TEST ledger níže. Skutečné spuštění
scheduleru čeká na ověření.
Live processing, checkout i veřejný rollout zůstávají vypnuté. Zdrojové změny
nebyly commitnuty, pushnuty ani mergnuty.

**Následný signed-session TEST, 13. listopadu 13:44 CET:** vlastník poslal
snímek publikované stránky po přihlášení a testovací úhradě. UI hlásí
„Simulovaná úhrada potvrzena“ a období do 13. prosince 13:43. Read-only hosted
kontrola v 12:45 UTC našla za poslední dvě hodiny jeden nový dokončený TEST
Checkout, jedno zaplacené TEST funding období, osm dokončených webhook událostí
bez selhání a **nula běžných subscriptions**. To potvrzuje produktový HTTP
průchod přes přihlášeného kupujícího a oddělení TEST od skutečného VIP.
Samostatný automatický renewal nebo scheduled invocation tím prokázán není.

## Rozdělení práce a TODO — 13. listopadu 2026

Vlastník požádal nejprve o rozdělení práce bez jejího provádění. Následující
zápis zachycuje jeho odpovědi; v tomto kroku se mění pouze dokumentace.

| Bod | Stav / rozhodnutí vlastníka | Kdo dokončí |
| --- | --- | --- |
| 1. Live migrace | Schválena a 13. listopadu aplikována; vypnutá, bez offer/grantů. | Agent: preflight, aplikace a postflight dokončeny. |
| 2. VIP nabídka | Návrh **5 vlastních lobby** (odpověď „5?“), finální kvóta dosud nepotvrzena. Ceny 49 Kč měsíčně / 499 Kč ročně jsou již přijaté. | Vlastník: finální kvóta a nabídka. Agent: návrh textů, konfigurace a návaznost na přijaté funkce produktové větve. |
| 3. Prodejce / daně | **TODO vlastníka:** OSVČ versus s.r.o. zůstává otevřené; IČ doplní až po rozhodnutí. Existující osobní IČ neznamená výběr prodejce. Daňový režim neuzavřen. | Vlastník: volba subjektu, údaje a potvrzení daňového režimu s účetní. Agent: technické nastavení podle výsledku. |
| 4. Doména / identita | **TODO vlastníka:** připraví doménu, výběr dosud neuzavřen. | Vlastník: doména. Agent: propojení, Clerk issuer/origins a návratové adresy. |
| 5. Sandbox HTTP | Vlastník souhlasí s dokončením ověření. | Agent: konfigurace a průchod; vlastník případně provede své přihlášení. |
| 6. Nasazení | Vlastník souhlasí s billing nasazením s vypnutým prodejem; není to souhlas s vydáním nesouvisejících rozpracovaných změn. | Agent: vymezený billing release, skutečné webhooky, replay a recovery ověření. |
| 7. Ostrý Stripe | Vlastník bere na vědomí svou část onboardingu; dokončení nebylo hlášeno. | Vlastník: identita, bankovní údaje a přijetí podmínek zvoleného prodejce. Agent: katalog a technické propojení. |
| 8. Aktivace | Vlastník chápe postup; **pokyn zapnout prodej nezazněl**. | Agent: příprava přijaté konfigurace a kontrol. Vlastník: finální pokyn k aktivaci. |

Draft JSON nadále obsahuje `ownedLobbyQuota=null`, prázdného prodejce/doménu
a `taxModel=unresolved`. Návrh pěti lobby se nevydává za přijatý kontrakt.

## Co je nutné před aktivací

1. **Splněno 13. listopadu:** schválený hosted Live apply proběhl po aktuálním
   schema/ACL a aggregate preflight ve stejném projektu, bez beta DB.
2. Dokončit a přijmout implementované placené funkce v produktové větvi. Vyplnit
   přesnou VIP lobby kvótu, capability mapování, prodejce, viditelnou nabídku,
   obnovu/zrušení/refund/appearance podmínky a příslušné zveřejněné URL.
   [Draft šablona](billing-live-offer.template.json) je úmyslně neplatná;
   neobsahuje vymyšleného prodejce, kvótu, souhlas nebo daňový režim.
3. Vyřešit finální daňový režim se skutečným prodejcem. Adaptér nyní podporuje
   pouze přesnou nabídku bez tax/slev/prorací (`taxModel=no_tax`). Toto není
   posouzení daňových povinností. Pokud je potřeba VAT/Stripe Tax, vyžaduje to
   samostatné doplnění a testy adaptéru; nelze jen zapnout `automatic_tax`.
4. Potvrdit produkční doménu a Clerk issuer/authorized origins; zachovat nebo
   výslovně migrovat stejný interní player UUID. Žádné přiřazení podle shody
   e-mailu, obnovení native loginu nebo změna herních rolí.
5. **Splněno 13. listopadu:** vlastník prošel sandbox HTTP nákup přes
   přihlášenou Clerk session na publikovaném `/billing-test.html`; snímek a
   hosted ledger potvrzují dokončený TEST Checkout a financované období.
6. **Billing release nasazen:** snapshot endpoint s API `2026-10-28.endive`,
   vybranými eventy a vlastním podpisovým klíčem skutečně přijímá události.
   Replay, raw body a základní odmítnutí neautorizovaných/mode požadavků prošly.
   Autorizovaný HTTP recovery průchod v nasazeném prostředí prošel s prázdnou
   frontou; ještě doložit naplánovaný běh. Nepřipojit
   thin payload k snapshot handleru.
7. Pro Live zvlášť ověřit správný merchant účet, live Product/dvě Prices a
   omezenou Portal konfiguraci, seller onboarding a bankovní/obchodní náležitosti.
   Žádný Live objekt ani klíč nebyl v této práci použit nebo vytvořen. Sandbox
   IDs/klíče se nepřenášejí do Live.
8. Přijatý JSON kontrakt uložit do serverového `BILLING_LIVE_OFFER_CONTRACT` a
   přes service-only `billing_live_accept_activation` zaregistrovat shodný
   kontrakt v DB; vznikne disabled. `plans/plan_entitlements` musí odpovídat
   přesně přijatým, implementovaným capabilities. Teprve konečný owner release
   může volat `billing_live_set_activation` a zapnout samostatné checkout/UI
   gates. Klíče zůstávají server-only v lokálním/Netlify secret nastavení.

`BILLING_LIVE_ENABLED` znamená processing; `BILLING_LIVE_CHECKOUT_ENABLED`
znamená nové nákupy. Po spuštění se při pozastavení prodeje vypíná checkout,
nikoli webhook/recovery servicing již platících hráčů. Veřejný rollout je zvlášť
`BILLING_LIVE_PUBLIC_CHECKOUT_ENABLED`; před ním zůstává serverový allowlist.
Nezapínat roční/měsíční změny, trialy nebo slevy mimo přijatou první nabídku.

## Ověření a změněné soubory

| Ověření | Výsledek |
| --- | --- |
| Billing Node suite | 102 testů, včetně skutečného SDK HMAC, mock TEST/Live, uzavřených i nejednoznačných sporů, Endive Refund regresního testu a HTTP/raw-body kontraktů |
| Env / Clerk | 17 + 17 testů a tournament-winner Clerk scénáře prošly |
| Lokální TEST SQL suite | Kompletní, konečný ROLLBACK |
| Lokální Live SQL suite | Syntetické Live facts, TEST odmítnutí, admission/pause/refund/source/finite expiry, konečný ROLLBACK |
| Nezávislá DB připojení | 4 souběhové kontroly prošly, fixtures uklizeny, běžné lokální otisky obnoveny |
| Hosted TEST | Aplikované privátní schéma + menší rollback smoke + skutečný module/API payment/refund průchod; následně owner signed-session HTTP Checkout, zaplacené TEST období a osm dokončených webhooků |
| Hosted Live | Aplikované jako `20261113085132`; nulové offer/granty/subscriptions, bez veřejných RPC práv; rollback smoke prošel |
| Sandbox webhook endpoint | Zapnutý ve FanTip sandboxu, snapshot API Endive; podepsaný replay a nové skutečné provider doručení dokončeny |
| Nasazený TEST recovery HTTP | Autorizovaný reconcile vrátil HTTP 200, prázdná fronta a žádná chyba; scheduled invocation zatím nedoložena |
| Izolovaný release | Deploy `6af6f29b6ff8ff48500fde06`, 27 zachovaných veřejných souborů s ověřenými otisky a 17 nových billing assetů; TEST interní, Live vypnuto |
| Funkce release balíku | 12 lokálních ZIPů včetně 4 billing funkcí, ověřené SHA-256 v privátním manifestu |
| UI | Syntetické desktop1280 a mobile390, nabídka/roční součet/consent/conflict/status/account switch/default-off, bez console errors/overlays |
| Stripe UI | Skutečný hosted sandbox Checkout, testovací karta, návrat a čerstvý Portal ověřeny |
| Build / TS | `npm run lint`, normální build i samostatný build obou zapnutých UI větví prošly |
| Secrets | 66 veřejných assetů obou buildů zkontrolováno proti skutečným serverovým hodnotám; žádný nález |
| Whitespace / generátor | `git diff --check`, `billing:check-generated` |

Build má známé warnings o Node `module.register`, smíšeném importu Clerk
lokalizací a velikosti chunku. Nejsou schované jako úspěšný runtime test.
Automatický reálný renewal v čase, Google Pay/Apple Pay autorizace, SCA selhání,
skutečný scheduled recovery běh zůstává samostatné ověření. Apple Pay tlačítko
bylo viditelné; wallet transakce neproběhla.
Dispute scénáře jsou ověřené syntetickými kanonickými odpověďmi, skutečný spor
v sandboxu nevznikl. Částečné refundy a nejednoznačné spory nejsou automaticky
rozhodovaná obchodní politika.
DE/PL/SK copy nadále vyžaduje člověka; obchodní texty se neodvozují z překladů UI.

Soubory této větve, nad rámec předchozích rozpracovaných změn:

- Wiring/config: `.env.example`, `package.json`, `vite.config.ts`, `server.ts`,
  `netlify.toml`, `billing-test.html`, `billing.html`.
- Backend: `server/lib/stripeTestGateway.ts` a test; `billingTestStore.ts` a
  test; nové `billingTestConfig.ts`, `billingLiveConfig.ts`,
  `billingLiveActivation.ts` a test, `billingTestService.ts` a test,
  `billingTestHttp.ts` a test a `billingTestRoutes.ts`.
- Netlify: `billing-test.ts`, `billing-test-scheduled.ts`, `billing-live.ts`,
  `billing-live-scheduled.ts` v `netlify/functions`.
- Frontend: `src/lib/billingTest.ts` a test; `BillingTestScreen.tsx/.css`,
  nový `BillingLiveScreen.tsx`, `src/billingTestEntry.tsx`, `src/billingEntry.tsx`.
- SQL: TEST kandidát/suite, generovaná Live migrace/suite a Live-only template
  v cestách uvedených výše.
- Nástroje: `scripts/billing-test-concurrency.mjs`,
  `generate-billing-live-schema.mjs`, `stripe-sandbox-setup.mjs`,
  `billing-preflight.ts`.
- Dokumenty: tento záznam, draft offer JSON a aktualizované billing/handoff
  odkazy. Změny skórování, login kompatibility, datových providerů nebo dashboardu
  nejsou součástí billing větve.

Kontrolní příkazy:

```sh
npm run test:billing
npm run billing:check-generated
npm run billing:sandbox-setup
npm run billing:preflight
npm run billing:preflight -- --live
npm run lint
npm run build
git diff --check
```

Preflight je read-only/offline a při chybějící konfiguraci vrací exit1. Není to
neúspěšný payment test ani pokyn doplnit tajný údaj do výstupu. Skutečný apply,
akceptace Live nabídky a finální aktivace prodeje jsou samostatné kroky.

Lokální QA/zálohy bez klíčů jsou v
`/private/tmp/fantip-billing-local-20261112/`: schema metadata/otisky, lokální
schema-only backupy, rollback wrappers a UI screenshoty. Vymezený billing deploy
proběhl; žádný commit, push, merge, skutečné inkaso ani běžný VIP grant neproběhl.
