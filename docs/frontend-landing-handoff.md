# Front-end handoff: Fan Tipovačka

**Aktualizace 9. 11. — vstup do hry:** vlastník výslovně schválil vizuální
sjednocení přihlášení a registrace s brandkitem. Lokálně je upravený
`AuthScreen.tsx`, scoped `AuthScreen.css` a vzhled jeho Clerk SignIn/SignUp;
fonty jsou hostované v `public/fonts` s licencemi. Nejde o přebarvení celé hry
ani změnu logiky přihlášení, rolí či dat. Tato změna zatím není nasazená.
Kořenový TypeScript nově vynechává `sites` jako samostatný checkout, aby jeho
vlastní aliasy a Worker typy nenarušovaly kontrolu herní aplikace.
Starší omezení a výstup původního handoffu níže popisují předchozí stav.

Pracovní zadání z 9. 11. 2026. Výstup front-end subagenta: plán, nikoli
postavená landing nebo změna vzhledu aplikace. Navazuje na
[obsahový manuál](website-content-manual.md), [landing brief](landing-page-brief.md)
a [revizi profilu](profile-review-2026-11-08.md).

## Cíl a mantinely

Organizátor má pochopit společnou hru, založit lobby a pozvat partu. Pozvaný
má poznat, kam jde, a dokončit první tip. Hlavní CTA **Založit tipovačku**,
vedlejší **Mám pozvánku**, malý odkaz **Přihlásit se**. Profil není povinný
mezikrok. Méně kliků neznamená skrýt důležité podmínky připojení.

Pracovní název zůstává Fan Tipovačka. Nejnovější barevný námět vlastníka:
Azure Navy `#3283BE`, Snowy white `#FEFDFE`, Coral red `#FD614B`.
Jde o návrh brandkitu pro další vizuální práci, ne schválení přebarvení živé
aplikace. Zachovat výraznou sportovní typografii, čitelné karty a přímočaré
ovládání. Nevyměňovat celou architekturu kvůli nové marketingové stránce.

## Co znamenají požadované skills

Vlastník upřesnil, že zná následující názvy z Claude a nemá k nim zdroje.
Bereme je jako požadované oblasti práce. Přesné balíčky zde nejsou nainstalované;
nečekat na instalaci a nepřidávat náhodný balíček podle podobného názvu.

| Požadavek | Konkrétní odpovědnost a výstup |
| --- | --- |
| taste-skil | Jedna čitelná hierarchie, vědomá kompozice, kontrast a rozestupy; zdůvodnění každého bloku a odstranění opakující se výplně. |
| design-motion | Krátká zpětná vazba na ovládání a střídmé přechody; samostatné chování pro reduced-motion. |
| canvas-design | Brandboard: role barev, typografie, rytmus, ukázka tlačítka a produktové karty; shodné tokeny pro design i kód. |
| ae-motion | Případný krátký produktový klip pro kampaň jako oddělený asset. After Effects ani video nejsou závislost landing nebo podmínka prvního vydání. |
| hi-fi.mockups | Čitelný mobilní a desktopový návrh s reálnou délkou CZ/EN textů, chybovými stavy a označenými demo daty. |
| slide-decks | Volitelný stručný brand/handoff přehled. Prezentační deck nestavět místo funkčního webu. |
| feedback-loops | Jeden cílený review po struktuře, další po vybraném hi-fi návrhu a poslední po funkčním průchodu. Každé kolo má konkrétní problém a podmínku ukončení. |
| System-structure | Oddělená veřejná prezentační vrstva, sdílené tokeny a jasná hranice vůči autentizované hře. |
| persona-architecture | Dvě cesty: organizátor a pozvaný. Tvůrce/hospoda jsou příklady použití stejného modelu, ne další povinné rozcestníky. |
| tone-calibraion | Přátelské tykání v CZ, krátké věty, sportovní energie bez sázkařských slibů; jednotný slovníček CZ/EN. |
| guardrails | Žádné změny RLS, účtů, tipů, bodování nebo cronu v rámci vizuálního balíku; žádné skutečné osobní údaje v ukázkách. |
| trust-calibrations | Rozlišit funkční, připravované a demo. Žádné smyšlené počty lidí, partnerství, recenze, ceny nebo tvrzení o okamžitém live výsledku. |
| hndoff-protocol | Předat zvolený vizuální cíl, texty, assety/licence, tokeny, stavy, cíle CTA, provedené kontroly a neověřené části. |

Použitelný existující základ: `sites:sites` pro doručení samostatného webu,
`product-design:ideate` pro vizuální výběr, `build-web-apps:react-best-practices`
pro implementaci a `build-web-apps:frontend-testing-debugging` pro browser QA.
`imagegen` lze využít pro potřebné obrazové assety. To nejsou alternativní
názvy Claude balíčků, ale dostupné pracovní postupy. Nový motion nebo UI
framework nyní není potřeba; aplikace už má React, Tailwind, `motion` a
`lucide-react`. Sites přístup ověřil hlavní agent; další propojení pro návrh
není potřeba.

## Dvě návštěvnické cesty

**Organizátor:** landing → začátek založení s názvem party a soutěží →
přihlášení podle potřeby → návrat k rozepsané akci → lobby s prvním tipem a
pozvánkou. Ukázka na landing smí jít prohlédnout bez registrace. Netvrdit, že
tato cílová cesta už existuje: stávající aplikace je dnes auth-first.

**Pozvaný:** sdílený odkaz → identita lobby a soutěž → přihlášení podle
potřeby → připojení nebo jasný stav žádosti → otevřené tipy. Platný odkaz
nenutit přes marketingový rozcestník ani znovu opisovat join kód.

Pro produkční integraci CTA nejprve ověřit existující routing a Netlify
rewrites. Uchovat jen nezbytný create/join intent; join kód neposílat do
analytiky, veřejných URL screenshotů ani mezi nepříbuznými službami.

## Struktura a komponenty

| Blok | Mobil | Desktop a interakce |
| --- | --- | --- |
| `MarketingHeader` | Značka a Přihlásit se; bez nutného menu pro tři položky. | Kotvy Jak se hraje / Soutěže / FAQ a CZ/EN. |
| `LandingHero` | Headline, jedna věta, hlavní CTA, vedlejší odkaz a čitelný výřez hry. | Dva sloupce: sdělení a produkt; zachovat pořadí čtení. |
| `HowItWorks` | Tři krátké kroky ve svislém toku. | Stejný význam; neslibovat tři kliky nebo neověřenou dobu založení. |
| `ProductWalkthrough` | Jeden tip a vysvětlení bodů, pod ním pořadí. | Produktové ukázky a popisky vedle sebe; případný přepínač neskrývá hlavní vysvětlení. |
| `CompetitionOverview` | Skutečně dostupné soutěže seskupené podle sportu. | Kompaktní přehled, nikoli velká katalogová aplikace. |
| `GroupContinuation` | Jedna ukázka vlastní lobby s chybějícími tipy a dalšími zápasy. | Ukázat důvod návratu; nevytvářet druhou registraci nebo komunitu. |
| `LandingFAQ` | Nativní rozbalovací otázky se stavovou sémantikou. | Účet, soukromí, body, uzávěrka, opravy a další soutěž. |
| `FinalCTA` a `MarketingFooter` | Opakovat stejnou hlavní akci, kontakt, pravidla, soukromí a jazyk. | Žádné neověřené partnerství, prázdné právní odkazy nebo falešný ceník. |

Produkční výřez tipování a leaderboardu má navázat na dnešní
`MmaFightCard`, `PredictionDistribution` a `HomeDashboard`. Pro veřejnou
ukázku vytvořit prezentační adaptér se statickými demo daty; nemontovat do
landing plnou autentizovanou obrazovku nebo service-role klienta.
Ownerův `ProductEvolutionPreview` je rozpracovaný podklad, ne hotový marketingový
asset. Jeho demonstrační čísla nejsou veřejný důkaz používání.

## Brand a interakční tokeny k dopracování

- Snowy white je hlavní plátno, Azure vizuální identita a informační akcent,
  Coral hlavní akce a drobné zvýraznění. Doplnit textový ink a ověřené stavy,
  ne odvozovat úspěch/chybu pouze z brandových barev.
- Výpočtem sRGB mají Azure/Snowy kontrast přibližně **4,04:1** a Coral/Snowy
  **2,96:1**. Bílý drobný text na přesných akcentech nestačí pro cíl 4,5:1.
  Zachovat uživatelovy barvy; návrh funkčních doplňků je ink `#0F172A`
  a Azure Strong `#24618C`. Přesné role a kontrasty určuje návrh brandkitu.
- Typografii držet při zemi: výrazný sportovní nadpis, běžné čitelné tělo,
  tabulární číslice pro skóre. Kandidát: **Barlow Condensed ExtraBold Italic**
  pro krátké nadpisy a **Inter** pro tělo a ovládání. Použít jen potřebné řezy
  s diakritikou, ověřit licenci a self-hosting; nepřidávat další fontové rodiny.
- Cílit na základ textu 16 px, délku odstavce zhruba do 65 znaků na řádku,
  ovládací plochy nejméně 44 px a viditelný focus. Přesné rozměry ověřit v návrhu.
- Hover/focus/pressed odezva 120–180 ms; případný nástup obsahu 220–320 ms,
  malý posun a opacity. Obsah musí zůstat dostupný i bez spuštění animace.
- `prefers-reduced-motion` vypíná posuny a dekorativní animace. Žádný scroll
  hijacking, nutný autoplay, nekonečné plovoucí karty nebo vlastní cursor.

## Implementace bez zbytečných závislostí

Veřejný obsah vracet v HTML/statickém výstupu. CZ a EN mají vlastní cesty,
metadata a jazykové alternativy; žádná automatická registrace pro čtení návodu.
První viewport a hlavní CTA nepotřebují stáhnout celou herní aplikaci, Clerk
nebo sportovní API. Hru načíst až pro skutečnou cestu do aplikace.

Pro ověření návrhu lze použít samostatný soukromý Sites výstup. To neznamená
přesunout dnešní hru z Netlify nebo vytvořit jinou DB/auth. Finální umístění
veřejné landing na doméně propojit s existující aplikací a zvoleným routingem.
Zdrojové a hostingové kroky Sites provádí hlavní agent, nikoli několik agentů
souběžně proti jednomu Site.

Upřednostnit nativní odkazy, formuláře a FAQ; layout přes CSS. Dodatečný motion
balík nebo canvas runtime jen s konkrétním účelem a ověřeným dopadem.
Všechny obrázky mají správný rozměr, alternativní text/popis a původ/licenci;
produktové screenshoty nemají být nečitelná dekorace.

## Feedback a předání do realizace

1. **Struktura:** ověřit sdělení, primární akci a dvě návštěvnické cesty.
   Hotovo, když reviewer vlastními slovy řekne pro koho hra je a co udělat dál.
2. **Vybraný hi-fi cíl:** mobil a desktop s reálným textem, barevnými rolemi
   a stavy. Výběr vizuálního směru předchází plné implementaci. Reference jsou
   užitečné, ale současný styl a dodaná paleta stačí jako vstup do návrhu.
3. **Funkční preview:** projít obě cesty, klávesnici, chyby a návrat z auth;
   opravovat pozorované problémy, nepřidávat další efekty bez důvodu.

Při handoffu přiložit zdroj vybraného návrhu, tokeny, CZ/EN copy a slovníček,
asset manifest s licencemi, stavy CTA/formulářů, routy a přesné odlišení
funguje/demo/připravuje se. Kontroly se evidují jako provedeno/neprovedeno
s konkrétním výsledkem, nikoli „všechny možné scénáře prošly“.

### Podmínky dokončení budoucí landing

- Čitelná a bez vodorovného scrollu při 320/390/768/1280 px a při 200% zoomu.
- Hlavní sdělení a akce srozumitelné bez pohybu, hoveru nebo registrace.
- Klávesnicí dosažitelné odkazy, formuláře a FAQ; focus je viditelný a dialog
  jej správně vrací. Barva nenese význam sama.
- Kontrast textů/stavů zkontrolovaný na skutečných kombinacích, reduced-motion
  vyzkoušené v prohlížeči. Neprohlašovat kompletní WCAG shodu z jednoho screenshotu.
- Create/join intent přežije přihlášení; neplatná/expirující pozvánka a čekání
  na schválení mají srozumitelný stav. Prototyp netvrdí reálné DB uložení.
- Každý zveřejněný jazyk má úplný obsah a fungující odpovídající cíl CTA.
- Veřejný HTML obsah, title/description, canonical, hreflang, interní odkazy,
  chybějící assety a konzole ověřené. Technické SEO není garance citace AI.
- Žádný soukromý e-mail, tajný join kód, token nebo nezískaný souhlas v ukázkách.
- Build a relevantní kontroly prošly, uložené mobilní/desktopové screenshoty
  odpovídají vybranému návrhu; případná omezení jsou přiznaná.

Tento dokument připravil handoff. Žádná nová landing, brand změna v aplikaci,
integrace, instalace nebo publikace v této podúloze neproběhla.
