# B15 — aktivita hráče oddělená od scoringu

10. 11. 2026. **Zdrojová revize a návrh před realizací.** Neběžel SQL zápis,
tracker, nové cookies ani sběr událostí. Nebyla měněna aplikace, bodování,
RLS nebo časové sloupce. Tento dokument nenahrazuje [P0/P1 audit](public-launch-p0-p1-audit-2026-11-09.md),
[růstový experiment](p1-community-experiment-pack-2026-11-09.md) ani [právně-technickou revizi](public-launch-security-privacy-legal-2026-11-09.md).
Nový provozní sběr vyžaduje konkrétně potvrzený účel, rozsah, přístup a retenci.

## Závěr revize

**`predictions.updated_at` není čas hráčova návratu.** Fotbalový i hokejový
sync jej přepisují při změně bodů. Hráčova score editace naproti tomu ve
zdrojovém klientu neposílá nový timestamp a kontrolované triggery jej samy
nenastavují. Jeden sloupec tak nezajišťuje ani úplnost, ani správnou autoritu
hráčské aktivity.

**MMA má jiný průběh:** aktuální authenticated guard nastavuje
`mma_predictions.updated_at` při hráčově uložení, ale service-role větev
vrací řádek před tímto přiřazením a aktuální MMA scoring mění jen body.
Nelze tedy tvrdit, že nynější MMA cron tento timestamp běžně přepisuje.
Stále jde pouze o poslední stav, ne historii přijatých akcí s deduplikací retry.

Další podstatná hranice: veřejné soutěže používají systémové lobby s
`visibility='private'`. Soukromé A3 se musí oddělit podle
`tipovacka_private.public_competition_pools`, **nikoli pouze podle visibility**.

## Co bylo skutečně prověřeno

| Cesta / zrno dat | Zdroj a zjištění | Dopad na měření |
| --- | --- | --- |
| Fotbal/hokej save | [db.ts](../src/lib/db.ts), `savePrediction`: klient přečte metadata/zámek, provede `.upsert()` klíče `(user_id,lobby_id,match_id)` a skóre; po chybě vyhodí výjimku. Neposílá `created_at`, `updated_at` ani request ID. | Klik není důkaz uložení. Po síťovém timeoutu může být výsledek neznámý, přestože server již zápis přijal. |
| Score tabulka | [001_initial_schema.sql](../supabase/migrations/001_initial_schema.sql): složený PK `(user_id,lobby_id,match_id)`, oba časy mají výchozí `now()`. [Clerk guard](../supabase/migrations/20261104095025_clerk_identity_bridge.sql) chrání body; [result guard](../supabase/migrations/20261104193538_prediction_result_write_guard.sql) a provider lock triggery chrání oprávnění/zámek, nikoli historii hráčových akcí. | Výchozí hodnota sloupce není automatický update při editaci. Z těchto zdrojů není zaručený serverový čas každého hráčova save. |
| CL/PL scoring | Poslední definice `sync_football_data_catalog` v [multi_league_catalog.sql](../supabase/migrations/20261105200636_multi_league_catalog.sql): `UPDATE public.predictions ... points_earned=..., updated_at=now()` pouze při změně bodů. Starší self-healing migrace má stejný vzor. | Nárůst nedávných `updated_at` může být automatická oprava výsledku. Naopak nezměněné body žádný takový update nevyvolají; nejde o počet cron běhů. |
| NHL/ELH adaptér | [hockey_catalog_sync.sql](../supabase/migrations/20261105201914_hockey_catalog_sync.sql), `sync_hockey_catalog`: stejný update bodů + `updated_at`, pouze při rozdílu. ELH není tímto dokumentem aktivovaná. | Stejné zkreslení jako fotbal. |
| Historický ruční/result RPC | [021_atomic_result_scoring.sql](../supabase/migrations/021_atomic_result_scoring.sql) přepisuje `predictions.updated_at` při scoringu; připravená starší Official cesta má vlastní řádky. | I tato cesta musí zůstat mimo aktivitu hráče. Manuální výsledky nejsou zamýšlený běžný provoz. |
| MMA save | [mmaDb.ts](../src/lib/mmaDb.ts), `saveMmaPrediction`: `.upsert()` s `onConflict:'lobby_id,fight_id,user_id'`, winner/lineup a volitelně method. Žádný request ID, timestamp ani návratová reprezentace. | PK chrání jedinečnost tipu, nikoli jedinečnost přijímané akce. Dvě stejná HTTP uložení nejsou dva hráči ani dvě nové aktivace. |
| MMA guard a scoring | [mma_finish_method_predictions.sql](../supabase/migrations/20261108114411_mma_finish_method_predictions.sql): `guard_mma_prediction` nejprve vrací service-role zápisy; u hráče kontroluje identitu/členství/zámek/lineup, chrání `created_at` při UPDATE a nastaví `NEW.updated_at := clock_timestamp()`. `sync_mma_event` updatuje pouze `points_earned`. | Hráčův poslední timestamp je zdrojově lépe oddělený od cronu než u score tipů. Chybí ale prostřední úpravy/retry historie a jednotný kontrakt obou formátů. |
| Roční UFC | [ufc_season_league.sql](../supabase/migrations/20261108104454_ufc_season_league.sql): karta má `season_tournament_id`; aktivní pilotní vazby převedeny na roční ligu, staré karty archivované. | `competition_id` pro nynější UFC je roční liga; `opportunity_id` je konkrétní karta. Nesmí vzniknout nová „soutěž“ pro každý fight. |
| Veřejná účast | [public_competition_pools.sql](../supabase/migrations/20261110084040_public_competition_pools.sql): registr odlišuje systémové veřejné pooly od běžných soukromých lobby. | Veřejné hráče a jejich první tip/návrat vykazovat odděleně, i když podkladová lobby je technicky private. |

Prověřeny byly zdrojové save cesty, poslední definice uvedených funkcí a
výskyty timestamp/trigger zápisů v migracích. **Nejde o nové čtení produkčních
řádků, aktuálních `pg_trigger`/column grants nebo důkaz čerstvě nasazené definice.**
Před změnou je třeba porovnat konkrétní hostované definice a sloupcová práva;
historické timestampy neoznačovat za nefalšovatelné jen podle jejich názvu.
Supabase navíc [standardně nevrací upsertované řádky bez `.select()`](https://supabase.com/docs/reference/javascript/upsert);
dnešní dvě save funkce si autoritativní potvrzení času/requestu nevyžádají.

## Nejmenší doporučený kontrakt přijaté akce

Pro přesné měření doporučujeme **jeden interní serverově potvrzený fakt
`prediction_save_accepted`**, vznikající atomicky s přijatým hráčovým tipem,
společný pro score i MMA. Ne druhý klientský marketingový event jako zdroj pravdy.
Jde o návrh API/DB kontraktu, nikoli připravenou/aplikovanou migraci.

| Pole | Autorita / účel |
| --- | --- |
| `request_id` | Náhodné opaque UUID pro jeden logický pokus o uložení; stejné při technickém retry. Není odvozené z účtu, URL či pozvánky. Jedinečnost `(player_id,request_id)`. |
| `accepted_at` | Serverový UTC čas původního přijetí po úspěšných autorizačních a lock kontrolách; klient jej nesmí určit ani upravit. Opakování vrátí původní čas. |
| `player_id` | Interní UUID odvozené z ověřené Clerk identity přes `current_player_id()`, nikoli důvěra v klientské user ID. Jen uvnitř chráněného systému. |
| `lobby_id` | Serverem ověřený kontext členství. Je potřebný pro skupinový KPI, nikoli veřejný marketingový rozměr. |
| `competition_id` | Autoritativní soutěž; score z konkrétního match, dnešní MMA roční liga z eventu/platné vazby lobby. Nepřebírat bez kontroly klientské aktivní tournament ID. |
| `opportunity_id` | UFC konkrétní karta; fotbal konkrétní zveřejněné kolo/fáze, pokud existuje spolehlivý klíč. Neznámá hodnota se označí, nevymýšlí. |
| `prediction_kind` + `prediction_key` | `score_match`/`mma_fight` a interní klíč daného zápasu; dovolí doložit vazbu i následné zrušení/změnu lineup bez logování samotného tipu. |
| `scope_kind` | Serverem určené `private_group` nebo `public_competition` z registru; ne z `lobbies.visibility` a ne z klientského UTM. Uložený scope je snímek při přijetí. |
| `schema_version` | Pevná verze kontraktu pro dohledatelnost hranic měření. |

Žádné jméno, e-mail, bio, avatar, IP, user-agent, join kód, celá URL,
referrer, JWT nebo platební údaje. Ani vítěz/skóre/metoda nejsou potřebné
v analytickém faktu. Pro odmítnutí použití stejného request ID s jiným
obsahem může interní receipt držet serverový fingerprint požadavku; nepovažovat
jej za anonymizaci tipu a neposílat ho do reportů či externí analytiky.

`player_id` i `lobby_id` jsou v této kombinaci **pseudonymní osobní údaje**.
„Nula přímých osobních údajů v marketingových parametrech“ neznamená, že
interní vazba pro A3 je anonymní. Bez propojení odlišných účtů v konkrétní
partě nelze přesné A3 vypočítat; volitelnou alternativou je tyto metriky vůbec nesbírat.

### Přijetí, odmítnutí, retry a scoring

1. Klient vytvoří request ID při vědomém uložení. Dvojklik/síťový retry téhož
   pokusu používá stejný ID; nová vědomá editace dostane nový. Žádné automatické
   „save“ při otevření stránky, reloadu, výsledkové opravě nebo analytickém retry.
2. Server odvodí identitu, kontext a zkontroluje existující receipt daného
   uživatele/requestu. Stejný obsah vrací původní potvrzení; jiný obsah pod
   stejným ID se odmítne. Replay již přijatého tipu po zámku jen přečte původní
   potvrzení, neprovede nový zápis do uzamčeného tipu.
3. Pro nový požadavek proběhnou stávající RLS/lock/lineup a sportovní kontroly.
   Až úspěšný atomický zápis vytvoří přijatý fakt. Odmítnutí, rollback, neplatná
   identita, chybějící členství a změněný lineup aktivaci nevytvoří.
4. Při ztracené odpovědi je stav klienta **neznámý**, ne prokázané neuložení.
   Retry se stejným request ID vrátí původní přijetí, nevytvoří druhou aktivitu.
   Stávající PK upsertu sám tento smluvený význam request ID nenahrazuje.
5. Cron/service role, bodová oprava, pending repair a administrativní zásah
   přijatý hráčský fakt nevytvoří. Sportovní body mohou být 0 a akce přesto
   platná; scoring neovlivňuje `accepted_at`. Zrušení duelu později nesmaže
   historický fakt skutečného přijatého save.

Pokud budou dál povolené přímé authenticated tabulkové zápisy vedle nového
RPC, nový event by šel obcházet. Budoucí scope musí výslovně vyřešit **všechny
povolené write cesty**, přístup k receiptům a nejmenší potřebná oprávnění;
nezavádět `SECURITY DEFINER` nebo obecný analytics endpoint jen kvůli pohodlí.

## Alternativy a rozsah následné implementace

| Varianta | Výhoda | Omezení / doporučení |
| --- | --- | --- |
| A. Pouze oddělený `player_submitted_at`, případně first/last čas na predikci | Nejmenší oprava smíšeného timestampu. Serverový auth guard může odlišit hráče od scoringu bez trackeru. | Poslední stav neuchová prostřední akce, přesné historické kohorty ani retry receipt. Pro aktuální orientační activity přehled, ne zpětně úplnou retenci. Sám neuzavírá B15. |
| B. Atomické přijetí + interní receipt/fakt podle kontraktu výše | Přesná aktivace, retry a audit obou formátů bez externího trackeru; lze agregovat jen potřebné KPI. | Vyžaduje samostatný ověřený save/API/DB scope a účel/retenci. **Doporučená cílová varianta pro B15.** Žádná taková tabulka teď nevznikla. |
| C. Jen agregované přehledy z dnešních řádků a dobrovolné rozhovory | Bez nového sběru lze připravovat/testovat produkt. | Reportovat uložené tipy/pozorování, ne přesnou retenci. Není to náhrada serverových přijatých akcí. |
| Klientský click/pageview tracker jako autorita | Snadné přidání tlačítkové události. | Nedokazuje commit; retry, blokovaný prohlížeč a scoring nerozliší. Pro autoritativní aktivaci nedoporučeno. Volitelné měření návštěv má vlastní účel a právní režim. |

Případný malý timestamp hotfix musí mít vlastní specifikaci: co znamená
každý sloupec, kdo ho smí měnit, jak se chová na INSERT/UPDATE/service role,
co dostanou staré řádky a jak se obnoví původní stav. **Nevyplňovat historický
`player_submitted_at` z kontaminovaného `updated_at` ani datum „dnes“.**

## Metriky a pokrytí

Zachovat definice z [růstového packu](p1-community-experiment-pack-2026-11-09.md#metriky-bez-falešné-aktivity):

- **Aktivace hráče:** první backendem přijatý platný pre-lock tip, nikoli účet,
  klik ani body. U staršího hráče bez úplné historie lze tvrdit jen „první
  pozorovaný od zapnutí kontraktu“, ne první v životě.
- **A3/28:** za okno `[T−28 dní,T)` počet běžných soukromých lobby, v nichž
  nejméně 3 různé netestovací účty úspěšně uložily alespoň jeden backendem
  přijatý platný tip ve stejné soutěži. Nejprve distinct
  `(lobby,competition,player)`, potom kontexty s alespoň 3 a nakonec distinct
  lobby, aby se nezapočítala dvakrát. Veřejné pooly/Official oddělit.
- **A3/7:** totéž za 7 dní jako diagnostika; ne hlavní hodnocení UFC.
- **Aktivace nové party:** 3 tipující ve stejné soutěži do 7 dní od vzniku;
  jmenovatel jen dozrálé nové soukromé lobby se skutečně otevřenou příležitostí.
- **Návrat:** přijatý tip při další skutečně nabídnuté příležitosti téže
  soutěže — fotbalové kolo nebo UFC karta. Jmenovatel pouze způsobilí
  aktivovaní s dokončeným pozorováním další nabídky; D7 doplňkově.

Počítáme účty, ne potvrzené fyzické osoby. Řízený seznam vlastních alternativních
a testovacích účtů dodá Viktor; admin role sama není výluka. Zapojit score i
MMA bez dvojího počítání kopií v lobby; stejný zápas ve dvou lobby je jiný
herní kontext, nikoli dva různí lidé.

Zaznamenat začátek úplného měření, výpadky a změny verze. První úplné A3/28
okno vznikne až po 28 dnech spolehlivého pokrytí; dřívější průběžný report má
uvést kratší pokrytí. Historický report a dostupnost další příležitosti nejsou
úplné jen z aktuálního rozpisu: přesunuté/zrušené zápasy mohou změnit přiřazení
ke kolu. Pro první malý experiment stačí řízený záznam dvou skutečně nabídnutých
příležitostí; nebudovat obří nový fixture-history systém.

**Nula** = úplné pokrytí způsobilého okna a žádná kvalifikovaná akce.
**Neměřeno/neznámé** = chybějící historie, neověřený čas, výpadek, nedozrálá
kohorta nebo neznámá příležitost. Existující `created_at` může pomoci jako
omezená historie prvních zachovaných řádků; sám neprokáže všechny návraty
a bez kontroly aktuálních práv ani autoritativní původ.

## Soukromí, UTM a navržená retence

Pro začátek **žádný externí tracker, reklamní pixel, session replay ani nové
marketingové cookies**. Interní accepted fakt a volitelné landing pageviews
mají odlišný účel. Vyřešit právní titul a případný souhlas pro skutečně zvolenou
variantu; „cookieless“ nebo vlastní DB automatickou výjimku nezaručují.

UTM přebírá [povolenou konvenci](p1-community-experiment-pack-2026-11-09.md#utm-pouze-veřejné-hodnoty):
jen `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, registrované
hodnoty `[a-z0-9_]`, max. 64 znaků, žádný `utm_term`. Příklad:
`community_cs_01 / community / p1_cl_cs_2026_wave01 / post_a`.
Neznámé hodnoty zahodit, neuložit raw vstup. V UTMs žádné osoby, UUID,
Clerk subject, join kódy, tokeny ani celé URL/referrery. Soukromé `/join/...`
a `?join=...` se nesmějí dostat do landing logu jen proto, že je scrubber
zaměřený pouze na parametr UTM. Public slugs a campaign ID nejsou privátní invite.

Přijatý herní fakt pro A3 nepotřebuje UTM. Pro případnou pozdější atribuci
nejvýš oddělený schválený campaign ID; žádný povinný marketingový identifikátor
přimíchaný do oprávnění k tipu, ani automatické propojení dvou domén.

**Konkrétní pracovní retenční návrh k rozhodnutí:** přijaté pseudonymní akce
a retry receipty maximálně 90 dní, kontrola a odmazání průběžně; poté ponechat
jen potřebné skutečně agregované týdenní součty nejvýše 12 měsíců bez player/lobby
ID. Je to návrh pro pilot, nikoli zákonná lhůta nebo nynější nastavení. Důvod
90 dní: 28denní okno, sedmidenní aktivace a čas na další UFC kartu/kontrolu.
Příliš dlouhou mezeru bez další příležitosti označit nevyhodnocenou, ne prodlužovat
automaticky uchování všeho. Agregáty malých kohort nejsou automaticky anonymní;
nepublikovat rozpad, který identifikuje konkrétní malou partu.

Jednodušší alternativou jsou 30denní akce a žádná dlouhá UFC retence;
potom přiznat omezené pokrytí. Business historie tipů/bodů, účetní doklady,
bezpečnostní logy a zálohy mají samostatné účely a lhůty. Výmaz účtu musí
řešit i interní aktivitu/receipty, případné oprávněné výjimky a doběh záloh.
Přístup k eventům není public ani běžným členům lobby; potřebný je chráněný
provozní přístup a agregace. Nevytváříme admin dashboard.

## Podmínky dalšího bloku

Viktor potvrdí variantu sběru, konkrétní účel/retenci a seznam testovacích
účtů; právní revize zkontroluje režim interního a volitelného marketingového
měření. Pak lze připravit jeden konkrétní technický scope a rollback, bez
opětovného rozhodování o celém produktu.

Nejmenší ověřovací sada pro implementaci: INSERT/edit/stejná volba, zámek,
revokovaná identita a cizí lobby, MMA lineup změna, body 0, scoring/pending
repair bez aktivity, retry před/po ztracené odpovědi i po zámku, stejný request
s jiným obsahem, rollback obou zápisů, public-pool vyloučení navzdory private
visibility, actor/test výluky, expirace/mazání a neznámé historické období.
Ručně přepočítat malý syntetický A3/7 a A3/28 vzorek; žádný výsledek této sady
nebyl tímto zdrojovým rozborem předstírán jako provedený.
