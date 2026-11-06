# UFC/MMA a cesta k MS v hokeji 2027

Stav k 6. 11. 2026. Produktové zadání a pracovní plán. Následný winner-only
pilot je implementovaný a obě UFC karty importované; skutečný stav ověření
a vydání je v [MMA runbooku](mma-pilot-runbook.md). Landing je pouze zadání.
Dlouhodobý směr je v [ROADMAP.md](ROADMAP.md).

## Přijatý směr

- Přidat MMA, nejprve UFC. Vlastníka tento sport baví a může kolem něj získat první partu.
- Využít návaznost dvou eventů pro ověření návratu hráčů ve stejné lobby.
- **MS v hokeji mužů 13.–30. 5. 2027 je hlavní CZ/SK milník.** Před jeho kampaní
  už má produkt plně běžet. Kampaň má být hlavně marketing, ukázky a polish;
  základní funkce ani bezpečnost se nemají dokončovat těsně před MS.
- Zachovat jeden model: stálá lobby pořadatele → jednotlivé soutěže/eventy →
  vlastní účast, pravidla a pořadí. Pozvánka míří rovnou do soutěže.
- Landing nejprve definovat společně. Současný pokyn nezadává její stavbu.

## Nejbližší příležitost a podmínky

| Event | Ověřený termín | Účel v plánu |
| --- | --- | --- |
| UFC 334, New York | 14. 11. 2026, datum v místě konání | Kandidát na první malý test s partou |
| UFC Qatar: Procházka–Stirling | 21. 11. 2026 podle UFC | Kandidát na návrat stejné party a české sdělení |
| MS v hokeji mužů | 13.–30. 5. 2027 | Hlavní příležitost pro CZ/SK nábor |

UFC termíny jsou příležitost, nikoli slíbené datum vydání. Před spuštěním je
nutný ověřený dostupný zdroj, úplná karta, pravidla a průchod skutečného hráče.
Pokud to listopadový termín nesplní, test se přesune na další vhodný event.
Pilot UI používá jednotně Europe/Prague; globální volba časové zóny hráče ještě
není implementovaná. Datum americké hlavní karty se v Česku posouvá na další den.
Přesné ověřené časy první/hlavní karty jsou v runbooku.

## MMA struktura — přijatý směr a zbývající pravidla

Sport je **MMA**, organizace **UFC**, event je konkrétní karta a zápas je duel
dvou bojovníků. UFC není samostatný sport ani druhý model lobby. Každý event
má vlastní pořadí; sezonní MMA žebříček zatím nenavrhujeme jako podmínku startu.

| Oblast | Nejmenší smysluplná varianta |
| --- | --- |
| Tip | Přijatý směr: vítězný bojovník; speciální pravidla dovolí zapnout bonus za způsob a bonus za kolo. Vlastník potvrdil kolo bez přesného času |
| Výsledek | Vítěz, oficiální způsob ukončení, kolo/čas, stav a zdrojová revize, pokud je zdroj poskytuje |
| Bodování | Pilot `mma-winner-v1`: správný vítěz 1 bod, jinak 0; bonusy nejsou implementované |
| Uzávěrka | Pilot má společnou uzávěrku při prvním zápase karty, před prelims, ne až při main card |
| Změna soupeře | Původní tip nepřenést na jiný duel; změnu zobrazit a nové tipování povolit pouze před platnou uzávěrkou |
| Zrušení, remíza, no contest | Pilot neboduje, zobrazuje skutečný stav a nepřiřazuje vymyšleného vítěze |
| Oprava výsledku | Dohledatelná novější ověřená fakta a automatický přepočet podle verze pravidel; starší data odmítat |

Způsob a kolo navrhujeme jako dvě jednoduché volby zapnuto/vypnuto při založení
soutěže s okamžitým příkladem bodů. Číselné bonusy zatím přijaté nejsou.
Pracovní návrh: bonusy získat jen při správném vítězi, kolo vybírat jen u
ukončení před časovým limitem; výhra na body nedává automaticky bonus za
poslední kolo. Přesné zacházení s technickým rozhodnutím, diskvalifikací,
remízou/no contest a opravami potvrdí datový a herní kontrakt. Oficiální
metodu ukládat samostatně od případně zjednodušené herní kategorie.

Odklad po uzávěrce nesmí automaticky znovu otevřít tipy. Čas jednotlivého duelu
nebývá pevný; per-duel uzávěrky lze slíbit až po ověření včasných stavů zdroje.
Skóre 0:0/1:0 z fotbalu či hokeje nemá zastupovat MMA výsledek.

**Technické oddělení:** `src/lib/scoring.ts` podporuje jen `football` a
`hockey`; `Match` a `Prediction` v `src/types.ts` předpokládají dvě číselná skóre.
MMA má proto vlastní datový/predikční kontrakt, tabulky a kartu. Znovu používá
účty, lobby, pozvánky a princip společného syncu. Nový cron pro každou lobby není potřeba.

## Data před stavbou

Nejprve porovnat dostupné MMA zdroje pro současné UFC: ID eventu/duelu/bojovníka,
úplnost karty, změny soupeřů, UTC termíny, zrušení, remízu/no contest, konečné
výsledky a jejich opravy. Ověřit provoz z Netlify, limity i povolené použití dat
v zamýšleném produktu. Bezplatný tarif není důkaz použitelnosti aktuální sezony.

Pro dvě karty prošel UFCalendar Free: úplné duely, UTC, stav a parsování
historických výsledků. Schéma a quota-aware polling popisuje runbook. Samotné
ověření vzorku negarantuje dostupnost a zpoždění výsledků během živé karty.
Placený tarif vyžaduje vlastníkovu volbu až nad konkrétní cenou a ověřeným rozsahem.

## Landing a návrat hráče

Jedna značka a společná landing; tematické vstupy pro UFC a MS v hokeji.
Komunikace: vyzvat partu, tipnout, sledovat společné pořadí. Organizátor přichází
s předvoleným eventem; pozvaný hráč zachová lobby/event přes přihlášení a dostane
se rovnou k otevřeným tipům. Úprava avataru první tip neblokuje.

Po UFC eventu nabídnout další event stejné partě; účast je dobrovolná a body se
do nového pořadí nepřenášejí. Vyhodnocovat první tip po pozvánce, čas k jeho
uložení a návrat na druhý event. Neoptimalizovat pouze počet registrací.
Číselné cíle náboru a rozpočet zatím přijaté nejsou.

## Navržené přípravné milníky

Termín MS je pevný kalendářní vstup. Následující interní termíny jsou pracovní
návrh, ne potvrzení hotové implementace nebo příslib bez ověření rozsahu.

| Období | Ověřitelný výsledek |
| --- | --- |
| Listopad 2026 | Stabilní dosavadní hra; MMA zdroj a pravidla ověřené před malým testem |
| Prosinec 2026 – leden 2027 | Souvislý mobilní CZ/EN průchod od pozvánky po body, landing po výběru směru, měření a test s další samostatnou partou; slovenský rozsah rozhodnout včas |
| Únor, cílově do 28. 2. 2027 | Plně provozuschopný veřejný základ, bezpečnostní a zátěžové ověření, dohled/obnova a ověřená cesta pro MS data |
| Březen – duben 2027 | Už běžící produkt: hlavně obsah, tvůrci, komunity, demonstrace a polish. Do 30. 4. generální zkouška kampaně, nikoli první dokončení základů |
| 1.–12. 5. 2027 | Nábor a drobné opravy při sledovaném provozu |
| 13.–30. 5. 2027 | MS kampaň a sledovaný provoz |

## Co znamená připravený produkt pro MS

- Skutečné průchody založení, pozvánky, přihlášení, tipu, uzávěrky, výsledku a
  pořadí projdou na mobilu i desktopu, také bez pomoci autora.
- Celý hlavní průchod a pravidla fungují CZ/EN. Pro CZ/SK kampaň doporučujeme
  doplnit i plnou slovenštinu; její rozsah zatím není rozhodnutý.
- Produkční konfigurace Clerku a zvolená veřejná doména jsou ověřené;
  development instance není cílový stav veřejného vydání.
- Oprávnění/RLS, oddělení lobby a ochrana uzávěrek mají ověřené negativní
  scénáře. Před kampaní projde bezpečnostní kontrola včetně závislostí;
  nevyřešené zneužitelné závažné nálezy blokují širší spuštění.
- Automatické MS rozpisy, play-off, prodloužení/nájezdy, opravy a přepočet
  bodů projdou reprezentativními scénáři. NHL není důkaz ověření IIHF zdroje.
- Výpadek zdroje, zpožděná data a selhání jobu jsou viditelné; existuje dohled,
  záloha s vyzkoušenou obnovou a postup pro omezení zápisů při incidentu.
- Zátěžová zkouška odpovídá domluvenému počtu hráčů a špičce před zápasem.
  Cílový objem a provozní rozpočet se stanoví před testem; dnes ověřené nejsou.
- Landing, pravidla/soukromí, kontakt a měření pozvánka → první tip → návrat
  jsou připravené pro kampaň. Kosmetika a sponzorované ceny nejsou podmínkou.

## Zdrojové podklady

Ověřeno 6. 11. 2026. Časy a karty znovu ověřit před importem a publikací.

- [MSG: UFC 334, 14. listopadu 2026](https://www.msg.com/events-tickets/ultimate-fighting-championship-ufc-madison-square-garden-november-2026/3B00652EC2504689).
- [UFC: listopadové eventy včetně Procházka–Stirling](https://www.ufc.com/story/a9f2be51-0187-4915-840d-fa46514147b6).
- [IIHF: aktuální rozpis MS 2027](https://www.iihf.com/en/events/2027/wm/schedule).
  Rozpis začíná 13. května; některé starší přehledy IIHF ještě uvádějí 14. května.
