# Kompletní checklist pro další vývoj Tipovačky

**Ukončení MMA schváleno — 8. 11. 2026:** KO/TKO, Submise, Na body jako volitelný
doplněk k povinnému vítězi. Samostatný pruh uložených tipů v lobby. Bodování v2:
vítěz i ukončení 5 / pouze vítěz 3 / pouze ukončení 1 / jinak 0; remíza, no contest
a zrušený duel 0. Nová pravidla jen pro dosud otevřené nebodované a nové karty,
historické/uzamčené v1 beze změny. [Kontrakt a ověření](docs/mma-finish-methods.md).

**Schváleno — 8. 11. 2026:** UFC má jednu roční soutěž v lobby, eventy jako její
kola, souhrnné roční i jednotlivé eventové pořadí a filtr karet/výsledků.
Nové karty se přidávají automaticky; další rok se zapíná samostatně, bez přenosu
bodů. Existující tipy se nekopírují. [Kontrakt a stav vydání](docs/ufc-season-league.md)
nahrazují původní samostatné pilotní karty a jejich polling.

**Realizace — 6. 11.:** dvě UFC karty jsou importované v jediné stávající DB.
MMA má samostatný winner-only kontrakt, RLS a automatický přepočet; bootstrap
testy prošly s ROLLBACK. Stav vydání a provozní hranice jsou v
[MMA runbooku](docs/mma-pilot-runbook.md). Bonusy způsob/kolo zůstávají další etapou.

**Produktové upřesnění — 6. 11. 2026:** vlastník chce před hlavní CZ/SK kampaní
MS 2027 již plně běžící produkt a čas kampaně věnovat hlavně marketingu a polish.
YouTube/tvůrčí komunity používají stejnou stálou lobby s jednotlivými eventy;
placený přístup je námět k samostatnému dopracování. U MMA je přijatá základní
volba vítěze a volitelné bonusy způsob/kolo, bez přesného času. Chybějící tipy
mají být na očích a dosažitelné přímo. [Stav a rozdělení práce](docs/product-readiness-2026-11-06.md)
oddělují existující funkce od navržených úprav, právního/měřicího nastavení a
nedokončeného ověření. Tento plán nemění pravidla ani data běžící aplikace.

**Více lig — 5. 11. večer:** na pokyn vlastníka jsou importované a aktivní Premier
League a NHL, připojené do Testovacího rodea. Extraligový import je zachovaný, ale
dočasně skrytý/archivovaný: Hokej.cz z Netlify vrací 403 a API-Sports Free odmítá
sezonu 2026. Cron ELH výslovně přeskočí, ostatní ligy fungují. Další zdroj se
nejprve ověří s přístupem; placené API zatím schválené není.
Společný chráněný endpoint rozšiřujeme na CL/PL/NHL/ELH se stejným cronem a klíčem.
Hokej počítá oficiální konečné skóre (po nájezdech s jedním rozhodujícím gólem),
5 bodů přesně / 2 za vítěze; předchozí fotbalové pravidlo se nemění.
Aktuální rozsah, validace a neověřené extraligové play-off viz
[multi-sport runbook](docs/multi-sport-sync.md). Starší stavové poznámky níže jsou historie.

**Cron a play-off — 5. 11. 2026:** vlastník potvrdil funkční uložené tipy na Netlify
a schválil uložení klíče syncu do cron-job.org a zapnutí zápisů každých 15 minut.
Úloha 8799825 je aktivní; testy i první naplánovaný běh prošly. Adaptér a RPC
podporují postupné doplnění play-off LM podle API, bez vymýšlení účastníků a časů.
Pevný kontrakt používá góly po prodloužení nebo samotné skóre rozstřelu, se stejnými
body 5/3/2/2; dvojutkání může mít remízový zápas. Detailní stav je v
[runbooku](docs/football-data-cron.md). Volitelné/verzované pravidlo pro každou lobby
a jeho úprava během soutěže zůstávají samostatnou prací.

**Release 5. 11. 2026:** vlastník zadal push a publikování aktuální pracovní verze na stávající `https://tipovacka-fotbal.netlify.app` a potvrdil Netlify CLI. Potřebný merge do `main`, nastavení tohoto webu a nasazení jsou pro tento balík schválené. Stav předchozích etap níže je historický; externí cron ani odložené Official Events/ceny se automaticky nezapínají.

**Ověřený výsledek releasu:** PR #16 je sloučený a commit `0e6aece` publikovaný.
Clerk přihlášení se vykresluje; chráněné API odmítá nepřihlášené požadavky.
Sync dry-run vrátil 200, 144 nezměněných zápasů, bez konfliktů a bez DB zápisu.
Externí cron ještě není naplánovaný. Kompletní herní průchod pod svým Clerk účtem
na Netlify nyní ověří vlastník. Starší stavové poznámky níže jsou historie.

## Aktualizace plánování — 3. 11. 2026

**Aktualizace 4. 11. 2026:** vlastník schválil přestavbu jediné stávající DB `hkhkbtzdyjbdeeoiurvw`, napojení Clerk, registraci, profil a RLS. Potvrdil, že projekt nyní není v ostrém provozu, a povolil čištění/přestavbu DB i transakční RLS testy. Clerk identity migrace už byla aplikována se zachováním dosavadní historie. Konfigurace je běžný `.env` lokálně a proměnné Netlify při nasazení; druhá DB ani beta profil se nepoužívají. Tento pokyn nahrazuje starší omezení na pouhé plánování a oddělenou betu; viz [aktuální rozsah](docs/beta-implementation-scope.md). Produkční deployment a merge zůstávají samostatným krokem.

**Upřesnění 5. 11. 2026:** projekt je nyní „tunící prostor“, nikoli ostrý provoz. Vlastník schválil import Ligy mistrů a přípravu chráněného endpointu pro cron-job.org. Původní varování před každým DB zápisem je historické; ve schváleném rozsahu se souhlas znovu nevyžaduje. [AGENTS.md](AGENTS.md) je s tímto režimem sjednocený. Zálohy a ověření zůstávají součástí práce, nikoli potvrzovacím kolečkem.

Původní soutěže po MS v hokeji a fotbale jsou odehrané. Historická aplikace i data jsou dostupné, nový živý pilot tím nezačal. Historie slouží jako podklad a kontrolní vzorek; níže uvedené staré produkční checklisty nepřebíjejí aktuální oprávnění k přestavbě.

Clerk registrace, profil a připojení hráčů do lobby jsou ověřené lokálně. Do hlavní DB je importovaný a aktivní katalog Ligy mistrů připojený do Testovacího rodea; [sync a postup pro cron-job.org](docs/football-data-cron.md) jsou připravené. Navazuje soutěžní účast a dokončení celého pilotního průchodu. Nový deployment zatím neproběhl. Primární publikum jsou soukromé party a komunity; Supabase zůstává datový základ a Clerk vrstva účtu. Další rozhodnutí a checklist jsou v [docs/product-restart-plan.md](docs/product-restart-plan.md), dlouhodobý směr v [docs/ROADMAP.md](docs/ROADMAP.md).

Vlastník zvolil archiv staré verze a čistý pilot bez automatického přenosu starých účtů a bez započítání historických bodů do nového pořadí. Dne 3. 11. upřesnil, že jedinou reálnou lobby byli „Fotbaloví experti“ a jejich data lze použít pro revizi a ověření. U dvou testovacích lobby potvrdil archivaci a skrytí i ve staré aplikaci se zachováním dat. [Audit a konkrétní postup](docs/archive-test-lobbies-plan.md) jsou připravené; dnešní aplikace tuto operaci pro celou lobby neumí. Archivace, kopírování dat ani změny infrastruktury zatím neproběhly.

První pilotní soutěž je Liga mistrů, následuje Premier League. **Vlastník přijal model B: stálá lobby pořadatele, soutěže uvnitř s vlastní účastí a pořadím, pozvánka do konkrétní soutěže.** Stejný model platí pro partu, hospodu Kobra a budoucí jednorázový sponzorovaný turnaj. Výběr A/B je uzavřený; přijatá logika je v [ROADMAP.md](docs/ROADMAP.md#accepted-organizer-model--2026-11-03), důvody v [rešerši](docs/lobby-model-research-2026-11-03.md).

Produktový model a plán jsou přijaté; aktuální rozsah implementace upřesňuje aktualizace 4. 11. výše. Migrace stávajících Official Events a nasazení tímto shrnutím potvrzené nejsou. **Nový pokyn 5. 11. ruší tříkolový limit: Ligu mistrů 2026/27 odkrýt hned a postupně dohrát celou sezonu. Testovací rodeo má aktivní všech 144 importovaných zápasů ligové fáze; podpora play-off teprve naváže. Body vznikají vlastními novými tipy, sezonní vítěz se neboduje. Tipy budou samostatné v každé lobby.** Vlastník chce úplný konečný výsledek a při penaltách preferuje bodovat skóre rozstřelu, např. 5:4; plný kontrakt dopracuje T05. Oficiální góly a rozstřel se evidují zvlášť. Nový požadavek 5. 11. počítá s úpravou pravidel i během ladění soutěže: uchovat jejich verzi, ukázat dopad a případný přepočet provést viditelně. Nyní je připravená malá ukázka variant 90 minut/konečný výsledek; přepínání náhledu aktivní pravidla nemění. Běžné výsledky i novější opravy API se vyhodnocují automaticky napříč lobby; ruční obsluha není podmínkou provozu. Ceny a obchodní balíčky nejsou přijaté; první pilot zůstává soukromý.

Starší stavové a produktové checklisty níže jsou historický kontext; aktuální stav nasazení ani schválení nové migrace z nich nevyvozujeme.

## 0. Stav projektu teď

Cíl: stabilizovat ostrý provoz a připravit bezpečný základ pro V2.

Aktuálně považujeme za hotové:

- login funguje v produkci,
- lobby funguje,
- hráči jsou importovaní,
- tipování funguje,
- winner picker funguje,
- leaderboard funguje,
- scoring je centralizovaný,
- admin zápis výsledků funguje,
- manuální přepočet bodů je stabilnější,
- UI je beta ready.

Od této chvíle platí:

- tipy v DB jsou ostrá data,
- body se nesmí ručně upravovat,
- predikce se nesmí měnit mimo běžný uživatelský flow,
- jakýkoliv zásah do výsledků musí být kontrolovaný.

---

## 1. Co musí udělat Viktor

### A. Produktová rozhodnutí

- [ ] Rozhodnout, jestli teď cílíme na:
  - [ ] soukromé lobby pro kamarády,
  - [ ] firemní/komunitní tipovačky,
  - [ ] veřejné turnaje,
  - [ ] interní MVP pro MS 2026.
- [ ] Definovat jednu větu produktu, např. „Soukromá tipovací platforma pro party, firmy a komunity.“
- [ ] Určit hlavní core loop:
  - [ ] uživatel otevře appku,
  - [ ] tipne další zápasy,
  - [ ] sleduje pořadí,
  - [ ] porovnává se s ostatními,
  - [ ] vrací se kvůli výsledkům a rivalitě.
- [ ] Rozhodnout priority na nejbližších 30 dní:
  - [ ] stabilita,
  - [ ] ruční výsledky,
  - [ ] důvěra v body,
  - [ ] betatesting,
  - [ ] až potom API a monetizace.

### B. Ostrý provoz a důvěra

- [ ] Přijmout pravidlo: nikdy ručně neupravovat tipy hráčů.
- [ ] Přijmout pravidlo: nikdy ručně neupravovat body hráčů.
- [ ] Povolená změna je pouze výsledek zápasu.
- [ ] Body se mění výhradně automatickým přepočtem.
- [ ] Před každou větší DB změnou udělat export/zálohu.
- [ ] Veškeré testy výsledků dělat mimo ostrou lobby, pokud to jde.

### C. Admin role

- [ ] Rozhodnout, kdo může být globální admin.
- [ ] Rozlišit:
  - [ ] globální admin = zapisuje výsledky,
  - [ ] lobby admin/owner = spravuje lobby,
  - [ ] hráč = tipuje.
- [ ] Zkontrolovat, že běžní hráči nevidí admin tab.
- [ ] Zkontrolovat, že admin tab neumožňuje měnit tipy hráčů.
- [ ] Zvážit druhé potvrzení při zápisu výsledku: „Opravdu chceš zapsat výsledek a přepočítat body?“

### D. API výsledků

- [ ] Vybrat API až po stabilizaci manuálního režimu.
- [ ] Nejdřív chtít dry-run režim bez zápisu do DB.
- [ ] API nesmí přepisovat ruční admin výsledek.
- [ ] API může pouze navrhnout výsledek.
- [ ] Automatický zápis povolit až po ověření mapování zápasů.

---

## 2. Co může dělat AI samostatně

### A. Audity

AI smí auditovat bez změn:

- [ ] audit admin výsledků,
- [ ] audit scoringu,
- [ ] audit leaderboardu,
- [ ] audit stale `points_earned`,
- [ ] audit DB schématu,
- [ ] audit RLS policies,
- [ ] audit secrets/env proměnných,
- [ ] audit Vercel/Netlify deploy flow.

### B. Dokumentace

AI smí vytvářet a udržovat:

- [ ] `SYSTEM.md`,
- [ ] `AGENTS.md`,
- [ ] ADR šablonu,
- [ ] PR checklist,
- [ ] release checklist,
- [ ] incident checklist,
- [ ] beta testing checklist,
- [ ] data safety rules.

### C. Bezpečné UI úpravy

AI může samostatně navrhovat a implementovat:

- [ ] drobné UI polishe,
- [ ] copy texty,
- [ ] responsive opravy,
- [ ] avatar nabídky,
- [ ] layout karet,
- [ ] prázdné stavy,
- [ ] tooltipy,
- [ ] informační texty.

Vždy ale platí:

- [ ] bez změny DB,
- [ ] bez změny scoringu,
- [ ] bez změny auth,
- [ ] bez zápisu do ostrých dat.

### D. Testy a validace

AI může připravit:

- [ ] testovací scénáře,
- [ ] validační SQL `SELECT` dotazy,
- [ ] lint/build kontrolu,
- [ ] checklist před mergem,
- [ ] smoke test produkce.

---

## 3. Co AI smí dělat jen po schválení

### A. Databáze

AI nesmí bez schválení:

- [ ] měnit schéma,
- [ ] přidávat tabulky,
- [ ] přidávat sloupce,
- [ ] měnit RLS,
- [ ] mazat data,
- [ ] upravovat produkční predikce,
- [ ] upravovat body,
- [ ] upravovat výsledky zápasů.

### B. Auth a role

AI nesmí bez schválení:

- [ ] měnit login flow,
- [ ] měnit role,
- [ ] povyšovat uživatele na admina,
- [ ] měnit service role logic,
- [ ] měnit Supabase Auth nastavení.

### C. Scoring

AI nesmí bez schválení:

- [ ] měnit bodovací pravidla,
- [ ] měnit winner picker body,
- [ ] měnit výpočet leaderboardu,
- [ ] měnit lock logic,
- [ ] měnit uzamykání tipů.

### D. Produkční data

AI nesmí bez schválení:

- [ ] spouštět validační skripty, které zapisují do DB,
- [ ] vytvářet testovací predikce v ostré lobby,
- [ ] resetovat výsledky,
- [ ] mazat hráče,
- [ ] měnit lobby members.

---

## 4. Červené linie

Nikdy nedělat:

- [ ] žádné plaintext heslo v repozitáři,
- [ ] žádný service role key ve frontendu,
- [ ] žádný `.env` commit,
- [ ] žádný přímý update bodů hráče,
- [ ] žádný přímý update tipů hráče po locku,
- [ ] žádné API, které samo přepisuje ruční výsledky,
- [ ] žádný „quick fix“ v produkční DB bez zálohy,
- [ ] žádný merge bez lint/build,
- [ ] žádný merge bez manuálního testu core flow.

---

## 5. Core flow checklist před každým větším releasem

### Login

- [ ] uživatel se přihlásí přes nickname,
- [ ] heslo funguje,
- [ ] logout funguje,
- [ ] refresh drží session,
- [ ] produkce nepoužívá placeholder Supabase URL.

### Lobby

- [ ] uživatel vidí svoji lobby,
- [ ] auto-enter funguje pro jednu lobby a jeden turnaj,
- [ ] back button funguje,
- [ ] lobby popisek se zobrazuje správně,
- [ ] počet členů sedí.

### Tipování

- [ ] uživatel může tipnout zápas,
- [ ] tip se uloží,
- [ ] tip se po refreshi zobrazí,
- [ ] po locku nejde měnit,
- [ ] tipy ostatních se zobrazují správně.

### Winner picker

- [ ] ukazuje 48 týmů,
- [ ] výběr se uloží,
- [ ] výběr se zobrazí v profilu,
- [ ] výběr se zobrazí v pořadí.

### Výsledky

- [ ] admin může zadat výsledek,
- [ ] výsledek se uloží,
- [ ] status se změní na `finished`,
- [ ] body se přepočítají,
- [ ] endpoint vrátí správný počet přepočtených predikcí,
- [ ] leaderboard se aktualizuje.

### Leaderboard

- [ ] body sedí,
- [ ] přesné tipy sedí,
- [ ] vítězné tipy sedí,
- [ ] avatary sedí,
- [ ] vybraný vítěz turnaje se zobrazuje,
- [ ] pořadí se aktualizuje po výsledku.

---

## 6. Checklist před API výsledků

### Před registrací do API

- [ ] manuální admin zápis výsledků funguje,
- [ ] scoring je centralizovaný,
- [ ] leaderboard sedí,
- [ ] neexistují stale `points_earned`,
- [ ] `provider_match_id` existuje u všech zápasů,
- [ ] je jasné, kdo je source of truth.

### API dry-run

- [ ] API pouze čte data,
- [ ] nic nezapisuje do DB,
- [ ] vypíše mapování:
  - [ ] `provider_match_id`,
  - [ ] domácí,
  - [ ] hosté,
  - [ ] skóre,
  - [ ] status.
- [ ] ověří se 5–10 zápasů ručně.

### API write režim

Povolit až když:

- [ ] API spolehlivě pozná finished zápas,
- [ ] API mapování sedí,
- [ ] API používá stejný backend flow jako admin,
- [ ] API nepřepisuje ručně potvrzený výsledek,
- [ ] existuje log změny.

---

## 7. Doporučené pořadí další práce

### Teď hned

- [ ] commitnout aktuální stabilní změny,
- [ ] otestovat produkci,
- [ ] nedělat další UI kosmetiku,
- [ ] začít betatest s hráči.

### Nejbližší technická priorita

- [ ] audit log výsledků,
- [ ] `result_source`,
- [ ] `result_confirmed_by_admin`,
- [ ] `result_updated_by`,
- [ ] `result_updated_at`.

### Potom

- [ ] API dry-run,
- [ ] API návrh výsledku,
- [ ] admin potvrzení výsledku,
- [ ] automatický cron.

### Později

- [ ] Hall of Fame,
- [ ] oddělení lobby info a turnajových pravidel,
- [ ] notifikace,
- [ ] share lobby,
- [ ] monetizace.

---

## 8. Definition of Done pro beta-ready stav

Beta je připravená, když:

- [ ] všichni hráči se přihlásí,
- [ ] všichni vidí lobby,
- [ ] všichni umí tipnout zápas,
- [ ] winner picker funguje,
- [ ] leaderboard funguje,
- [ ] admin umí zadat výsledek,
- [ ] body se přepočítají,
- [ ] produkce běží na správné Supabase DB,
- [ ] nejsou žádné testovací zásahy do ostrých tipů,
- [ ] je jasné pravidlo, že body a tipy se nikdy neupravují ručně.

---

## 9. Krátký prompt pro AI před každou změnou

Používat vždy:

> Jsme v ostrém provozu. Tipy v DB jsou reálné. Neprováděj žádné zápisy do predictions, matches ani profiles bez výslovného schválení. Necommituj. Neprováděj destruktivní změny. Nejdřív udělej audit, napiš rizika, navrhni plán a počkej na potvrzení.

Poznámka: V tomto repozitáři má systémová instrukce pro automatizovaného agenta přednost před tímto promptem, pokud výslovně vyžaduje commit/PR po dokumentační změně.

---

## 10. Krátký release checklist

Před mergem:

- [ ] `git status` čistý kromě zamýšlených souborů,
- [ ] žádný `.env`,
- [ ] žádný secret,
- [ ] `npm run lint` prošel,
- [ ] `npm run build` prošel,
- [ ] manuální test core flow,
- [ ] PR popis obsahuje, co se mění,
- [ ] merge do main,
- [ ] Vercel deploy prošel,
- [ ] produkční smoke test.
