# Supabase Migration Blueprint (Plán migrace na Supabase)

Tento dokument představuje ucelený architektonický a technický manuál pro přesun aplikace **Tipovačka 2.0 (Universal Lobby Manager)** z lokální SQLite (Turso) databáze na cloudové řešení **Supabase (PostgreSQL)**. 

Blueprint detailně mapuje transformaci datových struktur, migraci uživatelských identit včetně hesel, nahrazení aplikačních middleware pomocí Row Level Security (RLS) politik a vyhodnocuje možná rizika a rozdíly v SQL dialektech.

---

## 1. Mapování tabulky `players` na `auth.users` a `profiles`

V novém systému Supabase bude striktně oddělena **autentizační rovina** (spravovaná Supabase Auth v uzavřeném schématu `auth.users`) a **aplikační rovina** (ve veřejném schématu `public.profiles`).

```
                    ┌────────────────────────┐
                    │  SQLite (legacy DB)    │
                    │   tabulka: players     │
                    └───────────┬────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              ▼                                   ▼
 ┌────────────────────────┐          ┌────────────────────────┐
 │ Supabase Auth Schema   │          │ Public Schema (v2)     │
 │  tabulka: auth.users   │          │   tabulka: profiles    │
 ├────────────────────────┤          ├────────────────────────┤
 │ id (UUID)              │◄─────────┤ id (UUID, FK reference)│
 │ email (synthetic)      │          │ username (TEXT, unique)│
 │ encrypted_password     │          │ role ('player'/'admin')│
 │ created_at             │          │ created_at             │
 └────────────────────────┘          └────────────────────────┘
```

### Specifikace schémat v PostgreSQL

#### 1. Veřejný profil (`public.profiles`)
Tato tabulka bude obsahovat veřejně přístupné informace o uživatelích a nahrazuje legacy tabulku `players`. Je přímo svázána s autentizační tabulkou Supabase.

```sql
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
    tournament_winner_id TEXT, -- Vazba na celkového vítěze (bude migrována na novou entitu)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 2. Automatická synchronizace přes Trigger
Aby se při registraci nového uživatele přes Supabase Auth automaticky vytvořil příslušný záznam v tabulce `public.profiles`, vytvoříme PostgreSQL funkci a trigger na schématu `auth.users`:

```sql
-- Funkce pro založení profilu
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role, created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'uzivatel_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_app_meta_data->>'role', 'player'),
    NEW.created_at
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger po provedení INSERT v auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## 2. Migrace uživatelských hesel a autentizace

Při migracích do nového systému je nanejvýš žádoucí zachovat uživatelům stávající přihlašovací údaje bez nutnosti vynucení resetu hesla.

### Přenos Bcrypt hashů
Stávající backend v `server.ts` používá knihovnu `bcryptjs` s parametrem `saltRounds = 10`. Supabase Auth (postavený na knihovně GoTrue) nativně podporuje ověřování uživatelů, jejichž hesla jsou uložena jako standardní Bcrypt hashe `$2a$` nebo `$2b$`.

### Migrační SQL skript pro import uživatelů
Postup migrace začíná dočasným importem původních uživatelů do pracovní tabulky `legacy_players_import` a následným přesunem do `auth.users`. E-maily se v tomto kroku syntetizují z uživatelských jmen, protože Supabase Auth vyžaduje unikátní e-mailovou adresu.

```sql
-- 1. Dočasný import z SQLite dumpu do PostgreSQL
CREATE TEMP TABLE legacy_players_import (
    id TEXT,
    username TEXT,
    password_hash TEXT,
    role TEXT,
    created_at TEXT
);

-- (Zde proběhne naplnění daty...)

-- 2. Přímý bezpečný zápis do auth.users
INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password, -- Bcrypt hash se zapíše sem
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    is_sso_user
)
SELECT
    '00000000-0000-0000-0000-000000000000', -- Výchozí UUID instance
    gen_random_uuid(),                     -- Vygenerování korektního PostgreSQL UUID
    'authenticated',
    'authenticated',
    LOWER(username) || '@tipovacka.local',  -- Generovaný unikátní email
    password_hash,                         -- Bcrypt hash zachován a vložen
    NOW(),                                 -- Email označíme jako okamžitě potvrzený
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', COALESCE(role, 'player')),
    jsonb_build_object('username', username),
    COALESCE(created_at::timestamptz, NOW()),
    NOW(),
    FALSE
FROM legacy_players_import;
```

*Poznámka: Aktivovaný databázový trigger `on_auth_user_created` po spuštění tohoto skriptu automaticky a čistě naplní tabulku `public.profiles` všemi importovanými uživateli.*

---

## 3. Schéma a migrace ostatních entit

Všechny ostatní tabulky budou přeneseny do schématu `public` a jejich sloupce budou přizpůsobeny standardům PostgreSQL (zejména přísnější typování datumů a cizích klíčů).

```
               ┌───────────────────────┐
               │        sports         │
               └───────────┬───────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
 ┌───────────────────────┐   ┌───────────────────────┐
 │     participants      │   │      tournaments      │
 └───────────┬───────────┘   └───────────┬───────────┘
             │                           │
             ├─────────────┬─────────────┘
             │             ▼
             │ ┌───────────────────────┐        ┌───────────────────────┐
             │ │        matches        │◄───────┤        lobbies        │
             │ └───────────┬───────────┘        └───────────┬─────────┬─┘
             ▼             │                                ▲         │
 ┌───────────────────────┐ │                                │         │
 │ longterm_predictions  │ │                                │         │
 └───────────────────────┘ ▼                                │         ▼
 ┌─────────────────────────────────────────────────────┐    │ ┌───────────────────────┐
 │                    predictions                      ├────┘ │     lobby_members     │
 └─────────────────────────────────────────────────────┘      └───────────────────────┘
```

### DDL definice tabulek v PostgreSQL

```sql
-- 1. SPORTS
CREATE TABLE public.sports (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    icon TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE, -- Změna z SQLite INTEGER na BOOLEAN
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. PARTICIPANTS (přejmenováno z teams)
CREATE TABLE public.participants (
    id TEXT PRIMARY KEY,
    sport_id TEXT NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    short_name TEXT,
    type TEXT NOT NULL DEFAULT 'team' CHECK (type IN ('team', 'individual', 'driver')),
    flag_code TEXT,
    logo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TOURNAMENTS
CREATE TABLE public.tournaments (
    id TEXT PRIMARY KEY,
    sport_id TEXT NOT NULL REFERENCES public.sports(id) ON DELETE RESTRICT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'hidden')),
    external_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. LOBBIES
CREATE TABLE public.lobbies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT, -- Převod na UUID
    tournament_id TEXT NOT NULL REFERENCES public.tournaments(id) ON DELETE RESTRICT,
    join_code TEXT UNIQUE NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. LOBBY_MEMBERS
CREATE TABLE public.lobby_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lobby_id TEXT NOT NULL REFERENCES public.lobbies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, -- Převod na UUID
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_lobby_member UNIQUE (lobby_id, user_id)
);

-- 6. MATCHES (v2 shadow tabulka migrovaná na produkční matches)
CREATE TABLE public.matches (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    home_participant_id TEXT NOT NULL REFERENCES public.participants(id) ON DELETE RESTRICT,
    away_participant_id TEXT NOT NULL REFERENCES public.participants(id) ON DELETE RESTRICT,
    start_time_utc TIMESTAMPTZ NOT NULL, -- Změna textu na časové razítko
    lock_time_utc TIMESTAMPTZ NOT NULL,  -- Změna textu na časové razítko
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'finished')),
    stage TEXT,
    home_score INTEGER,
    away_score INTEGER,
    provider_name TEXT,
    provider_match_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pro synchronizaci s externím API
CREATE UNIQUE INDEX idx_matches_provider_pg 
ON public.matches(provider_name, provider_match_id) 
WHERE provider_name IS NOT NULL AND provider_match_id IS NOT NULL;

-- 7. PREDICTIONS (v2 shadow tabulka predictions_v2 migrovaná na produkční predictions)
CREATE TABLE public.predictions (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, -- Převod na UUID
    lobby_id TEXT NOT NULL REFERENCES public.lobbies(id) ON DELETE CASCADE,
    match_id TEXT NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    predicted_home_score INTEGER NOT NULL,
    predicted_away_score INTEGER NOT NULL,
    points_earned INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, lobby_id, match_id)
);
```

---

## 4. Nahrazení Express middleware pomocí Row Level Security (RLS)

V aktuálním monolithic Express setupu jsou API routy chráněny pomocí vlastních kontrolních funkcí v kódu. Supabase umožňuje přejít na bezserverový model, kde klientská aplikace komunikuje s databází **napřímo skrze Supabase JS Client**. 

Zabezpečení přechází na úroveň databáze pomocí **Row Level Security (RLS)** a politik (Policies), které PostgreSQL vykonává nad každým příchozím dotazem.

### Jak to funguje:
1. Uživatel se přihlásí v React aplikaci přes `supabase.auth.signInWithPassword(...)`.
2. Supabase SDK uloží JWT token (Access Token) lokálně v prohlížeči.
3. Při každém následném volání databáze klientská knihovna automaticky přibalí tento JWT token do HTTP hlavičky `Authorization: Bearer <JWT>`.
4. PostgreSQL rozbalí token a získá z něj bezpečnostní kontext uživatele (mj. jeho ID pomocí funkce `auth.uid()`).
5. Databáze vyhodnotí nadefinované SQL podmínky (Policies). Pokud dotaz vyhovuje, vrátí data; v opačném případě vrací prázdné výsledky nebo chybu.

---

## 5. Definice RLS politik (Policies)

Pro implementaci bezpečné multi-lobby architektury nadefinujeme striktní pravidla pro čtení a zápis.

### Pomocné databázové funkce (Security Definer)
Chceme zabránit rekurzivním dotazům při vyhodnocování členství v lobby. Pro zjištění, zda má uživatel administrátorská práva, vytvoříme optimalizovanou helper funkci:

```sql
-- Bezpečná kontrola na systémového admina
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql;

-- Bezpečná kontrola na členství v lobby
CREATE OR REPLACE FUNCTION public.is_lobby_member(lobby_id_val TEXT)
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.lobby_members
    WHERE lobby_id = lobby_id_val AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql;
```

### Konkrétní RLS Policies pro jednotlivé entity

```sql
-- Aktivace RLS nad tabulkami
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lobbies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lobby_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- POLITIKY PRO TABULKU public.profiles
-- ==========================================
CREATE POLICY "Profily jsou čitelné všemi přihlášenými uživateli"
ON public.profiles FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Uživatel si může upravit pouze svůj vlastní profil"
ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- ==========================================
-- POLITIKY PRO TABULKU public.lobbies (Lobby Owners & Admins)
-- ==========================================
CREATE POLICY "Veřejné lobby vidí všichni, soukromé pouze členové"
ON public.lobbies FOR SELECT TO authenticated USING (
  visibility = 'public' OR is_lobby_member(id) OR is_admin()
);

-- Pouze vlastník lobby (owner) nebo systémový admin může lobby editovat
CREATE POLICY "Pouze vlastník nebo admin může vytvořit lobby"
ON public.lobbies FOR INSERT TO authenticated WITH CHECK (
  owner_id = auth.uid() OR is_admin()
);

CREATE POLICY "Pouze vlastník nebo admin může upravit lobby"
ON public.lobbies FOR UPDATE TO authenticated USING (
  owner_id = auth.uid() OR is_admin()
);

CREATE POLICY "Pouze vlastník nebo admin může smazat lobby"
ON public.lobbies FOR DELETE TO authenticated USING (
  owner_id = auth.uid() OR is_admin()
);

-- ==========================================
-- POLITIKY PRO TABULKU public.lobby_members (Lobby členové)
-- ==========================================
CREATE POLICY "Členy lobby mohou vidět pouze ostatní členové dané lobby"
ON public.lobby_members FOR SELECT TO authenticated USING (
  is_lobby_member(lobby_id) OR is_admin()
);

-- Vlastník lobby může přidávat a odebírat členy. Člen se může přidat sám (veřejná lobby)
CREATE POLICY "Zápis členů do lobby"
ON public.lobby_members FOR INSERT TO authenticated WITH CHECK (
  EXISTS(SELECT 1 FROM public.lobbies WHERE id = lobby_id AND owner_id = auth.uid()) OR
  (user_id = auth.uid() AND EXISTS(SELECT 1 FROM public.lobbies WHERE id = lobby_id AND visibility = 'public')) OR
  is_admin()
);

-- ==========================================
-- POLITIKY PRO TABULKU public.matches
-- ==========================================
CREATE POLICY "Zápasy mohou číst všichni přihlášení uživatelé"
ON public.matches FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Zápasy a skóre může upravovat pouze systémový administrátor"
ON public.matches FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ==========================================
-- POLITIKY PRO TABULKU public.predictions (Tipy na zápasy)
-- ==========================================
CREATE POLICY "Uživatelé vidí tipy ostatních pouze v rámci své lobby"
ON public.predictions FOR SELECT TO authenticated USING (
  is_lobby_member(lobby_id) OR is_admin()
);

-- Tipy lze vkládat a upravovat pouze pro sebe sama a před časem uzamčení
CREATE POLICY "Vkládání vlastních tipů"
ON public.predictions FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND 
  EXISTS (
    SELECT 1 FROM public.matches 
    WHERE id = match_id AND NOW() < lock_time_utc
  )
);

CREATE POLICY "Aktualizace vlastních tipů"
ON public.predictions FOR UPDATE TO authenticated USING (
  user_id = auth.uid() AND 
  EXISTS (
    SELECT 1 FROM public.matches 
    WHERE id = match_id AND NOW() < lock_time_utc
  )
);
```

---

## 6. Vyřazení přebytečných komponent backendu

Přechodem na platformu Supabase eliminujeme nutnost provozovat velkou část dosavadního Node/Express serverového kódu. Tím se sníží režijní náklady a odstraní potenciální slabá místa v zabezpečení.

### Co bude kompletně vymazáno / odstraněno:
1. **Verifikace uživatelů a šifrování na backendu (`server.ts`):**
   * Smaže se závislost na `bcryptjs` (či `bcrypt`) a generování JWT / sessions v Expressu.
   * Odpadnou middlewares jako `cookieParser` a custom hlavičkové autorizační mechanismy.
2. **Standardní CRUD API routy:**
   * `/api/auth/register` a `/api/auth/login` (nahrazeno Supabase Auth).
   * `/api/teams` (nahrazeno přímým dotazem na `public.participants`).
   * `/api/matches` (nahrazeno přímým voláním `public.matches`).
   * `/api/predictions` pro standardní operace zápisu (nahrazeno klientským Supabase insertem).

### Které backendové komponenty zůstanou:
Zabezpečení aplikací vyžaduje zachovat tzv. **Důvěryhodnou serverovou logiku (Trusted Logic)**, kterou nelze svěřit klientovi, například vyhodnocování bodů. Tyto části můžeme implementovat jako **Supabase Edge Functions** (Deno Serverless) nebo ponechat jako dedikované endpointy v odlehčeném Express serveru:

1. **Vyhodnocování odehraných zápasů (Scoring engine):**
   * Administrátor zapíše výsledek zápasu. Server/Edge funkce následně provede hromadný přepočet bodů v tabulce `predictions` na základě definovaných `scoring_rules`. Klient nesmí mít možnost přímého zápisu do sloupce `points_earned`.
2. **Synchronizace s externími datovými API:**
   * Periodický cron trigger, který stahuje zápasy z externích providerů a bezpečně je zapisuje do `public.matches`.

---

## 7. SQL rozdíly mezi SQLite a PostgreSQL a jejich úskalí

SQLite a PostgreSQL mají odlišnou vnitřní filozofii (minimalistické, dynamicky typované souborové úložiště vs. plnohodnotný, striktně typovaný relační server). Během migrace narozíme na tyto klíčové odlišnosti:

| Charakteristika | SQLite (Turso) | PostgreSQL (Supabase) | Dopad na migraci a řešení |
| :--- | :--- | :--- | :--- |
| **Časová razítka** | Textový formát (`TEXT DEFAULT CURRENT_TIMESTAMP`). | Datový typ `TIMESTAMPTZ` (s časovou zónou). | V SQLite se čas ukládá jako ISO8601 řetězec. V Postgresu je nutné formáty explicitně přetypovat přes `::timestamptz`. |
| **Pravdivostní hodnoty** | `INTEGER` (používá se `0` pro false, `1` pro true). | Nativní typ `BOOLEAN` (`true` / `false`). | Sloupec `is_active` u sportů musíme v Postgresu definovat jako `BOOLEAN`. V klientském kódu je třeba upravit kontroly (místo `=== 1` na standardní pravdivostní hodnoty). |
| **Potlačení konfliktů** | Klíčové slovo `INSERT OR IGNORE`. | Klauzule `ON CONFLICT DO NOTHING`. | Všechny seed skripty a serverové synchronizace se musí přepsat. Konstrukt `INSERT OR IGNORE INTO` v PostgreSQL vyvolá syntaktickou chybu. |
| **Auto-increment id** | `INTEGER PRIMARY KEY AUTOINCREMENT`. | Datový typ `UUID` nebo sekvenční `BIGSERIAL` / `IDENTITY`. | Pro bezpečné multi-lobby prostředí je ideální u tabulek jako `lobby_members` použít typ `UUID DEFAULT gen_random_uuid()` k ochraně před ID harvestingem. |
| **Case Sensitivity** | Identifikátory tabulek/sloupců jsou case-insensitive. | PostgreSQL je ve výchozím nastavení case-sensitive na malá písmena. | Pokud jsou v dotazech SQLite tabulky v uvozovkách nebo velkými písmeny (kupř. `Matches`), Postgres vyžaduje striktní dodržování malých písmen (`matches`), pokud nebyly uvozovkami definovány jinak. |

---

## 8. Navržený harmonogram a postup migrace

Migrace na produkční Supabase bude probíhat v 6 krocích s nulovým výpadkem (Zero-Downtime) pro stávající uživatele.

```
┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
│     1. Setup DB        │ ───► │   2. Auth & Profiles   │ ───► │  3. ETL transformace   │
│ Vytvoření schématu,    │      │ Trigger pro autolinking│      │  Export SQLite, převod │
│  indexů, RLS politik   │      │   stávajících hráčů    │      │   booleanů a datumů    │
└────────────────────────┘      └────────────────────────┘      └────────────────────────┘
                                                                            │
                                                                            ▼
┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
│   6. Decommissioning   │ ◄─── │   5. Frontend swap     │ ◄─── │    4. Bulk Import      │
│ Smazání legacy kódů a  │      │ Přepnutí klienta na    │      │  Nahrání dat v přesném │
│  vypnutí Express API   │      │  Supabase SDK v Reactu │      │ pořadí dle závislostí  │
└────────────────────────┘      └────────────────────────┘      └────────────────────────┘
```

### Podrobný itinerář kroků:

1. **Krok 1: Příprava prostředí v Supabase**
   * Spuštění kompletního DDL skriptu (definovaného v sekci 3) v SQL Editoru v administraci Supabase.
   * Vytvoření indexů, helper funkcí a aktivace RLS politik.
2. **Krok 2: Konfigurace automatické synchronizace uživatelů**
   * Nasazení PostgreSQL triggeru `on_auth_user_created` , který zajistí automatické provázání nově registrovaných uživatelů do tabulky `profiles`.
3. **Krok 3: Příprava migračních dat (ETL fáze)**
   * Export dat ze stávající SQLite databáze do formátu CSV/SQL dump.
   * Spuštění jednoduchého skriptu pro transformaci bool hodnot `0/1 ➔ false/true` a konverzi textových datumů na korektní PostgreSQL timestamps.
   * Vygenerování syntetických e-mailů s formátem `username@login.tipovacka`.
4. **Krok 4: Hromadný import (Bulk Import)**
   * Provedení importu v přesném pořadí relačních vazeb:
     1. Import uživatelů do `auth.users` (tím trigger automaticky založí profily v `public.profiles`).
     2. Import tabulky `sports`.
     3. Import tabulky `participants`.
     4. Import tabulky `tournaments`.
     5. Import tabulky `matches` (z doposud nasbíraných stávajících dat).
     6. Import tabulky `lobbies` a následně `lobby_members`.
     7. Import tabulky `predictions` (předpovědi uživatelů se navážou na globální lobby `global-hockey-lobby`).
5. **Krok 5: Přepnutí klientského rozhraní (Frontend Cutover)**
   * Instalace `@supabase/supabase-js`.
   * Nahrazení přihlašovacích a registračních formulářů voláním Supabase Auth.
   * Přepis klientských fetcherů (např. `fetch('/api/matches')` na direct volání `supabase.from('matches').select(...)`).
6. **Krok 6: Odstavení legacy Express kódu**
   * Jakmile je ověřena stoprocentní konzistence v produkčním prostředí a všichni uživatelé se mohou bez problémů přihlásit prostřednictvím svých starých hesel, dojde k odstranění nepoužívaných API rout z kódu serveru.
