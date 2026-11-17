# Cron a minimální dohled — audit B09

10. listopadu 2026. Tento blok prověřuje hlášení výsledkového syncu a návrh
nejmenšího dohledu. Nevytváří admin dashboard, nemění provider, bodování,
uzávěrky, plán volání ani limit API. Žádný hosted zápis, změna cron-job.org,
odeslané upozornění nebo obnova databáze se v tomto auditu neprovedly.

**Výsledek:** známé chyby výsledkových providerů již nevracejí falešné HTTP 200.
Zelený běh ale neprokazuje čerstvost každého zdroje. B09 zůstává otevřené do
ověření příjemce a doručení alertů, skutečného hlídání čerstvosti a obnovy.

## Co kód skutečně vrací

Netlify `sync-football-data.ts` předává odpověď
`handleFootballDataSyncRequest` beze změny; lokální Express přebírá stejný status.
`status = 200` u pravidla v `netlify.toml` označuje interní rewrite, není to
nařízení vracet úspěch při každé chybě funkce. Význam rewrite popisuje
[Netlify](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/).

| Situace | HTTP | Detail |
| --- | ---: | --- |
| Ověřený dokončený běh včetně legitimních odkladů | 200 | Výsledek každé soutěže je v `competitions` |
| Chyba CL, PL, NHL nebo výsledkové/discovery části MMA | 502 | `failed=true`, ostatní bezpečné transakce mohou uspět |
| Souběh nebo rozpor výsledkových faktů | 409 | `busy` nebo `conflicts`; nemusí znamenat nulové zápisy |
| Neplatný/chybějící Bearer | 401 | Provider ani databáze se nevolá |
| Neplatná metoda/tělo | 405 / 400 | Před spuštěním syncu |
| Chybějící konfigurace nebo vypnuté HTTP zápisy | 503 | Bez spuštění zapisovacího syncu |

Fotbal a hokej agregují chyby soutěží do `failed`; MMA stejně agreguje selhání
kalendáře, karet a ověření seznamu cílů. Společný handler bere jejich sjednocené
`failed/busy/conflicts`, takže úspěšná PL nezmění selhanou NHL nebo UFC na 200.
Neočekávaná výjimka také skončí neúspěchem, s obecnou zprávou bez převzetí
zdrojového textu nebo tokenu. JSON odpovědi mají `cache-control: no-store`.

Výsledek `wrote_to_db=true` může být přítomen i u 409/502: soutěže mají nezávislé
transakce. Opakování zůstává idempotentní. Chybu ani timeout nelze interpretovat
jako potvrzení, že žádný zápis neproběhl.

## Co zelený cron nezaručuje

- ELH je úmyslně vypnutá a vrací `skipped=true, disabled=true`. Její vypnutí není
  aktuální porucha NHL. Zdroj nelze marketingově vydávat za aktivně ověřený.
- MMA claim vrací stejný negativní výsledek pro neaktuální termín i vyčerpaný
  měsíční rozpočet. Odpověď pak uvádí „cached/not due or budget exhausted“ a
  HTTP 200 je legitimní stav transportu. **Dlouhodobě vyčerpaný budget může
  zastavit aktualizace UFC, zatímco společný cron dál svítí zeleně.**
- Prázdná, zatím nezveřejněná karta zůstává pending; nevytváříme zápasy ani
  výsledky. Chyba volitelné miniatury je warning a záměrně neshazuje výsledky.
- Chybějící samotné spuštění jobu nemusí vyvolat HTTP failure notification.
  Úspěšná jiná soutěž ani čas běhu endpointu nejsou důkaz posledního úspěšného
  pozorování konkrétní karty.

Limit 900 výsledkových/discovery požadavků měsíčně, nezávislý limit miniatur a
adaptivní cadence zůstávají stejné. Není důvod kvůli dohledu zvyšovat spotřebu
provideru nebo provádět ruční zápis skóre.

## Nejmenší provozní další krok

1. **Jeden kanál: ověřený e-mail vlastníka v existujícím cron-job.org.** Vlastník
   určí adresáta; potom ověřit failure po dvou bězích, recovery a automatické
   vypnutí. Nepřidávat Slack, nový placený monitor ani dashboard.
2. Ověřit aktuální konfiguraci existujícího jobu a reálné doručení failure i
   recovery bezpečným testem bez sportovních zápisů. Starý doklad v
   [cron runbooku](football-data-cron.md) z 5. listopadu uvádí zapnuté alerty,
   není však novým testem doručení konkrétnímu příjemci.
3. Samostatný malý follow-up: serverový read-only freshness check nad existujícími
   soukromými sync-state/budget údaji. Má signalizovat chybějící úspěšný běh,
   zastavený due cíl a vyčerpaný rozpočet; bez nových zápasových/API požadavků,
   bez veřejného přístupu a bez UI. Příjemce i tento check se zde nezapnuly.

Nativní notifikace umí failure threshold, recovery a automatické vypnutí;
doručovací kanál je oddělené nastavení. Pouhé `onFailure=true` bez skutečně
zvoleného a ověřeného kanálu není důkaz funkčního dohledu.
[Oficiální konfigurace cron-job.org](https://docs.cron-job.org/rest-api.html#jobnotificationsettings)
popisuje tyto přepínače a kanály, včetně účtového e-mailu.

## Čerstvost musí respektovat časovou osu sportu

Příští kontrola má porovnávat `last_success_at`, `next_sync_at` a stav/čas karty,
nikoli hlásit každý den bez nových gólů. Provider nemusí publikovat nový výsledek
právě teď; úspěšné ověření nezměněných faktů je pořád úspěšné pozorování.

| Cíl | Očekávaný interval podle současného kontraktu | Návrh tolerance pro dohled, nikoli nový polling |
| --- | --- | --- |
| CL/PL/NHL aktivní pravidelný sync | 15 minut | První provozní upozornění po dvou chybějících/chybných bězích; potvrdit příjemcem |
| Nedokončená UFC karta: 6 h před prvním zápasem až 12 h po něm | 15 minut | Dva zmeškané termíny plus délka právě běžícího jobu |
| UFC do 7 dní před / 72 h po kartě | 6 hodin | Jeden další interval a plánovací rezerva |
| Vzdálenější UFC / do 30 dní po kartě | 1 den | Jeden další interval a plánovací rezerva |
| UFC více než 30 dní po kartě | 30 dní | Archivní kontrola; ne incident po dni bez změny |
| UFC discovery | Denní úspěšný refresh; po chybě 6 h retry | Oddělit discovery od čerstvosti již známých karet |

Konkrétní tolerance musí být zapsané a ověřené proti `next_sync_at`/discovery
stavu při implementaci monitoru. Upozornění na vyčerpaný budget má být samostatné
a tlumené, ne opakovaný alert každých 15 minut. Stávající cadence je v
[UFC runbooku](ufc-season-league.md); hlídání ji nesmí zkrátit ani rozšířit budget.

## Ověření tohoto bloku

- `npm run test:football-data`: 11 providerových + 18 sync/HTTP testů prošlo.
  Nové regresní případy: NHL/UFC/discovery partial failure 502 i po úspěšném
  zápisu jiné soutěže, zachování 409 a diagnostiky při částečném zápisu,
  legitimní cached/disabled/optional stav 200.
- Stávající 401-before-work a sanitizace zdrojové výjimky prošly bez duplikace
  stejného testu. Nebyl vypsán ani použit žádný skutečný klíč.
- `npm run test:hockey`: 9/9; `npm run test:mma`: 34/34.
- `npm run lint` a `git diff --check`: prošly.
- Vše běželo s mockovanými zdroji a klienty. Netlify/cron-job.org runtime,
  příjemce e-mailu, doručení alertu ani skutečná čerstvost hosted dat se nyní
  neověřovaly. Produkční transportní zdrojový kód se nemusel opravovat.

Tento dokument **neuzavírá disaster recovery**. Dřívější exporty nebo omezená
rollback rehearsal nejsou totéž co úplná obnova databáze, Auth, Storage a
konfigurace. Samostatný restore audit musí doložit obsah a datum zálohy,
bezpečné místo obnovy, funkční přístup a kontrolní data, očekávané RPO/RTO a
postup pro identity, které se po výmazu nesmí obnovou znovu aktivovat.
