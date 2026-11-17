# Fan Tipovačka — návrh brandkitu v1

**Aktualizace 9. 11. — schválený rozsah aplikace:** vlastník nyní výslovně
schválil vizuální sjednocení vstupu do hry. Lokální přihlášení, registrace a
navazující jméno profilu používají Azure/Snow/Coral, Ink/Azure Strong a
self-hosted Inter/Barlow Condensed. Změny jsou omezené na `AuthScreen`, jeho
Clerk appearance a scoped CSS; logika přihlášení, ostatní herní UI a data se
nemění. Herní změna zatím není nasazená. Níže uvedené zákazy automatického
přebarvení byly omezením původního návrhu, ne zákazem této nové autorizace.

9. 11. 2026. Pracovní návrh pro landing a navazující profil. Zachovává název
a sportovní charakter aplikace, rozvíjí nově dodanou paletu. Návrh není
aplikovaný na živý web ani potvrzená finální značka.

## Značka a hlavní sdělení

**Fan Tipovačka. Stejná parta. Další výzva.**

Sportovní sebevědomí, přátelské soupeření a jasná orientace. Vizuálním základem
je čitelný produkt, výrazný nadpis a skutečné tipování/pořadí. Hlavní úvodní
sdělení zůstává: **Kdo z vaší party opravdu rozumí sportu?**

Primární člověk: organizátor party. Druhý průchod: pozvaný hráč, kterého vedeme
přímo do jeho lobby. Jedno hlavní tlačítko **Založit tipovačku**, vedle něj
textový vstup **Mám pozvánku**. Profil je pokračování identity a historie,
ne povinný formulář před prvním tipem.

## Barvy a jejich role

| Token | Barva | Použití |
| --- | --- | --- |
| Azure | `#3283BE` | Produktové akcenty, větší modré plochy, dekorativní sportovní detaily. Vlastníkem nazváno Azure Navy; hex zachovat přesně. |
| Snow | `#FEFDFE` | Dominantní podklad a světlá plocha. |
| Coral | `#FD614B` | Hlavní akce a vybraný důležitý moment. Úsporně, aby tlačítko zůstalo dominantní. |
| Ink — navržený doplněk | `#0F172A` | Běžný text, nadpisy a text na korálovém tlačítku. |
| Azure Strong — navržený doplněk | `#24618C` | Modrý běžný text na Snow, tmavší modré tlačítko se světlým textem. |

Snow je základ, Azure dává identitu, Coral přitahuje k hlavní akci.
Funkční doplňky slouží čitelnosti; nenahrazují tři původní barvy.
Výsledek a chybu neodlišovat pouze barvou. Týmové barvy v pruzích tipů mají
vlastní sportovní význam a nelze je globálně přebarvit na brand akcenty.

### Ověřené páry pro text

Výpočet kontrastu sRGB pro přesné hex hodnoty, bez průhlednosti:

| Text / pozadí | Poměr | Běžný text |
| --- | --- | --- |
| Ink / Snow | 17,59 : 1 | Ano |
| Ink / Coral | 5,94 : 1 | Ano — doporučené hlavní CTA |
| Snow / Azure Strong | 6,54 : 1 | Ano — alternativní CTA |
| Snow / Azure | 4,04 : 1 | Ne; pouze dostatečně velký text za splnění jeho podmínek |
| Snow / Coral | 2,96 : 1 | Ne; nestačí ani 3 : 1 pro velký text |
| Ink / Azure | 4,36 : 1 | Ne; nepoužívat pro drobný text |

Pravidlo 4,5 : 1 pro běžný text a 3 : 1 pro velký text vychází z
[WCAG 2.2, kontrast textu](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
To není osvědčení přístupnosti celé stránky. Focus, stavy, ikony, skutečnou
velikost textu a kontrast na fotografiích ověřit zvlášť.

## Typografie a komponenty

Návrh páru: **Barlow Condensed ExtraBold Italic** pro krátké sportovní nadpisy
a **Inter** pro tělo, navigaci a ovládání. Zachovat českou diakritiku a ověřit
EN texty. Nadpis může být výrazný; odstavce a tlačítka mají být snadno čitelné,
ne celá stránka psaná kondenzovanou verzálkou.

Obě rodiny mají v primárním repozitáři licenci SIL OFL 1.1:
[Barlow](https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/OFL.txt),
[Inter](https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt).
Pro finální web uložit potřebné fonty a licence lokálně, omezit řezy a použít
fallback i `font-display: swap`. Aktuální aplikace tím zatím nemění písmo.

- Rozestupy na mřížce 4/8 px; více místa mezi příběhovými sekcemi než uvnitř karty.
- Ovládání nejméně 44 px na výšku; čitelný label a viditelný focus.
- Návrh radiusu: tlačítka 12 px, karty 24 px. Shadow jen tam, kde pomáhá vrstvení.
- Produktové ukázky skutečně čitelné na mobilu, ne tři miniaturní telefony vedle sebe.
- V hero produkt a otázka pro partu; obecná fotografie stadionu není náhradou za vysvětlení hry.
- Pracovní wordmark je typografický název. Finální logo/favicon a jejich malé
  varianty jsou další výstup, pokud bude směr vybraný; nevydávat textový draft za hotové logo.

## Pohyb

Pohyb vysvětluje změnu: výběr tipu, otevření pravidel, potvrzené uložení.
Mikrointerakce přibližně 120–180 ms, přechod obsahu 200–280 ms. Hero a CTA
jsou dostupné okamžitě. Žádný scroll-jacking, nekonečné efekty, povinné video
nebo přepočítávání demonstračních čísel do falešných „živých“ statistik.

Respektovat `prefers-reduced-motion`. Potvrzení úspěchu přijde až po skutečném
uložení. Pro první implementaci stačí existující CSS a knihovna `motion`;
After Effects, video ani Lottie nejsou nutné závislosti.

## Tón, důvěra a hranice tvrzení

Krátké tykání, věcný sportovní humor, konkrétní další krok. „Pozvi partu“ nebo
„Tip uložen“ místo technického názvu systému. Jasně říct, zda jde o výsledek,
demo, čekající data nebo nepotvrzenou schopnost produktu.

Ukázky označit **Ukázková data**. Nezveřejňovat soukromé e-maily, kódy ani
celé pozvánky. Počty hráčů, partneři, ceny, retence, placené funkce a garantované
výsledky marketingu vyžadují skutečný podklad. Návrh brandkitu je neaktivuje.

## Skills, role a předání

Front-end subagent je spuštěný; [jeho konkrétní zadání](frontend-landing-handoff.md)
pokrývá rozložení, pohyb, persony, tón, zpětnou vazbu a přijetí.
Požadované názvy skillů vlastník zná z Claude a nemá konkrétní zdroj balíčků.
Nejsou nalezené pod přesnými názvy mezi instalovanými skilly ani v aktuálně
načteném oficiálním curated katalogu (39 položek). Neznamená to, že neexistují
jinde. Pro tuto práci je bereme jako požadované disciplíny, ne jako nainstalovaný kód.

Dostupné relevantní postupy: Sites, Product Design, React best practices,
frontend testing/debugging a image generation podle potřeby. Slide-deck
je volitelný budoucí prezentační výstup, ne závislost landing page.
Sites čtecí přístup byl ověřen. Pro tento návrh není potřeba nové propojení,
API klíč, databáze, placená služba ani cizí skill balík.

Další konkrétní výstup: návrh desktopové a mobilní landing v této paletě,
se skutečnou strukturou a označenými ukázkami, potom vybraný směr implementovat.
Hosting návrhu přes Sites a veřejný app deployment jsou samostatné cíle;
návrh brandkitu sám nepublikuje web ani nemění main.


## Implementace 10. 11. 2026 — pracovní návrh

Originální geometrický pohár je v `public/brand/fan-mark.svg`, odvozené favicon,
Apple a PWA/maskable PNG ve stejném adresáři. Primární herní CTA používají
`fan-primary` (#24618C) a Snow; výsledkové poměry, chyby a úspěchy si drží
vlastní významové barvy. Logo je pracovní návrh k přijetí vlastníkem, nikoli
prověrka ochranné známky. Landing a přihlášení používají stejný symbol.
Rozměry, maskable safe area a mobilní rendering byly ověřené; nativní instalace
a update PWA ještě ne. Detaily: [ověření](public-entry-verification-2026-11-10.md).
