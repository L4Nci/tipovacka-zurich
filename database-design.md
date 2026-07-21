# FÁZE 2: Nový datový model — Tipovačka 2.0 (Korekce Architektury)

> Historical design document. This is useful background for the data model, but
> the current schema source of truth is the Supabase migration set in
> `supabase/migrations` and the current application types/code.

Tento dokument představuje upravený celkový návrh relační databáze pro novou verzi **Tipovačka 2.0 (Universal Lobby Manager)**. Datový model je navržen tak, aby podporoval více sportů, více turnajů, oddělené komunitní skupiny (lobby) a dynamické vyhodnocování bodovacích pravidel s prioritním přepisováním.

---

## 1. Cílový seznam tabulek (Core Entities)

Architektura 2.0 je postavena na deseti úzce propojených a plně normalizovaných tabulkách:

1.  `profiles` (Uživatelé — nahrazuje legacy tabulku `players`)
2.  `sports` (Sporty jako hokej, fotbal, mma, tenis atd.)
3.  `participants` (Účastníci — zobecnění tabulky `teams` pro týmové i individuální sporty)
4.  `tournaments` (Jednotlivé sportovní poháry a soutěže)
5.  `matches` (Konkrétní zápasy s časovými zámky a vazbou na datové providery)
6.  `lobbies` (Komunitní herní skupiny / soutěže)
7.  `lobby_members` (Členové herních skupin a jejich role)
8.  `predictions` (Standardní zápasové tipy specifické pro každou kombinaci uživatele, lobby a zápasu)
9.  `longterm_predictions` (Dlouhodobé celkové tipy — vítězové, střelci atd.)
10. `scoring_rules` (Konfigurovatelná pravidla bodování podporující dědičnost a override)

---

## 2. ER Diagram (Mermaid)

Dole uvedený diagram popisuje vazby mezi všemi deseti tabulkami sjednocenými podle nového namingu.

```mermaid
erDiagram
    profiles ||--o{ lobby_members : joins
    profiles ||--o{ lobbies : owns
    profiles ||--o{ predictions : placing
    profiles ||--o{ longterm_predictions : places

    sports ||--o{ tournaments : categorizes
    sports ||--o{ scoring_rules : configures
    sports ||--o{ participants : contains

    tournaments ||--o{ matches : schedules
    tournaments ||--o{ lobbies : hosts
    tournaments ||--o{ scoring_rules : overrides

    matches ||--o{ predictions : receives
    matches }|--|| participants : home_participant
    matches }|--|| participants : away_participant

    lobbies ||--o{ lobby_members : "has members"
    lobbies ||--o{ predictions : group_scope
    lobbies ||--o{ longterm_predictions : group_scope
    lobbies ||--o{ scoring_rules : overrides

    lobby_members {
        string id PK
        string lobby_id FK
        string user_id FK
        string role
        timestamp joined_at
    }

    profiles {
        string id PK
        string username UNIQUE
        string password_hash
        string role
        timestamp created_at
    }

    sports {
        string id PK
        string slug UNIQUE
        string name
        string icon
        integer is_active
        timestamp created_at
    }

    tournaments {
        string id PK
        string sport_id FK
        string name
        string status
        timestamp created_at
    }

    scoring_rules {
        string id PK
        string sport_id FK
        string tournament_id FK
        string lobby_id FK
        integer winner_points
        integer exact_score_points
        integer draw_points
        string settings_json
    }

    matches {
        string id PK
        string tournament_id FK
        string home_participant_id FK
        string away_participant_id FK
        timestamp start_time_utc
        timestamp lock_time_utc
        string status
        string stage
        integer home_score
        integer away_score
        string provider_name
        string provider_match_id
        timestamp created_at
        timestamp updated_at
    }

    participants {
        string id PK
        string sport_id FK
        string name
        string short_name
        string type
        string flag_code
        string logo_url
        timestamp created_at
    }

    lobbies {
        string id PK
        string name
        string owner_id FK
        string tournament_id FK
        string join_code UNIQUE
        string visibility
        timestamp created_at
    }

    predictions {
        string user_id PK_FK
        string lobby_id PK_FK
        string match_id PK_FK
        integer predicted_home_score
        integer predicted_away_score
        integer points_earned
        timestamp created_at
    }

    longterm_predictions {
        string id PK
        string lobby_id FK
        string user_id FK
        string prediction_type
        string predicted_value
        integer points_earned
        integer is_locked
        timestamp created_at
    }
```

---

## 3. Detailní návrh schémat tabulek (SQL DDL)

Níže jsou podrobně definována cílová schémata včetně cizích klíčů, výchozích hodnot a unikátních omezení.

### 3.1 Tabulka `profiles`
Nahrazuje dřívější tabulku `players`. Obsahuje registrace uživatelů. Role `'admin'` umožňuje globální správu sportů, turnajů a výsledků.
```sql
CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'player', -- 'player', 'admin'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 Tabulka `sports`
Definuje škálu podporovaných sportů. Každý sport odkazuje na výchozí nastavení a ikonu.
```sql
CREATE TABLE sports (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,   -- 'hockey', 'football', 'tennis', 'mma', 'f1'
    name TEXT NOT NULL,          -- 'Hokej', 'Fotbal', 'MMA', 'F1'
    icon TEXT,                   -- '🏒', '⚽', '🥊', '🏎️'
    is_active INTEGER DEFAULT 1, -- 1 = Aktivní, 0 = Neaktivní
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### 3.3 Tabulka `scoring_rules`
Tabulka pro podrobnou definici bodovacích parametrů. Podporuje uložení na třech různých úrovních: globální pro celý sport, specifické pro turnaj, nebo uživatelské přepsání pro konkrétní lobby.

Sloupce `sport_id`, `tournament_id` a `lobby_id` jsou dobrovolné (`NULL`), což umožňuje vytvořit hierarchy overridů.
```sql
CREATE TABLE scoring_rules (
    id TEXT PRIMARY KEY,
    sport_id TEXT,               -- Pokud je nastaveno, platí globálně pro daný sport
    tournament_id TEXT,          -- Pokud je nastaveno, přepisuje pravidla pro daný turnaj
    lobby_id TEXT,               -- Pokud je nastaveno, přepisuje pravidla v rámci jedné lobby
    winner_points INTEGER NOT NULL DEFAULT 2,     -- body za uhodnutí vítěze nebo remízy
    exact_score_points INTEGER NOT NULL DEFAULT 5, -- body za přesný výsledek (např. 3:2)
    draw_points INTEGER NOT NULL DEFAULT 0,        -- doplňkové body za remízu v základním čase (pokud je sportem hokej apod.)
    settings_json TEXT,                            -- flexibilní JSON pro doplňková pravidla (např. body za střelce, bonusy za streak)
    FOREIGN KEY (sport_id) REFERENCES sports (id) ON DELETE CASCADE,
    FOREIGN KEY (tournament_id) REFERENCES tournaments (id) ON DELETE CASCADE,
    FOREIGN KEY (lobby_id) REFERENCES lobbies (id) ON DELETE CASCADE
);
```

#### Vyhodnocení priority pravidel (Resolution Order):
Při vyhodnocování bodů za ukončený zápas provede bodovací kalkulační engine vyhodnocení pravidel v tomto kaskádovém pořadí:

1.  **Lobby custom rules:** Hledá záznam, kde `lobby_id = :lobbyId` a `tournament_id = :tournamentId`. Pokud existuje, použije ho.
2.  **Tournament rules:** Hledá záznam, kde `tournament_id = :tournamentId` a `lobby_id IS NULL`. Pokud existuje, použije ho.
3.  **Sport default rules:** Fallback hledá záznam, kde `sport_id = :sportId` a `tournament_id IS NULL` a `lobby_id IS NULL`. Pokud existuje, použije ho.
4.  **Kódový fallback:** Pokud v DB chybí jakýkoliv záznam, použije se výchozí kódová konfigurace (např. winner=2, exact=5).

---

### 3.4 Tabulka `tournaments`
Sdružuje zápasy a herní skupiny pod jeden herní balík (např. MS Hokej 2026). Musí patřit konkrétnímu sportu.
```sql
CREATE TABLE tournaments (
    id TEXT PRIMARY KEY,
    sport_id TEXT NOT NULL,
    name TEXT NOT NULL,          -- např. 'MS Hokej 2026', 'Premier League 25/26'
    status TEXT DEFAULT 'active', -- 'active', 'finished', 'hidden'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sport_id) REFERENCES sports (id) ON DELETE RESTRICT
);
```

### 3.5 Tabulka `participants`
Zobecněný číselník týmů i jednotlivců. Řeší problém, kdy v hokeji soutěží `teams` (reprezentace), ale v tenise jednotliví hráči a v MMA bojovníci.
```sql
CREATE TABLE participants (
    id TEXT PRIMARY KEY,
    sport_id TEXT NOT NULL,      -- vazba na konkrétní sport
    name TEXT NOT NULL,          -- např. 'Czechia', 'Roger Federer', 'Jiří Procházka'
    short_name TEXT,             -- zkratka, např. 'CZE', 'FED', 'PRO'
    type TEXT NOT NULL DEFAULT 'team', -- 'team', 'individual', 'driver'
    flag_code TEXT,              -- ISO kód státu (např. 'cz', 'us') nebo emoji symbol ('🇨🇿')
    logo_url TEXT,               -- odkaz na klubový znak nebo portrét sportovce
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sport_id) REFERENCES sports (id) ON DELETE CASCADE
);
```

### 3.6 Tabulka `matches`
Významný update původního schématu. Zahrnuje sloupec `lock_time_utc` určující přesný termín, do kterého lze podávat a měnit tipy (obvykle 5 minut před startem). Dále obsahuje sloupce pro synchronizaci a zamezení duplicit při sběru dat z externích API providerů.
```sql
CREATE TABLE matches (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL,
    home_participant_id TEXT NOT NULL,
    away_participant_id TEXT NOT NULL,
    start_time_utc TEXT NOT NULL,
    lock_time_utc TEXT NOT NULL,       -- Čas uzamčení tipů (start_time_utc minus 5 minut)
    status TEXT DEFAULT 'scheduled',   -- 'scheduled', 'live', 'finished'
    stage TEXT,                        -- např. 'Skupina A', 'Čtvrtfinále'
    home_score INTEGER,                -- real score (NULL při neodehraném stavu)
    away_score INTEGER,                -- real score (NULL při neodehraném stavu)
    provider_name TEXT,                -- název API (např. 'thesportsdb', 'api-football')
    provider_match_id TEXT,            -- ID zápasu u externího poskytovatele
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tournament_id) REFERENCES tournaments (id) ON DELETE CASCADE,
    FOREIGN KEY (home_participant_id) REFERENCES participants (id),
    FOREIGN KEY (away_participant_id) REFERENCES participants (id)
);
```

#### Prevence duplicit při API synchronizaci:
Byl přidán unikátní složený index na kombinaci `(provider_name, provider_match_id)`. Tím se v databázi zabrání vzniku duplicitních zápasů při opakovaných nebo paralelních dotazech na API:
```sql
CREATE UNIQUE INDEX idx_matches_provider ON matches(provider_name, provider_match_id) 
WHERE provider_name IS NOT NULL AND provider_match_id IS NOT NULL;
```

---

### 3.7 Tabulka `lobbies`
Herní komunitní místnosti. Jsou navázané na konkrétní turnaje (a skrze ně na sporty). Vstup do private lobby probíhá zadáním `join_code`.
```sql
CREATE TABLE lobbies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    tournament_id TEXT NOT NULL,
    join_code TEXT UNIQUE NOT NULL,    -- uníkátní alfanumerický ověřovací klíč, např. 'ABCD123'
    visibility TEXT DEFAULT 'private', -- 'private', 'public'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES profiles (id) ON DELETE RESTRICT,
    FOREIGN KEY (tournament_id) REFERENCES tournaments (id) ON DELETE RESTRICT
);
```

### 3.8 Tabulka `lobby_members`
Vazební tabulka M:N definující příslušnost a oprávnění profilů v rámci jednotlivých lobbies.
```sql
CREATE TABLE lobby_members (
    id TEXT PRIMARY KEY,
    lobby_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'member', -- 'owner', 'admin', 'member'
    joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lobby_id) REFERENCES lobbies (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE,
    CONSTRAINT unique_lobby_member UNIQUE (lobby_id, user_id)
);
```

### 3.9 Tabulka `predictions` (Standardní zápasové tipy)
Vazba tipů obsahuje kombinaci uživatele, zápasu a **konkrétní lobby**. Umožňuje uživateli tipovat stejný zápas v různých skupinách odlišně.
```sql
CREATE TABLE predictions (
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
    FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE
);
```

---

### 3.10 Tabulka `longterm_predictions` (Dlouhodobé/turnajové tipy)
Navržena jako univerzální tabulka pro turnajové tipy (např. celkový vítěz turnaje, nejlepší střelec, pořadí ve skupině, finalista). Odbourává fixní sloupce v profilech a podporuje různé otázky napříč sporty.
```sql
CREATE TABLE longterm_predictions (
    id TEXT PRIMARY KEY,
    lobby_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    prediction_type TEXT NOT NULL, -- 'tournament_winner', 'top_scorer', 'group_winner', 'finalist'
    predicted_value TEXT NOT NULL, -- ID účastníka (např. 'cze'), nebo ID hráče, nebo text
    points_earned INTEGER DEFAULT 0,
    is_locked INTEGER DEFAULT 0,   -- 1 = uzamčeno (vypršel čas na tipování), 0 = editovatelné
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lobby_id) REFERENCES lobbies (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE,
    CONSTRAINT unique_lobby_user_type UNIQUE (lobby_id, user_id, prediction_type)
);
```
