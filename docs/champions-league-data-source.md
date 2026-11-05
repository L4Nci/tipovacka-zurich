# Liga mistrů — zdroj dat pro první pilot

Ověřeno 5. 11. 2026. Cíl: Liga mistrů 2026/27, později Premier League,
levný pilot a společná sportovní data pro všechny lobby. Následně schválený
import 36 klubů a 144 zápasů už proběhl; [aktuální stav a cron](football-data-cron.md).
Historické soutěže zůstávají na původním provideru.

## Výsledek autentizovaného dry-runu

**football-data.org Free prošel čtecím ověřením s vlastníkovým tokenem.**
Oficiální [pokrytí](https://www.football-data.org/coverage) zahrnuje Ligu mistrů
i Premier League. [Free tarif](https://www.football-data.org/pricing) má
10 požadavků za minutu, rozpisy a výsledky se zpožděním. Pro první pilot
nepotřebujeme živé minuty zápasu. Je ale nutné ověřit aktuálnost časů výkopu.

Živé GET dotazy na metadata a zápasy sezony vrátily HTTP 200:

| Soutěž 2026/27 | Zápasy | Kluby | Kola | Stav při kontrole |
| --- | --- | --- | --- | --- |
| Liga mistrů, ligová fáze | 144 | 36 | 8 × 18 | 72 dokončených, 72 s potvrzeným termínem |
| Premier League | 380 | 20 | 38 × 10 | 90 dokončených, 290 s potvrzeným termínem |

Počty odpovídají hlášenému počtu záznamů. Kontrola prošla bez duplicitních ID,
opakovaných dvojic v ligové fázi, neplatných UTC časů a chybějícího skóre u
dokončených zápasů. Každý klub LM má osm různých soupeřů a čtyři domácí zápasy;
každý klub PL má 38 zápasů, z toho 19 doma. Každé kolo má správný počet týmů.
Jde o ověření těchto sezon a konkrétního účtu, nikoli všech soutěží nebo celé historie.

Historický návrh prvních tří kol měl 54 zápasů. Vlastník následně zvolil celou
sezonu bez tohoto omezení; termíny zde zůstávají jako informace z dry-runu:

| Kolo | Termín | Zápasy |
| --- | --- | --- |
| 5 | 24.–25. 11. 2026 | 18 |
| 6 | 8.–9. 12. 2026 | 18 |
| 7 | 19.–20. 1. 2027 | 18 |

Všech 18 dvojic pátého kola, jeho data a výkopy, plus termíny šestého a sedmého
kola jsme porovnali s [oficiálním rozpisem UEFA](https://www.uefa.com/uefachampionsleague/news/02a8-2174c9e9019d-f909a77bd77a-1000--202627-champions-league-all-the-league-phase-fixtures-and-results/).
V listopadu až lednu odpovídá 17:45/20:00 UTC českým 18:45/21:00.
Definitivní kola vybereme až po dokončení aplikace. Data se před importem znovu načtou.

## Výsledky, prodloužení a penalty

Čtecí dotaz na dokončenou LM 2025/26 vrátil 189 zápasů: 186 v základní době,
dva po prodloužení a jeden s rozstřelem. Reálné payloady ukázaly:

- Po prodloužení: `regularTime = 3:0`, `extraTime = 0:2`, `fullTime = 3:2`.
  `extraTime` obsahuje góly samotného prodloužení; sčítáme základní dobu a prodloužení.
- Po rozstřelu: `regularTime = 1:1`, `extraTime = 0:0`, `penalties = 4:3`,
  zatímco `fullTime = 5:4`. Pro vlastníkovu preferenci je herním výsledkem **4:3**;
  oficiální gólové skóre zůstává **1:1**. Samotné `fullTime` nestačí.

Dry-run vrací odděleně oficiální góly, penalty a kandidáta herního skóre.
Chybějící či nekonzistentní komponenty finálního výsledku označí k revizi;
nedokončené skóre zůstává `null`. Tato interpretace nemění stávající bodování,
výsledky ani verzi pravidel v DB.

## Opakovatelné ověření

Token `FOOTBALL_DATA_API_TOKEN` patří do běžného ignorovaného `.env`, pouze na server.

```sh
npm run test:football-data
npm run football-data:dry-run -- CL 2026
npm run football-data:dry-run -- PL 2026
```

[Skript](../scripts/football-data-dry-run.mjs) používá pouze GET na pevně zadaný
API host, odmítá přesměrování a nevypisuje token ani chybové tělo providera.
Na běh použije dva sekvenční požadavky. Surovou odpověď a report ukládá do nové
dočasné složky s omezenými právy; cestu vypíše. Neobsahuje DB klienta.
[Jedenáct testů](../scripts/football-data-dry-run.test.mjs) ověřuje úplnost,
duplicity, cizí sezonu, chybějící týmy/časy, nulové výsledky, prodloužení,
penalty a ochranu tokenu. Testy i živý CLI dry-run prošly.

Změněné soubory této etapy: `scripts/football-data-dry-run.mjs`,
`scripts/football-data-dry-run.test.mjs`, `package.json`, `README.md`, tento dokument,
`docs/beta-implementation-scope.md` a `docs/product-restart-plan.md`.
Prošly také `npm run lint`, `npm run build`, `npm run build:netlify`, kontrola
syntaxe obou skriptů a `git diff --check`. Build dál hlásí dříve známý velký
frontendový chunk a Node deprecation warning. Nasazení neproběhlo.

`pilotReady` v reportu znamená pouze historické doporučení tří datově úplných
budoucích kol. Neomezuje nynější celosezonní test ani nepotvrzuje připravenost aplikace.
Pomocné doporučení zahrnuje jen celé kolo se všemi zápasy `TIMED`; `SCHEDULED` má podle
[dokumentace](https://docs.football-data.org/general/v4/match.html) pouze předběžný termín.

## Import a navazující implementace

Kluby a 144 zápasů jsou importované do společného katalogu v hlavní DB.
Soutěž je nyní aktivní v Testovacím rodeu, bez omezení na tři kola.
Otevřena je celá ligová fáze; importer a pravidla play-off ještě doplníme. `LEAGUE_STAGE` se mapuje
na `League Phase`, kterou klient správně rozpozná jako fázi s povolenou remízou.
Chráněný endpoint synchronizace je připravený a lokálně ověřený; Netlify
deployment a zapnutí cron-job.org teprve navážou. Samotný původní dry-run
zůstává čtecí a zápisy nezapíná. Podrobnosti jsou v [runbooku](football-data-cron.md).

## Proč nestačí současné bezplatné TheSportsDB

Živý čtecí dotaz na
`https://www.thesportsdb.com/api/v1/json/123/eventsseason.php?id=4480&s=2026-2027`
vrátil HTTP 200, ale pouze **15 zápasů z 7.–14. července 2026**, všechny z prvního
kvalifikačního kola. Všechna data byla označená ligou `4480` a sezonou `2026-2027`;
nešlo o prázdnou odpověď ani chybný identifikátor soutěže.

[Oficiální dokumentace](https://www.thesportsdb.com/documentation) pro sezonní
endpoint uvádí limit 15 záznamů zdarma a 3 000 v Premium. Častější opakování
stejného dotazu neodstraní omezení výsledku. Sdílený veřejný klíč `123` není
produkční tajný klíč. Placený TheSportsDB zůstává možností pro širší sportovní
pokrytí; jeho nákup není součástí tohoto podkladu.

## Zbývající ověření před živým syncem

- Před startem zopakovat kontrolu vybraných kol a oficiálního rozpisu;
  jednorázový snapshot nedokazuje rychlost budoucích aktualizací.
- Ověřit odklady, TBA, změnu termínu a dokončený zápas bez úplného skóre.
  Chybějící výsledek znamená čekání, nikoli nulu nebo automatické bodování.
- V DB a skutečném herním průchodu ověřit mapování fází, oficiálních gólů,
  rozstřelu a pevné verze pravidel. Offline čtečka tento průchod nenahrazuje.

## Návrh synchronizace

Jeden serverový adapter načte zápasy soutěže do společného katalogu;
počty lobby a hráčů nenásobí počet požadavků na externí API.
Mapování používá provider + stabilní ID události, nikoli pouze názvy týmů.

Pro pilot lze začít obnovou rozpisu po několika hodinách a kontrolou výsledků
přibližně každých 15 minut v okolí hracích dnů. Přesnou frekvenci upraví dry-run
podle limitů a zpoždění skutečného tarifu. Job musí být vypínatelný, mít zámek
proti souběhu, omezené retry a dohledatelné chyby.

Nejprve čtecí dry-run. Teprve ověřená data zapojit do chráněného zápisu výsledků:
opakované spuštění nesmí měnit body podruhé ani přepsat ručně potvrzenou opravu.
Pravidla konkrétní soutěže zůstávají verzovaná a pevná od prvního tipu.

Doplnění 5. 11.: všech 72 budoucích dvojic, dat a časů bylo porovnáno s uvedeným
oficiálním rozpisem UEFA po převodu do Europe/Prague, bez rozdílu. Všech 36 klubů
má importovaný znak z téhož API; viz [aktuální implementace](football-data-cron.md).
