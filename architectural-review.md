# Architektonické Posouzení & Návrh (Architectural Review) — Tipovačka 2.0

Tento dokument detailně rozebírá architekturu systému **Tipovačka 2.0 (Universal Lobby Manager)**. Poskytuje technická řešení pro škálovatelný sportovní engine, rozšiřitelnost typů předpovědí, nezávislost datových zdrojů, zobecnění herních entit, bezvýpadkovou migraci z legacy systému a vyhodnocování bodování na základě priority.

---

## 1. Návrh řešení Leaderboardů (Žebříčků)

V architektuře s více herními skupinami (lobby) se celkové pořadí uživatelů stává lokální záležitostí každé konkrétní lobby. Uživatel soutěží pouze s ostatními členy dané skupiny.

### A. Přístup: Dynamická agregace (On-the-fly)
Výpočet bodů v reálném čase přímým dotazem na tabulku `predictions` filtrovaným podle `lobby_id`.
*   **SQL Dotaz:**
    ```sql
    SELECT 
        lm.user_id,
        p.username,
        COALESCE(SUM(pr.points_earned), 0) as total_points,
        COUNT(CASE WHEN pr.points_earned = 5 THEN 1 END) as exact_scores,
        COUNT(CASE WHEN pr.points_earned = 2 THEN 1 END) as correct_winners
    FROM lobby_members lm
    JOIN profiles p ON lm.user_id = p.id
    LEFT JOIN predictions pr ON lm.lobby_id = pr.lobby_id AND lm.user_id = pr.user_id
    WHERE lm.lobby_id = ?
    GROUP BY lm.user_id
    ORDER BY total_points DESC, exact_scores DESC, p.username ASC;
    ```
*   **Výhody:** 
    *   100% konzistentní data. Nedochází k desynchronizaci.
    *   Není nutné psát složitou logiku pro čištění mezipaměti (cache invalidation).
*   **Nevýhody:**
    *   Při velkém počtu hráčů a odehraných zápasů může výkon klesat. U SQLite s indexy je toto řešení sub-milisekundové do desítek tisíc řádků.
*   **Indexační strategie:**
    ```sql
    CREATE INDEX idx_predictions_lobby_user ON predictions(lobby_id, user_id, points_earned);
    ```

### B. Přístup: Materializovaná tabulka žebříčků (Leaderboard Cache)
Zavedení fyzické tabulky `lobby_leaderboards`, která ukládá předpočítaný stav.
```sql
CREATE TABLE lobby_leaderboards (
    lobby_id TEXT,
    user_id TEXT,
    total_points INTEGER DEFAULT 0,
    exact_match_count INTEGER DEFAULT 0,
    winner_match_count INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    rank INTEGER,
    previous_rank INTEGER,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (lobby_id, user_id)
);
```

### Doporučené řešení:
Pro **Fázi 12** implementovat **Přístup A (Dynamická agregace)**. Je to nejbezpečnější a nejčistší cesta pro SQLite. S indexy na `predictions(lobby_id, user_id, points_earned)` je výpočet okamžitý.

---

## 2. Návrh řešení turnajových tipů (Dlouhodobé predikce)

Původní hokejová tipovačka měla pevně navázanou tabulku `players.tournament_winner_id` reprezentující jednoho celkového vítěze pro hokejový turnaj. V platformě 2.0 je toto chování nahrazeno univerzální tabulkou `longterm_predictions`.

Tato nová tabulka umožňuje:
1.  Možnost tipovat celkového vítěze individuálně pro každou lobby (hráč může v různých lobby věřit jiným týmům/účastníkům).
2.  Možnost tipovat jiné dlouhodobé události (např. krále střelců, celkového finalistu, vítěze skupin) na základě `prediction_type`.

### Navrhovaná tabulka `longterm_predictions`
```sql
CREATE TABLE longterm_predictions (
    id TEXT PRIMARY KEY,
    lobby_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    prediction_type TEXT NOT NULL, -- 'tournament_winner', 'top_scorer', 'group_winner', 'finalist'
    predicted_value TEXT NOT NULL, -- ID účastníka (z table participants, např. 'cze') nebo textová hodnota
    points_earned INTEGER DEFAULT 0,
    is_locked INTEGER DEFAULT 0,   -- Uzamčení tipu po vypršení termínu (1 = uzamčeno, 0 = otevřeno)
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lobby_id) REFERENCES lobbies (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE,
    CONSTRAINT unique_lobby_user_type UNIQUE (lobby_id, user_id, prediction_type)
);
```

### Pravidla uzamčení a bodování:
*   **Uzamčení (Locking):** Każdé pravidlo má stanovený časový limit (např. *tournament_winner* se uzamyká se začátkem prvního zápasu daného turnaje). Zámek kontroluje backend při zápisu.
*   **Bodování (Scoring):** Při uzavření turnaje administrátor v admin panelu označí správné odpovědi. Systém provede hromadný update a rozdistribuuje body (např. +10 bodů):
    ```sql
    UPDATE longterm_predictions
    SET points_earned = 10
    WHERE prediction_type = 'tournament_winner' AND predicted_value = :winnerParticipantId;
    ```

---

## 3. Návrh tabulky `scoring_rules` a priorit vyhodnocení

Pravidla pro bodování už nesmí být pevně zapsána v kódu ani v komponentách. Tabulka `scoring_rules` umožňuje flexibilní konfiguraci bodování.

### Struktura tabulky `scoring_rules`
```sql
CREATE TABLE scoring_rules (
    id TEXT PRIMARY KEY,
    sport_id TEXT,               -- Odkaz na sport (např. 'hockey')
    tournament_id TEXT,          -- Specifický override pro konkrétní turnaj (např. 'ms-hockey-2026')
    lobby_id TEXT,               -- Specifický override pro konkrétní herní skupinu (lobby)
    winner_points INTEGER NOT NULL DEFAULT 2,
    exact_score_points INTEGER NOT NULL DEFAULT 5,
    draw_points INTEGER NOT NULL DEFAULT 0,
    settings_json TEXT,          -- doplňující pravidla ve formátu JSON
    FOREIGN KEY (sport_id) REFERENCES sports (id) ON DELETE CASCADE,
    FOREIGN KEY (tournament_id) REFERENCES tournaments (id) ON DELETE CASCADE,
    FOREIGN KEY (lobby_id) REFERENCES lobbies (id) ON DELETE CASCADE
);
```

### Vyhodnocení priority pravidel (Resolution Order):
Pokud dojde k vyhodnocení odehraného zápasu, bodovací engine načte pravidla v následujícím sestupném pořadí priorit:

1.  **Lobby Custom Rules (Nejvyšší priorita):**
    Hledá záznam v `scoring_rules`, kde `lobby_id = :lobbyId` a `tournament_id = :tournamentId`. Pokud existuje, použijí se tyto body.
2.  **Tournament Rules:**
    Hledá záznam, kde `tournament_id = :tournamentId` a `lobby_id IS NULL`. Pokud existuje, přepisuje to výchozí pravidla sportu.
3.  **Sport Default Rules (Základní pravidlo):**
    Hledá záznam, kde `sport_id = :sportId` a `tournament_id IS NULL` a `lobby_id IS NULL`.
4.  **Kódový Fallback:**
    Pokud v DB neproběhl seeding žádných pravidel, použije se výchozí kódový fallback aplikace: `winner_points = 2`, `exact_score_points = 5`, `draw_points = 0`.

---

## 4. Návrh vrstvy poskytovatelů sportovních dat (Provider Layer)

Pro dosažení nezávislosti na konkrétním externím API zavedeme striktní abstrakční vrstvu.

### A. TypeScript Interface (`ISportsProvider`)
```typescript
export interface ExternalParticipant {
  externalId: string;
  name: string;
  flagCode: string; // ISO kód nebo emoji
}

export interface ExternalMatch {
  externalId: string;
  homeParticipant: ExternalParticipant;
  awayParticipant: ExternalParticipant;
  startTimeUtc: Date;
  status: 'scheduled' | 'live' | 'finished';
  homeScore?: number;
  awayScore?: number;
  stage?: string;
}

export interface ISportsProvider {
  fetchMatches(externalTournamentId: string): Promise<ExternalMatch[]>;
  fetchLiveResults(externalTournamentId: string): Promise<Partial<ExternalMatch>[]>;
}
```

### B. Zamezení duplicitám při API importu
Aby nedocházelo k vytváření duplicitních zápasů v tabulce `matches` (např. při souběžném běhu cronu), tabulka `matches` ukládá `provider_name` a `provider_match_id`.

Nad těmito dvěma sloupci je nastaven **unikátní složený index**:
```sql
CREATE UNIQUE INDEX idx_matches_provider ON matches(provider_name, provider_match_id) 
WHERE provider_name IS NOT NULL AND provider_match_id IS NOT NULL;
```
Při importu zápasů z API se provede operace typu **UPSERT** (v SQLite `INSERT INTO ... ON CONFLICT(provider_name, provider_match_id) DO UPDATE SET ...`):
```sql
INSERT INTO matches (
    id, tournament_id, home_participant_id, away_participant_id, 
    start_time_utc, lock_time_utc, status, stage, 
    provider_name, provider_match_id, created_at, updated_at
) VALUES (
    :id, :tournamentId, :homeParticipantId, :awayParticipantId,
    :startTime, :lockTime, :status, :stage,
    :providerName, :providerMatchId, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT(provider_name, provider_match_id) DO UPDATE SET
    status = excluded.status,
    stage = excluded.stage,
    home_score = CASE WHEN excluded.status = 'finished' THEN excluded.home_score ELSE home_score END,
    away_score = CASE WHEN excluded.status = 'finished' THEN excluded.away_score ELSE away_score END,
    updated_at = CURRENT_TIMESTAMP;
```

---

## 5. Zobecnění: Od `teams` k tabulce `participants` (Účastníci)

Termín „Team“ (Tým) je příliš omezující. V tenise hraje jednotlivec, v MMA nastupuje zápasník, ve Formuli 1 závodí jezdec nebo stáj.

Převod legacy tabulky `teams` na univerzální tabulku `participants` řeší tento problém naprosto čistě.

### Struktura tabulky `participants`
```sql
CREATE TABLE participants (
    id TEXT PRIMARY KEY,
    sport_id TEXT NOT NULL,
    name TEXT NOT NULL,               -- např. 'Jiří Procházka', 'Viktoria Plzeň'
    short_name TEXT,                  -- zkratka, např. 'PRO', 'PLZ'
    type TEXT NOT NULL DEFAULT 'team', -- 'team', 'individual', 'driver'
    flag_code TEXT,                   -- emoji vlajky nebo ISO kód
    logo_url TEXT,                    -- odkaz na klubový znak/fotku
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sport_id) REFERENCES sports (id) ON DELETE CASCADE
);
```

V souvislosti s tímto krokem se sloupce v tabulce `matches` přejmenují na:
*   `home_team_id` ➔ `home_participant_id`
*   `away_team_id` ➔ `away_participant_id`

---

## 6. Kompletní Migrační Strategie (Zero-Downtime Blueprint)

Naším cílem je přejít ze staré databáze (s tabulkami `players`, `teams`, `matches`, `predictions`) na novou architekturu 2.0 bez ztráty historických dat, uživatelských profilů a jejich tipů.

### KROK 1: Nasazení schémat (Strukturální migrace)
Vytvoříme nové tabulky a upravené verze stávajících tabulek vedle sebe:
```sql
-- 1. Tabulka profiles (Uživatelé)
CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'player',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabulka sportů
CREATE TABLE sports (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    icon TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabulka turnajů
CREATE TABLE tournaments (
    id TEXT PRIMARY KEY,
    sport_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sport_id) REFERENCES sports (id) ON DELETE RESTRICT
);

-- 4. Tabulka účastníků (participants)
CREATE TABLE participants (
    id TEXT PRIMARY KEY,
    sport_id TEXT NOT NULL,
    name TEXT NOT NULL,
    short_name TEXT,
    type TEXT NOT NULL DEFAULT 'team',
    flag_code TEXT,
    logo_url TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sport_id) REFERENCES sports (id) ON DELETE CASCADE
);

-- 5. Tabulka zápasů (s lock_time_utc a provider sloupci)
CREATE TABLE matches_new (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL,
    home_participant_id TEXT NOT NULL,
    away_participant_id TEXT NOT NULL,
    start_time_utc TEXT NOT NULL,
    lock_time_utc TEXT NOT NULL,
    status TEXT DEFAULT 'scheduled',
    stage TEXT,
    home_score INTEGER,
    away_score INTEGER,
    provider_name TEXT,
    provider_match_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tournament_id) REFERENCES tournaments (id) ON DELETE CASCADE,
    FOREIGN KEY (home_participant_id) REFERENCES participants (id),
    FOREIGN KEY (away_participant_id) REFERENCES participants (id)
);

-- 6. Tabulka herních skupin (Lobbies)
CREATE TABLE lobbies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    tournament_id TEXT NOT NULL,
    join_code TEXT UNIQUE NOT NULL,
    visibility TEXT DEFAULT 'private',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES profiles (id) ON DELETE RESTRICT,
    FOREIGN KEY (tournament_id) REFERENCES tournaments (id) ON DELETE RESTRICT
);

-- 7. Tabulka členů lobby
CREATE TABLE lobby_members (
    id TEXT PRIMARY KEY,
    lobby_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lobby_id) REFERENCES lobbies (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE,
    CONSTRAINT unique_lobby_member UNIQUE (lobby_id, user_id)
);

-- 8. Nová tabulka tipů (Predictions s vazbou na lobby_id)
CREATE TABLE predictions_new (
    user_id TEXT NOT NULL,
    lobby_id TEXT NOT NULL,
    match_id TEXT NOT NULL,
    predicted_home_score INTEGER NOT NULL,
    predicted_away_score INTEGER NOT NULL,
    points_earned INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, lobby_id, match_id),
    FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE,
    FOREIGN KEY (lobby_id) REFERENCES lobbies (id) ON DELETE CASCADE,
    FOREIGN KEY (match_id) REFERENCES matches_new (id) ON DELETE CASCADE
);

-- 9. Tabulka dlouhodobých tipů
CREATE TABLE longterm_predictions (
    id TEXT PRIMARY KEY,
    lobby_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    prediction_type TEXT NOT NULL,
    predicted_value TEXT NOT NULL,
    points_earned INTEGER DEFAULT 0,
    is_locked INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lobby_id) REFERENCES lobbies (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE,
    CONSTRAINT unique_lobby_user_type UNIQUE (lobby_id, user_id, prediction_type)
);

-- 10. Tabulka bodovacích pravidel
CREATE TABLE scoring_rules (
    id TEXT PRIMARY KEY,
    sport_id TEXT,
    tournament_id TEXT,
    lobby_id TEXT,
    winner_points INTEGER NOT NULL DEFAULT 2,
    exact_score_points INTEGER NOT NULL DEFAULT 5,
    draw_points INTEGER NOT NULL DEFAULT 0,
    settings_json TEXT,
    FOREIGN KEY (sport_id) REFERENCES sports (id) ON DELETE CASCADE,
    FOREIGN KEY (tournament_id) REFERENCES tournaments (id) ON DELETE CASCADE,
    FOREIGN KEY (lobby_id) REFERENCES lobbies (id) ON DELETE CASCADE
);
```

### KROK 2: Datová transformace a seeding (Migration Script)
Všechny operace proběhnou v jedné bezpečné databázové transakci v rámci jednorázového migračního skriptu:

1.  **Migrace profilů:**
    Převede všechny uživatelské účty z legacy tabulky `players` do nové tabulky `profiles`:
    ```sql
    INSERT INTO profiles (id, username, password_hash, role)
    SELECT id, username, password_hash, role FROM players;
    ```
2.  **Seeding výchozího sportu a turnaje:**
    Vloží sport `'hockey'` a přiřadí mu turnaj `'ms-hockey-2026'`:
    ```sql
    INSERT INTO sports (id, slug, name, icon, is_active) VALUES ('hockey', 'hockey', 'Hokej', '🏒', 1);
    INSERT INTO tournaments (id, sport_id, name, status) VALUES ('ms-hockey-2026', 'hockey', 'MS v Hokeji 2026', 'active');
    
    -- Vygenerování výchozího bodovacího pravidla pro sport hockey
    INSERT INTO scoring_rules (id, sport_id, winner_points, exact_score_points, draw_points)
    VALUES ('sr-default-hockey', 'hockey', 2, 5, 0);
    ```
3.  **Migrace týmů do účastníků:**
    Převede všechny záznamy ze staré tabulky `teams` do tabulky `participants` s vazbou na sport `'hockey'`:
    ```sql
    INSERT INTO participants (id, sport_id, name, short_name, type, flag_code)
    SELECT id, 'hockey', name, UPPER(id), 'team', flag_code FROM teams;
    ```
4.  **Migrace zápasů do nového formátu:**
    Převede zápasy a automaticky dopočítá `lock_time_utc` jako 5 minut před `start_time_utc`:
    *(V JS/TS migračním skriptu se lock_time_utc spočítá odečtením 5 minut v milisekundách z ISO stringu start_time_utc)*.
5.  **Vytvoření výchozí globální herní skupiny (Lobby):**
    Abychom zachovali stávající "komunitu" (všichni hráči tipující proti sobě), vytvoříme jednu hlavní veřejnou herní skupinu `global-lobby`:
    *   `id`: `'global-lobby'`
    *   `name`: `'Hlavní MS 2026 Tipovačka'`
    *   `owner_id`: ID prvního admina (pokud neexistuje, ID prvního hráče).
    *   `tournament_id`: `'ms-hockey-2026'`
    *   `join_code`: `'MS2026'`
    *   `visibility`: `'public'`
6.  **Migrace všech uživatelů do globální lobby:**
    Pro každého přeneseného hráče z tabulky `profiles` vytvoříme řádek v `lobby_members` spojený s `global-lobby`.
7.  **Migrace zápasových tipů:**
    Tipy z legacy tabulky `predictions` překopírujeme do `predictions_new` a přiřadíme jim vazbu na `lobby_id = 'global-lobby'`:
    ```sql
    INSERT INTO predictions_new (user_id, lobby_id, match_id, predicted_home_score, predicted_away_score, points_earned, created_at)
    SELECT player_id, 'global-lobby', match_id, predicted_home_score, predicted_away_score, points_earned, CURRENT_TIMESTAMP FROM predictions;
    ```
8.  **Převod dlouhodobých tipů na vítěze:**
    Uživatelům, kteří měli v legacy tabulce `players` vyplněný `tournament_winner_id`, vytvoříme odpovídající záznam v `longterm_predictions`:
    ```sql
    INSERT INTO longterm_predictions (id, lobby_id, user_id, prediction_type, predicted_value, points_earned, is_locked)
    SELECT 'ltp-' || id, 'global-lobby', id, 'tournament_winner', tournament_winner_id, 0, 1
    FROM players
    WHERE tournament_winner_id IS NOT NULL;
    ```

### KROK 3: Očištění a prohození tabulek (Cutover)
Jakmile je datový transfer úspěšně dokončen a ověřen:
1.  Odstraníme staré tabulky:
    ```sql
    DROP TABLE predictions;
    DROP TABLE matches;
    DROP TABLE teams;
    DROP TABLE players;
    ```
2.  Přejmenujeme dočasné tabulky na finální názvy:
    ```sql
    ALTER TABLE matches_new RENAME TO matches;
    ALTER TABLE predictions_new RENAME TO predictions;
    ```
3.  Vytvoříme unikátní provider index nad `matches`:
    ```sql
    CREATE UNIQUE INDEX idx_matches_provider ON matches(provider_name, provider_match_id) 
    WHERE provider_name IS NOT NULL AND provider_match_id IS NOT NULL;
    ```

---

## 7. Fáze 2.6 – Shrnutí a Závěry

### Finální seznam cílových tabulek
Aplikace bude po kompletním dokončení migrace využívat následujících **10 tabulek**:
*   `profiles` (Uživatelské profily a oprávnění)
*   `sports` (Podporované sportovní druhy)
*   `participants` (Účastníci turnajů - týmy i lidé)
*   `tournaments` (Konkrétní turnaje určené pro daný sport)
*   `matches` (Zápasy s časovými zámky a API klíči)
*   `lobbies` (Komunity a herní skupiny vytvořené uživateli)
*   `lobby_members` (Členové v herních skupinách)
*   `predictions` (Uživatelské tipy v jednotlivých lobby)
*   `longterm_predictions` (Turnajové tipy napříč lobby)
*   `scoring_rules` (Bodovací tabulka s prioritním vyhodnocením)

### Rizika implementace
1.  **Asynchronní synchronizace (API Limitace):** S rostoucím počtem sportů a turnajů se zvýší frekvence dotazů na API. Je nutné sledovat limity rate-limitů externích providerů a chránit backend pomocí lokálního cachování.
2.  **Konzistence SQLite při přepočtech:** SQLite nepodporuje pokročilé mechanizmy souběžnosti (concurrency). Pokud admin zadá výsledek a probíhá hromadný update tisíců tipů, může dojít k uzamčení DB (`SQLITE_BUSY`). Transakce musí být rychlé a optimálně zabalené.
3.  **Složité RLS na úrovni kódu:** SQLite nepodporuje nativní RLS. Všechna bezpečnostní pravidla (např. *uživatel vidí pouze své lobby*) musí být pečlivě vynucena v aplikačních API endpointech na Express backendu.

### Doporučené pořadí implementace (od Fáze 3 dál)
*   **Krok 1 (Fáze 3 až 7): Databázové změny a migrační skript.** Implementace SQL schémat a migračního skriptu. Krok je dokončen až po bezchybném startu DB s úspěšně převedenými daty do nového schématu.
*   **Krok 2 (Fáze 8 a 10): Bezpečnostní vrstva a pravidla bodování.** Nasazení aplikačního zabezpečení (uživatelská oprávnění k lobby) a vytvoření flexibilního scoring konfigurátoru.
*   **Krok 3 (Fáze 9 a 11): Výpočetní engine bodování.** Implementace izolované funkce `calculatePoints` podporující overridy pravidel, a procesoru výsledků zápasů.
*   **Krok 4 (Fáze 12 a 13): Lobby a pozvánky (Backend i Frontend UI).** Vývoj stránek pro zakládání lobby, generování unikátních kódů, připojování se přes URL parametry, a oddělení žebříčků.
*   **Krok 5 (Fáze 14 a 15): Výběr sportu a hlavní Dashboard.** Uživatelské přepínání mezi sporty/turnaji a kompletní transformace domovské obrazovky na modulární bento-style dashboard.
*   **Krok 6 (Fáze 16 a 17): Služba synchronizace (API a Cron).** Připojení prvního datového providera a zprovoznění automatického cronu pro aktualizaci výsledků.
*   **Krok 7 (Fáze 18 a 19): Assety a administrátorské rozhraní.** Přechod z externích vlajek na lokální SVG soubory a komplexní přepracování administrátorského panelu pro plnou kontrolu nad všemi 10 tabulkami.
