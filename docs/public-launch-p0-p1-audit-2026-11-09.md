# Fan Tipovačka — audit a plán P0/P1
Datum: 9. 11. 2026 · rozhodovací podklad, ne potvrzení připravenosti ke spuštění.

**Následný schválený posun9.11.:** tento audit zachycuje předchozí snapshot.
B01 má nyní lokálně ověřený dependency patch s npm audit0, bez vydání.
V DB je už nasazen Clerk-only resolver, staré native loginy/sessions odstraněné
a určený Clerk admin; herní historie zůstala zachovaná. Viz
[retirement výsledky](clerk-only-retirement-runbook-2026-11-09.md) a
[VIP/funnel návrh](vip-and-public-entry-proposal-2026-11-09.md).
Neznamená to uzavření všech P0 kontrol.

**Implementace 10.11.:** původní audit níže zůstává snapshotem. Nový veřejný
základ používá registry + stávající lobby/scoring; dvě migrace a tři rollback
sady jsou ověřené i v hostované vývojové DB. Frontend jazyky, brand a landing
jsou lokální, nevydané práce. [Aktuální důkazy a zbývající podmínky](public-entry-verification-2026-11-10.md).

## Závěr
**Funkční základ soukromého hraní existuje. Veřejný mezinárodní produkt s platbami ještě připravený není.** Největší zbývající práce není další sport ani animace: jsou to produkční identita a oprávnění, placené nároky, jedna bezpečná veřejná výzva, čtyřjazyčný průchod a provozní/právní minimum.

P0 znamená ověřenou cestu návštěvník → účet → správná soutěž → první tip → automatický výsledek, plus skutečně fungující placenou funkci. P1 zvyšuje počet lidí, kteří touto cestou projdou a vrátí se.

Tento audit nic neimplementuje. Vznikla dokumentace a snímky pro revizi; žádný commit, push, deploy ani zápis do databáze. Existující rozpracované změny a vlastníkovy preview soubory zůstaly zachované.

## Rozhodnutí a hranice
- **Potvrzeno vlastníkem 9. 11.: placené kosmetiky/VIP a rozšířené funkce správce už v P0.** Neodkládáme monetizaci automaticky do P1. Konkrétní produkty, cena a jednorázový/opakovaný model nejsou rozhodnuté.
- P0 jazyky **CS/EN/DE/PL**, P1 slovenština. Technický kód češtiny je `cs`, nikoli `cz`.
- Stálá lobby zůstává domovem party, hospody i tvůrce; roční UFC liga a jednotlivé karty zůstávají zachované.
- Požadavek P0.9 je **jedna bezplatná veřejná výzva bez cen**. Placené kosmetiky nedávají výhodu v bodování. Placené vstupy, sponzorované ceny a výplaty tvůrcům nejsou součástí tohoto plánu.
- Doporučení: Official Event použít jako systémovou veřejnou výzvu, nikoli druhý druh uživatelské komunity. Vyžaduje zapsání tohoto účelu a kompatibilní implementaci; dnešní flag se nezapíná.
- Jedna herní aplikace pro mobil/desktop/PWA. Landing je samostatný existující build, ne další jazyková aplikace.
- Pracujeme v jediném existujícím Supabase projektu; nevytváříme druhou beta databázi.

## Co bylo skutečně ověřeno
1. Read-only revize aplikace, serveru, migrací, dokumentace a existujících GitHub Issues; tři dílčí agenti pokryli produkt/funnel, brand/i18n a metriky/growth.
2. Read-only dotazy na hostovaná metadata a veřejné feature flags. Bez čtení hráčských tipů a bez write-mode testů.
3. Nové snímky lokální registrace CS/EN a landing. V lokálním demu kliknutím ověřen výběr vítěze + KO/TKO → vyhodnocení za 5 bodů. Jde o stav v paměti, nikoli hráčský tip.
4. Mobilní hero landing vizuálně zkontrolováno na 360/375/390/393/430 px; na 360/375/393/430 shodná šířka viewportu a dokumentu. Desktopový hero snímek 1280 px. **To není kompletní mobilní QA aplikace.**
5. Využit dnešní již dokončený částečný bezpečnostní scan a právně-technická rešerše. Neprováděl se další celý scan.
6. Přihlášené UI bylo v tomto náhledu nedostupné. Nová registrace, placení, celé lobby, přímé útokové scénáře, skutečný iOS/Android a obnova DB nebyly v této revizi provedeny. Historické úspěchy testů nejsou vydávané za dnešní runtime kontrolu.

Soukromá landing je publikovaná za ChatGPT bránou. Lokální brandovaný auth vstup dosud není vydaný na pracovní Netlify web. Snímek localhostu tedy nedokládá stav nasazeného webu.

## 1. Current-state audit

| Oblast | Co existuje a lze použít | Co zbývá / závislosti / riziko |
| --- | --- | --- |
| **P0.1 Brand — PARTIAL** | Paleta, fonty s licencemi a první brandkit; privátní landing; lokální nový auth. [Brandkit](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/docs/brandkit-v1.md:28), [AuthScreen](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/components/AuthScreen.tsx:4). | Vlastní geometrické logo chybí; aktuální pohár je Lucide. Hra uvnitř používá původní červené CTA. Chybí finální favicon/PWA/light-dark značka a rozhodnutí domény. Sjednotit akční barvy, zachovat význam chyb/výher/domácí-hosté. Snow na Coral/Azure není vhodný pro běžný drobný text. Světlá/tmavá varianta loga neznamená stavět celý dark mode. |
| **P0.2 Jazyky — PARTIAL** | Typované CS/EN katalogy, Intl a Clerk lokalizace. [i18n](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/i18n/index.ts:4), [Clerk](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/lib/clerkSession.tsx:27). | DE/PL chybějí i v profilovém kontraktu: [DB omezení](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/supabase/migrations/20261104095025_clerk_identity_bridge.sql:36). Rozšířit chyby, pravidla, checkout a právní informace, ne jen menu. Landing má jiné vlastní katalogy/routy. Nutná lidská revize DE/PL. Časy nyní vždy Europe/Prague: [matchTime](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/lib/matchTime.ts:2); jazyk není časová zóna. |
| **P0.3 Landing 2.0 — PARTIAL** | Textový směr a lokální demo existují; spodní demo používá 5/3/1/0. [LandingPage](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/sites/fan-tipovacka-landing/components/LandingPage.tsx:230). | Hero předvybírá vítěze/metodu a nemá vyhodnocení. Plné demo je níže; před kliknutím prozrazuje vzorový výsledek. Přesunout jeho logiku do jednoho hero, prázdný začátek, výsledek až po kliknutí, jasně ukázkové reakce. Nic neukládat. Rotující headline je požadovaný, ale doporučujeme odložit do P1. |
| **P0.4 Skutečné ukázky — TODO** | Reálné herní komponenty existují. [MmaFightCard](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/components/MmaFightCard.tsx:12) je dobrá prezentační hranice bez přímého DB přístupu. | Dnešní landing používá vlastní HTML ilustrace. Pro tip/pořadí/lobby použít skutečné UI s bezpečnými fixtures. [LobbyView](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/components/LobbyView.tsx:151) načítá DB při mountu; celý jej do landing neimportovat. Začít sanitizovanými snímky skutečného UI nebo malými čistými view; ne velkým monorepo refaktorem. |
| **P0.5 Mobile/PWA — PARTIAL** | Responzivní základ, manifest a ikony. Čerstvý hero smoke v pěti požadovaných šířkách neukázal horizontální přetečení. | Hra blokuje zoom: [index.html](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/index.html:5). Některé prvky mají 28/32/40 px: [LeaderboardScreen](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/components/LeaderboardScreen.tsx:77), [MmaFightCard](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/components/MmaFightCard.tsx:105). [Manifest](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/public/manifest.json:2) stále nese IIHF/MS2026. Chybí doložená instalace, aktualizace, session/deep link a offline chyba na reálném iOS/Android. |
| **P0.6 Bezpečnost — PARTIAL** | RLS je zapnuté na všech 25 hostovaných public tabulkách; existují RPC, auth a DB testy. Dnešní dílčí scan neměl nový potvrzený nález. [Kontrolní matice](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/docs/security-readiness-matrix.md). | Není to potvrzení bezpečnosti celého produktu. Zbývají runtime cross-lobby/role/revokace testy, Clerk production, legacy auth rozhodnutí, závislosti #26, limity přímých RPC, dohled a obnova. Rizikové jsou zvlášť nové veřejné a platební cesty. |
| **P0.6 Cookies/právo — PARTIAL / NEEDS DECISION** | Existuje zdrojový inventář technologií a seznam povinností; vlastní marketingový tracker nenalezen. [Právně-technická revize](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/docs/public-launch-security-privacy-legal-2026-11-09.md). | Nejsou schválené právní texty, seller identita, věková politika, retenční/výmazový proces ani kompletní runtime cookie inventář. Zvlášť řešit data/loga/fotky. Cookie lišta sama tyto mezery neřeší. Placený start přidává checkout/odstoupení/reklamace a daňový režim. |
| **P0 platby — TODO / BLOCKED rozhodnutími nabídky** | Starší katalog plánů a entitlements, pouze read RPC. [Entitlements foundation](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/supabase/migrations/018_entitlements_foundation.sql:4). | Checkout/webhook/refundy a vynucení nároků nejsou implementované. `subscriptions.user_id → auth.users` neodpovídá novým Clerk profilům. Osobní kosmetika a funkce vlastníka lobby potřebují odlišný rozsah nároků. Klient ani návratová URL nesmí udělit premium. |
| **P0.7 Měření — TODO, datový základ PARTIAL** | Tipy, členství a sdílecí akce existují; žádný jednotný měřicí kontrakt. [Uložení tipu](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/lib/db.ts:972), [MMA uložení](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/lib/mmaDb.ts:10). | Není propojený landing→app funnel, deduplikace událostí, test výluky ani baseline. `predictions.updated_at` mění i scoring cron: [self-healing](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/supabase/migrations/20261105151206_football_data_self_healing.sql:173). Nelze jej použít jako důkaz hráčova návratu. |
| **P0.8 Registrace/pozvánky — PARTIAL** | Clerk zachovává cestu/query, parser podporuje join link i kód a serverový join. [AuthScreen](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/components/AuthScreen.tsx:55), [sharing](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/lib/sharing.ts:23), [db](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/lib/db.ts:631). | Zachovat základ; doložit celý průchod nový/existující účet, OAuth, reload, pending/removed, chybný kód a zrušený login. Obecná landing zatím vede na registraci, ne rovnou veřejnou výzvu. |
| **P0.9 Veřejná výzva — BLOCKED** | V repozitáři existuje Official Event UI a starší migrace. [Foundation](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/supabase/migrations/020_official_events_foundation.sql:4), [OfficialEventView](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/components/OfficialEventView.tsx). | V aktuální DB chybějí Official tabulky/RPC i flagy; nelze jen přepnout přepínač. Staré identity/remízy a aktuální sync nejsou kompatibilní. Podrobnosti níže. |
| **P1.1 Více výzev — TODO** | Část admin/UI návrhu existuje. | Nejdřív bezpečně jedna výzva. Katalog, moderace a discovery nejsou důsledkem `Lobby.visibility=public`. Žádný třetí membership/scoring systém. |
| **P1.2 Sdílení — PARTIAL** | QR, native share, kopie linku a obrázku už jsou: [InviteShareDialog](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/components/InviteShareDialog.tsx:17), [sharing](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/lib/sharing.ts:168). | Lokalizovat/brandovat karty, bezpečné OG a odkazy na výsledek/odvetu. Dnes některé kreslené karty používají české texty a starou červenou. Soukromé join kódy nepatří do veřejných OG ani analytiky. |
| **P1.3 Marketing — PARTIAL podklady / TODO experiment** | Positioning, sportovní preference a landing brief jsou připravené. [Obsah webu](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/docs/website-content-manual.md). | Nejsou ověřené kanálové kohorty, schválené příspěvky a měřený experiment. Začít jedním trhem/sportem/komunitou; pravidla propagace ověřit těsně před postem. Nic automaticky nepublikovat. Bundesliga/ELH/IIHF nejsou automaticky spuštěné jen kvůli jazykové nabídce. |
| **P1.4 Retence — PARTIAL** | Přehled chybějících tipů podle konkrétní lobby a soutěže už existuje; stálé party a roční UFC také. [HomeDashboard](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/components/HomeDashboard.tsx:363), [souhrny](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/lib/homeDashboard.ts:215). | Neplánovat tento přehled znovu. Dobrovolné připomínky, výsledek/změna pořadí a nový event doplnit po měření návratu; žádný automatický marketingový souhlas po registraci. |
| **P1.5 Slovenština — TODO** | Použije rozšířenou P0 i18n architekturu. | Nezakládat samostatný build; lidská revize a stejný kompletní průchod jako ostatní jazyky. |

## 2. Gap analysis
Status je úroveň konkrétního požadavku, ne procento dokončení projektu.

| Status | Co sem dnes patří |
| --- | --- |
| **DONE** | Existující soukromé tipování a roční UFC v kódu; přehled nenatipovaných zápasů po lobby; základ CS/EN; QR/copy/native share; schválený paletový směr. DONE u zdroje neznamená dnešní kompletní runtime akceptaci. |
| **PARTIAL** | Brand celé cesty, lokalizace, auth/invite průchod, mobil/PWA, bezpečnostní kontrola, právní podklady, demo a sdílení. |
| **TODO** | Originální logo, skutečný showcase, DE/PL, platby, hráčská aktivita oddělená od cronu, přehled KPI, právní finální texty/procesy, nové P1 růstové mechanismy. |
| **BLOCKED** | Public Challenge na současném schema/sync kontraktu; platební realizace bez nabídky a správné identity; veřejný prodej bez seller/rights/legal uzavření. BLOCKED zde znamená závislost úkolu, ne nemožnost dál pracovat na auditu. |
| **NEEDS DECISION** | Seller, přesný obsah/rozsah placených balíků a platební model, doména, časová zóna zobrazení, první score-based veřejná výzva, věk a dostupné země pro nákup. |

## Zásadní nález: Official Event není hotová veřejná soutěž
Read-only metadata nynější DB:
- `official_events`, `official_event_participations`, `official_event_predictions`, `user_onboarding_state` nejsou nasazené; příslušné RPC také chybějí.
- `get_public_feature_flags()` nevrací `official_events_enabled` ani `onboarding_first_tip_enabled`. Klient u chybějícího flagu zůstane zavřený.
- Nasazené `sync_football_data_catalog` a `sync_hockey_catalog` obsahují explicitní odmítnutí Official Event scoringu. Source guard: [multi-league sync](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/supabase/migrations/20261105200636_multi_league_catalog.sql:182).

Před aktivací jsou nutné čtyři konkrétní opravy: identity/FK na interní Clerk profil; společná aktuální pravidla remíz a zámků; atomické vyhodnocení soukromých i Official tipů ve skutečně používaném syncu; přímý průchod z kampaně na první tip.

Staré migrace 020–023 nepouštět jako balík bez revize. Clerk bridge přepisoval jen tehdy existující funkce, ne budoucí instalaci Official RPC. Současné Official tipy mají FK na `matches` a skóre; **nejsou MMA formátem**. Pro první veřejnou výzvu doporučujeme existující fotbalovou soutěž, ideálně Premier League; jde o doporučení, ne změnu dříve zvolené soukromé CL priority. Pokud musí být první veřejná kampaň UFC, má tento blok větší rozsah.

## 3. Doporučené pořadí a podmínky spuštění
Podrobné samostatné bloky, soubory, testy a DoD jsou v [implementačním plánu](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/docs/public-launch-p0-p1-blocks-2026-11-09.md).

| Pořadí | Výsledek | Co může běžet souběžně |
| --- | --- | --- |
| **1. Uzavřít rizika a vstupy** | Dosah/opravy dependencies #26; produkční identita a permission matice; rozhodnutí nabídky/seller/licencí. | Originální značka a revize překladů bez změn auth/scoring. |
| **2. Zprovoznit placený základ** | Interní billing identita → testovací nákup → serverový nárok → použití → refund/expirace. Právní a daňové podklady běží od začátku. | Práva k účtu, zálohy/restore, monitoring a limity. |
| **3. Uvolnit veřejný vstup** | Jedna kompatibilní free/no-prize výzva; bezpečný direct link; registrace zachová kontext až do prvního tipu. | CS/EN/DE/PL napříč app/landing/checkout; metrický kontrakt. |
| **4. Dokončit veřejnou podobu** | Jedno hero demo, skutečné ukázky, společný brand, domény/SEO, mobil/PWA/a11y. | Minimální týdenní přehled a uzavření runtime cookies. |
| **5. P0 acceptance** | Cizí člověk projde všechny relevantní cesty, test nákup/refund, automatická oprava výsledku, export/výmaz, provozní incident/restore. Pak samostatná akceptace a vydání. | Žádná plošná kampaň před splněním této brány. |
| **6. P1 experiment** | Jedna komunita a dvě sportovní příležitosti → návrat → vlastní parta s3 hráči. Až podle výsledku rozšířit katalog, kanály a notifikace. | Překlady SK, share/OG a malé vizuální experimenty. |

Čtyři plné jazyky + placený start + veřejná výzva jsou významný rozsah. Plán neslibuje dokončení najednou ani termín bez uzavření rozhodnutí. Nedoporučujeme mezitím přidávat další sporty či app stores.

**Doporučený přesun P0 → P1:** rotující headline, další reakce/oslavy a bohatý analytický dashboard. Zachovat statický silný nadpis, jedno demo a jednoduchou tabulku KPI pro P0. Jde o návrh na zúžení, nikoli tichou změnu zadání. Pokud headline zůstane v P0, je nutné i ovládání pauzy/frekvence, stabilní přístupný text a žádný CLS; samotné reduced-motion nestačí. [W3C Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide).

## 4. Měření, které nebude lhát
**Navržený hlavní KPI A3/28:** počet soukromých lobby, v nichž za posledních28 dnů alespoň3 různé netestovací účty úspěšně uložily platný tip před zámkem ve stejné soutěži. Lobby počítat jednou, i když hraje víc soutěží. „3 účty“ není automaticky „3 lidé“; vlastníkovy alternativní účty vyloučit řízeným seznamem.

| Ukazatel | Definice a hranice |
| --- | --- |
| A3/7 | Stejný výpočet za7 dnů; provozní puls, ne hlavní soud nad UFC s nepravidelnými kartami. |
| Aktivace party | Nová soukromá lobby má do7 dnů3 tipující. Jen dozrálé kohorty s dostupnou otevřenou příležitostí; uvést jmenovatel. |
| Aktivace hráče | První backendem potvrzený tip; nikoli vytvořený účet, otevřená karta nebo stisk „uložit“. |
| Návrat | Tip při další nabídnuté příležitosti: fotbalové kolo/UFC karta. D7 doplňkově a s dostupností zápasů. |
| Veřejná výzva | Vstup → první Official tip → další kolo. Počítat zvlášť; její účastníci nesmějí nafouknout soukromé A3. |
| Pozvánky | „Odkaz zkopírován“ / „share sheet dokončen/zrušen“; nelze pravdivě nazvat odesláním/doručením. Přijetí = potvrzené členství; pending approval je jiný stav. |

Minimální události: `landing_view`, CTA s účelem, `account_ready`, `lobby_created`, potvrzené `lobby_joined`, potvrzený tip, kopie pozvánky, dokončené/zrušené share UI; checkout události odděleně a potvrzená platba pouze serverově.

Serverová aktivita hráče se musí oddělit od scoringu. `updated_at` dnes přepisuje cron; `created_at` zachytí první řádek tipu, nikoli úplnou historii návratů. Retry deduplikovat, odmítnutý tip nepočítat jako úspěch, později zrušený duel nevymaže fakt dřívější aktivity.

UTM jen z povolených veřejných identifikátorů. Nikdy celé query/referrery, join kódy, tokeny, e-maily, bio či platební údaje. Nepovinné měření podle posouzeného souhlasu/právního titulu; „cookieless“ samo nezaručuje výjimku. Propojení dvou domén není automatické. Report uvádí změřenou část provozu a výluky, ne vymyšlený celkový funnel.

## 5. Quick wins
Tyto položky mají malý rozsah; stále jde o návrhy pro schválený implementační blok.
- Povolit zoom a opravit historický title/manifest; nový symbol navázat na dokončené logo.
- Schovat technický údaj „Přihlášení: Clerk“ do podpůrných informací; hráči nabízet srozumitelnou správu účtu. Bez změny identity.
- Doplnit požadovaný kredit football-data; samotný kredit nevyřeší práva k logům.
- Sjednotit CTA barvy přes tokeny a kontrast, bez přebarvení významových domácí/hosté/chyba/úspěch.
- Přesunout existující plné demo do hero, odstranit předvolbu a předčasné prozrazení výsledku. Nové bodování není třeba.
- Využít dnešní QR a chybějící tipy podle lobby; nepřepisovat je.
- Nejprve prostá týdenní tabulka A3/aktivace/návratu, později dashboard.

## 6. Kritická rizika
1. **Falešný pocit připravenosti.** RLS=true,0 scan nálezů, passing build a soukromá landing nedokládají veřejnou bezpečnost ani celý funkční funnel.
2. **Veřejná výzva může zastavit sync.** Nejprve kompatibilní schema/scoring, teprve potom účastníci a flag.
3. **Platby nemají hotovou datovou ani provozní cestu.** Starý katalog není checkout ani inventář trvale vlastněných kosmetik.
4. **Licence při prodeji.** Komerční oprávnění pro NHL zdroj/znaky není doložené; loga/fotografie mají vlastní práva. Nevyřešený zdroj lze pro public release vypnout nebo nahradit právně použitelným, nikoli považovat funkční API za licenci.
5. **Čtyři jazyky mohou zakrýt chyby pravidel/checkoutu.** Překládat aktuální kontrakt; neměnit zámky, UTC ani scoring jako vedlejší efekt.
6. **Špatná aktivita v datech.** Cron může vytvořit falešnou retenci, veřejná mega-výzva falešné A3 a dvojité účty falešné lidi.
7. **Ztráta kontextu registrace.** Reklama slíbí event, ale hráč skončí bez něj na Home; právě zde měření/UX musí rozlišovat tři vstupy.
8. **Rozpracované verze se liší.** Lokální auth, hlavní Netlify a soukromá Sites landing nejsou jediný nasazený celek; release musí mít doložené verze a rollback.

Právní dokumenty budou **návrhy k odborné kontrole**, ne právně schválené materiály. Neopakovat celý bezpečnostní scan při každém UI patchi; nové oprávnění/platby/sync mají cílenou revizi, finální celek nezávislou kontrolu.

## 7. První doporučený úkol
**B01 — uzavřít dosah a minimální opravy dependencies v existujícím [Issue26](https://github.com/L4Nci/tipovacka-zurich/issues/26).**

Proč první: máme konkrétní neuzavřený inventář critical/high advisories a čeká nás registrace/platby. Úkol nečeká na cenu, logo ani sport; zabrání stavění nových citlivých cest na nevyhodnoceném základu. Registry severity sama neznamená zranitelnost nasazené aplikace.

Přesně: rozlišit browser/server/build-only a dosažitelnost, zvolit nejmenší kompatibilní opravy; změny omezit na package manifest/lock a nutné konfigurační úpravy. Žádné `npm audit fix --force`, žádná změna DB, bodování ani providerů. Pokud je potřebná větší migrace stacku, oddělit ji a doložit důvod.

Ověření: cílené testy dotčené auth/provider cesty, typecheck, oba relevantní buildy, lokální smoke a opakovaný dependency audit; zbylé advisories mají jasné odůvodnění/dosah. Po schválení samostatný reviewovatelný patch. Poté B02 oprávnění/produkční identita; souběžně vlastník uzavře nabídku a seller údaje.

## Rozdělení práce a režim
- **Já:** rozdělit schválený blok, implementace, cílené testy, zdokumentovat výsledek a limity; bez automatického vydání.
- **1 bezpečnost/backend agent:** identity/RLS/API/platby, bez souběžných schema editací s jiným agentem.
- **1 frontend/i18n agent:** brand, přístupnost, skutečné ukázky, čtyři jazyky. Překládá stabilní kontrakt.
- **1 QA/growth agent podle fáze:** nezávislá kontrola hotového bloku nebo metriky/komunitní experiment; nezakládat zároveň mnoho agentů na stejnou věc.
- **Viktor:** seller+kontakt, konkrétní placená nabídka (komu patří nárok, trvalá kosmetika nebo VIP, jednorázově/předplatné), doména, věková/zemská politika, volba veřejné výzvy a časové zóny; reálný Safari/iPhone/Android test a akceptace.
- **Externě:** český právník pro placenou digitální službu a licence; účetní pro doklady/DPH/země prodeje; rodilá DE/PL korektura. Před větší kampaní nezávislé cílené testování oprávnění a plateb. Logo může vzniknout interně, designer je volitelný.

Používat existující skills cíleně: Security scan/diff/validated-fix podle úkolu, Supabase pro DB, Stripe až při zvoleném provideru, frontend testing/React pro UI, Product Design audit pro průchody, Data design-kpis pro měření, Sites pro existující landing. Není potřeba instalovat balík neznámých „Claude skills“.

**Pracovní cyklus:** schválit jeden scope → malý patch → cílené testy + nezávislá kontrola → vlastník vyzkouší → samostatné vydání po souhlasu. V tuto chvíli se předkládá audit a návrh, nikoli žádost o blanketní souhlas se všemi bloky.

## Čerstvé vizuální důkazy
1. [Registrace EN,390px](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/docs/audits/public-launch-2026-11-09/01-auth-en.png).
2. [Registrace CS,390px](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/docs/audits/public-launch-2026-11-09/02-auth-cs.png): část placeholderu a dodavatelské texty zůstávají anglicky; produkční Clerk konfigurace ještě není ověřená.
3. [Landing desktop](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/docs/audits/public-launch-2026-11-09/03-landing-hero.png).
4. [Landing mobil,390px](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/docs/audits/public-launch-2026-11-09/04-landing-mobile.png): CTA viditelné před ukázkou; demo je níž a hero má předvolbu.
5. [Vyhodnocení místního dema](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/docs/audits/public-launch-2026-11-09/05-demo-evaluated.png): potvrzená funkční větev5 bodů, ostatní větve dnes runtime neprocházené.

PWA ověřovat instalací a použitím, ne pouhou přítomností manifestu. Nenalezený service worker sám neznamená univerzální zákaz instalace. [MDN installability](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
