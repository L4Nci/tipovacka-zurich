# Tipovačka — plán další verze

Verze 1.0 · 5. 11. 2026 · otevřený průběžný test Ligy mistrů 2026/27 bez limitu tří kol.

**Upřesnění vlastníka — 6. 11. 2026:** před kampaní MS už má běžet plný
produkt; kampaň je hlavně marketing, ukázky a polish. Stálá lobby může sloužit
YouTube komunitě s opakovanými eventy. Paywall je námět k ověření, nikoli
hotová funkce. Nenatipované zápasy mají být viditelné bez hledání. U MMA je
přijatý směr vítěz + volitelné bonusy za způsob a **kolo**, bez přesného času.
Aktuální stav, jazyky, měření a rozdělení práce shrnuje
[připravenost produktu](product-readiness-2026-11-06.md); distribuční pokusy
popisuje [marketingový plán](marketing-strategy-2026-11-06.md).

**Produktový směr — 6. 11. 2026:** vlastník zvolil UFC jako první organizaci
pro MMA. Listopadové eventy jsou příležitost pro malý test, pokud ověříme
automatický zdroj a sjednotíme pravidla. Hlavní CZ/SK milník je **MS v hokeji
13.–30. 5. 2027**; před kampaní musí být produkt provozně i bezpečnostně
připravený. [Samostatný plán](mma-and-worlds-launch-plan.md) rozlišuje přijatý
směr od navržených pravidel, termínů a kontrol. Na následný pokyn je nyní MMA
winner-only pilot implementovaný a importovaný; aktuální ověření viz
[MMA runbook](mma-pilot-runbook.md). Landing zůstává zadáním bez stavby.
Aktuální stav nasazených fotbalových/hokejových soutěží uvádí
[multi-sport runbook](multi-sport-sync.md); starší stavové poznámky níže jsou historie.

**Aktivní cíl: funkční produkt v hlavní aplikaci a jediné stávající DB.** Používáme běžný `.env` lokálně a proměnné Netlify při nasazení. Oddělená beta konfigurace se ruší. Development Clerk na localhostu je propojený přes vlastníkem povolené nativní Supabase Third-Party Auth; skutečná registrace, mapování interního UUID a dokončený vlastní profil s rolí `player` jsou ověřené DB kontrolou a screenshoty. SQL sada RLS prošla s rollbackem a simulovanými ověřenými claims. Vlastník ověřil opětovné přihlášení a dva Google účty ve stejné lobby; DB potvrzuje tři aktivní členy včetně historického Supabase admina. Rozšířené SQL testy ověřily oddělení tipů a opravena je mezera při tipování po známém výsledku. Skutečné Clerk API 403 a živý herní průchod zbývají ověřit. Produkční instance/doména, deployment a celý pilot hotové nejsou. Aktuální stav a zbývající rozsah jsou v [realizačním podkladu](beta-implementation-scope.md). Dvojice alternativních prototypů se nestaví.

**Teď dokončujeme schválený přechod na Clerk a ověřujeme jeden funkční průchod v hlavní aplikaci.**

## Aktuální pracovní dohoda — 5. 11. 2026

Vlastník zvolil **otevřít soutěž hned a postupně dohrát celou Ligu mistrů 2026/27**.
Původní tříkolový pilot je zrušený. Soutěž je aktivní v **Testovacím rodeu**,
kde jsou tři stávající účty. Aktuálně je dostupných 144 zápasů ligové fáze,
72 z nich ještě lze tipovat. Play-off dosud importer nepodporuje; doplnit ho
včetně prodloužení a rozstřelů je úkol této sezony, nikoli hotová vlastnost.
Odehrané zápasy tvoří historii, běžné uzávěrky dál platí.

| Pořadí | Agent | Vlastník | Hotovo, když |
| --- | --- | --- | --- |
| 1. Hratelný základ | Odstranit natvrdo zadané turnaje ve výběrech, ověřit ukládání/refresh, dokončit automatické výsledky a pořadí | Na svém účtu otevřít LM, uložit a změnit tip, vrátit se po refreshi; poslat konkrétní chybu | První skutečný tip vydrží návrat a vyhodnotí se správně |
| 2. Běžící data | Připravit nasazení funkce, ověřit cron, změny termínů a dohled; rozšířit sync na play-off a jeho pravidla | Nastavit proměnné na Netlify a job podle runbooku | Rozpis/výsledky se obnovují a selhání je vidět |
| 3. Jednoduchý produkt | Sladit lobby/soutěž/účast, profil, mobil a celý CZ/EN průchod | Hrát s partou a říkat, kde se ztrácí nebo něco překáží | Hráč přijde z pozvánky, tipne a najde pořadí bez vysvětlování |
| 4. Ověření a růst | Přidat základní měření používání, připravit landing a další soutěž; potom PL, hokej, MMA | Přivést první partu a zkusit pozvání další skupiny; ověřit komunikační sdělení | Lidé se vracejí na další zápasy a pozvou další hráče |

Pracujeme po jednom hlavním balíku. Každý má stručný výsledek, provedené kontroly,
známé nedostatky a konkrétní krok pro vlastníkův test. Připomínka ideálně obsahuje
**kde → co jsem udělal → co se mělo stát → co se stalo**; screenshot podle potřeby.
Pravidla a rozpracovanou soutěž měnit viditelně, aby se v bodování dalo vyznat.
Platby, kosmetický obchod a další sportovní API nepředbíhají hratelný základ.

## Směr v jedné větě

**Soukromá sportovní tipovačka pro party a komunity: pozvat ostatní, snadno tipovat, věřit bodům a vracet se kvůli společné soutěži.**

První průchod, který musí fungovat:

**Pozvánka / založení ligy → přihlášení → minimum profilu → první tip → výsledek a pořadí → další kolo.**

## Co už máme vyjasněné

- [x] Primární publikum jsou party a komunity. Firemní využití je vedlejší možnost.
- [x] Cílem je web pro mobil i desktop a vícejazyčný produkt.
- [x] Supabase zůstává datový základ. Zamýšleným směrem přihlášení je Clerk.
- [x] Zapojení Clerku a základních cronů nejsou samy o sobě výzkumné úkoly; potřebujeme sladit jejich kontrakty s aplikací.
- [x] Netlify může sloužit jako první testovací prostředí.
- [x] První pilot testuje vlastník a známá parta. Nábor cizích skupin není podmínkou této první testovací verze.
- [x] Začátek má být levný, ideálně bez paušálů; ověřený produkt lze později finančně podpořit. Nulová cena není pevný limit pro celý další vývoj.
- [x] Více sportů a velké eventy patří do směru produktu. Nebudeme je všechny vydávat najednou.
- [x] Pořadí rozšiřování: **fotbal → hokej → MMA**. Dne 6. 11. vlastník zvolil **UFC jako první MMA organizaci**; UFCalendar a winner-only pilot prošly bootstrap ověřením. **F1 zatím volitelně**, nikoli slíbený rozsah.
- [x] První fotbalová soutěž je **UEFA Liga mistrů, potom Premier League**. Pilot je potvrzený pro **Ligu mistrů 2026/27 bez omezení na tři kola, s cílem dohrát sezonu včetně play-off; body začínají vlastními novými tipy, bez bodovaného tipu na sezonního vítěze**. Soutěž je otevřená pro testování nyní; běžné uzávěrky platí a chybějící fáze doplníme podle dostupnosti rozpisu.
- [x] **Tipy zůstávají samostatné v každé lobby**, i když hráč tipuje stejný zápas ve více skupinách.
- [x] Vlastník chce **úplný konečný výsledek** a při rozstřelu preferuje tipování jeho skóre, např. **5:4**. Jde o preferovanou herní variantu k dopracování v T05, nikoli oficiální gólové skóre nebo implementované pravidlo. Návrh jen 90 minut ani automatické přičtení jednoho gólu nebereme jako přijatou volbu.
- [x] Vlastník chce možnost pravidlo později změnit. Návrh provedení: verze pravidel uložená pro konkrétní soutěž. Nový pokyn 5. 11. připouští změny během ladění; dopad ukázat a případný přepočet spustit viditelně pod novou verzí. Malá ukázka 90 minut/konečný výsledek je připravená; skutečné ukládání změn dosud ne.
- [x] Kosmetické Premium patří mezi zamýšlené možnosti monetizace. Cena, obsah balíčku a způsob placení zatím nejsou rozhodnuté.
- [x] Staré soutěže jsou odehrané. Původní Supabase byla obnovena pro revizi a historická aplikace je dostupná; nový živý pilot tím nezačal. Historická data nadále chráníme.
- [x] **Starou verzi archivovat, pilot začít čistě.** Automatický přenos starých účtů a započítání historických bodů do nového pilotu není v rozsahu. Archivace je plánovaný úkol, dosud nebyla provedena.
- [x] Podle vlastníka byla **„Fotbaloví experti“ jediná reálná lobby**. Její data lze využít pro revizi a ověření nové verze. U dvou testovacích lobby vlastník výslovně vybral **archivovat a skrýt i ve staré aplikaci, data zachovat**. [Audit a postup](archive-test-lobbies-plan.md) jsou připravené; současná aplikace nemá archivaci celé lobby. Žádná lobby zatím nebyla tímto plánováním archivována, změněna ani smazána.
- [x] **Vlastník přijal model B: stálá lobby pořadatele → soutěže uvnitř → účast a pořadí konkrétní soutěže.** Pozvánka vede přímo do soutěže. Stejný model obslouží partu, hospodu Kobra i jednorázovou sponzorovanou akci. Volbu A/B znovu neotvíráme; [rešerše](lobby-model-research-2026-11-03.md) zachovává důvody rozhodnutí.
- [x] Teoretické porovnání A/B je uzavřené výběrem B. Prototypy se nestaví; následný pokyn vlastníka schválil realizaci podle aktuálního rozsahu výše.
- [x] Do budoucího směru patří možnost stálé lobby hospody (příklad Kobra), sponzorované soutěže s cenou a firemního brandingu. Nejde o potvrzení placených balíčků ani rozšíření prvního pilotu o partnerský provoz.

## Přijatá produktová logika

Tato část popisuje cílové chování přijatého modelu B, nikoli stav již nasazené implementace. Dlouhodobý zdroj rozhodnutí je [ROADMAP.md](ROADMAP.md#accepted-organizer-model--2026-11-03).

| Pojem | Význam a životní cyklus |
| --- | --- |
| **Účet a profil hráče** | Přetrvávají mezi lobby a soutěžemi. Clerk řeší identitu; herní profil a vazby zůstávají v aplikační DB |
| **Lobby pořadatele** | Stálý prostor party, hospody nebo jiného pořadatele. Má členství, vlastní identitu a historii; nemusí mít stále rozehranou soutěž |
| **Soutěž v lobby** | Konkrétní hraní vybrané sportovní soutěže/sezony s vlastním obdobím, účastí, pravidly, tipy a pořadím. Další soutěž začíná vlastním bodováním |
| **Sportovní data** | Sdílený rozpis, týmy a výsledky poskytovatele. Jeden zápas se nestahuje zvlášť pro každou lobby; hráčské tipy a pořadí mají herní kontext |
| **Branding a ceny později** | Vzhled lobby patří pořadateli; partner a cena se vážou ke konkrétní soutěži. Osobní kosmetika patří hráči. Přesné balíčky a oprávnění se teprve dopracují |

Z přijatého modelu plyne:

1. **Nový event nevyžaduje novou lobby.** Kobra může ve stejné lobby postupně hrát fotbal i hokej; soutěže mají samostatné pořadí. Jednorázový pořadatel může mít pouze jednu soutěž a dál nepokračovat.
2. **Pozvánka zachovává pořadatele i soutěž přes přihlášení a profil.** Hráč má před vstupem vědět, kam se přidává, a po něm se dostat k tipování této soutěže. Nevynucujeme volbu mezi dvěma odlišnými herními režimy.
3. **Členství v lobby a účast v soutěži se rozlišují.** Nová soutěž automaticky neznamená aktivní účast všech členů. Přesný vstupní kontrakt a oprávnění určí T03/T04.
4. **Historie, identita a kosmetika přetrvávají; body jsou v kontextu soutěže.** Změna sezony nemá přičítat historické body do nového pořadí. Přesný rozsah viditelnosti a životní cyklus kosmetiky se určí samostatně.
5. **Sponzor je partner soutěže, ne automatická správcovská role.** Budoucí veřejnost, ceny a branding rozšíří stejný průchod; nezakládáme kvůli nim druhý produkt nebo nový herní engine.
6. **Sportovní výsledek a herní vyhodnocení jsou oddělené.** Uchovat gólové skóre, případný rozstřel a postupujícího jako sportovní fakta. Z nich příslušná verze pravidel určí bodované skóre; změna herní varianty nepřepisuje zdrojová fakta.

První pilot používá soukromou lobby a Ligu mistrů. Pozdější přechod téže party na Premier League ověří návaznost mezi soutěžemi. Model B sám neurčuje fotbalové skóre, uzávěrky, společné tipy ani cenu Premium.

## Co navrhujeme pro první testovací verzi

Tato část je návrh rozsahu, ne další potvrzené rozhodnutí.

| Do pilotu | Po prvním ověření |
| --- | --- |
| Soukromé ligy, pozvánka a členství | Veřejné a partnerské turnaje, ceny |
| Přihlášení, základní editovatelný profil a avatar | Široký katalog kosmetiky, obchod a platby |
| Kompletní hlavní průchod v češtině a angličtině | Další jazyky podle skutečných skupin |
| Vybraná soutěž/sezona, rozpis a výsledky | Další soutěže podle ověřených dat |
| Tipování, uzávěrka, pořadí a vysvětlení bodů | MMA jako další formát tipu, F1 jako volitelný pozdější směr |
| Testovací prostředí na Netlify a kontrolované sync joby | Samostatné firemní funkce a prodej |

Potvrzené pořadí je **fotbal → hokej → MMA**, F1 zůstává volitelná. Vlastník vybral **Ligu mistrů 2026/27 pro průběžný test celé sezony, Premier League jako následující soutěž**. Česká nejvyšší liga zůstává pozdější možnost podle zájmu party. Premier League je anglická domácí soutěž; Liga mistrů je samostatná evropská klubová soutěž. Limit tří kol je zrušený; odehrané zápasy tvoří historii a tipovat lze budoucí zápasy před uzávěrkou. U MMA je první organizací UFC; ověříme datový zdroj a formát tipu podle [nového plánu](mma-and-worlds-launch-plan.md). Pro první fotbalové soutěže prošel football-data.org čtecím ověřením; katalog je importovaný a chráněný sync je připravený k nasazení.

Premier League nabízí pravidelný ligový rytmus; Liga mistrů přidá evropské kluby a pohárový formát. To je produktové doporučení, ne žebříček velikosti trhu. La Liga, Bundesliga nebo Serie A mohou následovat stejnou fotbalovou cestou podle skutečné poptávky; nejsou podmínkou pilotu.

### Datový zdroj a rozšiřování — aktualizace 5. 11. 2026

- [football-data.org](https://www.football-data.org/coverage) prošel živým dry-runem s vlastníkovým Free tokenem: LM 2026/27 má všech 144 zápasů ligové fáze a PL všech 380 zápasů. Původní návrh kol 5–7 (54 zápasů) už rozsah hry neomezuje; vlastník zvolil celou sezonu. [Report a opakovatelné kontroly](champions-league-data-source.md) pokrývají úplnost, ID, UTC časy a reálná skóre po prodloužení i rozstřelu. [Free tarif](https://www.football-data.org/pricing) má opožděné výsledky i rozpisy; rychlost budoucích změn termínů jednorázový snapshot nedokazuje. Schválený import 36 klubů a 144 zápasů LM už proběhl; soutěž je nyní aktivní v Testovacím rodeu; [sync endpoint a runbook](football-data-cron.md) jsou připravené. Nový deployment ani externí job zatím neběží.
- [API-Football](https://www.api-football.com/coverage) uvádí také Czech Liga a upozorňuje, že podrobné pokrytí závisí na sezoně či zápasu. Výběr vyžaduje malý dry-run s konkrétní sezonou a dostupným tarifem, nikoli nákup naslepo.
- Další fotbalová soutěž u stejného poskytovatele může využít stejný adapter. Přidání zahrnuje sezonu, ID, fáze, termíny, stavy a kontrolní scénáře. Není potřeba samostatný cron pro každou lobby ani pro každou soutěž.
- Nový sport nebo poskytovatel znamená další mapování a ověření. Hokej potřebuje jasně oddělit základní dobu, prodloužení a nájezdy; MMA zrušení, změnu soupeře a výsledek bez vítěze; F1 pořadí a pozdější penalizace. API dodává fakta, pravidla naší hry určujeme zvlášť.

Existující rozpracované Official Events a ceny posoudíme vůči přijatému modelu B: určit použitelné části, odložené funkce a případný budoucí převod. Samostatná produktová větev Official Events není cílem nové verze. Toto plánování nemaže ani neaktivuje stávající kód, tabulky nebo migrace; konkrétní převod bude mít vlastní audit a zadání.

Odložená funkce neznamená, že lze automaticky vynechat její migrace. Současný backend závisí na `020`/`021` i při zápisu soukromých výsledků; výchozí verzi a databázové závislosti ověří T02/T07 podle [stávajících rollout gates](onboarding-start-event-architecture.md#rollout-gates).

## Otevřené volby — řešit postupně

| Volba | Stav / pracovní návrh | Kdy ji potřebujeme |
| --- | --- | --- |
| Rozsah testování | Uzavřeno: celá Liga mistrů 2026/27 bez tříkolového limitu. Otevřená v Testovacím rodeu, pokračovat do konce sezony; play-off doplnit do adapteru a pravidel | Testovat hned, další fáze připravit před jejich začátkem |
| Vstup a účast podle přijatého B | Model je vybraný. Doplnit konkrétní stavy pozvánky, přihlášení, členství a účasti; seznam polí a oprávnění | T03/T04 před propojením identity, dat a UI |
| Provedení archivu staré verze | Zachovat reálné „Fotbalové experty“; dvě testovací lobby archivovat a skrýt při zachování dat. [Postup připraven](archive-test-lobbies-plan.md), implementace a nasazení neproběhly | Před změnami nebo vypínáním původní infrastruktury |
| Pozdější rozšíření testování | První pilot je potvrzený: vlastník a známá parta. Novou skupinu bez osobní pomoci autora zvážíme až následně | Při vyhodnocení prvního pilotu |
| Profil při prvním vstupu | Návrh: zobrazované jméno, avatar a jazyk; další údaje volitelné | Při návrhu obrazovek a profilu |
| Unikátní handle | Rozhodnout, zda je vůbec potřeba vedle interního ID a zobrazovaného jména | Před profilovým/datovým kontraktem |
| Připomenutí dalšího kola | Rozhodnout kanál a souhlas; push není automaticky podmínka první verze | Před pilotem |
| Vzhled nové verze | Zachovat použitelné části; nejprve vybrat vizuální směr pro klíčové obrazovky | Před UI implementací |

### P1 — rozhodnutí vlastníka před stavbou

P1 zde označuje první plánovací etapu, ne schválení implementace nebo zápisů. P1.1, P1.2, P1.3 a P1.5 jsou přijaté v uvedeném rozsahu. P1.4 obsahuje vlastníkovu preferenci bodovat skóre rozstřelu; úplný bodovací kontrakt a hraniční případy dopracuje T05. Přesné termíny a data se ověří před pilotem v T08.

| Rozhodnutí | Stav / pracovní návrh | Co zbývá nebo jaká je alternativa |
| --- | --- | --- |
| **P1.1 — Co hraje první parta** | **Potvrzeno: Liga mistrů 2026/27 → Premier League** | Průběžně testovat celou sezonu včetně budoucího play-off; volbu první soutěže neopakujeme |
| **P1.2 — Co znamená lobby** | **Přijato: model B**, stálá lobby pořadatele a soutěže s vlastní účastí a pořadím; pozvánka do konkrétní soutěže. Platí pro partu, Kobru i jednorázového sponzora | Výběr A/B je uzavřený. T03/T04 dopracují vstup a role; případný převod starších Official Events je samostatný úkol. Prototypy nyní nestavíme |
| **P1.3 — Sezona a bodované období** | **Přijato: Liga mistrů 2026/27 bez tříkolového omezení, testovat nyní a dohrát sezonu; nové body za vlastní tipy, bez bodovaného tipu na sezonního vítěze** | Ligová fáze je otevřená; přidávání play-off a finálního skóre zbývá. Průběžně vyhodnocovat používání a chyby, bez předem stanoveného konce po třech kolech |
| **P1.4 — Jaké skóre tipujeme** | Vlastník chce úplný konečný výsledek; **preferuje při rozstřelu bodovat jeho skóre**, např. 5:4, a zachovat možnost jiné varianty v budoucnu | T05 sepíše jednoznačné příklady, zvolený profil bodování, chybějící data a opravy. Oficiální zápis zůstává oddělený. Pravidlo má verzi pro soutěž; při změně během testování ukázat dopad a zřetelně potvrdit případný přepočet. Interaktivní ukázka už porovnává 90 minut a konečný výsledek. Hodnoty bodů a uzávěrku při výkopu navrhujeme zachovat. Historie se nepřepočítává |
| **P1.5 — Tip ve více partách** | **Přijato: samostatné tipy v každé lobby jako dnes** | Jeden tip automaticky nepřenášet do jiných lobby. Budoucí ruční kopírování by byl samostatný návrh, nikoli součást tohoto rozhodnutí |

U penalt oddělujeme sportovní fakta od herního bodování. [IFAB Law 10](https://www.theifab.com/laws/latest/determining-the-outcome-of-a-match/) rozlišuje skóre zápasu a rozstřel po jeho konci. UEFA například uvádí [Manchester City–Real Madrid 1:1 po prodloužení, rozstřel 3:4](https://www.uefa.com/uefachampionsleague/news/028c-1aad6a5c7b4a-4c4a76ccd847-1000--report-real-madrid-beat-city-on-penalties/). Skóre rozstřelu tedy není gólovým skóre zápasu. Před převzetím z API ověříme význam konkrétních polí.

Preferovaný herní kontrakt k dopracování v T05:

| Sportovní průběh | Bodované skóre v preferované variantě | Sportovní zápis ponechaný v datech |
| --- | --- | --- |
| Bez prodloužení, konec 2:1 | 2:1 | 2:1 |
| Po 90 minutách 1:1, po prodloužení 2:1 | 2:1 | Skóre po 90 minutách i konečné 2:1, pokud je zdroj poskytuje |
| Po prodloužení 1:1, rozstřel 5:4 | **5:4** | **1:1, penalty 5:4**; žádné nahrazení oficiálních gólů |

Hráč tipuje před výkopem podle předem zveřejněné verze pravidel. Tato varianta mění cílovou veličinu, když zápas dojde do rozstřelu; vyšší počet možných skóre sám neprokazuje větší podíl dovednosti. Srozumitelnost a zábavnost ověří pilot. Při nové verzi se staré tipy znovu nevyhodnocují. Odveta může mít jiného vítěze zápasu a jiného postupujícího, proto se pravidlo nesmí odvozovat jen z remízy nebo automatického „+1 gólu“.

T05 musí potvrdit také dopad na body: stávající [calculatePoints](../src/lib/scoring.ts) by při bodovaném výsledku 5:4 dal tipu 2:1 tři body za správného vítěze a rozdíl, přesnému 5:4 pět bodů. Samotná změna cílového skóre tedy nezavádí nové bodování přesnosti; případná změna bodové tabulky je samostatná produktová volba pro novou verzi pravidel.

Uzavření dvou testovacích lobby je již vlastníkem vybrané: **archivovat a skrýt i ve staré aplikaci, data zachovat**. Nejde o hotovou dostupnou operaci: současné schéma ani Home nemají archivní stav celé lobby. [Read-only audit, přesná ID, baseline a postup](archive-test-lobbies-plan.md) jsou připravené pro samostatnou změnu; databáze ani nasazení tímto plánem změněné nejsou. „Fotbaloví experti“ zůstávají zdrojem reálných příkladů, nikoli startovních bodů nové sezony. Případná kopie pro testy bude oddělená a zbavená nepotřebných osobních údajů a přihlašovacích vazeb; tímto plánem nebyla vytvořena.

Technickou volbu providera, plánování jobů, opakování po chybě a mapování dat připraví agent v T08. Vlastník rozhoduje, pokud ověření vyžaduje placený tarif nebo kompromis v dostupnosti či rychlosti. Název avataru, nové jazyky nad CZ/EN, ceny Premium a další sporty neblokují uzavření P1.

## Úkoly a pořadí

ID slouží k domluvě v chatu. Toto jsou návrhy úkolů, nikoli již založené GitHub Issues. Rozpracovat konkrétní Issue až před příslušnou implementací podle [Issue workflow](ISSUE_WORKFLOW.md).

### A. Nejdřív společně uzavřít zadání

| Stav | ID / úkol | Výstup a kritérium dokončení |
| --- | --- | --- |
| [ ] | **T01 — Rozsah pilotu** | Přijaté jsou model B, Liga mistrů 2026/27 bez omezení počtu kol, nové body bez bodovaného vítěze sezony a samostatné tipy mezi lobby. Preference rozstřelu 5:4 je zapsaná v P1.4; úplný kontrakt uzavře T05. Soutěž je otevřená nyní; rozšíření na play-off a průběžné vyhodnocení jsou součástí další práce. První testuje vlastník a známá parta; prototypy nyní nestavíme. |
| [ ] | **T02 — Archiv a výchozí stav kódu** | [Baseline plán](beta-baseline-plan.md), zdrojový snapshot a pracovní větev existují; před Clerk migrací vznikla záloha veřejných dat. Git checkpoint a archivace/skrytí dvou historických testovacích lobby zbývají. Rozpracované Official Events zůstávají odložené a jejich sdílené DB závislosti se ověřují před nasazením. |
| [ ] | **T03 — Účet, profil a oprávnění** | [Kontrakt identity](beta-account-contract.md), Clerk frontend/backend, interní UUID, bootstrap/profil a RLS jsou implementované. Skutečná registrace a dva Clerk hráči v jedné lobby jsou ověřené; historické účty se automaticky nepřevádějí. Zbývá nový soutěžní kontext/účast, skutečné API 403 a celý herní průchod; viz [stav realizace](beta-implementation-scope.md). |
| [ ] | **T04 — Průchody a refresh vzhledu** | Podle B popsat cestu z eventové pozvánky, založení lobby s první soutěží, návrat hráče, konec soutěže a přechod stejné party na další. Zahrnout neplatnou pozvánku a archiv, profil, zápasy a pořadí; vizuální směr vybrat před UI implementací. |
| [ ] | **T05 — Pravidla a jazyky** | Dopracovat preferovanou variantu finálního skóre: bez rozstřelu gólové skóre po případném prodloužení, při rozstřelu jeho skóre; sportovní fakta uložit zvlášť. Pravidla mají dohledatelnou verzi; úpravy během ladění potřebují viditelný dopad a přepočet, nikoli tichou změnu historie. Rozlišit ligovou fázi, první zápas, odvetu, postupujícího, chybějící data, odklady a opravy. Test zahrnuje celou sezonu, bez bodovaného sezonního vítěze. Celý kontrakt i vysvětlení dodat CZ/EN před implementací. |

### B. Potom sladit technický základ

| Stav | ID / úkol | Výstup a kritérium dokončení |
| --- | --- | --- |
| [ ] | **T06 — Konfigurace a testování na Netlify** | Jedna aplikace a stávající DB. Lokálně `.env`, na Netlify stejné názvy proměnných v nastavení webu; [šablona](../.env.example) a `npm run env:check`. Clerk testovací i produkční klíče jsou podporované; pro veřejný provoz zvolit produkční instanci, doménu a shodný issuer/allowlist v backendu i Supabase. Zbývá dokončit konfiguraci a živé ověření; beta launcher není součástí plánu. |
| [ ] | **T07 — Integrita a regresní pojistky** | Opravy z auditu mají vlastní ověření: odstranění zbytků přihlašovacích údajů z klientského stavu, atomické výsledky i vítěz, ochrana ručního výsledku, úplné načtení tipů a testy skutečných produkčních funkcí. Historická pravidla a body se nezmění. |
| [ ] | **T08 — Data a sync pro první soutěž** | LM 2026/27 má v hlavní DB 36 klubů a 144 zápasů v aktivní soutěži připojené do Testovacího rodea. [Import a chráněný sync](football-data-cron.md) ověřují 17 Node testů, rollback SQL testy, opakování a lokální HTTP dry-run. Mapování fáze/remíz, odkladů, uzávěrek, snapshotu bodů a ochrana potvrzených/ručních výsledků jsou implementované. Zbývá explicitní soutěžní účast, import a pravidla play-off, živé sledování změn termínů, nasazení a nastavení externího jobu. |

### C. Dokončit jeden celý produktový průchod

| Stav | ID / úkol | Výstup a kritérium dokončení |
| --- | --- | --- |
| [ ] | **T09 — Účet až pořadí** | Implementovaný schválený průchod B: pozvánka do soutěže → Clerk → profil → správná lobby a účast → tip → výsledek → pořadí soutěže. Kontext zůstane po refreshi a návratu; editace profilu a logout nepřeruší herní vazby. |
| [ ] | **T10 — Ověření testovací verze** | Projdou níže uvedené kontrolní scénáře na mobilu i desktopu a v CZ/EN. Automatické kontroly běží; verze je dohledatelná a lze bezpečně zastavit sync. |

### D. Ověřit s lidmi a vybrat další rozšíření

| Stav | ID / úkol | Výstup a kritérium dokončení |
| --- | --- | --- |
| [ ] | **T11 — Pilot se skutečnými skupinami** | Průběžně hrát Ligu mistrů až do konce sezony a během toho vylepšovat produkt. Zaznamenat první tip, návrat na další kolo, chyby a ruční zásahy. Pozdější přechod stejné lobby na Premier League ověří další soutěž, samostatné body a pokračující historii. Další skupiny bez pomoci autora nabírat až následně. |
| [ ] | **T12 — Kosmetika a další etapa** | Malý ověřitelný návrh vzhledů a Supporter statusu, odlišený od výkonových odznaků. Z pilotu vybereme další soutěž či notifikace; rozšiřování sportů naváže hokejem a MMA. Platební integrace bude samostatný úkol, F1 zůstává volitelná. |

Pořadí: **T01–T05 → T06–T08 → T09–T10 → T11–T12.** Zadání profilu, vizuální směr a návrh kosmetiky lze připravovat souběžně. Změny identity a data musí mít uzavřené kontrakty před jejich propojením s UI.

## Integrační dohody, které má návrh respektovat

- **Clerk:** identita, přihlášení a účet. **Supabase:** herní profil, členství, tipy, body a historie. Vlastnictví jednotlivých profilových polí musí určit T03.
- Nový pilot má nové účty a nové bodované období. Staré účty se automaticky nepropojují ani nepřenášejí; historické vazby zůstanou v archivu. Data „Fotbalových expertů“ lze využít jako referenci pro návrh a kontrolu, nikoli přičíst do nového pořadí. Případný oddělený testovací vzorek se připraví samostatně. Nový interní identifikátor hráče bude oddělený od identity poskytovatele přihlášení.
- Soukromé ligy zůstávají aplikační doménou; nepředpokládáme převod každé ligy na Clerk Organization.
- Přijatý model B používá jednu lobby pořadatele a její soutěže. Shodný herní kontrakt musí zvládnout dlouhodobou skupinu i jediný event. Převod existujících technických domén se navrhne zvlášť; schválení produktu samo nemění schéma ani RLS.
- **Potvrzeno: tipy zůstávají samostatné podle lobby**, včetně stejného zápasu odehraného ve více skupinách.
- Změnitelnost herních pravidel řešit verzí konkrétní soutěže, pevnou od prvního uloženého tipu. Oprava sportovního výsledku vyhodnocuje tipy podle stejné verze; globální přepínač nesmí změnit rozehrané ani historické soutěže. Oficiální skóre a rozstřel uchovat odděleně od bodovaného skóre.
- Tříkolové bodované období platí pro vstup, ukládání tipů, výpočet bodů i pořadí. Skrytí zbylých zápasů pouze ve frontendu by nestačilo. Bodovaný tip na sezonního vítěze se pro tento pilot nezapíná; stará data se nepřepisují.
- Sdílená sportovní data se získávají jednou pro všechny ligy. Plánovač vybírá aktivní soutěže; adapter řeší poskytovatele a sezonu.
- Vyhodnocení je automatické pro všechny lobby. Novější API oprava výsledku atomicky přepočítá body, opakování je idempotentní. Ruční obsluha není podmínkou provozu; oprávnění a zvlášť označený historický ruční původ zůstávají chráněné.
- Netlify Preview je jen místo spuštění. Datové a auth oddělení se musí ověřit samostatně.
- Monetizace nemění body, uzávěrky ani možnost vyhrát. Zatím neschvalujeme cenu, platby ani nové omezení Free verze.

## Checklist před pozváním do pilotu

- [ ] Nový organizátor založí soukromou ligu a pošle funkční pozvánku.
- [ ] Pozvanému zůstane kontext ligy přes přihlášení a doplnění profilu.
- [ ] Pozvánka vede do správné soutěže správné lobby a hráči je jasné, kam vstupuje.
- [ ] Nový i vracející se účet skončí u správného herního profilu a členství.
- [ ] Účast v nové soutěži je odlišená od trvalého členství; hráč se nezapíše automaticky do všech dalších sportů.
- [ ] Profil jde upravit bez přerušení vazby na tipy; je srozumitelné, co uvidí ostatní.
- [ ] Tip se uloží, zobrazí po refreshi a po uzávěrce jej nepovolí ani přímý zápis.
- [ ] Výsledek vede ke správným bodům a pořadí; totéž platí pro opravu a opakovaný job.
- [ ] Cizí liga a administrátorské akce jsou nepřístupné neoprávněnému hráči.
- [ ] Změněný termín a nedostupný provider nezpůsobí tiché chybné vyhodnocení.
- [ ] Hlavní průchod včetně chyb a pravidel je celý CZ/EN.
- [ ] Mobil i desktop zvládnou návrat, refresh, prázdný stav a výpadek připojení.
- [ ] Je určeno, jak hráč pozná další kolo a jak pošle zpětnou vazbu.
- [ ] Beta používá výslovně zvolený stávající projekt a dohledatelnou verzi; migrace a testy zachovaly historická data.

Při následném přidání Premier League ověříme, že stejná lobby a její členství pokračují, nová soutěž má vlastní pořadí a historie Ligy mistrů zůstává dostupná. Tento mezisoutěžní scénář nelze označit za ověřený po samotném prvním kole Ligy mistrů.

### Průběžné vyhodnocení během sezony

- **Správnost:** uložené tipy, uzávěrky, výsledky a body odpovídají přijatým pravidlům; do pořadí nezasahují jiné zápasy ani staré bonusové body. Závažná chyba bodování nebo oprávnění blokuje rozšíření.
- **Použitelnost:** zaznamenat, kde hráč či organizátor potřeboval pomoc, ztratil kontext nebo si nebyl jistý potvrzením tipu.
- **Návrat:** uvést skutečný počet aktivních hráčů a návratů do druhého a třetího kola s ohledem na dostupné zápasy. Jednu známou partu nevykládat jako statistický důkaz retence celé platformy.
- **Další etapa:** podle zjištění zvolit opravy nebo přidání Premier League do stejné lobby. Nákup kosmetiky ani veřejný sponzorovaný turnaj nejsou podmínkou úspěchu tohoto pilotu.

To je přejímka pilotu, nikoli důkaz připravenosti na neomezený veřejný provoz nebo product-market fit. Veřejné spuštění bude mít vlastní rozhodnutí podle [PROJECT_RULES.md](../PROJECT_RULES.md).

## Jak budeme plán používat

1. Doplníme otevřené volby do tohoto souboru; nebudeme stejná rozhodnutí opakovat v každém chatu.
2. Před implementací vezmeme nejbližší uzavřený úkol a připravíme konkrétní zadání s důkazem dokončení; Issue založíme na pokyn vlastníka.
3. U citlivých změn použijeme audit a schválení podle [AGENTS.md](../AGENTS.md) a [PROJECT_RULES.md](../PROJECT_RULES.md). Plán není souhlas se změnou auth, RLS, historických dat nebo nasazením.
4. Dlouhodobá rozhodnutí patří do [ROADMAP.md](ROADMAP.md); detailní implementace a ověření do příslušných Issues.

Navazuje na [beta polish](beta-polish-sprint-01.md), [profilové a produktové základy](product-growth-architecture.md) a [stávající onboarding / Official Events](onboarding-start-event-architecture.md). Tyto zdroje popisují dosavadní implementaci; zde je plán jejího dalšího vývoje.
