# Profil: revize a návrh dalšího balíku

Pracovní doporučení z 8. 11. 2026, nikoli vydaný redesign nebo změna pravidel.
Navazuje na [obsahový manuál webu](website-content-manual.md).

Vizuální směr potvrzen vlastníkem 9. 11.: zachovat název Fan Tipovačka a
současný bílý/červený sportovní styl. Navrhované přeskupení profilu naváže
na existující typografii, karty a ovládací prvky; referenční weby nejsou podmínkou.

## Verdikt

Profil má fungující základ pro identitu, účet a odznaky. Dnes však začíná
velkými editačními formuláři; vlastní hráčský přehled je pod nimi. Navíc
statistiky a obecné hráčské milníky nezapočítávají MMA. Pouhé přeskládání
karet by tento problém schovalo, ne vyřešilo.

Cíl: hráč pozná, jak ho vidí ostatní, co už dokázal a kde jeho výkon patří.
Jméno, bio a avatar mají jít upravit dobrovolně; neblokují vstup do hry.

## Podklady a hranice ověření

- S1: vlastníkem dodaný screenshot 18:48:34 — identita, úprava jména,
  bio, viditelnost a čtyři statistiky.
- S2: vlastníkem dodaný screenshot 18:48:40 — získané odznaky, účet,
  správa účtu, jazyk a odhlášení.
- Oba původní soubory byly prohlédnuty. Soukromé kopie jsou pouze lokálně
  v `/private/tmp/tipovacka-profile-audit-2026-11-08/`, nikoli v repozitáři.
  Druhý screenshot obsahuje osobní e-mail; nepoužívat jej v marketingu.
- Prověřen aktuální zdrojový kód. Čtecí kontrola definic skutečných DB funkcí
  potvrdila: `get_profile_summary` a `reconcile_my_achievements` čtou zápasové
  `predictions`, nikoli `mma_predictions`; `get_user_badges` používá `name_cs`.
  Nebyly čteny osobní hodnoty profilů ani provedeny DB zápisy.
- Přihlášený profil nebyl dostupný v ovladatelném prohlížeči. Jde o revizi
  dodaných obrazovek a implementace, ne nový živý průchod ukládáním a Clerkem.
  Klávesnici, focus, čtečku a skutečné ukládání bude nutné ověřit při implementaci.

## Průchod a zjištění

| Krok | Stav | Důkaz a problém | Doporučení |
| --- | --- | --- | --- |
| 1. Otevřít profil a poznat svou vizitku | Základ funguje, slabá hierarchie | S1: první velká karta je formulář; jméno je současně nadpis i pole. | Kompaktní vizitka, až 3 vystavené odznaky, akce Upravit profil a náhled. |
| 2. Upravit identitu a soukromí | Zbytečně rozdělené, nejasný rozsah viditelnosti | S1: dvě samostatná uložení; titulek Veřejný profil při stavu Profil je soukromý. | Editace až na vyžádání; pojmenovat viditelnost a vysvětlit komu co ukážeme. |
| 3. Pochopit statistiky | Neúplné a zavádějící popisky | S1 + DB/kód: MMA chybí, Soutěže znamená dokončené účasti; součet bodů míchá různé kontexty. | Nejprve sjednotit definice; výkony zobrazit v konkrétní lobby a soutěži. |
| 4. Vybrat odznaky a najít další cíl | Výběr existuje, postup je schovaný | S2 + komponenta: získané odznaky lze vystavit, vrácené progress se nevykresluje. | Kompaktní sbírka a jeden nejbližší dosažitelný milník. |
| 5. Spravovat účet, jazyk a odhlášení | Funkce existují, zbytečně dlouhý blok | S2: několik velkých karet; Clerk je implementační název, ne metoda přihlášení. | Nastavení účtu jako vedlejší vstup; zachovat správu účtu přes Clerk. |

Silné stránky: konzistentní vizuální styl, čitelné názvy akcí, rozumný
limit tří vystavených odznaků a oddělení sportovního profilu od správy přihlášení.
V návrhu je zachovat; nepotřebujeme nový účetní nebo autentizační systém.

## Navržené pořadí profilu

1. **Hráčská vizitka:** avatar, zobrazované jméno, volitelné bio a nejvýše
   tři vystavené odznaky. Dvě malé akce: Upravit profil / Jak mě vidí ostatní.
2. **Moje výkony:** konkrétní lobby a soutěž, vyhodnocené tipy, úspěšnost
   výsledku/vítěze a umístění. Přesné skóre jen u fotbalu/hokeje, ukončení
   jen u MMA. Jeden zřetelně označený kontext; žádné anonymní „#1“.
3. **Moje odznaky:** vybrané a další získané, odkrytí celé sbírky na vyžádání,
   jeden nejbližší cíl s aktuálním a cílovým počtem.
4. **Nastavení:** jazyk, vysvětlení viditelnosti, e-mail a Spravovat účet,
   nápověda/kontakt a odhlášení. Vývojářský nápis Clerk odstranit z běžného textu.

Nedělat čtyři povinné záložky. Výchozí obrazovka je přehled; editace a nastavení
se otevřou až podle potřeby. Nenatipované zápasy zůstávají hlavním úkolem domova
a lobby. Z profilu stačí návrat do zobrazené lobby, ne druhý seznam všech zápasů.

### Soukromí: zachovat skutečný význam

Soukromá vizitka dnes neukazuje ostatním bio a globální statistiky; jméno
a avatar jsou dál viditelné spoluhráčům ve společné lobby. Veřejná vizitka
umožní bio/statistiky zobrazit i ostatním přihlášeným hráčům. Nejde o veřejný
profil s indexovanou URL. Návrh textu: **Viditelnost hráčské vizitky**, pod ním
výše uvedené konkrétní vysvětlení. Nezaměňovat přejmenování ovladače za změnu RLS.
Náhled musí odpovídat skutečným oprávněním, ne jen přepnutí CSS.

## Statistický kontrakt před implementací

| Údaj | Doporučená definice | Hranice |
| --- | --- | --- |
| Odehrané tipy | Uložené tipy na vyhodnocené duely v zobrazené lobby/soutěži | Nepočítat čekající, void/cancelled nebo zneplatněnou sestavu mezi pokusy o úspěšnost. |
| Úspěšnost | Správný výsledek 1/X/2 u fotbalu/hokeje nebo vítěz MMA / platné vyhodnocené tipy | Metodika a jmenovatel pod (i); 0 vyhodnocených = „Zatím bez výsledků“, nikoli 0 % skillu. |
| Přesné skóre | Přesně zasažené bodované skóre podle pravidel dané soutěže | Nevztahovat na MMA; nesměšovat góly a penaltové skóre. |
| Ukončení MMA | Správně vybraná kategorie / vyhodnocené platné tipy s vybranou kategorií a známým ukončením | Skipped method, DQ/other a neznámé ukončení nejsou neúspěšný povinný tip. |
| Body a pořadí | Autoritativní leaderboard zobrazené lobby a soutěže | Nesčítat různé sporty a v1/v2 jako jednotný žebříček dovednosti. |
| Aktivita napříč aplikací | Případně počet unikátních duelů: sport/provider + duel ID | Oddělit od počtu tipů lobby × duel; bez skrytého přepisu stávajícího významu. |
| Účasti / trofeje | Aktivní účast a dokončený výsledek jsou různé věci | Neodvozovat dnešní „Soutěže“ jako počet zapnutých soutěží. |

To jsou návrhy zobrazovaných metrik, ne schválení nové bodovací logiky.
Stejný zápas ve dvou lobby má dál dva samostatné tipy. Procenta nejprve
zobrazovat v konkrétním kontextu, kde je tento význam přirozený.

## Odznaky a retence

- **Milníky:** první platný tip, další počet tipů, založení party; nabídnout
  srozumitelný další krok. Do přehledu zapojit i MMA, ne vytvořit druhý systém.
- **Sportovní výsledky:** vítěz lobby/eventu/sezony vždy s kontextem a rokem.
  Před propagací sjednotit shody a opravy s autoritativním leaderboardem.
- **Kosmetika:** případné budoucí rámečky/skin oddělit od zasloužených trofejí.
  Tento návrh neaktivuje prodej ani neuděluje placený sportovní výkon.
- Dnešní obecné awards zůstávají po opravách výsledku a přiznávají se při
  otevření profilu. Není to hotové okamžité udělování po každém tipu.
- Odznaky z DB mají české názvy i při EN. Použít stabilní klíče a překlady;
  otestovat i texty vracené serverem, nejen statické titulky Reactu.

### Přístupnost k ověření při změně

S1/S2 ukazují velmi světlé popisky a oddělení převážně barvou — změřit kontrast.
Kód přepínače viditelnosti nemá stavovou sémantiku, výběr odznaků nemá
`aria-pressed`, bio nemá trvalý label a avatar modal nemá dialogovou sémantiku.
Při implementaci doplnit názvy/stavy, viditelný focus, obsluhu klávesnicí,
správný návrat focusu z dialogů a oznámení výsledku uložení. Ze screenshotů
nelze potvrdit úplnou shodu s WCAG.

## Dva proveditelné balíky

**A — spolehlivý profil:** nejdřív odsouhlasit statistické definice; společně
provést opravu multisportových agregací a cílené přeskupení UI. Zachovat
bodování, členství, oprávnění a přihlášení. Testovat oddělení lobby,
duplicitní tipy, nulové výsledky, MMA v1/v2, opravu výsledku, změnu sestavy,
odznaky CZ/EN a soukromí. Žádné skutečné QA tipy; DB scénáře přes rollback.

**B — veřejný web:** souběžně dokončit texty a ukázky podle manuálu. Pak vybrat
vizuální směr a postavit veřejnou landing + krátký návod. Návrat z přihlášení
musí zachovat pozvánku a zamýšlenou akci. Nepodmiňovat první tip editací profilu.

Přijetí A: nový hráč rozpozná svou vizitku, upraví jméno, vysvětlí statistiky,
vybere odznak a vrátí se do lobby. Přijetí B: organizátor založí partu a pošle
pozvánku; pozvaný dokončí první tip. U obou ověřit mobil, klávesnici a CZ/EN.
Konverze/retence se teprve změří; počet účtů sám o sobě není úspěch.

## Reference implementace

- [Profil](../src/components/ProfileScreen.tsx), [komunitní profil a odznaky](../src/components/ProfileCommunityPanel.tsx).
- [Profilové statistiky a viditelnost](../supabase/migrations/015_community_profiles_foundation.sql).
- [Obecné milníky a awards](../supabase/migrations/016_achievements_badges_foundation.sql).
- [Rozšířený přehled odznaků a progress](../supabase/migrations/023_official_event_product_evolution.sql).
- [MMA kontrakt](mma-finish-methods.md), [UFC roční liga](ufc-season-league.md).

Migrace jsou reference vývoje, ne tvrzení, že staré auth.uid() je současný
auth model; existující Clerk bridge zůstává zdrojem identity.
