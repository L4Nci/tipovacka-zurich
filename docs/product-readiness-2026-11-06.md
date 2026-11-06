# Tipovačka — stav, příprava produktu a rozdělení práce

Aktualizace 6. 11. 2026. Plán a čtecí revizi následoval schválený MMA pilot a
zpřehlednění chybějících tipů. Aktuální import/testy/release rozlišuje
[MMA runbook](mma-pilot-runbook.md). Analytické služby a ceny se neměnily. Dlouhodobý směr je v
[roadmapě](ROADMAP.md), distribuce v [marketingovém plánu](marketing-strategy-2026-11-06.md).

## Co už je podložené a co zbývá

| Oblast | Podložený stav | Další práce |
| --- | --- | --- |
| Účet, profil, vytvoření/připojení lobby | Clerk průchod a více účtů vlastník ověřil; nový klient nasazený 5. 11. | Produkční Clerk/doména, úplný průchod nového člověka a případné vyřazení historického Supabase přihlášení |
| Fotbal | Liga mistrů a Premier League importované a aktivní | Průběžně ověřovat změny rozpisu a budoucí play-off, celý hráčský průchod |
| Hokej | NHL aktivní, sdílený sync; ELH import zachovaný, ale skrytý kvůli nedostupnému zdroji | Ověřit nový ELH zdroj; současná NHL automatizace nedokazuje MS/IIHF integraci |
| Automatické vyhodnocení | Cron CL/PL/NHL 5. 11. prošel skutečným zápisovým během bez změn; body vznikají napříč lobby | Dohled a zpoždění zdrojů, provozní scénáře a opravy při skutečné hře |
| Chybějící tipy | Home má pojmenované lobby, součet chybějících tipů, jednotlivé soutěže a přímý vstup Bez tipu; komponentové QA prošlo | Skutečný účet: save → pokles počtu → refresh, více skutečných lobby |
| Více jazyků | Dílčí CZ/EN slovník a mnoho podmínek v komponentách; profil ukládá cs/en | Jednotná i18n vrstva a úplné pokrytí; slovenštinu potvrdit pro CZ/SK kampaň |
| MMA | UFCalendar ověřený; dvě karty importované; winner-only UI/sync, body a RLS implementované, bootstrap DB test prošel | Release/živý účet/cron ověřit podle runbooku; bonusy způsob/kolo zatím nejsou |
| Landing/SEO/analytics | Konkrétní [landing brief](landing-page-brief.md) a distribuční plán; analytics SDK ani consent manager nezapojené | Reference → text a flow → vizuální výběr → stavba, měření a ověření |
| Veřejný provoz | Část bezpečnostních kontrol existuje; čtecí audit odhalil konkrétní podmíněnou mezeru u long-term tipu | Oprava a testy, další RPC/roles, skutečné cookies, produkční nastavení, zátěž a obnova |

Zdroj stavu automatizace: [multi-sport runbook](multi-sport-sync.md). Dnešní
čtecí revize není novým testem všech těchto nasazených průchodů. Přihlášený
Safari průchod nebyl tímto auditem zopakován.

## Lobby tvůrce a placený přístup

Stálá lobby funguje jako domov komunity tvůrce, hospody nebo party. Konkrétní
event přináší pozvánku, samostatné pořadí a důvod k odvetě; komunita zůstává.
Přes videa se má vstupovat přímo do správného eventu, se zachováním kontextu
přes přihlášení. Nevynucovat nové založení lobby každým hráčem.

Odkaz vložený za cizí paywall lze přeposlat. Skutečné placené oprávnění by
vyžadovalo ověření členství na serveru, pravidlo zániku přístupu a odpovědnost
za platby/podporu. Doporučený první pokus je bezplatná výzva jednoho tvůrce na
dva eventy. Současné entitlements tabulky nejsou důkaz hotového paywallu.

## Chybějící tipy podle lobby

**Implementované chování:** `src/lib/homeDashboard.ts` zachovává urgentní okno
48 hodin, doplňuje všechny budoucí netipované zápasy podle lobby/soutěže.
`HomeDashboard.tsx` ukáže pojmenovanou lobby, její součet a při více soutěžích
jednotlivé odkazy s počtem. Tlačítko vede přímo do příslušného filtru Bez tipu.

**Záměr a přejímací kontrola:** po příchodu hráč vidí počet zbývajících tipů,
soutěže a nejbližší uzávěrku; jednou akcí otevře správný seznam Bez tipu.
Prioritu mají brzké uzávěrky. Více soutěží v jedné lobby nesmí další chybějící
tipy skrýt. U stejného zápasu ve dvou lobby jde o dva samostatné tipy a počet
tomu odpovídá. Vzdálená celosezonní utkání odlišit od urgentních úkolů.

Ověření: uložit tip → počet klesne → refresh stav zachová; všechny tipy uložené
→ srozumitelný hotový stav; blížící se uzávěrka → správné řazení; více lobby,
soutěží a účtů → vlastní počty, žádná cizí data. Nezapočítat uzamčené, hotové
nebo neznámé zápasy a nevracet hráče na začátek obecných výběrů.

## Multijazyk: středně velký jednorázový refaktor

Není nutná přestavba celé aplikace. Největší práce je vytáhnout rozptýlené
texty, sjednotit chyby a otestovat celý průchod; další jazyk pak hlavně přidává
obsah a kontrolu. Samotný překlad menu nestačí. Bez inventury řetězců neslibujeme
přesný počet hodin nebo dnů.

Deset jazyků neznamená deset různých aplikací. Jednorázový přesun na jednotné
klíče a locale kontrakt je středně náročná změna; deset kompletních překladů a
jejich kontrola už jsou větší obsahová práce. Technickou podporu připravit pro
celou pracovní sadu CS, SK, EN, ES, PL, DE, FR, PT, IT, TR, vydávat pouze
hotové překlady. Nejde o světový žebříček podle počtu mluvčích. Doporučený
start je souvislé CS/EN a SK pro hlavní kampaň, další podle skutečného náboru.
U každého jazyka ověřit přihlášení, pozvánku, lobby, tip a pravidla; sportovní
ID a názvy bojovníků se nepřekládají automatickým přepisem databáze.

Navržené provedení:

1. Jeden překladový systém pro React, například i18next/react-i18next; katalogy
   podle účtu, lobby, tipování, pravidel a veřejných stránek. Překlady zůstávají
   v repozitáři; placený překladový systém není podmínka.
2. Používat standardní cs/en a případně sk. Staré UI/localStorage cz převést
   kompatibilně na cs; databáze už používá cs/en. Pro sk doplnit i validační
   kontrakt profilu, ne jen položku přepínače.
3. Přeložit tlačítka, validaci, chyby, prázdné stavy, bodovací příklady, pozvánky,
   profil, přihlašovací komponenty a případné ověřovací e-maily. Clerk má vlastní
   lokalizační nastavení; překlad App.tsx ho automaticky nezmění.
4. Ošetřit množná čísla, datum/čas a časovou zónu odděleně od jazyka. Aktuální
   UI časy používají Europe/Prague; globální lokalizace musí říct, zda zobrazujeme
   čas hráče, nebo jednotnou zónu soutěže. Globální časovou změnu tímto plánem neprovádíme.
5. Veřejné stránky mají jazykové URL, správný html lang, canonical, hreflang a
   metadata; herní obsah za přihlášením není veřejný SEO materiál.
6. Ověřit chybějící klíče a skutečné průchody CS/EN, později SK. Delší překlady
   nesmí rozbít mobil, pozvánku nebo tlačítko Uložit.

## Měření a soukromí — návrh před zapojením

Doporučený pilotní nástroj je **PostHog Cloud EU**: ručně vybrané události,
vypnuté session replay i autocapture, minimalizace osobních údajů a souhlas
vyřešený před zachytáváním nepovinné analytiky. Free má k datu kontroly
1 milion product-analytics událostí měsíčně bez karty; nejde o souhlas s nákupem
ani záruku budoucích podmínek. Účet a integrace zatím nevznikly.

Začít šesti typy událostí: otevření veřejné stránky, kliknutí na založení,
otevření pozvánky, vytvoření lobby, skutečně dokončený vstup a úspěšné uložení
tipu. Úspěch neposílat před potvrzením operace. Na startu stačí tyto otázky:

| Ukazatel | Pracovní definice | Rozhodnutí |
| --- | --- | --- |
| Hrající skupiny | Lobby s alespoň 3 různými tipujícími ve stejném eventu; jde o návrh definice | Přivádí kanál celé party? |
| První tip | Nový účastník s alespoň jedním platně uloženým tipem; jmenovatel zahrnuje jen lidi s otevřenou příležitostí | Kde je tření při vstupu? |
| Návrat | Ze stejné první kohorty ti, kteří tipují při další nabídnuté otevřené příležitosti; další kolo a další event zvlášť | Funguje důvod vrátit se? |

Čas od příchodu po první tip je pomocná diagnostika; ne stanovený výkonnostní
benchmark. Počty i podíly uvádět s jmenovatelem a typem příležitosti. Kvantitativní
cíle a rozpočet se rozhodnou po prvním vzorku. Měření se souhlasem má výběrové
zkreslení; počet změřených návštěv není veškerý provoz.

Zdroje rozlišit pomocí krátkých kampaní/UTM a veřejného identifikátoru tvůrce.
Do analytiky neposílat plné pozvánkové URL, join_code, token, e-mail, jméno ani
texty profilu. Pseudonymní identifikátor pro návraty stále může být osobní údaj.
Referrer nemusí být dostupný; atribuce AI návštěv ani sdílení není stoprocentní.

Nepovinnou analytiku navrhujeme spouštět až po souhlasu; odmítnutí musí být
stejně snadné a hra dál použitelná. Technické přihlašovací cookies se posuzují
podle účelu zvlášť. EU hosting sám právní soulad nezaručuje. Před veřejným
národním/evropským náborem doplnit skutečný cookie/network inventář, správce a
účely zpracování, zpracovatele a přenosy, dobu uchování, kontakt a postup pro
výmaz/export. Pro širší komerční provoz nechat toto skutečné nastavení právně zkontrolovat.

## Bezpečnostní stav — co z kontroly plyne pro plán

Čtecí kontrola hostovaných metadat 6. 11. potvrdila RLS na 20 public tabulkách,
zákaz anon/authenticated execute na obou nových katalogových sync RPC a zákaz
přímé změny profiles.role pro authenticated. Bio/profile_visibility nejsou
přímo čitelné přes table grant. Metadata nejsou test cizího JWT nebo všech cest.

Standard zdrojový sken `cf13e29d-cbd4-4b15-adee-4bbd7b87ec24` je uzavřený
s **dílčím pokrytím**, jedním podmíněným nálezem nízké závažnosti a konkrétními
zbývajícími kontrolami. Oba bezpečnostní agenti narazili na limit účtu; kořenový
agent převzal validaci a report. Měření spotřeby skenu nebylo dostupné.
Výsledek se vztahuje k původnímu snapshotu; souběžně vznikala plánovací dokumentace.

Nález: starý tip na vítěze turnaje lze při existenci vhodného budoucího/prázdného
cíle přesunout změnou kontextu a zachovat dřívější body. Před MMA importem byl
v metadatech počet takových cílových turnajů nula. Po přidání MMA
existují dva katalogy bez legacy zápasů; samostatné MMA pořadí long-term tipy
nepoužívá, ale stará mezera vyžaduje opravu před širším provozem. Oprava má zmrazit identitu kontextu a
kontrolovat uzávěrku původního řádku. Hráč tím nezískává cizí členství ani roli.
Žádný útok ani opravný zápis této legacy mezery v DB nebyl proveden.

Před širším provozem zbývá samostatně projít další RPC/sync zdroje, negativní
scénáře se skutečnými účty, historické přihlášení, produkční Clerk, admin MFA a
obnovu, závislosti, cookie síťové chování a bezpečný provoz. Advisors upozorňuje
i na úmyslně zpřístupněné SECURITY DEFINER RPC; jejich samotná existence není
důkaz chyby. RLS bez policies u serverových tabulek není automaticky otevřený přístup.

## Režim práce a navržené milníky

Jeden hlavní implementační balík v jednu chvíli. Marketing může paralelně
připravovat texty a nábor, bezpečnost kontrolovat přesně danou hranici. Zbytečně
nespouštět další skeny/hejna agentů. Každý balík má výsledek, kontrolní scénáře,
známá omezení a jeden konkrétní test pro vlastníka.

| Kdo | Odpovědnost | Výstup |
| --- | --- | --- |
| Hlavní agent, CTO role | Pořadí práce, implementace, jazyky, datový kontrakt a integrace | Jeden ověřitelný balík a přehled stavu |
| Marketingový agent | Tvůrci, hospody, komunita, copy, SEO/AI dohledatelnost a experimenty | Konkrétní návrhy a měření; zprávy připraví, Viktor odesílá |
| Bezpečnostní role | RLS/RPC/auth/klíče/oddělení lobby a kontrola změn | Nálezy s důkazem, cílené testy a dohledatelné opravy; tento subagent je nyní po limitu, dalšího bez potřeby nespouštíme |
| Viktor | Reference, sdělení, vztahy a test se skutečnou partou | 3–5 webů s důvodem, 3 relevantní kanály/kontakty, jedna dostupná komunita a konkrétní chyby |

Navržené cíle: listopad hratelný základ + menší MMA ověření podle dostupnosti
zdroje; prosinec/leden souvislé jazyky, vstup, landing a měření; **do 28. 2. 2027
plně provozuschopný veřejný základ**. Březen/duben marketing, ukázky, partneři
a polish při běžícím produktu. Dubnová zkouška je kontrola připravenosti kampaně,
nikoli první dokončení aplikace. Datum 28. 2. je pracovní návrh, vlastník ho zatím nepotvrdil.

Nejbližší pořadí balíků: potvrzená bezpečnostní mezera a zbývající zásadní
negativní scénáře → chybějící tipy a vstup → jednotné jazyky → landing a
consent/analytics. Čtecí ověření MMA zdroje může běžet nezávisle; nové sportovní
formáty nesmí rozbít ověřené fotbalové/hokejové kontrakty.

## Skills pro další fáze

- Product Design get-context/ideate: z referencí a skutečného produktu určit
  brief, potom tři vizuální směry k výběru. Landing se nyní nestaví.
- Product Design image-to-code nebo frontend-app-builder podle vybraného
  cíle, React best practices a frontend-testing-debugging pro implementaci a ověření.
- Sales strategie a Data design-kpis pro nabídku, distribuční testy a definice
  měření; konkrétní čísla neodhadovat podle pocitu.
- Supabase a Codex Security pro konkrétní změny bezpečnostních hranic; neplést
  čtecí audit, návrh opravy a ověřenou opravu.

Kvalitu landing určí konkrétní reference, skutečný obsah hry a zvolená
typografie/kompozice. Před kódováním si vybereme směr. Jeden hlavní CTA,
ukázka tipu/pořadí a eventová vstupní stránka jsou návrh, ne automaticky
optimalizovaný funnel. Konverzi a návrat ověříme na skutečných skupinách.

## Ověřené externí podklady

- [react-i18next](https://react.i18next.com/) a [množná čísla i18next](https://www.i18next.com/translation-function/plurals).
- [Clerk lokalizace](https://clerk.com/docs/guides/customizing-clerk/localization).
- [PostHog cena](https://posthog.com/product-analytics/pricing), [EU ukládání](https://posthog.com/docs/privacy/data-storage) a [řízení sběru](https://posthog.com/docs/privacy/data-collection).
- [ÚOOÚ: cookies a souhlas](https://uoou.gov.cz/verejnost/qa-otazky-a-odpovedi/cookies).
- [Google: AI vyhledávání](https://developers.google.com/search/docs/appearance/ai-features) a [vícejazyčné stránky](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites).

## Změněné podklady a ověření této etapy

- [ROADMAP.md](ROADMAP.md): tvůrčí komunity, MMA volby a produkt běžící před kampaní.
- [product-restart-plan.md](product-restart-plan.md): aktuální upřesnění a odkazy.
- [PROJECT_RULES.md](../PROJECT_RULES.md): trvalé rozhodnutí vlastníka bez změny aktuálních herních pravidel.
- [mma-and-worlds-launch-plan.md](mma-and-worlds-launch-plan.md): bonus kolo bez přesného času a dřívější provozní milník.
- [marketing-strategy-2026-11-06.md](marketing-strategy-2026-11-06.md): první distribuční experimenty a rozdělení práce.
- Tento dokument: stav, chybějící tipy, jazyky, soukromí/měření a následující balíky.

Kontrola whitespace/conflict markerů i místních odkazů v šesti dokumentech
prošla. Změny jsou dokumentační; aplikace nebyla přestavěna nebo nasazena a
databázové kontroly byly SELECT metadat/agregátů. Bezpečnostní report je
generovaný a uložený pod scan ID uvedeným výše, nikoli ručně psaná certifikace.
