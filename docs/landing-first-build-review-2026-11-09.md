# První landing — implementace a ověření, 9. 11. 2026

Soukromá první verze pro vlastníka, ne dokončená veřejná kampaň:
https://fan-tipovacka-landing-v1.l4nci.chatgpt.site

Sites potvrdilo terminální stav `succeeded`. Browser handoff potvrdil soukromou
bránu ChatGPT; v náhledu není přihlášený účet vlastníka. Samotná stránka byla
funkčně i vizuálně ověřena na lokálním sestavení stejného zdroje.

- Projekt: `appgprj_6af18fef391881919e7dedc450759aa4`
- Zdrojový commit: `62f595a11c6fc4cba41c1d4a288fcfa922c3f42c`
- Verze: `appgprj_6af18fef391881919e7dedc450759aa4~appgver_84273dee6b50819183d78539d2ab8916`
- Deployment: `appgdep_6af1c0c4246c8191afe3ca7f91b7431c`
- Zdroj: `sites/fan-tipovacka-landing` (vlastní Sites Git checkout).

## Porovnání s koncepty

Tři související koncepty v `design/` mají 1487 × 1058 px. Hero a střed byly
porovnány se screenshoty ve stejném viewportu; závěr se srovnává po sekcích,
protože skutečné FAQ je delší a obsahuje navíc funkční formulář pozvánky.
Vlastník vybral brandový směr; konkrétní dokončenou stránku ještě nepřijal.

| Oblast | Výsledek / záměrná odchylka |
| --- | --- |
| Hierarchie hero | Dva sloupce, velký kondenzovaný titulek, modré „ROZUMÍ“, produktová karta vpravo. Na mobilu se karta řadí za CTA. |
| Text nad přehybem | Titulek, hlavní vysvětlení, „Založit tipovačku“, „Mám pozvánku“ a „Začneš přihlášením.“ odpovídají konceptu. Hlavička zachovává Jak se hraje / Soutěže / FAQ / CZ / EN / Přihlásit se. Žádný další slib ani horní slogan. |
| Typografie | Skutečné self-hosted Barlow Condensed a Inter z brandkitu; generátor měl přibližnou typografii a větší doprovodné texty. Kód zachovává čitelné ovládání, ne totožnou velikost každého bitmapového detailu. |
| Barvy | Přesné Azure/Snow/Coral tokeny. Výběry jsou Coral/Ink místo generátorovy dodatečné cyan. Závěrečný pruh používá tmavší Azure Strong pro kontrast bílého textu. |
| CTA | Coral hlavní akce a textová pozvánka. Přihlášení v hlavičce je klidný text místo dalšího coral tlačítka. |
| Kompozice | Otevřené tři kroky a sportovní řádek, zaoblené produktové ukázky, tenké oddělovače, FAQ a závěrečný barevný pruh. Reálné vysvětlivky zvyšují výšku proti konceptu. |
| Pravdivost ukázek | Výslovně fiktivní data, žádná tvrzení o skutečných uživatelích. Doplněna verze MMA pravidel a okrajové výsledky. |
| Pohyb a ovládání | Střídmé přechody, respekt k reduced-motion, viditelný focus a funkční klávesnice. Podstatná informace nezávisí na animaci. |

## Ověřené chování

- TypeScript `tsc --noEmit` a oficiální Sites build prošly.
- HTTP kontrola sestavení: `/`, `/cs`, `/en`; CS/EN text je v počátečním HTML,
  správný jazyk dokumentu, title/description, canonical a hreflang; soukromý
  návrh má noindex. Fonty jsou místní a dostupné.
- Browser: šířky 320, 390, 768, 1280 a 1487 bez vodorovného přetečení.
  Ve 1280 × 720 je hlavní CTA i informace o přihlášení nad přehybem.
- Samostatná ukázka ověřena pro 5/3/1/0, nepovinné ukončení, reset a zákaz
  vyhodnocení bez vítěze. Nevytváří skutečný tip.
- Přepnutí CS/EN, FAQ, prázdná pozvánka a fokus klávesnicí ověřeny.
- Cíle CTA porovnány s aktuální aplikací: `?account=sign-up`, `/join/CODE`.
  Aplikace zatím začíná přihlášením; landing nepředstírá přímé založení lobby.
  Bez JavaScriptu formulář předá `join` přímo aplikaci.
- Finální lokální produkční sestavení nemělo zachycené console warning/error.
  První dev načtení mělo přechodnou chybu při Vite optimalizaci závislostí;
  po optimalizaci se neopakovala ve finálním sestavení.

Nejde o úplný audit WCAG ani bezpečnostní certifikaci. Samostatně nebylo
ověřeno Safari, reálná nová registrace, kompletní návrat po přihlášení, 200%
zoom ani výkon pod kampaní. Herní DB, auth, pravidla a Netlify nebyly změněny.

## Co zbývá před veřejnou kampaní

Vlastník projde texty a mobilní první dojem. Poté navázat skutečný průchod
založením lobby a pozvánkou, doplnit provozovatele/kontakt, veřejnou doménu,
podmínky a úplné informace o osobních údajích. Měření funnelu a případné souhlasy
navrhnout zvlášť; tato verze nepřidává vlastní analytiku ani cookies trackeru.
