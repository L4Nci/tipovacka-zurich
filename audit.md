# FÁZE 1: Audit současného projektu

Tento audit podrobně analyzuje aktuální stav codebase hokejové tipovací aplikace „MS 2026 Fan Tipovačka“. Zkoumá strukturu databáze, aplikační logiku, dostupná API rozhraní, uživatelské rozhraní a odhaluje stávající nedostatky.

---

## 1. Existující databázová schémata (Tabulky)
Aplikace využívá **SQLite (LibSQL / Turso client)** pro perzistenci dat. Schéma je definováno v `init.sql` a dynamicky inicializováno v `server.ts` při startu serveru.

Aktuálně existují **4 tabulky**:

### A. `teams` (Týmy)
Ukládá účastnické týmy turnaje.
*   `id` (TEXT, PRIMARY KEY) — např. `'usa'`, `'cze'`, `'tba'`.
*   `name` (TEXT, NOT NULL) — název týmu (např. `'Czechia'`).
*   `flag_code` (TEXT, NOT NULL) — emoji vlajky nebo speciální symbol (např. `'🇨🇿'`).
*   `group_name` (TEXT) — označení skupiny (např. `'A'`, `'B'`, nebo `NULL` pro play-off).
*   `is_final_winner` (INTEGER, DEFAULT 0) — označení šampiona turnaje (`1` = zvítězil v turnaji, `0` = nikoliv).

### B. `players` (Hráči / Uživatelé)
Ukládá profily tipujících hráčů a administrátorů.
*   `id` (TEXT, PRIMARY KEY) — generovaný identifikátor (např. `'u-abcde12'`).
*   `username` (TEXT, UNIQUE, NOT NULL) — přihlašovací jméno.
*   `password_hash` (TEXT, NOT NULL) — zahashované heslo (přes `bcryptjs`).
*   `role` (TEXT, DEFAULT `'player'`) — role v systému (`'player'` nebo `'admin'`).
*   `tournament_winner_id` (TEXT, FOREIGN KEY) — odkaz na `teams(id)` (tip uživatele na celkového vítěze).

### C. `matches` (Zápasy)
Ukládá jednotlivá utkání turnaje.
*   `id` (TEXT, PRIMARY KEY) — např. `'m001'`, `'qf1'`.
*   `home_team_id` (TEXT, FOREIGN KEY) — odkaz na `teams(id)`.
*   `away_team_id` (TEXT, FOREIGN KEY) — odkaz na `teams(id)`.
*   `start_time_utc` (TEXT, NOT NULL) — čas výkopu/buly v ISO-8601 formátu (UTC).
*   `home_score` (INTEGER) — reálné skóre domácího týmu (`NULL`, pokud zápas neskončil).
*   `away_score` (INTEGER) — reálné skóre hostujícího týmu (`NULL`, pokud zápas neskončil).
*   `status` (TEXT, DEFAULT `'scheduled'`) — stav zápasu (`'scheduled'` nebo `'finished'`).
*   `stage` (TEXT) — popis fáze turnaje (např. `'Group A'`, `'Quarterfinal'`).

### D. `predictions` (Tipy uživatelů)
Ukládá tipy jednotlivých hráčů na konkrétní zápasy.
*   `player_id` (TEXT, FOREIGN KEY) — odkaz na `players(id)`.
*   `match_id` (TEXT, FOREIGN KEY) — odkaz na `matches(id)`.
*   `predicted_home_score` (INTEGER, NOT NULL) — tipovaný počet gólů domácích.
*   `predicted_away_score` (INTEGER, NOT NULL) — tipovaný počet gólů hostů.
*   `points_earned` (INTEGER, DEFAULT 0) — body získané za tento tip (nastaví admin).
*   **Složený primární klíč:** `PRIMARY KEY (player_id, match_id)` (hráč může tipovat zápas právě jednou).

---

## 2. Existující vazby (Foreign Keys)
*   `players.tournament_winner_id` ➔ `teams.id` (RESTRICT/SET NULL)
*   `matches.home_team_id` ➔ `teams.id`
*   `matches.away_team_id` ➔ `teams.id`
*   `predictions.player_id` ➔ `players.id` (ON DELETE CASCADE)
*   `predictions.match_id` ➔ `matches.id` (ON DELETE CASCADE)

---

## 3. Row Level Security (RLS) Politiky
*   **Stav:** **Žádné databázové RLS politiky neexistují.**
*   **Důvod:** Databáze běží na SQLite/LibSQL. SQLite nepodporuje nativní Row Level Security (RLS) v cloudu tak, jak je známé z PostgreSQL (např. Supabase).
*   **Implementace bezpečnosti:** Ochrana dat je v současnosti řízena na aplikační úrovni:
    *   **Backend (`server.ts`):** Kontroluje oprávnění administrátora podle `role` v tabulce `players` u citlivých operací (jako je zadávání výsledků přes `/api/admin/*`).
    *   **Frontend (`src/lib/db.ts`):** Připojuje se přímo do databáze (přes Turso HTTP client) s přístupovými údaji uloženými ve `.env` (`VITE_TURSO_DATABASE_URL` a `VITE_TURSO_AUTH_TOKEN`). Klient si stahuje data selektivně předáním parametru `userId`.

---

## 4. Existující stránky a navigace (Zobrazení)
Aplikace je postavena jako Single Page Application (SPA). Navigace je řešena vnitřním stavovým přepínačem `tab` v `/src/App.tsx`.

Existuje celkem **5 hlavních zobrazení (záložek)**:

1.  **Zápasy (`matches`)**:
    *   Zobrazuje seznam nadcházejících neodehraných zápasů.
    *   Umožňuje uživateli vyplnit nebo upravit svůj tip (gól domácích a hostů).
    *   Tipy se uzamykají **5 minut před oficiálním začátkem zápasu**.
2.  **Výsledky (`results`)**:
    *   Zobrazuje seznam odehraných zápasů (`status = 'finished'`) včetně reálných výsledků.
    *   Zobrazuje body získané uživatelem za daný zápas.
    *   Umožňuje rozkliknout zápas a vidět, co tipovali ostatní hráči v systému.
3.  **Pořadí (`leaderboard`)**:
    *   Zobrazuje celkovou tabulku hráčů seřazenou podle bodů.
    *   Zobrazuje počet přesných zásahů (5 bodů) a správných tipů vítěze (2 body).
    *   Zobrazuje trendy (posun v pořadí nahoru/dolů oproti předchozímu stavu).
    *   Zobrazuje aktuální tipovací sérii (streak) úspěchů.
4.  **Můj Profil (`profile`)**:
    *   Umožňuje změnu přihlašovacího hesla uživatele.
    *   Umožňuje zvolit celkového vítěze turnaje pro získání bonusových 10 bodů. Volba se uzamyká **4 hodiny před prvním zápasem** turnaje.
5.  **Admin Panel (`admin`)**:
    *   Přístupný pouze pro uživatele s `role = 'admin'`.
    *   Umožňuje zadávat a upravovat konečné výsledky zápasů. Po uložení výsledku se automaticky přepočítají body všech predikcí pro daný zápas.
    *   Umožňuje vytvořit nového uživatele (hráče) v systému.
    *   Umožňuje vybrat celkového vítěze turnaje k uplatnění bonusu.

---

## 5. Komponenty v aplikaci
Frontend je navržen velmi přímočaře. Většina logiky se nachází v hlavním souboru `src/App.tsx`.

Vytvořené a rozdělené komponenty:
*   `TeamFlag` (`src/App.tsx`): Komponenta pro vykreslení národní vlajky. Obsahuje robustní parsování emotikonů na standardní ISO kódy pro získání obrázkových vlajek s fallbackem na emoji nebo text.
*   `AdminMatchCard` (`src/App.tsx`): Karta zápasu v administrátorském rozhraní, umožňující flexibilní zadání výsledků.
*   **Ostatní UI panely:** Jsou napsány jako interní renderovací bloky (funkce) v hlavním `App` komponentu na základě stavu `tab`.

---

## 6. API endpointy (Express Server)
Pokud klient nepoužívá přímé připojení na Turso (přes `src/lib/db.ts`), server v `server.ts` vystavuje následující REST API endpoints:

| Metoda | Endpoint | Popis | Oprávnění |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/auth/register` | Vytvoření nového hráče v systému | Admin |
| **POST** | `/api/auth/login` | Přihlášení hráče do systému | Veřejné |
| **GET** | `/api/teams` | Získá seznam všech národních týmů | Přihlášený |
| **GET** | `/api/matches` | Získá seznam zápasů a případný tip přihlášeného | Přihlášený (předává `userId`) |
| **GET** | `/api/matches/:id/predictions` | Získá tipy všech hráčů pro konkrétní zápas | Přihlášený |
| **POST** | `/api/predictions` | Uloží nebo aktualizuje tip na zápas | Přihlášený (kontroluje zámek 5m) |
| **GET** | `/api/leaderboard` | Spočítá a seřadí celkovou tabulku hráčů | Přihlášený |
| **POST** | `/api/admin/set-tournament-winner` | Nastavení reálného celkového šampiona | Admin |
| **POST** | `/api/profile/tournament-winner` | Vyplnění tipu uživatele na celkového vítěze | Přihlášený (kontroluje uzamčení) |
| **POST** | `/api/admin/match-result` | Zadání reálného skóre a přepočet všech bodů zápasu | Admin |

---

## 7. Cron Joby a automatické úlohy
*   **Stav:** **V systému aktuálně neexistují žádné cron joby.**
*   Při zadání výsledku se body přepočítají okamžitě na vyžádání (on-demand) v admin endpointu nebo frontendovém volání.
*   Seznam týmů a zápasů je pevně nasetován při inicializaci db v `initDb()` v souboru `server.ts`.

---

## 8. Klíčová zjištění a odhalené syntaktické chyby

### 🛑 Chyba kompilace v `src/App.tsx` (TS1117)
Při auditu a spuštění linteru `npm run lint` byla nalezena kritická chyba, která momentálně **blokuje build aplikace**:
*   **Soubor:** `src/App.tsx` (řádek 198)
*   **Chyba:** `An object literal cannot have multiple properties with the same name.`
*   **Zdroj problému:** V definici mapování `map` pro ISO zkratky zemí:
    ```typescript
    const map: Record<string, string> = {
      'cze': 'cz', 'svk': 'sk', 'can': 'ca', 'usa': 'us',
      'fin': 'fi', 'swe': 'se', 'sui': 'ch', 'ger': 'de',
      'lat': 'lv', 'den': 'dk', 'nor': 'no', 'kaz': 'kz', // <-- první výskyt 'kaz'
      'aut': 'at', 'fra': 'fr', 'slo': 'si', 'hun': 'hu',
      'gbr': 'gb', 'pol': 'pl', 'ita': 'it', 'slv': 'si',
      'kor': 'kr', 'jpn': 'jp', 'aus': 'au', 'bel': 'be', 
      'ukr': 'ua', 'kaz': 'kz'                            // <-- druhý výskyt 'kaz' a duplicate key!
    };
    ```
*   **Doporučení k opravě:** Při přechodu na další fázi je nutné odstranit duplicitní klíč `'kaz': 'kz'` na řádku 198.
