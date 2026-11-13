# P0/P1 — samostatné implementační bloky
Plán z 9. 11., stav aktualizován 10. 11. 2026. Navazuje na [audit](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/docs/public-launch-p0-p1-audit-2026-11-09.md).
Vlastník zadáním `/goal dokončit P0 a P1` z 9. 11. schválil pokračování
implementace v malých ověřených blocích. Není potřeba znovu schvalovat tutéž
implementační práci. Toto zadání neurčuje ceník, placené služby ani termín a
nenahrazuje konkrétní schválení veřejného vydání. Níže se rozlišuje zapsaný kód,
lokální ověření, hostovaná aplikace a akceptace; samotný plán nic neaktivuje.

**Posun po schválení9.11.:** B01 je implementovaný a lokálně ověřený, bez
commit/push/deploy. Z B02 je proveden Clerk-only retirement v hostované DB,
odstranění starých loginů a převod admina; production Clerk a reálné session
průchody zůstávají. B03 má [konkrétní návrh jednoho VIP](vip-and-public-entry-proposal-2026-11-09.md),
nikoli schválený ceník. Velký admin dashboard odložit, zachovat provozní minimum.

**Posun 10. 11. — veřejná soutěžní cesta:** B10/B11/B11M používají novou soukromou
registry a nově vytvořenou systémovou lobby pro každou veřejnou soutěž/sezonu.
CL, PL a roční UFC mají společný vstup, explicitní připojení a samostatné
žebříčky. Stávající `predictions`/`mma_predictions`, crony, bodování a zámky se
znovu používají; soukromé lobby, tipy a historie zůstávají oddělené. Starý
Official backend 020–023 se nereimplementuje ani nezapíná. Registry migrace,
RPC/RLS a skutečné fotbalové/MMA sync cesty prošly v lokální kopii aktuálního
schématu se syntetickými daty a `ROLLBACK`. Obě nové migrace jsou nyní aplikované ve stávajícím hostovaném projektu;
RLS/locale/scoring sady prošly i tam se závěrečným ROLLBACK a bez zbytků fixtures.
Šest lokálních browserových lifecycle scénářů návratu po přihlášení prošlo.
Skutečný Clerk-to-public-game průchod, provisioning a vydání zbývají;
launch gate je false a reálné pooly zatím nevznikly. Viz [architektura a runbook](public-competition-backend-2026-11-10.md).

**Novější prioritizace9.11.:** odložen je celý admin dashboard i jeho navigace,
nejen rozsáhlé rozšíření. Bez nového výslovného zadání nestavět ani status UI
nebo opravu interního počítadla uživatelů. Backendová bezpečnost, základní
alerty a ověřená záloha zůstávají. Ruční vyhodnocování není provozní závislost.

**Následující produktový blok:** veřejný vstup → zvolená soutěž → Clerk →
první tip; soukromá pozvánka dál zachová vlastní kontext. Cílová nabídka CL/PL/UFC
má společný vstup a samostatné žebříčky. Nejprve ověřit fotbalovou cestu na
jedné soutěži a druhé fotbalové soutěži potvrdit paritu, poté MMA cestu.
Konkrétní migrace a validační zápisy se koordinují podle runbooku v jediném
stávajícím projektu; přepnutí flagu samo není veřejné vydání ani akceptace.
Návštěvník z kampaně přeskočí obecný výběr soutěže, bio ani VIP nejsou podmínkou
prvního bezplatného tipu. Do tohoto bloku nepřidávat admin UI, ceny nebo nové sporty.

Náročnost je relativní: **S** drobný ohraničený zásah, **M** více vrstev s integrační kontrolou, **L** více kontraktů a vyšší nejistota — před realizací dále rozdělit. Nejde o součet hodin ani slib termínu.
U souborů je „nový“ návrh budoucího souboru, nikoli tvrzení, že už existuje.

**Ověření 10.11.:** aplikace má lokálně CS/EN/DE/PL/SK (nové jazyky jsou drafty),
brand/PWA základ a landing s jediným funkčním hero demem a třemi skutečně
renderovanými ukázkami na syntetických datech. Nic z tohoto frontend balíku není
vydané. Stav a konkrétní důkazy: [ověření implementace](public-entry-verification-2026-11-10.md).

## P0 — nezbytné pro první veřejnou placenou verzi

### B01 — Dependencies: dosah a minimální opravy · S/M
- **Cíl:** uzavřít konkrétní rizika z [Issue26](https://github.com/L4Nci/tipovacka-zurich/issues/26), ne slepě honit nulový registry výpis.
- **Rozsah:** inventář direct/transitive, browser/server/build-only, dosažitelnost; kompatibilní opravy a zdůvodněné zbytky. Bez plošného stack upgradu.
- **Soubory:** [package.json](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/package.json), [package-lock.json](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/package-lock.json), případná nezbytná build konfigurace; stručný záznam issue/reportu.
- **Rizika:** změna bundleru/SDK poruší auth nebo importy; samotné critical v npm není důkaz runtime exploitu.
- **Testy:** dotčené auth/provider testy, typecheck, main Netlify build; landing build, pokud sdílí změněný základ; lokální vstupní smoke, nový audit.
- **DoD:** žádný nevyhodnocený dosažitelný kritický nález v dotčené cestě; zbytky mají dosah a další krok, patch malý a reviewovatelný.
- **Závislosti:** žádné nové produktové rozhodnutí. První doporučený úkol.

### B02 — Produkční identita a oprávnění · M
- **Cíl:** doložit, že uživatel dostane pouze svůj účet, role a lobby.
- **Rozsah:** Clerk production/doména/origins/issuer, admin MFA, rozhodnutí a řízené vyřazení či zabezpečení legacy JWT, revokace sdílených test přístupů; matice owner/member/pending/removed/admin.
- **Soubory:** [clerkIdentity](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/server/lib/clerkIdentity.ts), [clerkAuthorization](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/server/lib/clerkAuthorization.ts), [clerkSession](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/lib/clerkSession.tsx), [auth-security](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/docs/auth-security.md), cílené testy v [supabase/tests](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/supabase/tests); nové migrace jen pro doložené mezery.
- **Rizika:** odříznutí účtů, chybné mapování interního UUID, změna permissions pod rouškou UI.
- **Testy:** dva skutečné Clerk účty a různé role; přímá Data API/RPC s cizím ID, odebrané členství, sezonní vítěz, profil, zamčený tip; odmítnutí neověřeného tokenu. Transakční zápisy až po schválení bloku.
- **DoD:** povolené i zakázané scénáře mají runtime důkaz; skrytý admin button se nepovažuje za ochranu.
- **Závislosti:** B01 pro dotčené SDK, doména a přístup vlastníka k produkčnímu Clerk nastavení.

### B03 — Prodejní kontrakt dvou typů funkcí · S

**Rozhodnutí 10. 11.:** vlastní bodování nebo naše výchozí pravidla patří do
jednoho osobního VIP **49 Kč měsíčně / 499 Kč ročně**; první vlastní lobby
a pozvaní hráči zdarma, bez pětičlenného paywallu. Nahrazuje dřívější úvahy
o placeném prvním založení a A/B 29/49 Kč měsíčně. Kvótu VIP lobby, bránu
a životní cyklus dopracovat do [kontraktu](billing-contract.md) před aktivací.
Prodejce předběžně OSVČ, zatím nepotvrzeno. Nynější peněžní provozní náklady
vlastník uvedl 0 Kč.

- **Cíl:** před billing kódem vědět, co se prodává a komu nárok patří.
- **Rozsah:** přesná minimální kosmetika a owner funkce jednoho osobního VIP se schválenými měsíčním/ročním intervalem; trvalost kosmetiky; kvóta vlastních lobby; změna vlastníka; refund/expirace; pravidla obnovy a země prodeje.
- **Soubory:** nový `docs/billing-contract.md`, [PROJECT_RULES](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/PROJECT_RULES.md), [ROADMAP](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/docs/ROADMAP.md); zatím bez platebního runtime.
- **Rizika:** záměna nákupu kosmetiky za subscription; slib neexistující funkce; nechtěné odebrání dnešní Free funkce.
- **Testy:** walkthrough nákup → použití → zrušení → změna vlastníka → konec nároku na papírových příkladech.
- **DoD:** vlastník schválí jednoznačnou nabídku; premium neovlivňuje body, role ani členství.
- **Závislosti:** rozhodnutí vlastníka; právník/účetní posoudí návrh. Provider není tímto plánem automaticky vybrán.

### B04 — Billing identita a bezpečné nároky · M
- **Cíl:** platební evidence navazuje na stejného interního hráče jako Clerk.
- **Rozsah:** opravit FK/identity/lifecycle; reuse katalogu a read RPC, přidat pouze chybějící rozsah nároku. Trvalý inventář oddělit od časově omezené služby, pokud jej B03 vybere.
- **Soubory:** výchozí [018 foundation](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/supabase/migrations/018_entitlements_foundation.sql); nová dopředná migrace místo přepisování historie; nové DB testy; [clerkAuthorization](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/server/lib/clerkAuthorization.ts).
- **Rizika:** cizí UUID, klientský zápis do subscriptions, premium omylem udělí admina, orphan po výmazu/změně ownera.
- **Testy:** A/B izolace, zákaz přímého udělení, expirace, správné spojení owner role + nároku; rollback test, kontrola historických vazeb.
- **DoD:** pravdivý interní identity kontrakt a serverově ověřované nároky, žádná platba ani role přidána testem natrvalo.
- **Závislosti:** B02, B03; schválená DB migrace a záloha.

### B05 — Testovací checkout a autoritativní webhook · M
- **Cíl:** pouze potvrzená platba vyvolá správný nárok.
- **Rozsah:** jeden provider a hosted checkout; serverový allowlist produktů/cen, kupující z ověřené identity, podpis webhooku, idempotence, reconciliace a minimální bezpečný ledger. Bez vlastního formuláře karty.
- **Soubory:** nové sdílené payment moduly v `server/lib`, odpovídající Netlify Functions + lokální route v [server.ts](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/server.ts), nový serverový billing adapter/UI; konfigurační šablona bez klíčů.
- **Rizika:** podvržený user_id/cena/return URL, duplicitní či opožděný webhook, přetečení logů osobními údaji.
- **Testy:** paid/failed/cancelled, neplatný podpis, replay, out-of-order, dva účty, návrat bez platby; pouze testovací platební režim.
- **DoD:** nárok vzniká ze serverové autority, nikoli redirectu; neshody se opraví kontrolovanou reconciliací.
- **Závislosti:** B03/B04, poskytovatel/účet prodávajícího, návrh právních informací B07. Pokud Stripe, použít Checkout/Billing podle kontraktu.

### B06 — Použití nároku, refund a zrušení · M
- **Cíl:** placená funkce funguje a správně končí.
- **Rozsah:** nejmenší skutečná kosmetika a owner funkce z B03, serverové vynucení + UI, zákaznická správa/refund/cancel podle kontraktu; zachovat dosavadní Free možnosti.
- **Soubory:** příslušná profilová/lobby komponenta, nové billing/entitlement moduly a RPC; změněné produktové docs. Přesné UI soubory až podle vybrané funkce.
- **Rizika:** UI paywall bez serverové ochrany, ztráta nesouvisející trvalé kosmetiky, kupující nemá owner roli, nezrušitelné obnovování.
- **Testy:** přímý RPC neplatícího, aktivní/expirující/refundovaný nárok, změna ownera, výpadek webhooku a jeho oprava; žádná změna tipů/bodů.
- **DoD:** ukázaný celý lifecycle v test režimu; kontaktní a samoobslužná cesta fungují v požadovaných jazycích.
- **Závislosti:** B03–B05, B07/B08; schválení konkrétní placené funkce.

### B07 — Právní informace, licence a prodejní podklady · M + odborná kontrola
- **Cíl:** připravit pravdivé informace odpovídající skutečnému produktu a prodeji.
- **Rozsah:** seller/kontakt, podmínky bezplatné i placené služby, privacy/cookie inventář, minors, retence, doklady/DPH/země, odstoupení/reklamace, procesory a licence dat/log/fotek; jasně oddělit budoucí ceny/vklady.
- **Soubory:** navázat na [právně-technickou revizi](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/docs/public-launch-security-privacy-legal-2026-11-09.md), nové návrhy právních textů a registr licencí; právní routy landing/app, checkout kontrakt.
- **Rizika:** univerzální „souhlasím s GDPR“, nesprávné zřeknutí se odstoupení, chybějící oprávnění ke zdroji/obrázku, nevhodný překlad.
- **Testy:** obsah proti skutečným datovým tokům a nabídce, odkazy před registrací/nákupem, verze podmínek a potvrzení; lidská právní a jazyková revize.
- **DoD:** podklady označené jako návrhy, odborně zkontrolovaný finální rozsah pro dostupné země; nevyřešené zdroje se do public verze neuvádějí jako oprávněné.
- **Závislosti:** seller a nabídka od vlastníka, odborník, runtime inventář; konkrétní licence od dodavatelů. Nečekat s touto prací až na hotový checkout.

### B08 — Export, výmaz a retenční workflow · M
- **Cíl:** uživatel může bezpečně uplatnit práva bez rozbití ostatních hráčů.
- **Rozsah:** ověřená žádost, export vlastních dat, rozhodnutí vlastnictví lobby, revokace sessions, návaznosti profil/tipy/Clerk/billing, zákonné doklady a zálohy s oddělenou retencí.
- **Soubory:** nové serverové account-lifecycle moduly a testy, cílená migrace podle schváleného retenčního kontraktu; [ProfileScreen](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/components/ProfileScreen.tsx) pokud existující komponenta poskytuje vstup, jinak aktuální profilový kontejner.
- **Rizika:** smazání cizích výsledků, osiřelý owner, aktivní předplatné po zrušení účtu, opětovné založení po webhooku.
- **Testy:** A nemůže žádat za B; owner/člen/nakupující; opakovaná žádost, výpadek jedné služby, obnova zálohy znovu neuvede vymazané identity bez procesu.
- **DoD:** doložený celý proces a odpovědná osoba. Nemusí být plně samoobslužný, musí fungovat; samotný Clerk Delete account nestačí.
- **Závislosti:** B02/B03/B07, schválený lifecycle a test data. Destruktivní provedení skutečné žádosti má vlastní kontrolu.

### B09 — Provoz, zneužití, klíče a obnova · M, realizovat po dílčích kontrolách
- **Cíl:** incident nebo výpadek API lze zjistit a napravit bez ručního přepisování bodů.
- **Rozsah:** alerty selhání cron/providerů, rate/quota limity včetně přímých RPC, payload/time limity, minimum chybového dohledu bez tokenů; záloha a zkouška obnovy; klíče/rotace; HTTP hardening nejdřív CSP Report-Only.
- **Soubory:** [netlify.toml](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/netlify.toml), aktivní server/Netlify endpointy, SQL rate guardy jen podle konkrétního zjištění; provozní runbooky a monitor konfigurace.
- **Rizika:** lokální in-memory limit neochrání distribuované funkce ani Data API; CSP rozbije OAuth/obrázky; falešná jistota bez restore.
- **Testy:** omezené abuse scénáře, 401 pro cron bez klíče, timeout/429/poškozená odpověď jednoho provideru, alert/recovery, obnovitelnost a čas poslední zálohy. Žádný zátěžový útok na veřejnou službu.
- **DoD:** jasný vlastník incidentu, doložená obnova a bezpečná konfigurace pro dohodnutou pilotní kapacitu; žádný token/join kód v logu.
- **Závislosti:** B02, zvolená kapacita a infrastruktura, doklad licencí B07. Bez nákupu placené služby bez souhlasu.

### B10 — Veřejné soutěžní pooly nad stávajícím lobby modelem · M
- **Cíl:** nabídnout systémové CL/PL/UFC bez nutnosti vlastní party a bez druhého prediction/scoring systému.
- **Rozsah:** soukromá registry → nová vyhrazená systémová lobby + jedna soutěž/sezona; žádná konverze soukromé lobby ani kopie tipů. Bezpečné veřejné list/detail RPC s vlastním `is_member` příznakem (anon false, bez identity a přístupových ID), explicitní Clerk-only join, service-only provisioning/publikace a guardy systémového kontextu. Podkladová lobby je interně `private`, protože běžná veřejná lobby zpřístupňuje svůj řádek včetně join kódu. Veřejnost řídí registry; staré Official 020–023 a prize/paid-entry flagy zůstávají vypnuté.
- **Soubory:** skutečná [registry migrace](../supabase/migrations/20261110084040_public_competition_pools.sql), [RPC/RLS sada](../supabase/tests/public_competition_pools.sql), [typy a klient](../src/lib/publicCompetitions.ts), [architektura a provozní kontrakt](public-competition-backend-2026-11-10.md). [Starý Official přehled](official-public-tournaments.md) je historický podklad, ne předpis nové implementace.
- **Rizika:** únik ownera/join kódu před účastí, přímý legacy-code bypass gate, automatické přihlášení do další soutěže, záměna veřejných/soukromých tipů. Publikační gate není revokace již existujících členství.
- **Testy:** anon/member/service grants, bezpečná metadata bez účasti a příznak vlastního členství, dva Clerk hráči, native-JWT denial, explicit/idempotent join, leave/rejoin/removed, cizí účet/lobby, zákaz druhé i archived soutěžní vazby, zachování soukromých tipů; vše v `ROLLBACK`.
- **Stav 10. 11.:** zdroj implementován a ověřen v lokální kopii aktuálního schématu. Žádná hostovaná registry migrace, skutečný pool ani publikace zatím neprovedeny. Výchozí `public_competitions_enabled=false`, nové pooly unpublished.
- **DoD:** ověřené schema/RPC a hostovaná kompatibilita; nasazení/provisioning koordinované s B11/B11M. Samotný migration apply nezapíná veřejný vstup. Každá nová sezona vyžaduje vlastní explicitní účast; soukromé party se nemigrují.
- **Závislosti:** B02, B07 a [accepted organizer model](ROADMAP.md#accepted-organizer-model--2026-11-03); B11 ověří CL a PL, B11M roční UFC. Placená nabídka B03 se tímto nerozhoduje.

### B11 — Společný vstup, automatické fotbalové body a první tip · M
- **Cíl:** po veřejném odkazu a přihlášení člověk dorazí rovnou k vlastnímu tipu a výsledky dál zpracuje současný cron.
- **Rozsah:** `/play` a `/play/:slug`, společný katalog/detail, explicitní join, návrat do stejné soutěže po Clerk; soukromá pozvánka zachová svůj kontext. Stávající člen může otevřít i výsledky uzavřené sezony podle vlastního `is_member`; nový uživatel se do ní nepřipojí a backend členství znovu ověřuje. Reuse `predictions`, současného `sync_football_data_catalog`, pravidel oprav a locků; žádné `official_predictions`, `resolve_official_event_slug`, další scorer ani nový provider/cron pro tuto cestu. Neaktivovat dosavadní Official UI a prize model.
- **Soubory:** [PublicPlayScreen](../src/components/PublicPlayScreen.tsx), [publicCompetitions](../src/lib/publicCompetitions.ts), [usePublicPlay](../src/lib/usePublicPlay.ts), [publicPlayIntent](../src/lib/publicPlayIntent.ts) a [jeho testy](../src/lib/publicPlayIntent.test.ts), [App.tsx](../src/App.tsx), [skutečný sync integrační test](../supabase/tests/public_competition_scoring.sql), [runbook](public-competition-backend-2026-11-10.md). Aktivní sync/scoring kód se kvůli veřejné účasti nemění.
- **Rizika:** ztráta zvolené soutěže během OAuth, join pouhým načtením detailu, odebraný člen otevře game context, předčasné otevření gate, neúplné načítání u velkého veřejného žebříčku. Před vstupem vysvětlit sdílení jména/avataru a tipů s připojenou komunitou.
- **Testy:** nový/existující účet, autentický Clerk návrat, reload/cancel, valid/invalid slug, private invitation precedence, explicitní join; fixture→tip→lock→final v public/private lobby a idempotentní opakování syncu. Stávající sady revizí/stale/pending oprav zůstávají regresním podkladem; fotbalová parita CL/PL se musí potvrdit.
- **Stav 10. 11.:** zdroj vstupu připraven k integračnímu ověření. Lokální DB test skutečného CL sync RPC přidělil 5 veřejných a 3 soukromé body za rozdílné tipy na tentýž zápas a opakování body nezvýšilo; zámky zůstaly. Skutečný hosted cron, browser session a celá CL/PL cesta nejsou tímto testem potvrzené.
- **DoD:** CL i PL bez vkladu/cen dostupné přímým odkazem, automatic scoring ověřen v cílové aplikaci, žádná nutnost založit partu; nováček flow zkontrolovaný a potvrzený. Až pak otevřít odpovídající gate v konkrétním vydání.
- **Závislosti:** B10 a současné sdílené kontrakty; B12/B14 a ostatní launch kontroly před veřejným vydáním. Zdrojová implementace je schválena cílem P0/P1, release zůstává samostatný krok.

### B11M — Veřejná roční UFC liga ve společném vstupu · M/L
- **Cíl:** člověk bez vlastní party může hrát také UFC se současnými pravidly.
- **Rozsah:** stejná registry, katalog a explicitní join jako fotbal; nová systémová lobby má jednu roční UFC soutěž. Reuse `mma_predictions`, roční ligy, filtrů karet, vítěze/volitelné metody, verzí pravidel a `sync_mma_event`. Nové karty se připisují do stejného roku; nový rok vyžaduje nový pool/účast. Žádné Official MMA tabulky, provider, cron nebo druhý bodovací engine.
- **Soubory:** [registry migrace](../supabase/migrations/20261110084040_public_competition_pools.sql), společný vstup B11, stávající [mmaDb](../src/lib/mmaDb.ts)/[MMA lobby loading](../src/lib/mmaLobbyData.ts), [RPC/RLS testy](../supabase/tests/public_competition_pools.sql) a [sync integrace](../supabase/tests/public_competition_scoring.sql); [roční kontrakt](ufc-season-league.md), [metody](mma-finish-methods.md) a [veřejný backend runbook](public-competition-backend-2026-11-10.md).
- **Rizika:** záměna soukromé a veřejné účasti/tipů, kopírování soukromých predikcí, změna ID duelů, přepočet starých v1 pravidel.
- **Testy:** veřejný odkaz→Clerk→stejná roční liga/karta→tip→automatické body; duplicate join/save, cizí identita/lobby, lock, změna sestavy, zrušení/no-contest a oprava výsledku. Soukromé tipy a staré verze pravidel zůstanou zachované.
- **Stav 10. 11.:** společný backend a roční MMA save/leaderboard jsou lokálně ověřené; skutečné `sync_mma_event` přidělilo 5 veřejných a 1 soukromý bod za odlišné winner/method tipy, bez přičtení při opakování. Veřejný žebříček nezapočítal soukromé body a first-bell/finished lock zůstal. Hosted provisioning, skutečná session a plánovaný cron ještě nejsou tímto doložené.
- **DoD:** společný rozcestník nabízí CL/PL/UFC s oddělenými žebříčky; UFC používá aktuální verzované bodování a vstup bez vlastní party. Žádný nový veřejný či cenový rollout bez ověření a vydání.
- **Závislosti:** B02, společný vstup B10/B11, stávající MMA kontrakty a koordinovaná validace/aplikace připravené registry migrace. Admin UI mimo scope.

### B12 — CS/EN/DE/PL napříč celou cestou · L, dělit podle kontraktu a obrazovek
- **Cíl:** uživatel dokončí první tip i placenou cestu bez nečekané změny jazyka.
- **Rozsah:** rozšířit locale kontrakt + profilovou validaci, Clerk locales, pravidla/chyby, Intl a přepínač; landing routy/meta/hreflang; checkout/právní informace; dlouhé texty. Zobrazovací zónu rozhodnout zvlášť.
- **Soubory:** [src/i18n](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/i18n), [types.ts](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/types.ts:5), [clerkAccount](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/lib/clerkAccount.ts:22), [clerkSession](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/lib/clerkSession.tsx), nová locale migrace, landing `lib/landingMetadata.ts`, `proxy.ts`, katalogy a routy.
- **Rizika:** DB odmítá nový jazyk, neúplné fallbacky, špatné plurály/částky/zóna, změna lock času vedlejší úpravou.
- **Testy:** klíče/placeholdery/plurály, pre/post-login persistence, deep link a chyby ve4 jazycích, delší DE/PL, DST/zóny bez změny UTC; lidská revize.
- **DoD:** všechny4 cesty od marketingu přes účet až po tip a vybraný nákup revidované; jeden herní build.
- **Závislosti:** aktuální nabídka/pravidla B03/B07/B11, korektor DE/PL, rozhodnutí časové zóny.

### B13 — Originální značka a sjednocení tokenů · M
- **Cíl:** návštěvník pozná stejný produkt před registrací i ve hře.
- **Rozsah:** geometrický pohár vytvořený pro značku, test32px, light/dark mark, favicon/PWA/maskable varianty podle potřeby; doplnit brandkit a přenést CTA tokeny do app. Malé ověření srozumitelnosti názvu v EN/DE/PL s rodilými mluvčími, dohledatelnosti a kolizí; dostupnost domény není právní prověrka značky.
- **Soubory:** [brandkit](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/docs/brandkit-v1.md), nový zdroj loga/asset exporty, [AuthScreen.css](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/components/AuthScreen.css), příslušné app styly/CTA, landing brand komponenty, `public/manifest.json` a ikony.
- **Rizika:** generická ikona vydávaná za original, nedostatečný kontrast, přebarvení sportovních významů, změna rozměrů karet.
- **Testy:**32px a velký formát, světlé/tmavé pozadí, kontrast/focus/disabled, mobile; oba buildy a vizuální porovnání reálné app.
- **DoD:** schválený originální symbol a paleta, doložené fonty, žádné nechtěné změny layoutu/scoring.
- **Závislosti:** finální název/doména před exportem veřejných metadat; nikoli před prvními návrhy.

### B14 — Jedno hero demo a skutečný showcase · M
- **Cíl:** návštěvník před registrací pochopí jednu akci a uvidí reálnou app.
- **Rozsah:** přesunout existující vyhodnocení do hero, bez předvolby, volitelná metoda, evaluate/reset, ukázková reakce; tři skutečné obrazovky s fixtures. Pro rychlý P0 lze sanitizované snímky aktuálního UI; interaktivní reuse jen čistými view. Rotace nadpisu je navržená až P1.
- **Soubory:** [LandingPage.tsx](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/sites/fan-tipovacka-landing/components/LandingPage.tsx), landing styly/katalogy; čistá část [MmaFightCard](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/components/MmaFightCard.tsx), leaderboard/lobby view až po odříznutí datových závislostí.
- **Rizika:** demo začne volat DB/Clerk, vydává umělé body za reálné, velký frontend refaktor obou buildů.
- **Testy:** výchozí empty, povinný winner/optional method, existující5/3/1/0 větve, reset, bez registrace a herních requestů; shoda ukázek s app; mobil/reduced-motion.
- **DoD:** jedna úplná hero ukázka a3 pravdivé produktové náhledy, nulový zápis i síťové napojení showcases na skutečné účty; duplicitní plné demo pryč.
- **Závislosti:** B12/B13, stabilní současné UI a bezpečné ukázkové fotografie/licence.

### B15 — Důvěryhodné měření a minimální přehled · M
- **Cíl:** počítat skutečně tipující party a návrat, nikoli práci cronu.
- **Rozsah:** nejprve účel, retenční doba a kontrakt událostí; serverový fakt úspěšného hráčova uložení oddělený od bodování; deduplikace; test/preview výluky; povolené UTM, oddělení soukromých/veřejných soutěží, jednoduchá týdenní tabulka. Pro historické mezery přiznat neznámé. Před vyjasněním účelu a retence nenasazovat nový analytics runtime.
- **Soubory:** nové malé analytics/metric moduly a datový kontrakt; datové funkce [db.ts](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/lib/db.ts:972)/[mmaDb.ts](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/lib/mmaDb.ts:10), autoritativní save RPC a nová migrace podle schváleného návrhu; nové KPI docs; landing/app CTA.
- **Rizika:** cron nafoukne retenci, dvě varianty klientského eventu duplicitní, osobní údaje/join kód v atribuci, souhlas zkreslí jmenovatel.
- **Testy:** accepted/rejected/locked/retry, scoring bez aktivity, A3 ručně přepočítaný vzorek, dozrálé kohorty, opt-out a anonymní průchod, sanitized UTM.
- **DoD:** A3/28 + A3/7 + aktivace + návrat podle příležitosti se zdrojem, obdobím a výlukami; nula odlišená od neměřeno.
- **Závislosti:** B07/B08, právní titul/consent dle konkrétního řešení, B11 pro Official větev. Nová DB událost musí mít schválený účel/retenci.

### B16 — Mobile, přístupnost a PWA smoke · M
- **Cíl:** celá cesta je použitelná na telefonu, nejen hero.
- **Rozsah:** povolit zoom, min44px hit areas, focus/klávesnice/screenreader, safe-area/fixed navigation, aktualizovaný manifest/ikony, instalace/session/deep link/update/offline vysvětlení. Žádná nová offline fronta tipů.
- **Soubory:** [index.html](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/index.html), [manifest](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/public/manifest.json), dotčené herní/landing komponenty a CSS; QA záznam.
- **Rizika:** hit area oprava rozbije karty, nový bundle ponechá neplatnou session, cache odhalí API/JWT nebo nabídne falešné uložení offline.
- **Testy:**360/375/390/393/430 +desktop a200% zoom; Safari/iOS a Chrome/Android skutečně, pomalá síť, keyboard, reduced-motion, orientace/softkeyboard, add-to-home/open/update.
- **DoD:** žádný horizontální overflow/překryté CTA, zřetelné loading/error/success, instalace a návrat fungují ve zdokumentovaném rozsahu; výkon změřen se zařízením/podmínkami.
- **Závislosti:** hotové P0 flow, B12–B14, vlastník nebo tester s reálnými zařízeními. Service worker sám není univerzální podmínkou instalace.

### B17 — Acceptance a veřejné vydání · S/M
- **Cíl:** veřejný celek je přesně ta verze, kterou jsme ověřili.
- **Rozsah:** verze main/app/landing/DB, domény/DNS/TLS/canonical/hreflang/sitemap, production Clerk + test platby, runtime cookie inventář, incident/rollback; veřejnou indexaci povolit teprve ve správném vydání.
- **Soubory:** release checklist/runbook, existující hosting konfigurace, landing metadata a public robots/sitemap podle cíle; žádný nový site ani druhá DB.
- **Rizika:** zveřejnění soukromých fixture údajů, noindex zapomenutý nebo zrušený předčasně, mismatch landing a app, nevratný release bez plánu.
- **Testy:** cizí návštěvník, lobby invite a veřejná výzva; všechny4 jazyky; nákup/refund v test režimu, autorizace, finální build/smoke a monitoring. Reálná platba až na výslovně schváleném veřejném prodeji.
- **DoD:** vlastník akceptuje skutečnou cestu a konkrétní vydání; známé mezery mají rozhodnutí, P0 gate uzavřen; teprve potom samostatný souhlas s commit/push/deploy.
- **Závislosti:** všechny relevantní P0 bloky, zaregistrovaná doména a odborně uzavřené podklady. Tento plán sám nic nepovoluje nasadit.

## P1 — získávání uživatelů a opakované hraní

### G01 — Jedna komunita, dvě sportovní příležitosti · M
- **Cíl:** změřit aktivaci a návrat na skutečných lidech s malým rozpočtem.
- **Rozsah:** jeden trh/jazyk/sport,1 konkrétní komunita nebo tvůrce, veřejná free výzva, užitečný transparentní příspěvek a veřejný UTM kód. Varianty Reddit/FB/Discord nebo krátké video jsou experimenty, ne současná šestikanálová kampaň.
- **Soubory:** nový experiment brief a lokalizované koncepty postů; landing event link.
- **Rizika:** zákaz propagace, přehnané sliby, promo bez přiznání vztahu, návštěvnost bez dalších zápasů.
- **Testy:** aktuální pravidla konkrétní komunity těsně před publikací, klik→správný jazyk/event→tip, skutečné počty a dozrálé kohorty.
- **DoD:** vlastník schválí a publikuje/explicitně povolí post; vyhodnocené dva termíny, záznam překážek a rozhodnutí o dalším testu; žádná vymyšlená konverzní procenta.
- **Závislosti:** B17/B15, skutečná sportovní nabídka a práva. DE obsah neslibuje Bundesligu, dokud není import a licence.

### G02 — Lokalizované share/OG a přechod do vlastní party · M
- **Cíl:** pozvat dalšího hráče s minimem kroků.
- **Rozsah:** reuse QR/copy/native share, brandované lokalizované obrázky výsledku/pořadí, bezpečný veřejný OG a CTA po reálném použití veřejné výzvy.
- **Soubory:** [sharing.ts](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/lib/sharing.ts), [InviteShareDialog](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/components/InviteShareDialog.tsx), Official UI a veřejný OG endpoint podle schváleného datového kontraktu.
- **Rizika:** soukromé tipy/join kódy/email v preview, caching soukromého obsahu, share sheet úspěch označený jako doručení.
- **Testy:** mobile/desktop/cancel/clipboard fail, různé jazyky, crawler bez session, private/public datové hranice.
- **DoD:** čerstvý odkaz vede na slíbenou akci, fallback funguje a neloguje pozvánku; metriky pojmenované pravdivě.
- **Závislosti:** B12–B15/B17, bezpečně veřejné zdroje dat.

### G03 — Více Official výzev a moderace · M/L
- **Cíl:** rozšířit ověřenou první výzvu, nikoli vymýšlet další veřejné lobby.
- **Rozsah:** katalog/paginace, více eventů, administrace a moderace, veřejné pořadí, přechod do vlastní stálé party. MMA Official je samostatný formátový scope, pokud bude vybráno.
- **Soubory:** [officialEvents](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/lib/officialEvents.ts), Official components, cílené nové migrace a feature flags; dokumentace modelu.
- **Rizika:** únik privátního členství, příliš drahé pořadí, dva scoring systémy, rozšíření cen/vkladů bez posouzení.
- **Testy:** více souběžných soutěží, oddělení účasti/bodů, moderátor bez cizích práv, abuse/limity a opravy výsledků.
- **DoD:** ověřený bezpečný katalog na existujícím modelu; žádná implicitní aktivace cen a placených vstupů.
- **Závislosti:** B10/B11/B17 a prokázané použití G01.

### G04 — Dobrovolné připomínky a návrat · M
- **Cíl:** pomoci dokončit otevřené tipy a vrátit se při příští příležitosti.
- **Rozsah:** nejdřív jedno připomenutí/kanál; reuse souhrnu lobby; výsledky/pořadí/nová karta jen s jasnou hodnotou, frekvenční limit a snadné odhlášení.
- **Soubory:** home summary, nový preference/delivery modul a šablony podle schváleného kanálu.
- **Rizika:** spam, marketing skrytý pod provozní zprávou, časové zóny, odeslání po zámku/zrušení eventu.
- **Testy:** opt-in/out, duplicitní job, no remaining picks, postponed/cancelled, lokální čas a další karta bez známého začátku.
- **DoD:** změřená doručovací funkce a návrat, ne pouze počet odeslání; základní hra bez notifikací plně funguje.
- **Závislosti:** B07/B12/B15, zvolený kanál a souhlas/účel podle konkrétního řešení.

### G05 — Slovenština a vizuální experimenty · S/M, dva oddělené patche
- **Cíl:** rozšířit jazyk a ověřovat malé úpravy bez komplikace hry.
- **Rozsah:** SK do existujících katalogů/Clerk/profilu/rout/SEO; samostatně případný rotující headline a1 reakce v demu. Žádný nový jazykový projekt.
- **Soubory:** i18n katalogy + locale kontrakt, landing metadata/routy, hero CSS/komponenta podle konkrétního experimentu.
- **Rizika:** nekonzistentní pravidla, nečitelná animace, pohyb bez pause/reduced-motion, CLS.
- **Testy:** celá SK cesta s korektorem; zvlášť reader/keyboard/pause/reduced-motion a dlouhé řetězce u nadpisu.
- **DoD:** SK stejně úplné jako P0 jazyky; animace jen pokud přináší hodnotu a je přístupná. Rozhodnutí přijmout/odmítnout experiment má skutečné podklady.
- **Závislosti:** B12/B14/B17, lidská korektura. Rotace není technická podmínka prvního tipu.

## Konec každého bloku
Přiložit: změněné soubory, konkrétní testy a výsledky, známé limity, aktualizované dlouhodobé docs a malý reviewovatelný diff. Rozlišovat **implemented / verified / accepted**. Passing build není uživatelská akceptace; před vydáním ukázat konkrétní výsledek a získat samostatný souhlas podle aktuálního zadání.

