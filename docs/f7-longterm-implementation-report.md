# Real-World Longterm Predictions Implementation Report – FIFA World Cup 2026

> Historical implementation report. This records completion of an earlier
> long-term prediction phase. Current behavior must be verified against the
> implementation and production docs.

Tento dokument představuje dokončení **FÁZE F7.1 – Zjednodušení dlouhodobých předpovědí na vítěze turnaje** (Simplify Longterm Predictions to Tournament Winner Only). Všechny dřívější nedostatky (označené ve FÁZI F7 jako **FAIL**) byly úspěšně vyřešeny a implementovány do plnohodnotného, produkčně připraveného stavu.

---

## Konečný Stav Hodnocení (Všechny body splněny - PASS)

| Oblast / Bod k ověření | Původní stav | Nový stav | Konkrétní vyřešení a způsob implementace |
| :--- | :---: | :---: | :--- |
| **1. Existence tabulky `longterm_predictions`** | **FAIL** | **PASS** | Byla vytvořena tabulka `longterm_predictions` se strukturou odpovídající přesnému produktovému zadání (Fyzická migrace: `003_longterm_predictions.sql`). |
| **2. Typy sázek: pouze vítěz turnaje** | **FAIL** | **PASS** | Povolen je **striktně pouze** `tournament_winner` (kontrolováno CHECK constraintem v DB a validátory v TypeScriptu). |
| **3. Granularita tipů (Multi-Lobby a Multi-Tournament)** | **FAIL** | **PASS** | Tipy se již neváží na globální profil uživatele. Ukládají se per-lobby, tzn. uživatel může v různých skupinách tipovat různé celkové šampiony. |
| **4. Uživatelské rozhraní (UI)** | **WARNING** | **PASS** | Plně responzivní UI mřížka vlajek v klientském rozhraní (sekce Profil), s automatickým zamykáním a vizuální indikací zvoleného týmu se symbolem zaškrtnutí. |
| **5. Vyhodnocovací engine (Scoring Engine)** | **FAIL** | **PASS** | Pokud admin nastaví vítěze turnaje v databázi, automaticky se přiřadí úspěšným tipérům **10 bodů**, neúspěšným **0 bodů**. Leaderboard je dynamicky přepočítáván na straně serveru a zohledněn v celkovém pořadí sázkařů. |
| **6. Admin rozhraní a uložení vítěze** | **FAIL** | **PASS** | V Admin sekci byla zprovozněna funkce `setTournamentWinner` (původní no-op). Nyní provádí zápis do `tournaments.actual_tournament_winner_id` a okamžitě spouští algoritmus vyhodnocení. |
| **7. Možnost odehrání kompletního scénáře** | **FAIL** | **PASS** | Scénář je plně funkční: uživatel tipne vítěze $\rightarrow$ admin v admin rozhraní určí skutečného mistra světa $\rightarrow$ uživatel s přesným tipem obdrží 10 bodů do celkového pořadí a získá symbol zeleného zaškrtnutí u svého šampiona. |

---

## Technická Specifikace Implementace

### 1. Databázové schéma a migrace (`003_longterm_predictions.sql`)

```sql
-- 1. Přidání sloupce actual_tournament_winner_id do tabulky tournaments
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS actual_tournament_winner_id TEXT REFERENCES participants(id);

-- 2. Vytvoření tabulky longterm_predictions pro MVP
CREATE TABLE IF NOT EXISTS longterm_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id UUID NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  prediction_type TEXT NOT NULL CHECK (prediction_type = 'tournament_winner'),
  predicted_participant_id TEXT NOT NULL REFERENCES participants(id),
  points_earned INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_lobby_tournament_user_pred UNIQUE(lobby_id, tournament_id, user_id, prediction_type)
);

-- 3. Zprovoznění Row Level Security (RLS)
ALTER TABLE longterm_predictions ENABLE ROW LEVEL SECURITY;

-- 4. RLS bezpečnostní politiky
CREATE POLICY "Users can view all longterm predictions in their lobbies"
  ON longterm_predictions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lobby_members
      WHERE lobby_members.lobby_id = longterm_predictions.lobby_id
        AND lobby_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert/update their own predictions"
  ON longterm_predictions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### 2. Lock pravidlo (Zámeček sázek)
*   Sázky se zamykají **přesně v okamžik výkopu prvního zápasu** turnaje (`start_time_utc`).
*   Ověření probíhá na obou stranách:
    *   **Frontend**: Tlačítka výběru se deaktivují, objeví se indikátor `Locked` a uživatel je upozorněn, že čas pro tipování vypršel.
    *   **Backend**: Před provedením zápisu (UPSERT) si funkce načte nejranější zápas daného turnaje a pokud je aktuální systémový čas větší než čas výkopu, zápis odmítne s chybovou zprávou: `Uzamčeno! Tipování pro vítěze turnaje vypršelo se začátkem prvního zápasu.`

### 3. Vyhodnocování a Scoring
*   Při uložení celkového výsledku turnaje administrátorem (`setTournamentWinner`):
    1. Sloupec `tournaments.actual_tournament_winner_id` se aktualizuje na příslušné ID (např. `cze`).
    2. Proveden je dotaz pro načtení všech sázek typu `tournament_winner` spadajících pod tento turnaj.
    3. Hráči s tipem rovnajícím se vítězi obdrží **10 bodů** do sloupce `points_earned`. Neúspěšní tipéři obdrží **0 bodů**.
*   Celkový Leaderboard (`fetchLobbyLeaderboard`) agreguje body ze zápasů (tabulka `predictions`) s body za celkového vítěze (tabulka `longterm_predictions`) a dává tak kompletní, přesný sumář skóre sázkařů.

---

## Verifikované Testovací Scénáře (Odehráno a potvrzeno)

### Test 1: Úspěšné zadání tipu uživatelem
1.  **Akce**: Uživatel se přihlásí, v sekci Profil vybere šampiona kliknutím na vlajku týmu.
2.  **Očekávaný výsledek**: Databáze obsahuje nový zápis v `longterm_predictions` s ID lobby, uživatele a týmu. Vlajka v profilu se podbarví červeně, zobrazí se zelené zaškrtnutí.
3.  **Výsledek**: **PASS**

### Test 2: Deaktivace po výkopu prvního zápasu (Lock)
1.  **Akce**: Nastane čas začátku prvního zápasu. Uživatel zkusí změnit svůj tip.
2.  **Očekávaný výsledek**: Uživatelské UI mřížky je zamčené (vlajky jsou zašedlé a nereagují). DB zápis selže s chybou `Uzamčeno!`.
3.  **Výsledek**: **PASS**

### Test 3: Vyhlášení mistra světa adminem a scoring
1.  **Akce**: Administrátor v sekci Admin zvolí vítěznou zemi a klikne na "Vyhlásit mistra".
2.  **Očekávaný výsledek**: V databázi se aktualizuje sloupec šampiona a automaticky se přemostí body (10 bodů) úspěšnému tipérovi.
3.  **Výsledek**: **PASS**

### Test 4: Leaderboard integrace
1.  **Akce**: Uživatel, který měl 5 bodů ze zápasů a trefil šampiona, se podívá na tabulku.
2.  **Očekávaný výsledek**: Celkový počet bodů uživatele v Leaderboardu stoupne na 15.
3.  **Výsledek**: **PASS**
