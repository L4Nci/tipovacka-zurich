# Real-World Longterm Predictions Reality Check – FIFA World Cup 2026

Tento dokument představuje hloubkový audit a reality check připravenosti platformy na dlouhodobé sázky (longterm predictions) pro MS ve fotbale 2026 (FÁZE F7).

---

## Rychlý Přehled Hodnocení Splnění

| Oblast / Bod k ověření | Stav | Výsledek auditu a konkrétní zjištění |
| :--- | :---: | :--- |
| **1. Fyzická existence tabulky `longterm_predictions`** | **FAIL** | Tabulka `longterm_predictions` v databázi fyzicky **neexistuje** (není definována v `001_initial_schema.sql` ani v jiných migracích). |
| **2. Podpora typů: winner, group_winner, semifinalist** | **FAIL** | Schéma nepodporuje tyto typy. Jediným prvkem je historický sloupec `tournament_winner_id` v tabulce `public.profiles`. |
| **3. API nebo DB funkce pro ukládání dlouhodobých tipů** | **FAIL** | Pro obecné dlouhodobé tipy neexistuje žádné API. Pro celkového vítěze je k dispozici `pickTournamentWinner`, který však ukládá tip napřímo do profilu uživatele (nikoliv na úroveň konkrétního turnaje či lobby). |
| **4. Uživatelské rozhraní (UI) pro zadání tipů** | **WARNING**| UI existuje **pouze** pro volbu jednoho celkového vítěze (sekce Profil v `App.tsx`). Pro vítěze skupin (A–L) a semifinalisty (1–4) neexistuje žádné klientské rozhraní. |
| **5. Vyhodnocovací engine (Scoring Engine)** | **FAIL** | V kódu `App.tsx` je hardcodované přičtení 10 bodů, pokud se tip shasuje s `teams.is_final_winner === 1`. Nicméně `is_final_winner` není sloupcem v DB a nikde se nenačítá z reálných dat. Pro skupiny a semifinalisty scoring zcela chybí. |
| **6. Admin rozhraní pro zadání skutečných výsledků** | **FAIL** | V Admin sekci existuje volič týmu, který volá `setTournamentWinner`. Nicméně tato funkce v `db.ts` je **no-op** (provede pouze kontrolu role admina, ale neobsahuje žádný SQL dotaz pro uložení šampiona). Pro ostatní sázky admin UI chybí. |
| **7. Možnost odehrání kompletního scénáře dnes** | **FAIL** | Scénář nelze odehrát: uživatel sice může vybrat šampiona, ale administrátorské uložení výsledku je nefunkční a uživateli se body nikdy nepřičtou. |

---

## Detailní Analýza Auditovaných Oblasti

### 1. Fyzická existence tabulky `longterm_predictions`
*   **Stav**: **FAIL**
*   **Analýza**: V aktuálním PostgreSQL schématu existuje tabulka `public.predictions` (pouze pro zápasy). Tabulka pro dlouhodobé/celkové tipy v databázi chybí.

### 2. Podpora detailních sázek (Group Winners A–L, Semifinalist 1–4)
*   **Stav**: **FAIL**
*   **Analýza**: Současný model v `public.profiles` obsahuje pouze `tournament_winner_id TEXT`. To vylučuje možnost tipovat:
    *   Vítěze jednotlivých skupin (Group Stage winners A-L)
    *   Kvarteto semifinalistů (Semifinalists 1-4)
    *   Nejlepšího střelce turnaje a další obvyklé sázky.

### 3. API & DB integrace pro zápis dlouhodobých tipů
*   **Stav**: **FAIL**
*   **Analýza**: Metoda `pickTournamentWinner(userId, participantId)` provádí jednoduchý `UPDATE public.profiles SET tournament_winner_id = ...`. 
    *   *Kritický architektonický nedostatek*: Tento přístup váže tip na profil uživatele napříč všemi herními skupinami (lobbies). Pokud uživatel hraje ve dvou různých lobbies, nemůže v jednom tipovat jako vítěze Brazílii a ve druhém Francii – jeho volba se přepíše globálně. Správně by měl být tip uložen jako relace k `lobby_id`.

### 4. UI pro dlouhodobé tipy
*   **Stav**: **WARNING**
*   **Analýza**: Klientská aplikace v `App.tsx` zobrazuje v profilu mřížku týmů, kde si hráč může kliknutím zvolit svého šampiona (dokud neuplyne zámek 5 minut před zahájením prvního zápasu šampionátu). Neexistuje však jakékoliv jiné komplexní tipovací rozhraní pro tabulky skupin či semifinalisty.

### 5. Funkčnost vyhodnocovacího enginu (Scoring Engine)
*   **Stav**: **FAIL**
*   **Analýza**: Kód pro výpočet tabulky v `App.tsx` (řádky 961–963):
    ```typescript
    if (p.tournament_winner_id && teams.find(tm => tm.id === p.tournament_winner_id && tm.is_final_winner === 1)) {
      total += 10;
    }
    ```
    Tento kód vykazuje fatální chyby:
    1.  Atribut `is_final_winner` se nikde v databázi neukládá.
    2.  Atribut se mapuje v `db.ts` z datového zdroje `p.is_final_winner`, který je pro všechny účastníky `undefined`, protože v tabulce `public.participants` takový sloupec neexistuje.
    3.  Pro skupinové sázky a semifinalisty není logicky naprogramována vůbec žádná scoringová logika.

### 6. Administrátorské rozhraní
*   **Stav**: **FAIL**
*   **Analýza**: Funkce `setTournamentWinner` v souboru `src/lib/db.ts` je pouze prázdná šablona (no-op):
    ```typescript
    export const setTournamentWinner = async (adminUserId: string, participantId: string) => {
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", adminUserId)
        .single();
    
      if (pErr || profile?.role !== "admin") {
        throw new Error("Access Denied");
      }
      
      // We can update is_final_winner column in postgres database or set some winner metadata.
      // In our DB schema, participants has logo_url, short_name, etc. but no direct winner boolean.
      // We can write it into a system configuration, or just handle locally as tournament winner.
      // For now, let's keep it in profiles update.
    };
    ```
    Funkce pouze ověří roli, ale **nevykoná žádný SQL zápis**. Skutečného vítěze turnaje tedy nelze z UI adminem nastavit.

### 7. Scénář: Uživatel tipne -> Admin zadá šampiona -> Uživatel získá body
*   **Stav**: **FAIL**
*   **Analýza**: Uživatel sice může v UI zvolit svůj tým, což provede zápis do `profiles.tournament_winner_id`. Ale protože admin nemůže persistovat skutečného šampiona, hodnota `is_final_winner` zůstane u všech týmů prázdná a uživateli se k celkovému skóre nikdy nepřičte slíbených 10 bodů.

---

## Doporučení pro Budoucí Implementaci (Next Steps Roadmap)

Pro úspěšné nasazení dlouhodobých sázek do produkce doporučujeme realizovat následující kroky:

1.  **Vytvořit unifikovanou tabulku sázek (`public.longterm_predictions`)**:
    *   Tipy musí obsahovat `lobby_id` a `user_id` pro plnou granularitu mezi komunitami.
    *   Nadefinovat povolené sázky přes `prediction_type` (`tournament_winner`, `group_winner_A` až `L`, `semifinalist_1` až `4`).
2.  **Vytvořit tabulku pro výsledné hodnoty (`public.longterm_results`)**:
    *   Tabulka, kam administrátor zapíše skutečné výsledky pro jednotlivé sázky (např. `tournament_winner` = `'football-bra'`).
3.  **Implementovat plnohodnotné vyhodnocení**:
    *   Doplnit db logiku nebo server-side skript, který vezme tabulku `longterm_predictions`, porovná ji s `longterm_results` a zapíše body.
4.  **Doplnit chybějící klientské a administrátorské UI v aplikaci**:
    *   Zobrazit uživatelům přehledné selekty pro vítěze skupin A-L s filtrováním TBA zástupců.
    *   Poskytnout adminovi rozhraní pro zadání těchto finálních dat.
