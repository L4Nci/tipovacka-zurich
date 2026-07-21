# Cutover Readiness Audit (Analýza připravenosti na přepnutí)

> Historical cutover document. This describes migration readiness during the
> legacy-to-Supabase transition and is not current operational guidance. Current
> safety rules are in [AGENTS.md](AGENTS.md) and [PROJECT_RULES.md](PROJECT_RULES.md).

Tento dokument slouží jako audit a strategická analýza připravenosti na přechod z legacy datového modelu na nový modulární multi-lobby systém (**datový model v2**). 

---

## 1. Přehled legacy tabulek a jejich náhrad

| Legacy tabulka | Nový ekvivalent v2 | Stav vytvoření v2 | Stav migrace dat | Připravenost na Cutover |
| :--- | :--- | :---: | :---: | :---: |
| **`players`** | `profiles` / `users` | ❌ Nevytvořeno | ❌ Nemigrováno | **Ne** (chybí tabulka profiles i refaktor registrace) |
| **`teams`** | `participants` |  Vytvořeno |  Migrováno | **Ano** (data jsou plně synchronizována) |
| **`matches`** | `matches_v2` |  Vytvořeno |  Migrováno | **Ano** (zápasy migrovány a spočten lock_time) |
| **`predictions`** | `predictions_v2` |  Vytvořeno |  Migrováno | **Ano** (tipy namapovány na global-hockey-lobby) |

---

## 2. Detailní analýza závislostí legacy systému

Před odpojením legacy tabulek musíme bezpečně přepojit nebo upravit následující části aplikace.

### A. Tabulka `players` (Legacy uživatelé a auth)
* **API Endpoints:**
  * `POST /api/auth/register` – Přímo zapisuje `id`, `username`, `password_hash` do `players`. Ověřuje roli admina.
  * `POST /api/auth/login` – Čte a ověřuje heslo vůči tabulce `players`.
  * `GET /api/matches` – Používá `player_id` (userId z parametrů) pro načtení tipů.
  * `GET /api/matches/:id/predictions` – Spojuje tabulky `predictions` a `players` na zobrazení uživatelských jmen a vlajek v detailu zápasu.
  * `GET /api/leaderboard` – Načítá uživatele a počítá celkový počet bodů spojením s tabulkou `predictions`.
  * `POST /api/profile/tournament-winner` – Upravuje sloupec `tournament_winner_id` v tabulce `players`.
  * `POST /api/admin/match-result` – Čte kontrolu role `admin` z tabulky `players`.
* **Funkce & DB Logika:**
  * Seeding administrátorů (`u-viktor`, `u-hana`) se provádí na startu serveru přímo do tabulky `players`.
  * Do tabulky `lobby_members` se provádí synchronizace uživatelů načtením z `players`.
* **UI / Klientská rozhraní:**
  * Přihlašovací a registrační obrazovka pracuje přímo s daty odeslanými z endpointů spojených s `players`.
  * Typ `Player` v `src/types.ts` přímo reflektuje strukturu `players`.

### B. Tabulka `teams` (Hokejové týmy)
* **API Endpoints:**
  * `GET /api/teams` – Vrací kompletní seznam národních týmů z tabulky `teams`.
  * `GET /api/matches` – Provádí `JOIN teams h` a `JOIN teams a` pro zobrazení názvů a vlajek zemí v dashboardu.
  * `GET /api/matches/:id/predictions` – Připojuje vlaječku vybraného celkového vítěze uživatele spojením tabulek `players` a `teams`.
  * `GET /api/leaderboard` – Připojuje vybraného celkového vítěze a uděluje +10 bodů, pokud má tým `is_final_winner = 1`.
  * `POST /api/admin/set-tournament-winner` – Nastavuje `is_final_winner = 1` pro zvolený tým v tabulce `teams`.
* **Funkce & DB Logika:**
  * Seeding hokejových týmů se provádí do tabulky `teams`.
  * Synchronizace do `participants` čte původní data z `teams`.
* **UI / Klientská rozhraní:**
  * Dashboard vyžaduje vlajku a název pro zobrazení každého zápasu.
  * Výběr celkového vítěze v profilu uživatele spoléhá na seznam týmů z API.
  * Typ `Team` v `src/types.ts`.

### C. Tabulka `matches` (Legacy zápasy)
* **API Endpoints:**
  * `GET /api/matches` – Dotazuje se na zápasy, spojuje týmy a počítá celkové předpovědi.
  * `POST /api/predictions` – Kontroluje `start_time_utc` z `matches`, zda zápas již nezačal (lock time).
  * `POST /api/admin/match-result` – Updatuje výsledky (score) a mění stav zápasu na `'finished'`.
  * `POST /api/profile/tournament-winner` – Kontroluje čas zahájení prvního zápasu v celém turnaji pro uzamčení výběru celkového vítěze.
* **Funkce & DB Logika:**
  * Seeding zápasů generuje 57 zápasů do tabulky `matches`.
  * Migrace do `matches_v2` čte původní data z `matches`.
* **UI / Klientská rozhraní:**
  * Hlavní komponenta zápasů (Dashboard) je plně závislá na dates, scores a statuses z `matches`.
  * Formuláře pro tipování zaheslovaných zápasů.
  * Typ `Match` v `src/types.ts`.

### D. Tabulka `predictions` (Legacy tipy)
* **API Endpoints:**
  * `GET /api/matches` – Připojuje předpovědi aktuálně přihlášeného hráče.
  * `GET /api/matches/:id/predictions` – Získává všechny tipy ostatních hráčů k danému zápasu.
  * `POST /api/predictions` – Vkládá nebo nahrazuje předpověď v tabulce `predictions`.
  * `GET /api/leaderboard` – Sčítá body a počítá přesné zásahy z tabulky `predictions`.
  * `POST /api/admin/match-result` – Prochází všechny tipy pro zadaný zápas, porovnává je s reálným výsledkem a aktualizuje `points_earned` přímo v `predictions`.
* **UI / Klientská rozhraní:**
  * Tipovací políčka na zápasy a zobrazení získaných bodů u odehraných utkání.
  * Typ `Prediction` v `src/types.ts`.

---

## 3. Tabulka připravenosti (Readiness Dashboard)

| Přechodová osa | Pokrok | Blokující faktory / Co zbývá dořešit |
| :--- | :---: | :--- |
| **`players` ➔ `profiles`** | **10 %** | Neexistuje tabulka `profiles`. Je nutné navrhnout, jak elegantně oddělit autentizační data od uživatelského profilu (či zda se integruje Supabase Auth, který tabulku profiles vyžaduje odděleně od auth tabulek). |
| **`teams` ➔ `participants`** | **95 %** | Tabulka vytvořena. Data zkopírována. Zbývá pouze upravit backend sql dotazy, aby četly z `participants` místo `teams`. |
| **`matches` ➔ `matches_v2`** | **90 %** | Tabulka vytvořena. Všechny zápasy migrovány a byl automaticky dopočítán uzamykací čas (`lock_time_utc = start_time_utc - 5m`). Zbývá přepojit API na čtení z `matches_v2` a předávat `tournament_id` v parametrech dotazu. |
| **`predictions` ➔ `predictions_v2`** | **85 %** | Tabulka vytvořena a existující data jsou bezpečně spojena s výchozí hokejovou lobby `global-hockey-lobby`. Zbývá upravit API tak, aby pracovalo s dynamickým `lobby_id` z klientské aplikace. |

---

## 4. Doporučené, nejbezpečnější pořadí Cutoveru

Pro eliminaci výpadků a snadný debugging doporučujeme postupovat striktně v těchto krocích:

```
  [ Krok 1: Týmy ]     ──>    [ Krok 2: Uživatelé ]    ──>    [ Krok 3: Lobbies API ]
(teams ➔ participants)        (players ➔ profiles)           (Správa členství v lobby)
                                                                       │
                                                                       ▼
  [ Krok 6: Clean up ]  <──  [ Krok 5: Leaderboard ]  <──  [ Krok 4: Zápasy & Tipy ]
 (Smazání legacy tabulek)      (Lobby-specific žebříčky)     (matches/predictions v2)
```

### Podrobné zdůvodnění kroků:

1. **Krok 1: Převod týmů (`teams` ➔ `participants`):**
   * *Proč jako první:* Nejjednodušší krok, který nemá vliv na stav uživatelů, tipy ani stav zápasů. Pouze se nahradí dotazy na tabulku `teams` dotazy nad `participants WHERE type = 'team'`. Snižuje se tím riziko komplikací při složitějších operacích.
2. **Krok 2: Převod uživatelů a registrace (`players` ➔ `profiles`):**
   * *Proč nyní:* Stabilní identita uživatele je klíčová. Musíme mít tabulku `profiles` plně funkční a provázanou s registrací a přihlašováním, než začneme implementovat složitou logiku pro individuální lobby (`lobby_members`).
3. **Krok 3: Zprovoznění Lobbies API (`tournaments` & `lobbies` & `lobby_members`):**
   * *Proč nyní:* Jakmile máme profiles a participants, zprovozníme možnost uživatelů zakládat, vyhledávat a připojovat se do různých lobbies. Aplikace sice zatím tipuje na pozadí do legacy tabulky, ale uživatelé již mohou spravovat svá členství v nové datové vrstvě.
4. **Krok 4: Cutover zápasů a tipů (`matches_v2` & `predictions_v2`):**
   * *Proč nyní:* Toto je "jádro" přechodu. Nejprve se přepíše API pro zápasy, které začne brát hodnoty z `matches_v2` pro daný `tournament_id` a `predictions_v2` pro aktuálně zvolenou `lobby_id`. Zároveň se přepíše vyhodnocovací a ukládací logika tipů administrátorem, aby zapisovala a bodovala v `predictions_v2`.
5. **Krok 5: Přepnutí žebříčků a statistik (Leaderboard v2):**
   * *Proč na konci:* Žebříčky a dashboardy jsou závislé na bodech spočtených v kroku 4. Zde implementujeme přepínání žebříčku podle otevřené lobby (každá lobby má svůj vlastní žebříček bodů nasbíraných v rámci svých členů).
6. **Krok 6: Odstranění legacy tabulek (Clean up):**
   * *Proč až nakonec:* Všechny legacy tabulky zůstávají po celou dobu migrace jako fallback. Teprve po potvrzení stoprocentní stability v produkčním prostředí a po úspěšné migraci všech historických dat je bezpečně smažeme.

---

## 5. Vyhodnocení strategie migrace na Supabase (Turso vs. Supabase)

Zvažovali jsme dvě varianty:
* **Varianta A:** Dokončit kompletní Universal Lobby Manager a Cutover na lokální / Turso (SQLite/libsql) databázi a teprve poté migrovat technologii na Supabase (PostgreSQL).
* **Varianta B:** Migrovat na Supabase ještě před provedením cutoveru (provádět cutover přímo v Supabase Postgres prostředí).

### Jednoznačné doporučení: **Varianta A** (Dokončit cutover na Turso, poté migrovat na Supabase)

#### Proč je Varianta A výrazně bezpečnější:

1. **Izolace architektonického a infrastrukturního rizika:**
   * Pokud provádíte zásadní refaktoring kódu (přechod z 1-lobby na multi-lobby, změna dotazů a relačních struktur) a zároveň měníte databázový engine, slučujete dvě velmi odlišná rizika do jednoho bodu selhání. 
   * Pokud se objeví chyba v přepočtu bodů, bude nesmírně těžké diagnostikovat, zda jde o logickou chybu v novém v2 kódu, nebo o nepatrný rozdíl v chování SQL dialektu (PostgreSQL vs. SQLite).

2. **Rozdílné SQL dialekty a chování:**
   * SQLite používá dynamické typování a benevolentní kontroly constraintů. PostgreSQL je striktní (např. práce s typy jako `BOOLEAN` vs `INTEGER`, striktní validace `FOREIGN KEY`, upřednostňování `ON CONFLICT DO NOTHING` místo `INSERT OR IGNORE`).
   * Zápis a stabilizace SQL v2 kódu na stávajícím Turso/libsql minimalizuje neznámé parametry. Ladíme pouze logiku. Až bude logika stoprocentní, migrace na PostgreSQL bude znamenat pouze "překlad" již stabilních a otestovaných v2 SQL dotazů.

3. **Mnohem jednodušší migrační balíčky:**
   * Při variantě A migrujeme na Supabase pouze čistá, nová, konsolidovaná v2 data.
   * Při variantě B bychom museli na Supabase přenést jak legacy tabulky `teams`/`matches`/`predictions`, tak rozpracované tabulky `participants`/`matches_v2`/`predictions_v2`, spouštět dočasné přechodové skripty v PostgreSQL a udržovat "shadow" schémata na dvou různých databázových technologiích paralelně.

### Shrnutí rizik implementace:
* **SQLite timestamp formáty:** Při migraci na Postgres (Supabase) bude nutné ohlídat, aby textové reprezentace ISO UTF časových razítek v SQLite korektně prošly do Postgres `TIMESTAMPTZ` sloupců.
* **Chybějící tabulka `profiles`:** To je aktuálně největší slepá skvrna modelu. Musíme co nejdříve zadefinovat strukturu tabulky `profiles`, aby bylo jasné, jak se propojí s auth systémem platformy.
