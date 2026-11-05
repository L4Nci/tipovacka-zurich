# Premier League, NHL a česká extraliga — 5. 11. 2026

Vlastník zadal přidání Premier League a poté automatizaci NHL i české extraligy.
Používáme stejnou DB, aplikaci, `.env`, Netlify web a chráněný cron. Nová placená
služba ani API klíč se nezakládají. Každá soutěž má samostatný katalog a pořadí;
tipy zůstávají oddělené pro každou lobby.

## Ověřené katalogy

| Soutěž | Zdroj | Zápasy v DB | Hotové / budoucí při importu |
| --- | --- | ---: | --- |
| Liga mistrů 2026/27 | football-data.org, CL | 144 | 72 / 72 |
| Premier League 2026/27 | football-data.org, PL | 380 | 90 / 290 |
| NHL 2026/27 | veřejný feed webu NHL | 1 344 | 250 / 1 094 |
| Tipsport extraliga 2026/27 | rozpis, kalendář a detaily Hokej.cz | 363 | 117 / 246 |

Extraligový zdroj obsahuje všech 364 zápasů základní části. Jeden nemá potvrzený
čas a zůstává v `awaiting_fixtures`; nic nevymýšlíme. Další sync jej přidá, až bude
čas známý. Všechny nové soutěže jsou aktivní a připojené do Testovacího rodea.
Nové lobby vybírají z DB katalogu; správce může soutěž přidat i do své stálé lobby.
Původních 1 034 tipů a jejich součet 1 667 bodů se importem nezměnily.

Premier League ověřuje 20 klubů, 38 kol, 380 zápasů a vyvážený rozpis.
NHL má v sezoně 2026/27 nově **84 utkání na klub**, nikoli 82: 32 klubů × 84 / 2
= 1 344 zápasů. Viz [oficiální oznámení NHL](https://www.nhl.com/news/nhl-announces-2026-27-regular-season-schedule).
Adaptér čte 32 klubových sezonních rozpisů s omezenou souběžností, z každého bere
domácí zápasy a kontroluje 84 utkání / 42 domácích na klub. Přípravu neimportuje.
Publikované zápasy typu 3 doplní do fáze Playoffs, maximálně 105 utkání.

Extraliga používá [oficiální přehled Hokej.cz](https://www.hokej.cz/tipsport-extraliga/zapasy).
Kontroluje 14 klubů, 52 kol a 7 zápasů v kole. Budoucí čas se převádí z Europe/Prague
do UTC; u historického/nově skončeného zápasu ověřujeme přesný čas i stav „konec“
v jeho detailu. Průběžné skóre se nevyhodnotí jako konečné. Stejný již ověřený detail
se znovu nestahuje, dokud se seznamové údaje nezmění. Chybějící nebo rozporné údaje
zastaví příslušný import a upozorní přes cron; ruční zápis výsledků není podmínkou.

**Hranice extraligy:** nyní je ověřená a automatizovaná základní část. Strukturu
play-off se nepodařilo ověřit na historickém zdroji (403); nepředstíráme podporu
nadstavby. Před jejím začátkem je potřeba doplnit a ověřit adaptér podle skutečně
publikované struktury. Neznámou fázi odmítáme. Hokej.cz není smluvně garantované
verzované API; změna HTML může vyžadovat úpravu parseru. NHL feed také nemá
garanci dostupnosti. Tato omezení platí pro veřejný komerční rollout.

## Jednotná automatizace

Existující úloha [8799825](https://console.cron-job.org/jobs/8799825) dál volá:

```text
POST https://tipovacka-fotbal.netlify.app/api/admin/sync-football-data
Authorization: Bearer <existující FOOTBALL_DATA_SYNC_SECRET>
Content-Type: application/json
{"dryRun":false}
```

Název endpointu zůstává kvůli kompatibilitě. Zpracuje CL, PL, NHL a ELH v oddělených
transakcích; výpadek jedné soutěže nezastaví ostatní. Odpověď má
`competitions.CL`, `.PL`, `.NHL`, `.ELH`. Konflikt/busy vrací 409, chyba některé
soutěže 502. Stav každé soutěže je uložený v neveřejných sync-state tabulkách.
Kill switch `enabled=false` zůstává dostupný pro každou soutěž zvlášť.
Lokální integrační dry-run všech čtyř soutěží: HTTP 200, 4,3 s, žádné konflikty
ani DB zápisy. Naplánovaný Netlify běh se ověřuje po vydání.

Žádný klíč nepatří do URL ani frontendu. Hockey zdroje neposílají žádný náš klíč;
povolujeme pouze GET a omezená přesměrování na stejný HTTPS origin.

## Skóre a ochrany

- Fotbal zachovává `football-final-shootout-v1`: konečné góly, při rozstřelu jeho
  samostatné skóre. Premier League má pouze základní hrací dobu. Body 5/3/2/2/0.
- Hokej má `hockey-final-v1`: oficiální konečné skóre po prodloužení / s jedním
  rozhodujícím gólem za nájezdy. Např. 2:2 po hře a výhra v nájezdech = **3:2**.
  Přesný tip 5 bodů, správný vítěz 2, nesprávný 0. Remízu nelze uložit ani přes DB API.
- Výsledek i body se zapisují atomicky pro všechny lobby. Kontroluje se snapshot
  predikcí, identity a soulad skóre se zdrojovými fakty. Starší lokální revize se
  ignorují; stejný ověřený snímek opraví lokální poškození. Potvrzený konec se
  nevrací na rozehráno podle jiného nehotového snímku. Uplynulé uzávěrky se neposunou.
- Hokejové zdroje nemají `lastUpdated` jako football-data.org. Ukládáme čas
  získání pozorování; shodná fakta zachovají předchozí ověřenou revizi. To chrání
  před opačným pořadím našich běhů, **neprokazuje stáří v interní cache providera**.
  Viz [politika zdrojů](result-source-policy.md). Tři zdroje pro různé ligy nejsou
  tři nezávislá potvrzení jednoho výsledku.

Frontend načítá i více než 1 000 zápasů / vlastních tipů a zobrazuje karty po 30,
s tlačítkem pro další. Klubové znaky používají stejný rozměr 48 × 48 jako fotbalové;
obrázky jsou omezené na konkrétní cesty providerů. Časy zůstávají v Europe/Prague.
Volitelné verzované bodování pro každou lobby ani monetizace se touto změnou nezavádějí.

## Opakování importu a kontrol

```sh
npm run football-data:dry-run -- PL 2026
npm run football-data:import -- --write --competition PL
npm run hockey:import -- NHL
npm run hockey:import -- ELH
# --write předem vytvoří soukromou zálohu a provede dry-run stejného batch:
npm run hockey:import -- NHL --write
npm run hockey:import -- ELH --write
npm run test:football-data
npm run test:hockey
npm run test:match-presentation
npm run lint
npm run build:netlify
npm run build
git diff --check
```

`--capture` připraví soukromý snapshot bez DB zápisu; volitelné
`--write /absolutni/cesta/snapshot.json` jej smí použít nejvýš 15 minut od pořízení.
Server kontroluje cílový projekt. SQL sady v `supabase/tests` používají dočasné
fixture ID a ROLLBACK; historické výsledky se pro test nepoškozují.
