# Tipovačka — konkrétní realizační rozsah

4. 11. 2026 · Aktivní cíl: **funkční produkt v jedné aplikaci a jednom stávajícím Supabase projektu**. Vlastník potvrdil, že nyní není v ostrém provozu, a povolil přestavbu/čištění hlavní DB. Dosavadní Clerk migrace historii zachovala. Lokálně používáme běžný `.env`, při nasazení proměnné Netlify; oddělená beta konfigurace a beta launcher se ruší. Historický název tohoto dokumentu ani pracovní větve neurčuje provozní prostředí.

## Výsledek, který má vzniknout

Ve stávajícím Supabase projektu má fungovat přijatý model B: **pozvánka do soutěže → Clerk → profil → členství a účast → uložený tip → výsledek → správné pořadí**. Vlastník 5. 11. zvolil test celé Ligy mistrů 2026/27 bez limitu tří kol, s cílem dohrát sezonu. Soutěž je aktivní v Testovacím rodeu; body vznikají vlastními novými tipy a sezonní vítěz se neboduje. Tipy v různých lobby jsou samostatné. Hlavní průchod je celý CZ/EN a použitelný na mobilu i desktopu.

Neměníme cíl na demo s ukázkovými daty. Testovací fixtures pomohou ověřit hraniční situace; připojení skutečné identity, DB a ověřených dat je podmínkou funkční bety. Samotný green build ani offline kontrola konfigurace tuto podmínku nesplňují.

## Realizační balík přijatý s jednou DB

1. **Uchovat práci a oddělit vývoj.** Prověřený checkpoint současného stromu a větev `codex/functional-beta` podle [baseline plánu](beta-baseline-plan.md). Zachovat potřebné rozpracované zdroje, vyloučit secrets a build výstupy. Nezahazovat lokální změny.
2. **Jeden stávající projekt.** Migrovat Supabase `hkhkbtzdyjbdeeoiurvw` pro přijatý model. Před migračními zápisy uložit DB snapshot a ověřit počty a vazby. Jedna vybraná Clerk instance musí souhlasit ve frontendu, backendu a Supabase. Produkční spuštění potřebuje produkční Clerk instanci a její doménu; lokální vývoj může používat development instanci. Druhá DB není podmínkou ani blokací.
3. **Clerk a herní profil.** Implementovat [T03 kontrakt](beta-account-contract.md): ověřená identita `(issuer, subject)` mapovaná na interní UUID, atomický bootstrap, nové pilotní migrace/RLS/RPC a odpovídající backend. Minimální profil navržený pro tento balík: neunikátní zobrazované jméno, emoji/barva avataru, jazyk. E-mail a přihlášení spravuje Clerk. Veřejný katalog a bio se odkládají.
4. **Model B a kontext soutěže.** Zachovat lobby jako dlouhodobou skupinu; odlišit členství a výslovnou účast. Pozvánka udrží kontext přes přihlášení. Tříkolový limit se nezavádí. Test celé sezony musí zahrnout i import a správná pravidla play-off. Návrh vstupu: potvrzení eventové pozvánky atomicky vyřeší oprávněné členství a účast, přihlášení samotné je nevytváří.
5. **Výsledek a herní pravidla.** Dopracovat a zavést preferovaný konečný výsledek: gólové skóre po případném prodloužení, při rozstřelu jeho skóre. Oficiální fakta uchovat zvlášť, verzi pravidel evidovat; změny při ladění doprovodit náhledem dopadu a vědomým přepočtem. Návrh zachová bodové hodnoty 5/3/2/2; dopad rozdílu skóre a úplná pravidla musí být v T05 jednoznačné před propojením s živými tipy. Historické body se nepřepočítávají.
6. **Integrita a sportovní data.** Opravit známé mezery atomických výsledků, ochrany ručních oprav a úplnosti načtených tipů. Ověřit konkrétní sezonu LM u datového kandidáta, přidat adapter a vypínatelný plánovač s dry-run. Schválení se týká nové bety, nikoli změny providera v archivu. Placený tarif je samostatné rozhodnutí.
7. **Dokončit a ověřit průchod.** Předání zahrnuje ověřené připojení, reálný uložený tip, korektní uzávěrku a vyhodnocení, dvě lobby se stejným zápasem a odlišnými tipy, profil a návrat po refreshi. Oddělené nasazení na testovací Netlify naváže po kontrole konfigurace; produkční doména se nepřesměrovává.

Veřejné sponzorované akce, ceny, obchod, platby a samostatné enterprise rozhraní nejsou součástí prvního pilotu. Rozpracované Official Events se zachovají jako odložené; sdílené `020/021` vazby se neodstraňují bez ověřené náhrady. Archivace starých testovacích lobby má [vlastní oddělený postup](archive-test-lobbies-plan.md).

## Stav realizace

**Release 5. 11. ověřen:** [PR #16](https://github.com/L4Nci/tipovacka-zurich/pull/16),
commit `0e6aece`, je publikovaný na existujícím Netlify webu. Přihlašovací obrazovka
Clerk a API ochrany fungují. Přihlášený sync dry-run vrátil 200, všech 144 zápasů
beze změny, bez konfliktů a bez DB zápisu. Externí cron je vypnutý; plný přihlášený
herní průchod na této adrese ještě ověří vlastník. Používá se stávající Clerk dev
instance pro pracovní testování. Následující starší poznámky jsou historie realizace.

- Clerk frontend je zapojený do hlavní aplikace: přihlášení/registrace, aktuální token pro Supabase a API, bootstrap interního UUID a dokončení profilu. Skutečná registrace a dokončení profilu v hlavní DB jsou ověřené; celý herní průchod ještě ne.
- Backendový verifier `server/lib/clerkIdentity.ts` ověřuje podpis přes veřejné JWKS. `server/lib/clerkAuthorization.ts` převádí ověřenou identitu přes chráněné RPC na interní UUID; autoritu admina určuje DB profil. Zapojené jsou lokální a Netlify match-result, sdílený tournament-winner a lokální změna názvu lobby. Neplatná/chybějící identita vrací 401, neoprávněný hráč 403, nedostupné ověření 503 bez interních detailů.
- V hlavní DB byla aplikována migrace `20261104095025_clerk_identity_bridge.sql`: chráněné mapování identity, bootstrap/profilové RPC a přechod stávajících RLS/RPC na interní UUID. Před ní vznikla datová a schématová záloha veřejných tabulek; nejde o plný dump Auth/Storage. V privátním DB allowlistu je zvolený issuer `https://civil-seal-3653.clerk.accounts.dev` pouze pro `http://localhost:3000`. Vlastník pro stejnou development instanci povolil i nativní Supabase Third-Party Auth; příjem skutečného tokenu potvrzuje vytvořený profil.
- Větev `codex/functional-beta` byla pushnutá a sloučená přes PR #16. Dřívější snapshot 192 zdrojových souborů je popsaný v [baseline plánu](beta-baseline-plan.md); aktuální zdroje obsahuje Git release.
- Jediná lokální konfigurace je ignorovaný `.env`; [šablona](../.env.example) neobsahuje klíče. Původní nastavení Supabase zůstalo zachované. Clerk hodnoty jsou doplněné a offline kontrola prošla. CLI je propojené s existující aplikací Tipovačka `app_3LdaRuXTIBtmKluY8rhCW5DPJY6`; produkční Clerk instance zatím není vytvořená.
- Offline [kontrola](../scripts/check-env.mjs) a její [testy](../scripts/check-env.test.mjs) podporují testovací i produkční Clerk klíče. Kontrola hodnoty nevypisuje, nespouští aplikaci a nenahrazuje živé ověření identity ani RLS.
- V existující Clerk development instanci je přes cílený CLI patch nastavené `session.claims.role = authenticated`. To je přístupová role Supabase, nikoli platformní admin. Nativní Supabase Third-Party Auth je vlastníkem povolené. Nepoužívá se náhradní ověření přes service-role na klientovi.
- SQL sada `supabase/tests/clerk_identity_bridge.sql` prošla v hlavní DB s `ROLLBACK`: bootstrap, profil, interní UUID, zákaz povýšení role a změny bodů, uzávěrky i přístup do soukromé lobby. Před skutečnou registrací po rollbacku zůstalo 13 profilů, 1 032 tipů a součet bodů 1 667. Sada ověřuje RLS se simulovanými ověřenými claims; nenahrazuje test druhého živého účtu.
- Lokální `http://localhost:3000` běží; skutečné Clerk SignIn/SignUp widgety se vykreslují a přechod mezi nimi funguje. Konzole ukazuje pouze upozornění na development klíče. Widget zatím používá angličtinu i při české volbě aplikace; jeho lokalizace je zbývající část CZ/EN průchodu.
- Registrace/profil a nativní Clerk/Supabase důvěra jsou ověřené. Aktuální DB má 15 profilů a dvě Clerk identity s rolí `player`. Vlastník ověřil odhlášení/přihlášení, založení lobby Testovací rodeo a připojení obou Google účtů. V této lobby jsou tři aktivní členové; třetí je historický Supabase účet se zachovanou globální rolí admina. Vlastník lobby je odvozený z `owner_id`, jeho membership role zůstává `member`. Skutečné API 403 pro Clerk hráče a živý průchod tip → výsledek zbývají ověřit.
- Poslední lokální ověření: 17 Clerk testů, autorizační scénáře tournament-winner, 17 testů konfigurace, typecheck, oba buildy a `git diff --check` prošly. Běžící server vrátil 401 na chybějící i neplatný token u match-result, set-tournament-winner a změny názvu lobby. Build nadále upozorňuje na velký frontendový chunk; živé Netlify nasazení neproběhlo.

## Kontrola lobby a datového zdroje — 4. 11. 2026

- Pracovní Netlify adresa stále nasazuje starší Supabase přihlášení. Autorizovaným
  testovacím účtem bylo ověřeno přihlášení, obnovení stránky a seznam tří členů.
  Heslo není součástí souborů ani dokumentace. Nový Clerk zatím běží na localhostu.
- Nová migrace `20261104193538_prediction_result_write_guard.sql` opravuje skutečně
  reprodukovaný zápis tipu po známém výsledku při budoucí uzávěrce. DB nyní vynucuje
  existující frontendový zákaz; čas uzávěrky ani bodovací vzorce se nemění.
- Rozšířený transakční SQL test prošel: hotový zápas bez skóre, částečné skóre,
  hotový výsledek, zákaz pozdější editace, vlastní tipy dvou členů, zákaz změny
  cizího tipu, opakované připojení bez duplicity a ochrana vlastníka před odebráním.
  Jde o DB test s emulovanými ověřenými claims; fixture data skončila v ROLLBACK.
- Před změnou vznikl snapshot obou původních policies a jejich obnovovací SQL.
  Po testech zůstalo 15 profilů, 4 lobby, 16 členství, 1 032 tipů a 1 667 bodů.
  Obsahové otisky všech tipů a 104 zápasů se před/po změně shodují.
- Testovací rodeo obsahuje dokončené MS 2026; prázdná aktivní soutěž není chyba
  připojení. Reálný první tip potřebuje budoucí soutěž a zápasy.
- [Ověření zdroje Ligy mistrů](champions-league-data-source.md): stávající free
  sezonní endpoint TheSportsDB vrací pouze 15 červencových kvalifikačních zápasů.
  Dne 5. 11. prošel autentizovaný football-data.org Free dry-run: LM 2026/27
  144 zápasů / 36 klubů / 8 celých kol a PL 380 zápasů / 20 klubů / 38 kol.
  Původní návrh tří kol byl následně zrušen; nyní je cílem celá sezona. Reálné historické výsledky ověřily oddělení gólů
  a rozstřelu. Následně vlastník schválil import: všech 36 klubů a 144 zápasů
  je v hlavní DB. Po následném pokynu je soutěž aktivní a připojená do Testovacího rodea.
  [Chráněný sync a nastavení cron-job.org](football-data-cron.md) jsou připravené;
  prošlo 17 Node testů, rollback SQL sada, opakovaný import a lokální HTTP dry-run.
  Výsledky a body nového katalogu se ukládají atomicky existujícím výpočtem;
  historické otisky a součet bodů se nezměnily. Soutěžní účast, import a pravidla play-off,
  verze pravidel, nový deployment a zapnutí externího jobu zbývají.
- Bezpečnostní advisors mají stejná dříve evidovaná upozornění: očekávané privilegované
  RPC, tabulky bez přímých klientských policies a vypnutou kontrolu uniklých hesel
  starého Supabase Auth. Tato oprava sama není plošná bezpečnostní certifikace.

## Dokončení a oprávnění

Dokončení musí doložit skutečný end-to-end průchod, backendové 401/403 a RLS, izolované SQL/souběžné testy, testy skutečných bodovacích funkcí, lint/build a mobilní/desktopový CZ/EN průchod. Přípravné dokumenty a testy dílčích modulů nejsou dokončená beta.

[AGENTS.md](../AGENTS.md) nyní zaznamenává již udělený souhlas s přestavbou jediné stávající DB, implementací pilotu, Clerk, RLS, testy, importem a chráněným syncem. Vlastník 5. 11. znovu upřesnil, že jde o vývojový „tunící prostor“. Ve schváleném rozsahu se souhlas neopakuje a staré produkční varování se nepoužívá. Audit závislostí, záloha a ověření jsou součástí práce. Dosavadní migrace a import zachovaly staré tipy a body. Merge do `main`, produkční release a placené služby nejsou součástí tohoto pokynu.

Aktualizace znaků/pravidel/času 5. 11.: 36 klubových znaků je doplněno ze stejného
API; klient zachovává formát vlajek. Všechny budoucí výkopy byly ověřené proti UEFA
a zobrazení je explicitně Europe/Prague. Ligová fáze a dvojzápasy dovolují remízu;
malá ukázka 90 minut versus konečný výsledek a bodů je pouze při založení lobby.
Jde o náhled, nikoli uložené nastavení soutěže. Novější API opravy skóre a bodů
jsou automatické a atomické; normální provoz nepotřebuje ruční zapisování.
Vlastník nyní testuje starší Netlify klient připojený k GitHubu; nové UI ani
nový cron endpoint na tuto adresu dosud nebyly nasazené.

Navazující release 5. 11.: vlastník výslovně zadal push a nasazení na existující
`https://tipovacka-fotbal.netlify.app` a potvrdil přístup Netlify CLI. Tím je pro
tento balík schválený i potřebný merge do `main` a publikování pracovní verze.
Supabase allowlist nyní obsahuje localhost i přesný origin tohoto webu. Na Netlify
jsou doplněné Clerk a football-data proměnné; serverová tajemství mají pouze
production kontext, žádný prefix `VITE_`. Omezení rozsahů jen na Functions není
na současném tarifu dostupné. Externí cron se tím nezapíná; jeho konfigurace
naváže až po ověření nasazené funkce. Klubové znaky mají na kartách 48 × 48 px,
národní vlajky zůstávají 48 × 32 px. Dočasná QA hláška „Náhled uložení“ není
součástí aplikace. Odložené Official Events a ceny se tímto releasem nezapínají.
