# Výchozí kód funkční bety

4. 11. 2026 · Výchozí audit a uchování zdrojů. Větev `codex/functional-beta` již existuje; název je historický. Provozní konfigurace je běžný `.env` a jedna stávající DB, viz [aktuální rozsah](beta-implementation-scope.md). Navazuje na [přijatý rozsah](product-restart-plan.md) a [archiv staré aplikace](archive-test-lobbies-plan.md).

## Výchozí bod a uchování práce

**HEAD: `e565308cb51e821f2a45105041854d48d68cb708`**, původní větev `codex/beta-polish-sprint-01`, commit z 28. 7. 2026. Aktuální pracovní větev je `codex/functional-beta`. `origin/main` ukazuje na `94dbb68`; skutečně nasazenou verzi je nutné ověřit zvlášť. Současný strom obsahuje další nezapsané úpravy a nové soubory.

Doporučení: **nejprve kontrolovaný checkpoint celého současného stromu, potom explicitní větev `codex/functional-beta` z checkpointu**. Zahrnout prověřené tracked i untracked zdroje, testy a dokumentaci; vyloučit `.env`, klíče, závislosti a build výstupy. Samotný `git diff` neuchová nové soubory. Checkpoint pouze zachovává práci, nepotvrzuje její kvalitu ani připravenost k nasazení.

**Provedená bezpečná příprava:** lokální zdrojový snapshot 192 souborů je v `/private/tmp/tipovacka-beta-checkpoint-xagwbi6r/source.tar.gz`, vedle je `manifest.json` s výchozím HEAD, větví a SHA-256 souborů. Obsah archivu byl proti manifestu ověřen. Zahrnuje tracked i potřebné untracked soubory k okamžiku vytvoření; provozní `.env`, `.git`, závislosti a build výstupy jsou vyloučené. Pozdější edity dokumentace v něm nejsou. Jde o dočasnou lokální zálohu zdrojů, nikoli Git commit, trvalý archiv nebo zálohu DB; pracovní větev již vznikla, Git checkpoint zatím nevznikl.

Čistý základ z HEAD je možný po odděleném uchování změn, ale nezbaví nás Official Events: HEAD již obsahuje migrace `020/021` i jejich scoring integraci. Přepnutí větve ve špinavém adresáři samo změny neizoluje. Nepoužívat reset, hromadné obnovení souborů ani skryté worktree.

## Co zachovat a co izolovat

| Oblast | Postup pro betu |
| --- | --- |
| Soukromé lobby, členství, správa turnajů, Home a pořadí | Zachovat existující základ. Home úpravy převzít po blocích; jsou promíchané s novými funkcemi. |
| Samostatné Official Events | Nechat uložené jako odloženou implementaci, vypnout navigaci a onboarding do této domény. Nevydávat ji jako paralelní cílový produkt. `OfficialEventCard/View/SeasonResult`, `officialEvents.ts`, `officialEventsState.ts` znovu použít až po vymezení převodu do B. |
| Ceny a komerční rozšíření | `LobbyPrizePanel`, `productEvolution.ts`, season awards, eligibility, partner branding a migrace `022/023` nepatří do prvního pilotu. Zachovat zdroje a testy, nezapínat ani automaticky aplikovat. |
| Sdílené pojistky | Zachovat `scoring.ts`, ověřování administrátora, atomický zápis výsledku a kontrolu snapshotu. Ochranu ručního výsledku posílit v transakci; současná předběžná kontrola neřeší souběh. |

Vazby ke kontrole: `src/App.tsx` kombinuje načítání Home, eventové odkazy, onboarding a ceny; `src/lib/db.ts` importuje `productEvolution.ts` a umí nový prize-create RPC. `LobbyView.tsx`, `HomeDashboard.tsx`, `productFeatures.ts`, `sharing.ts` a `types.ts` obsahují společné i odložené části. Odstranění nových souborů bez úprav importů rozbije sestavení. `product-evolution-preview.html` a jeho entry nejsou beta aplikací.

**Release závislost:** `server/lib/resultSync.ts::applyMatchResult` vždy čte `official_event_predictions` a volá `apply_match_result_atomic`. Vypnuté frontendové flagy tuto vazbu neruší. Při zachování backendu vybraný projekt potřebuje ověřenou foundation `020`, následně `021`, podle [rollout gates](onboarding-start-event-architecture.md#rollout-gates). Přijetí B neopravňuje tyto migrace odstranit; jejich budoucí náhrada potřebuje vlastní ověření.

## Přesné další úkoly

**Hlavní aplikace v jednom existujícím projektu:**

1. Připravit checkpoint, seznam zahrnutých souborů a reprodukovatelné sestavení. Pět flagů Official Events/onboardingu/cen ponechat false.
2. Použít výslovně vybraný Supabase projekt `hkhkbtzdyjbdeeoiurvw`, nikoli druhou DB. Zachovat historická data a oddělit kontext nových soutěží i účtů v témže projektu. Konfiguraci spouštět explicitně; write sync zůstane vypnutý. Clerk napojit na interního hráče a oprávnění podle schváleného kontraktu.
3. Rozšířit existující lobby/turnajový základ o výslovnou účast, kontext soutěže a povolené tři matchdays LM 2026/27. Stejný rozsah vynutit při zápisu i výpočtu pořadí; sezonní winner bonus pro pilot nepočítat.
4. Zavést schválenou pevnou verzi pravidel, oddělit sportovní skóre a rozstřel od bodovaného výsledku; historické výpočty zachovat.
5. Stránkovat serverové načítání tipů, transakčně chránit ruční výsledky a vyhodnocení vítěze; testovat skutečnou `calculatePoints`, nikoli její kopii.
6. Přidat LM adapter a vypínatelný plánovač s dry-run, potom dokončit pozvánka → účet → profil → soutěž → tip → výsledek → pořadí v CZ/EN.

**Archiv staré aplikace:** samostatná úzká větev ze skutečně nasazeného commitu; vlastní snapshot, archivní příznak, oprávnění, filtr Home a blokace nových zápisů. Jen dvě potvrzená ID; „Fotbaloví experti“ zůstanou nedotčení. Nevydávat společně s betou.

## Nejkratší ověření a oprávnění

Lokálně lze uchovat a analyzovat zdroje, upravovat dokumentaci, připravit neprodukční testy a spustit lint/build/scénáře bez živých přístupů. Kontrola: scénáře skutečných funkcí → izolované SQL testy včetně souběhu → `npm run lint`, `npm run build`, `npm run build:netlify`, `git diff --check` → mobilní/desktopový průchod se dvěma lobby a odlišnými tipy.

Vlastník výslovně schválil použití a přestavbu existujícího projektu; není potřeba další přepínač souhlasu ani druhá DB. Před zápisy ověřit zálohu a konkrétní migrační kontrakt podle [AGENTS.md](../AGENTS.md). Historii „Fotbalových expertů“ nemazat ani nepřepočítávat. Zachovat samostatnou kontrolu nasazení a oprávnění; volba jednoho projektu nepovoluje merge do main nebo produkční release.
