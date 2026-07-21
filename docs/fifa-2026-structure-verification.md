# FIFA World Cup 2026 Tournament Structure Verification

> Historical verification document. It remains useful context for the original
> FIFA World Cup 2026 setup, but current behavior and data shape must be
> verified against Supabase migrations, seed files, and current code.

Tento dokument přináší kompletní validaci a strukturální audit datového modelu pro **FIFA World Cup 2026** (MS ve fotbale 2026) v rámci herního ekosystému Tipovačka 2.0.

Pravidla turnaje jsou porovnávána se současnou fyzickou architekturou uloženou v Supabase (`001_initial_schema.sql`, `001_seed_base_data.sql`, `002_seed_world_cup_2026_participants.sql` a aplikační logikou v `db.ts` / `App.tsx`).

---

## 1. Analýza a Validace Turnaje (Tournament Setup)

### 📊 Stav: PASS

* **Počet týmů**: **48 týmů** (V pořádku). MS 2026 je historicky prvním turnajem s tímto počtem účastníků.
* **Počet skupin**: **12 skupin** (Pojmenovaných **Skupina A až L**).
* **Názvy skupin**: Skupiny A, B, C, D, E, F, G, H, I, J, K, L.
* **Počet postupujících**: **32 týmů**.
  * **Klíč postupu**: Do play-off (šestnáctifinále / Round of 32) postupují:
    * 2 nejlepší týmy z každé z 12 skupin ($12 \times 2 = 24$ týmů).
    * 8 nejlepších týmů ze 3. míst ze všech 12 skupin ($8$ týmů).
    * Celkem: $24 + 8 = 32$ týmů.
* **Hodnocení databáze**: Identifikátor turnaje `fifa-world-cup-2026` je správně navázán na sport `football`. Splňuje všechny strukturální náležitosti.

---

## 2. Zápasový Rozpis (Matches Count Verification)

### 📊 Stav: PASS

Počet zápasů plně odpovídá novému hernímu schématu FIFA World Cup 2026:

1. **Skupinová fáze (Group Stage)**:
   * 12 skupin po 4 týmech.
   * V každé skupině se odehraje 6 zápasů.
   * Celkem: $12 \times 6 =$ **72 zápasů**.
2. **Vyřazovací fáze (Play-off)**:
   * **Šestnáctifinále (Round of 32)**: 16 zápasů.
   * **Osmifinále (Round of 16)**: 8 zápasů.
   * **Čtvrtfinále (Quarterfinals)**: 4 zápasy.
   * **Semifinále (Semifinals)**: 2 zápasy.
   * **Zápas o 3. místo (Play-off for 3rd place)**: 1 zápas.
   * **Finále (Final)**: 1 zápas.
   * Celkem v play-off: $16 + 8 + 4 + 2 + 1 + 1 =$ **32 zápasů**.

* **Konečná bilance turnaje**: $72 + 32 =$ **104 zápasů**.
* **Závěr**: Naše importní procesy a CSV šablony jsou dokonale sladěny se 104 zápasovými pozicemi. Zápasová kvantita plně vyhovuje standardům FIFA.

---

## 3. Dlouhodobé Tipy (Longterm Predictions)

### 📊 Stav: WARNING

* **Zjištěný problém**: V aktuálním fyzickém schématu (`001_initial_schema.sql`) má tabulka `public.profiles` pouze jediný sloupec `tournament_winner_id` pro uložení celkového vítěze šampionátu za jednoho uživatele. Ostatní navrhované dlouhodobé tipy (jako vítězové skupin A–L, semifinalisté či nejlepší střelec) **nemají** ve stávající podobě databáze kam ukládat svá data, protože tabulka `longterm_predictions` nebyla v první verzi databáze zavedena.
* **Analýza dopadu**: Bez dodatečné SQL aktualizace nemůže platforma přijímat dlouhodobé sázky kromě celkového šampiona. To brání plnohodnotnému zážitku z MS 2026, kde jsou vítězové skupin a semifinalisté tradičně klíčovým prvkem herní zábavy.

### 💡 Doporučený Návrh Řešení ( SQL Schema Extension):
Pro plnohodnotné zprovoznění dlouhodobých tipů na MS 2026 doporučujeme provést migraci, která vytvoří unifikovanou tabulku pro turnajové sázky:

```sql
CREATE TABLE public.longterm_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lobby_id TEXT NOT NULL REFERENCES public.lobbies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    prediction_type TEXT NOT NULL CHECK (prediction_type IN (
        'tournament_winner', 
        'group_winner_A', 'group_winner_B', 'group_winner_C', 'group_winner_D',
        'group_winner_E', 'group_winner_F', 'group_winner_G', 'group_winner_H',
        'group_winner_I', 'group_winner_J', 'group_winner_K', 'group_winner_L',
        'semifinalist_1', 'semifinalist_2', 'semifinalist_3', 'semifinalist_4'
    )),
    predicted_participant_id TEXT NOT NULL REFERENCES public.participants(id) ON DELETE RESTRICT,
    points_earned INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_lobby_prediction UNIQUE (lobby_id, user_id, prediction_type)
);
```

### Navrhovaná Finální Sada Celkových Sázek (4 body za každý správný zásah):
1. **Absolutní vítěz turnaje (`tournament_winner`)** [1 sázka]
2. **Vítězové jednotlivých skupin A-L (`group_winner_A` až `group_winner_L`)** [12 sázek]
3. **Čtyři semifinalisté (`semifinalist_1` až `semifinalist_4`)** [4 sázky – vyhodnocení je nezávislé na určeném pořadí / indexu]

---

## 4. Účastníci & Zástupné Týmy (Participants & Wildcards)

### 📊 Stav: WARNING

* **Zjištěná fakta**:
  * Databáze obsahuje **48 reálných týmů** s ID `football-<fifa_code_lowercase>`.
  * Databáze obsahuje obecný placeholder **`football-tba`**.
  * Databáze obsahuje 48 speciálních číslovaných placeholderů **`football-tba-01` až `football-tba-48`**.

### ⚠️ Rizika a Dopad na Uživatelské Prostředí (UX):
1. **Zmatení uživatele v Profilech**: Pokud se v uživatelském rozhraní (volba celkového vítěze turnaje v sekci profilu) načtou všichni účastníci z tabulky `participants`, uživatel uvidí v nabídce 48 položek "TBA" s ikonou fotbalového míče `⚽`. Hrozí riziko, že uživatelé omylem vsadí na některý z placeholderů jako na celkového šampiona.
2. **Zbytečná redundantnost**: Pro účely zobrazení budoucích playoff zápasů v kalendáři (např. "Vítěz Skupiny A vs Druhý ze Skupiny B") plně postačuje jediný univerzální placeholder `football-tba` s popiskem "TBA". Zavedení dalších 48 separátních očíslovaných TBA řádků zvyšuje datový šum v tabulkách a ztěžuje klientské filtrování.

### 💡 Doporučené Zjednodušení:
1. **Filtrování v UI clientovi**: V herním rozhraní (především v seletech pro tipování dlouhodobých sázek) v souborech `App.tsx` nebo fetcherů odfiltrovat jakékoliv záznamy účastníků, jejichž ID začíná na `football-tba`. Uživatelé tak uvidí výhradně reálné země.
2. **Konsolidace zápasového schema**: Pro import zápasů, u nichž dosud neznáme konkrétní složení soupeřů (play-off fáze před začátkem turnaje), doporučujeme jako defaultní hodnotu `home_participant_id` i `away_participant_id` ukládat klasický obecný placeholder `football-tba`. Tím odpadne složitá správa 48 očíslovaných placeholderů.

---

## 5. Administrátorské Rozhraní a Workflow (Admin Workflow)

### 📊 Stav: PASS (S koncepčními doporučeními)

Je nezbytné jasně popsat, jak bude administrátor platformy spravovat reálná data MS 2026.

### 5.1 Zadávání Výsledků Zápasů
1. Admin se přihlásí s rolí `'admin'` (v tabulce `public.profiles`).
2. V administrativním panelu (nebo přímo přes zabezpečené rozhraní Supabase Studia) vyhledá odehraný zápas.
3. Nastaví `status` zápasu na `'finished'`.
4. Zapíše hodnoty pro `home_score` a `away_score`.
5. **Automatické vyhodnocení**:
   * Uložení výsledku spustí systémový přepočet (buď na pozadí pomocí DB triggerů, nebo prostřednictvím volání vyhodnocovacího API API endpointu).
   * Engine pro každý tip (`prediction`) porovná zapsaný výsledek s uživatelským tipem na základě scoring pravidel pro daný sport a zapíše získané body do sloupce `points_earned`. Leaderboard v lobby se okamžitě přepočítá.

### 5.2 Zadávání Semifinalistů a Vítězů Skupin (Longterm Evaluation)
Vyhodnocování dlouhodobých sázek proběhne na konci skupinových fází a celého turnaje podle následujícího scénáře:
1. V databázi (např. tabulce `tournaments` nebo nově zavedené tabulce turnajových výsledků) se definují oficiální vítězové:
   * `final_winner_id` (vítěz turnaje)
   * `group_winners` (seznam vítězů skupin A až L)
   * `semifinalists` (pole 4 kvalifikovaných semifinalistů)
2. Admin klepnutím v administraci (nebo spuštěním jednorázového SQL dotazu) zahájí vyhodnocení.
3. **Idempotentní vyhodnocení**:
   * Skript vybere všechny zapsané dlouhodobé tipy a porovná je.
   * U shody v poli semifinalistů (kde nezáleží na pořadí, v jakém je uživatelé zadali) se udělí **4 body**.
   * U přesné shody vítěze skupiny nebo celkového šampiona se udělí **4 body**.
   * Body se přičtou do celkového skóre uživatele v leaderboardu daného lobby.
   * Tipy se uzamknou nastavením `is_locked = TRUE` v tabulce, aby se zabránilo pokusům o neoprávněné změny po vyhodnocení.
