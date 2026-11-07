# MMA winner-only pilot

Aktualizace 6. 11. 2026. Dvě karty jsou importované v existujícím Supabase a
připojené do **Testovacího rodea**. Migrace `20261106122607_mma_winner_pilot`
je aplikovaná. První MMA release z [PR #23](https://github.com/L4Nci/tipovacka-zurich/pull/23)
je nasazený; skutečný plánovaný cron 6. 11. v 16:01 Praha vrátil HTTP 200 a
zpracoval obě karty. Okamžité opakování obě MMA karty správně přeskočilo jako
nesplatné. Historické tipy, zápasy a profily po importu i tomto běhu zůstaly
shodné se zálohou. Landing zůstává pouze zadáním.

## Karty a pravidla

| Soutěž / provider ID | Katalog | Otevřené duely při importu | První zápas v Praze | Hlavní karta v Praze |
| --- | --- | --- | --- | --- |
| UFC 334 / 2563 | `ufc-334-2026` | 13 + 2 zrušené | 14. 11. 23:00 | 15. 11. 03:00 |
| Procházka–Stirling / 3533 | `ufc-qatar-2026-11-21` | 9 | 21. 11. 16:00 | 21. 11. 19:00 |

Časy jsou první ověřený import, nikoli trvalý slib rozpisu. Ukládají se v UTC,
UI nyní používá `Europe/Prague`, nezávisle na volbě CZ/EN.

`mma-winner-v1`: tip na vítěze duelu, správný = **1 bod**, jinak 0. Remíza,
no contest a zrušený duel = 0. Celá karta se zamyká při prvním zápase, nikoli
při hlavním duelu nebo začátku hlavní karty. Způsob/kolo se ukládají jako fakta
výsledku; jejich tipování a bonusy v tomto pilotu nejsou zapnuté.

Tip je samostatný pro každou lobby. Změna kteréhokoli soupeře nebo opětovné
zařazení zrušeného duelu zvýší verzi obsazení. Starý výběr se nepřepisuje;
před uzávěrkou hráč vybere znovu, jinak původní neplatný tip získá 0.
Jednou uplynulá uzávěrka se posunem rozpisu neotevře.

MMA používá vlastní tabulky `mma_events`, `mma_fights`, `mma_fighters`,
`mma_predictions`. Nevytváří fiktivní fotbalové skóre 1:0. Pořadí je uvnitř
konkrétního eventu/lobby; globální profilové statistiky a staré odznaky zatím
MMA tipy nezahrnují. Různé sporty nemají společné bodové pořadí.

## Rozhraní a poměr tipů

Pravidla a časy hlavní karty jsou pod tlačítkem (i) v dialogu ve stylu ostatních
částí aplikace. Dialog podporuje Escape, zavření mimo obsah a vrácení fokusu.
Uzávěrka celé karty zůstává stručně viditelná nad filtry.

Stejná komponenta pruhu jako ve fotbalu a hokeji zobrazuje podíl uložených
platných tipů na oba bojovníky. Počítá jen členy této lobby, stejný duel a
aktuální verzi obsazení, včetně vlastního uloženého tipu. Rozepsaný výběr poměr
nemění. Bez tipů zůstává neutrální pruh a 0 % / 0 %. U nenulového počtu dávají
obě zaokrouhlené strany dohromady 100 %. Nejde o pravděpodobnost výsledku.

Rozbalení „Tipy ostatních“ ukáže jméno/avatar a vybraného bojovníka; vlastní tip
je zvýrazněný. Počet u tlačítka označuje ostatní, otevřený seznam zahrnuje i
vlastní platný tip stejně jako starší zápasové karty. Odebraní členové a tipy
na staré obsazení nejsou součástí tohoto přehledu. Ostatní tipy jsou viditelné
již před uzávěrkou, stejně jako v současných ostatních soutěžích.

Čtení používá stávající RLS, přesný lobby/event kontext a stránkování tipů i
pořadí; vlastní tipy zůstávají oddělené pro filtr Bez tipu a editační formulář.
Pro komunitní tipy není přidána nová policy, grant ani zápisová cesta. Tato klientská agregace je
určená pro pilot; velké veřejné komunity budou potřebovat samostatné kapacitní
ověření a případně serverovou agregaci.

## Zdroj, limity a automatizace

UFCalendar: `GET https://api.ufcalendar.com/v1/events/{id}`, serverový Bearer
`UFCAL_API_KEY`. Klíč nesmí mít prefix VITE a nepatří do gitu ani URL. Použitý
účet ověřen jako Free: 1 000 požadavků/měsíc, 10/min. Doplnění portrétů používá
stejný zdroj a klíč; popis je níže. API-Sports Free přístup k oběma termínům odmítl.

Stejný chráněný endpoint `/api/admin/sync-football-data` a stávající 15min cron
obslouží i MMA, pokud `MMA_SYNC_ENABLED=true`. JSON zachovává explicitní
`dryRun: false` a stávající autorizační hlavičku; žádný klíč se neposílá do UI.
Karta se načítá jednou pro všechny lobby, ne jednou na hráče nebo lobby.

DB `claim_mma_sync` povolí jen splatnou kartu a rezervuje požadavek ještě před
API voláním. Do 24 hodin před prvním zápasem až 16 hodin po něm každých
15 minut, mimo toto okno přibližně 6 hodin; po 72 hodinách denně, po 30 dnech
týdně. Dokončená karta vynechá intenzivní interval. Strop je 900 rezervací
měsíčně pro tento projekt, zbytek je rezerva pro ruční diagnostiku/import.
Jiné aplikace používající stejný klíč se do lokálního čítače nezapočítají.
Selhané pokusy rezervaci spotřebují, aby výpadek nevyčerpal API bez omezení.

Výsledek automaticky přepočítá MMA body napříč lobby. Stejný ověřený snapshot
opraví poškozené odvozené body; pozdější pozorování může opravit vítěze.
Starší **naše pozorování** nebo dva různé snapshoty pod stejným časem se odmítnou.
Zdroj neposkytl monotónní revizi každého výsledku: nový čas našeho načtení sám
nedokazuje, že poskytovatel nevrátil starší cache. Není implementován konsenzus
tří zdrojů ani zaručená live rychlost. Ověřený konečný duel nesmí nenápadně
přejít do čekajícího stavu; zmizení známého duelu z celé karty zastaví danou kartu.

Selhání jedné MMA karty nezastaví druhou ani fotbal/hokej. Selhání se promítne
do odpovědi společného endpointu. Ruční přepis vítěze v UI není součástí pilotu.

## Ověření a provoz

- `npm run test:mma` — normalizace, výsledek, změny soupeřů, UTC, uzávěrka,
  ochrana klíče, quota skip a oddělení selhání obou karet.
- `supabase/tests/mma_winner_pilot.sql` — bootstrap sada pro **prázdný MMA
  katalog**, zabalená do BEGIN/ROLLBACK. Skutečně prošla před importem přes
  oficiální CLI. Ověřuje vlastní/cizí lobby, immutable identitu, zákaz bodů a
  sportovních faktů z klienta, neuznanou identitu, stale lineup, přepočet ve
  dvou lobby, opravy bodů/vítěze, staré pozorování, uzávěrku a měsíční limit.
  Po ROLLBACK ověřeno 0 fixture profilů, 0 MMA eventů a 0 MMA tipů.
- Před prvním importem vznikly privátní zálohy starých public dat a zdrojových
  snapshotů. Skript `npm run mma:import -- --write` nyní zálohuje i MMA tabulky.
  `--write` je bootstrap s připojením k Testovacímu rodeu; pro běžný provoz
  používat sdílený sync. `--dry-run` katalog ani tipy nemění, ale čerpá API limit.
- Komponentové UI QA proběhlo na 1280×720 a 390×844: pojmenovaná lobby,
  jednotlivé soutěže, proklik Bez tipu, výběr/uložení, změna soupeře a zamčení.
  Použity fixture props bez zápisů do DB; nejde o skutečný Clerk E2E test.
- Čtecí DB test přes existující mapování vlastníka a simulované Clerk claims
  ověřil 13/9 chybějících tipů a dostupnost pořadí v jeho Testovacím rodeu.
  Nejde o test podpisu či browser session skutečného JWT.

Advisors: RLS je na všech nových tabulkách. Dvě serverové private tabulky jsou
úmyslně bez hráčských policies/grantů. `get_mma_lobby_leaderboard` je úmyslně
SECURITY DEFINER kvůli agregaci profilu a má explicitní kontrolu identity a
členství; negativní přístup byl otestovaný. Samotný advisor warning není
potvrzení chyby. Viz [výklad linteru](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Před pozváním širší veřejnosti zbývá skutečný účet/obnova po refreshi,
hraniční souběhy, výpadek a opožděné výsledky během živé karty, dohled a obnova.
Neoznačovat celý produkt za bezpečnostně uzavřený: [matice](security-readiness-matrix.md).

## Portréty bojovníků — patch 2

Migrace `20261107100541_mma_fighter_portraits` je aplikovaná v existujícím
projektu. Přidává pouze kosmetické `mma_fighters.portrait` a `portrait_checked_at`,
privátní frontu obnovy a čítač fotografií. Nemění jména/identity, rozpisy, výsledky,
tipy ani body. Zdrojový patch je navázaný na [issue #28](https://github.com/L4Nci/tipovacka-zurich/issues/28).

Server čte `GET /v1/fighters/{id}` přes stejný `UFCAL_API_KEY`. UI dostane jen
vybraný ověřený obrázek a plné kredity v již existujícím dotazu na bojovníky.
Nevolá poskytovatele po hráčích ani lobby. Soubory jsou obsloužené z providerova
Commons CDN a ukládají se do běžné browser/CDN cache; vlastní Storage ani placené
transformace nejsou potřeba. Neznámý host, neprůkazná licence nebo chybějící autor
znamenají náhradní zobrazení. Známé CC BY/BY-SA, CC0 a public domain metadata se
ověřují serverově i před vykreslením. Viditelný kredit pod daným bojovníkem uvádí
autora, licenci, odkaz na původní soubor a označení CSS ořezu. Aplikace nemění
originální obrázek a neposílá na CDN/API klíč ani referrer. API vrací pouze fotky
z Commons, nikoli oficiální promo fotografie; podmínky §6 uvádějí pravidla kreditů.

První načtení 7. 11. 2026 ověřilo všech 44 profilů aktivních duelů: 19 použitelných
fotografií a 25 náhradních zobrazení. Zbývající tři uložené profily nejsou součástí
aktuálních aktivních duelů, pro které se profil čerpá. Jde o pokrytí v okamžiku importu,
nikoli slib, že API dodá fotografii každému novému bojovníkovi. Kontrolní otisky
všech herních tabulek, historických tipů/profilů a původních údajů bojovníků
zůstaly po načtení shodné.

Každý nezkušební běh existujícího cronu zkusí nejvýše **jeden** splatný profil
z aktivních duelů. `dryRun`, vypnuté MMA nebo chyba při čtení MMA výsledků obnovu
fotek vynechá. Chyba portrétu sama nevyvolá chybu výsledkového cronu; odpověď nese
samostatné `competitions.MMA_PORTRAITS.warning`. Profilové volání má limit 5 s.

DB rezervace sdílí zamykání a měsíční rozpočet s výsledky. Fotky mají vlastní
strop **100 rezervací/měsíc** a přestanou rezervovat při celkovém čítači 800,
aby posledních 100 z limitu 900 zůstalo výsledkům. Mezi profilovými rezervacemi
je nejméně 10 s. Úspěch i potvrzené „bez fotky“ se cacheují 30 dní; chyba ponechá
stávající obrázek a počká den. Patnáctiminutový lease obnoví úlohu po pádu workeru;
starý/nesprávný/expirující token nesmí přepsat novější metadata. Tyto RPC může
spustit jen `service_role`; hráčská oprávnění se nerozšiřují.

`npm run mma:portraits -- --dry-run` pouze čte stav cache, bez API požadavků.
`--write --fighters=196,102,116` cíleně připraví několik profilů; `--write --limit=50`
postupně zpracuje až 50 splatných profilů, po 11 s. Všechny zápisy procházejí
stejnou DB rezervací, nikdy neresetují cache/kvótu a předem zálohují tabulku
bojovníků do privátního dočasného adresáře. Rychlé opakování může správně skončit
skipem. Budoucí nové zápasy/bojovníci se postupně doplní existujícím cronem.

Ověření: `npm run test:mma` zahrnuje profilovou identitu, výběr fotky, hosty/licence,
chybějící a prázdné obrázky, ochranu klíče a oddělení selhání od výsledků.
`supabase/tests/mma_fighter_portraits.sql` je opakovatelná sada pro existující
katalog s ROLLBACK: hráčské zákazy, lease, stará odpověď, 30denní cache, chyba,
prázdný výsledek, kvóty a zachování výsledkové rezervy. Test nemění sportovní fakta.
Náhled s fixture ověřuje mobil/desktop, kredity, výběr i uložení a zachování
rozepsaného tipu při selhání fotky. Skutečné Clerk přihlášení při tomto QA není
nahrazováno fixture důkazem.

## Zdrojové podklady

- [API dokumentace](https://api.ufcalendar.com/docs) a [OpenAPI](https://api.ufcalendar.com/openapi.json).
- [Tarif a použití](https://www.ufcalendar.com/developers/ufc-schedule-api), [podmínky](https://www.ufcalendar.com/developers/terms).
- [Produktový plán](mma-and-worlds-launch-plan.md) a [landing brief](landing-page-brief.md).
