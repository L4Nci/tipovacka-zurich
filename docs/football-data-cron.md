# Liga mistrů — import a cron-job.org

Stav 5. 11. 2026: do jediné stávající DB byl skutečně importován katalog LM
2026/27: **36 klubů a 144 zápasů ligové fáze**, z toho 72 hotových a 72 budoucích.
Na následný pokyn vlastníka je soutěž `uefa-champions-league-2026-27` aktivní
a připojená do **Testovacího rodea**. Tříkolový limit je zrušený; cílem je
průběžně hrát celou sezonu. Katalog zatím obsahuje ligovou fázi, import a pravidla
play-off ještě zbývají. K tipování je nyní 72 budoucích zápasů; 72 hotových je historie.
Aktivace byla ověřena katalogovým RPC pod emulovanou Clerk identitou vlastníka;
transakční zkouška uložení i editace vlastního tipu prošla s ROLLBACK.
SQL sada syncu byla upravena tak, aby její dočasný skrytý stav byl nezávislý
na skutečné aktivaci soutěže; znovu prošla a testovací řádky nezůstaly v DB.
V této změně se upravovaly stavové dokumenty a SQL test, nikoli frontendový kód;
vykreslený průchod v přihlášeném prohlížeči nyní ověří vlastník.

## Konfigurace

Lokálně je jediný běžný ignorovaný `.env`. Připravený serverový klíč
`FOOTBALL_DATA_SYNC_SECRET` je v něm vygenerovaný; jeho hodnotu neposílat do chatu.
Zápisy HTTP endpointu jsou lokálně vypnuté. Pro nasazení nastavit v Netlify:

```text
FOOTBALL_DATA_API_TOKEN=<stávající football-data.org token>
FOOTBALL_DATA_SYNC_SECRET=<hodnota z lokálního .env, alespoň 32 znaků>
FOOTBALL_DATA_SYNC_WRITE_ENABLED=true
```

Používají se také existující serverové `VITE_SUPABASE_URL` a
`SUPABASE_SERVICE_ROLE_KEY`. Žádný nový secret nesmí mít prefix `VITE_`.
Nové prostředí, druhá DB ani další přihlašovací služba se nezakládají.
`RESULT_SYNC_SECRET` a TheSportsDB endpointy se nemění.

## Nastavení jednoho jobu

Endpoint je připravený ve zdrojích a ověřený lokálně. **Nový Netlify deployment
dosud neproběhl**; job zapnout až po nasazení této funkce a konfigurace.
Při nasazení celé aplikace ověřit také Clerk origin/issuer v backendu a Supabase;
dosud ověřený DB allowlist zahrnuje jen localhost. Serverový cron používá vlastní
klíč a uživatelské přihlášení nepotřebuje.

```text
POST https://tipovacka-fotbal.netlify.app/api/admin/sync-football-data
Authorization: Bearer <FOOTBALL_DATA_SYNC_SECRET>
Content-Type: application/json
```

Nejprve jednorázově spustit s tělem:

```json
{"dryRun": true}
```

Pro běžný běh změnit tělo na:

```json
{"dryRun": false}
```

V [cron-job.org](https://cron-job.org/) zvolit metodu POST, vlastní hlavičky,
JSON tělo a upozornění na neúspěšný běh. Vlastní hlavičky a tělo podporuje
[oficiální konfigurace jobu](https://docs.cron-job.org/rest-api.html#jobextendeddata).
Pro začátek stačí **jednou za hodinu** (`0 * * * *`); kolem pilotních hracích
dnů lze zkrátit na 15 minut (`*/15 * * * *`). Zvolit časové pásmo Europe/Prague
a timeout 30 sekund. Free provider má zpožděné výsledky, nejde o live-score službu.

Jeden běh používá jeden požadavek na sezonu; počet lobby a hráčů jej nenásobí.
Výchozí tělo `{}` znamená dry-run. Tělo nepřijímá jiné soutěže, bootstrap ani secret.
Tajný klíč patří do hlavičky, nikoli URL.

## Kontroly a chování

- Adapter ověří všech 144 zápasů a 36 klubů, celá kola, stabilní ID, UTC časy,
  revize a finální skóre. ID používají namespace `football-data-team-*` a
  `football-data-match-*`; mapování nezávisí na názvu klubu.
- Zápasy mají fázi `League Phase` a samostatné `matchday`. Nový klient v ní
  správně umožňuje remízu. Skrytá soutěž je z výběru klienta vynechána a DB
  nepřijme hráčský tip do jejího zápasu. Skrytí není zákaz čtení sportovních dat.
- Import i sync mají transakční zámek proti souběžným zápisům. Nová revize může
  aktualizovat rozpis; starší revize se ignoruje. Posunutí výkopu znovu neotevře
  už uplynulou uzávěrku. Předběžné, odložené a zrušené zápasy nepřijímají nové tipy.
- První dokončený výsledek a body se uloží v jediné transakci. Server používá
  existující `calculatePoints`; všechny tipy načítá stránkovaně. DB porovná celý
  snapshot se zamčenými řádky, při změně vše vrátí zpět a vyžádá opakování.
- Opakované uložení stejného výsledku nepřidává body znovu. Novější revize
  výsledku vlastněného API se opraví automaticky a atomicky přepočítá body všech
  dotčených lobby. Jiný výsledek se stejnou revizí nebo odvolaný stav se odloží
  jako konflikt. Případný historický ruční zápis má samostatný původ a sync jej
  přeskakuje; ruční obsluha není součástí běžného vyhodnocování.
- Importér podporuje pouze ligovou fázi LM 2026/27. Play-off, rozstřely a další
  soutěže vyžadují vlastní navazující kontrakt. API fakta jsou uložená zvlášť
  v `provider_score`; tento krok nezavádí novou verzi herních pravidel.
- Official Events se nezapínají. Pokud by jejich tipy později používaly stejný
  zápas, sync odmítne neúplné bodování. Historický TheSportsDB provoz se nemění.

HTTP: `200` = dokončeno, `400` = neplatné tělo, `401` = chybný klíč,
`405` = jiná metoda, `409` = souběh / konflikt / změna snapshotu,
`422` = nevalidní sezona, `502` = upstream chyba, `503` = konfigurace či DB.
Při konfliktu mohou být jiné bezpečné zápasy ve stejné transakci aktualizované;
problémový výsledek se zachová. Při chybě spojení nelze tvrdit, že DB nic
nezapsala — opakování je idempotentní. Chyby nevracejí token ani tělo API chyby.

## Vypnutí a dohled

Zastavení jobu v cron-job.org nebo `FOOTBALL_DATA_SYNC_WRITE_ENABLED=false`
vypne HTTP zápisy. Druhý vypínač je v DB:

```sql
UPDATE tipovacka_private.football_data_sync_state
SET enabled = false
WHERE tournament_id = 'uefa-champions-league-2026-27';
```

Tabulka má RLS a není dostupná běžným hráčům. Obsahuje `last_success_at` a
`last_summary` pro poslední dokončený zápis; konflikt neposouvá čas posledního
úspěchu. Síťové chyby jsou vidět v HTTP výsledku/historii jobu, protože při
nedostupné DB nelze spolehlivě uložit auditní řádek. Neúspěch se nemá ignorovat.

## Ověření a další práce

```sh
npm run test:football-data
npm run football-data:import                    # DB dry-run, bez zápisu
npm run football-data:import -- --backup-only  # soukromá záloha veřejných tabulek
npm run football-data:import -- --write        # výslovný import + záloha
```

CLI je záměrně omezené na stávající projekt; `--write` je ruční operátorská
operace a nepoužívá HTTP vypínač. Respektuje DB vypínač. Každý zápis CLI nejprve
zálohuje tabulky, žádné hodnoty klíčů nevypisuje.

Migrace `20261105092439_football_data_catalog_sync.sql` je aplikovaná. Prošlo
17 Node testů a transakční sada `supabase/tests/football_data_sync.sql`
s ROLLBACK: import/dry-run, opakování, atomické body, změna snapshotu,
ruční a potvrzené výsledky, starší revize, uzávěrka, vypnutí, oprávnění a odklad.
Lokální HTTP kontrola ověřila 405/401/400/503 a skutečný dry-run 200.
Prošly také Clerk regresní testy, typecheck, oba buildy, sestavení samostatné
Netlify funkce a `git diff --check`; zůstává známé upozornění na velký frontendový
chunk a Node deprecation warning. Žádný nový deployment ani job nebyl spuštěný.

Před migrací: soukromá záloha veřejných tabulek a otisky/indexy/policies v
`/var/folders/l7/zzy19nj93l38xzq007g61cq00000gn/T/tipovacka-before-football-import-b9HYM9/`.
Nejde o dump Auth/Storage. Po importu se shodují otisky všech původních 104
zápasů, 1 032 tipů, profilů i členství; součet bodů zůstal 1 667.
Bezpečnostní advisors evidují očekávané tabulky bez přímých klientských policies,
existující privilegované RPC a vypnutou kontrolu uniklých hesel starého Auth;
nejde o čistou bezpečnostní certifikaci.

Pro průběžný test celé sezony zbývají soutěžní účast, import a pravidla play-off,
pevná verze pravidel, CZ/EN průchod a nasazení. Audit navíc zjistil, že starší ruční
backend výsledků odkazuje na dosud neaplikované `020/021` Official Events;
jeho oprava je odložená mimo automatický hlavní průchod. Nový CL sync tuto chybějící závislost nepoužívá.

Změny této etapy: `AGENTS.md`, `PROJECT_RULES.md`, `.env.example`, `package.json`,
`server.ts`, `netlify.toml`, `scripts/football-data-dry-run.mjs`, nový importní CLI,
provider/sync a testy v `server/lib/footballData*`, Netlify funkce
`sync-football-data.ts`, `src/lib/db.ts`, `src/lib/matchRules.ts`, migrace a SQL test
`football_data_sync`, tento runbook a související stavové dokumenty.


## Znaky, český čas a pravidla — doplnění 5. 11. 2026

Migrace `20261105101126_football_data_crests_and_auto_corrections.sql` doplňuje
klubové znaky a automatické opravy novějších API výsledků. Všech 36 klubů má
`participants.logo_url` z existujícího pole `team.crest`; nový zdroj ani token
se nezakládá. Import přijme jen HTTPS CDN `crests.football-data.org` s číselným
PNG/SVG souborem. Skóre, původní tipy ani jejich body se při doplnění znaků nezměnily.

Klient přenáší URL do zápasu a zobrazuje znak přes stejný modul jako vlajku,
pomocí `object-contain`. Klubový znak má na kartě prostor 48 × 48 px bez vnitřního
odsazení; národní vlajka zůstává 48 × 32 px. Chybějící/chybný obrázek spadne na dosavadní
záložní zobrazení. Národní vlajky se nemění. Karty, přehled lobby a domovské uzávěrky
používají `Europe/Prague`; karta navíc uvádí datum a používá uloženou DB uzávěrku,
pokud je přítomná. Ověřeno všech 72 budoucích zápasů proti oficiálnímu rozpisu UEFA:
žádný rozdíl data ani českého času. Testy zahrnují letní/zimní čas i změnu data.

Ligová fáze umožňuje remízu. Samotné označení play-off neurčuje zákaz remízy:
jednotlivý zápas dvojutkání může být remízový, postupující se určuje zvlášť.
Konečný režim vyžaduje vítěze u známého jednozápasového vyřazování (MS, finále LM).
Při bodování 90 minut je remíza možná i tam. Viz
[pravidla UEFA, článek 21](https://documents.uefa.com/r/Regulations-of-the-UEFA-Champions-League-2026/27/Article-21-Knockout-system-extra-time-and-penalty-shoot-outs-Online)
a [finále, článek 22](https://documents.uefa.com/r/Regulations-of-the-UEFA-Champions-League-2026/27/Article-22-Match-system-final-Online).

Pouze při založení fotbalové lobby je malá CZ/EN ukázka: 90 minut
versus konečný výsledek, remíza/prodloužení/rozstřel a vlastní tip s výpočtem
existujících bodů 5/3/2/2. Příklad 1:1 po hře a 4:3 v rozstřelu hodnotí v režimu
90 minut skóre 1:1, v konečném režimu 4:3. Jde výslovně o náhled; nepřepíná ani
nepřepočítává rozehranou soutěž. Uložení pravidel, jejich verzování a vědomé změny
během testování teprve navážou. Tato změna nedoplňuje import vyřazovací fáze.

Prošlo 17 testů syncu, 4 testy prezentace/času/pravidel a rozšířená rollback SQL
sada: znaky, automatická oprava skóre i bodů, opakování bez další změny bodů,
stejná/starší revize a zachování ručního původu. Prošel typecheck, oba buildy
se známým varováním velikosti chunku. Komponenty byly ověřeny v lokálním náhledu
na desktopu a při šířce 390 px: načtené znaky, zachované národní vlajky, fallback,
uložení remízy 1:1 v náhledu, přepnutí příkladu na 90 minut a výpočet 5 bodů.
Náhled ukládání neposílal tip do DB. Plný přihlášený průchod nové verze na Netlify
nebyl ověřený: vlastník testuje starší nasazený klient, web je připojený k GitHubu.
Pro nové UI je nutný nový deployment, včetně konzistentní Clerk konfigurace.

Příprava releasu 5. 11.: původní Netlify proměnné `VITE_SUPABASE_URL` a
`VITE_SUPABASE_ANON_KEY` byly chybně označené jako tajemství. První PR build
proto zastavil scanner na veřejné URL v SQL kontraktu. Tyto dvě veřejné klientské
hodnoty se obnovují jako běžná konfigurace; kontrola tajemství se nevypíná a žádný
serverový klíč se nezařazuje mezi veřejné proměnné. Netlify neumožňuje příznak
`is_secret` pouze zrušit aktualizací, proto je nutné dané dvě proměnné znovu
vytvořit. Skutečná serverová tajemství mají jen production kontext. Současný tarif
neumožňuje užší rozsah Functions; frontend dostává pouze proměnné `VITE_`.
Externí cron se zapne samostatně po ověření nasazeného endpointu.

Změněné soubory této etapy: `server/lib/footballDataSync.ts` a jeho test,
`src/App.tsx`, `src/types.ts`, `src/lib/db.ts`, `src/lib/matchRules.ts`,
nové `src/lib/teamAssets.ts`, `src/lib/matchTime.ts`, `src/lib/rulePreview.ts`,
`src/lib/matchPresentation.test.ts`, `src/components/ScoringRulesPreview.tsx`,
časové formátování v `HomeDashboard`, `LobbyView`, `OfficialEventCard`,
`package.json`, nová migrace a rozšířený `supabase/tests/football_data_sync.sql`,
tento runbook a stavové/plánovací dokumenty.
