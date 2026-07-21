# Football Rules Audit: FIFA World Cup 2026 (Fáze QA-2)

> Historical audit. This captures an earlier rules review and may describe
> behavior that has since changed, especially group-stage draw and playoff
> no-draw handling. Current scoring behavior must be verified against
> `src/lib/scoring.ts`, `src/lib/matchRules.ts`, and current UI code.

Tento audit podrobně rozebírá chování stávajícího bodovacího systému (scoring engine) aplikace **Tipovačka 2.0** v kontextu fotbalových pravidel pro Mistrovství světa ve fotbale 2026 (FIFA World Cup 2026) a navrhuje optimální model tipování pro herní komunitu.

---

## 1. Analýza současného chování při remíze (Draw Behavior)

Stávající implementace kódu v souboru `src/lib/db.ts` (a souvisejících částech) obsahuje následující pravidla:

1.  **Klientská validace tipu**:
    ```typescript
    if (home === away) {
      throw new Error("Remíza není povolena. Vyberte vítěze zápasu!");
    }
    ```
    Tento kód vyvolá výjimku při jakémkoli pokusu uživatele uložit shodný počet gólů pro domácí i hosty (např. `1 - 1`, `2 - 2`). Uživatel je tak nucen zvolit buď výhru jednoho či druhého týmu.

2.  **Výpočet bodů (`calculatePoints`)**:
    ```typescript
    export const calculatePoints = (ph: number, pa: number, mh: number, ma: number): number => {
      if (ph === mh && pa === ma) return 5;
      if ((ph > pa && mh > ma) || (pa > ph && ma > mh)) return 2;
      return 0;
    };
    ```

### Dopad na fotbalové zápasy:
*   **V základních skupinách** fotbalových turnajů jsou remízy běžným a regulérním výsledkem zápasu (např. cca 20–25 % zápasů na MS končí remízou po 90 minutách).
*   Se současným omezením **uživatelé nemohou tipovat remízu**. Pokud zápas skončí např. `1 - 1` (remíza):
    *   **Přesný výsledek (5 bodů)**: Nikdo nemůže získat 5 bodů, protože nikdo nemohl zadat shodné skóre.
    *   **Správný vítěz (2 body)**: Výraz `(ph > pa && mh > ma) || (pa > ph && ma > mh)` vyhodnotí remízový zápas (`mh === ma`) jako nepravdivý pro oba případy. **Všichni soutěžící tedy získají 0 bodů**, bez ohledu na to, jak blízko jejich tip byl.
*   **Závěr**: Pro fotbalový turnaj (zejména skupinovou fázi) je zákaz zadávání shodného skóre (`home === away`) z herního hlediska **kritickým nedostatkem**, který zcela eliminuje taktické tipování remíz a znehodnocuje bodový systém v případě nerozhodných výsledků.

---

## 2. Analýza specifik fotbalu podle fází (Skupiny vs. Play-off)

Fotbalový turnaj jako FIFA World Cup má dvě odlišné herní struktury:

### A. Skupinová fáze (Group Stage)
*   **Pravidla hry**: Zápas trvá standardních 90 minut + nastavení. Může skončit výhrou domácích, hostů, nebo remízou.
*   **Co musí systém umět**: Povolit v klientské aplikaci zadání shodného skóre (např. `0-0`, `1-1`, `2-2`) a správně vyhodnotit bodový přínos u remízových zápasů (přesný výsledek = 5 bodů, shoda na remíze s jiným skóre = 2 body).

### B. Vyřazovací fáze (Play-off / Knockout)
*   **Pravidla hry**: Zápas musí mít vítěze, který postoupí do dalšího kola. Pokud je po 90 minutách stav nerozhodný:
    1.  Následuje prodloužení (Extra Time) $2 \times 15$ minut.
    2.  Pokud je stav stále nerozhodný, následuje penaltový rozstřel (Penalty Shootout).
*   **Vznikající nejednoznačnost**: Co se bere jako "oficiální výsledek zápasu" pro účely vyhodnocení tipů?
    *   *Scénář*: Zápas skončí po 90 minutách `1 - 1`. Po prodloužení je to stále `1 - 1`. Na penalty vyhraje tým A.
    *   Pokud tipujeme "výsledek po 90 minutách", oficiální výsledek pro scoring je `1 - 1` (remíza).
    *   Pokud tipujeme "výsledek včetně prodloužení", oficiální výsledek je `1 - 1`.
    *   Pokud vyžadujeme "konečné rozhodnutí", musíme do systému zapracovat mechanismus, jak definovat postupujícího, protože penaltový rozstřel se běžně nekalkuluje do skóre zápasu jako klasické góly (např. zápas neskončí výsledkem `6 - 5` na penalty, oficiálně se v análech uvádí remíza a postupující po rozstřelu).

---

## 3. Srovnání modelů tipování pro fotbalové turnaje

Níže uvádíme detailní srovnání čtyř hlavních přístupů k tipování fotbalových utkání z hlediska herní zábavnosti pro uživatele a náročnosti na implementaci.

| Kritérium / Model | A) Tipování přesného skóre | B) Tipování pouze vítěze (1/X/2) | C) Tipování skóre po 90 min | D) Tipování postupujícího |
| :--- | :---: | :---: | :---: | :---: |
| **Uživatelský zážitek (Fun factor)** | 🔥 **Extrémní** (Napětí do poslední sekundy, radost z přesné trefy) | 😐 **Průměrný** (Jednoduché, méně emocí, rychlé) | 😍 **Vysoký** (Zavedený standard pro klasické sportovní sázky) | 😎 **Vysoký** (Zejména v play-off, kde se řeší čistý postup) |
| **Plošná férovost** | Vysoká (Odměňuje hluboké znalosti i štěstí) | Nízká (Příliš mnoho lidí má stejné body) | Vysoká | Střední (Při jasných zápasech snadný tip) |
| **Zpracování v play-off** | Komplikované (Jak započítat penalty?) | Srozumitelné (Kdo nakonec zvedne pohár) | Jednoduché (Vždy se uzavírá v 90. min) | Velmi čisté (Binární volba postupu) |
| **Náročnost na UI / UX** | Střední (Dvě číselná pole) | Nízká (Tři klikací tlačítka) | Střední | Velmi nízká (Kliknutí na logo týmu) |

---

## 4. Návrh optimálního modelu pro Tipovačku 2.0

Pro docílení maximální férovosti a skvělého herního zážitku doporučujeme **Kombinovaný model** (Skóre po 90 minutách jako základ + doplňkový tip na postupujícího v play-off):

### Zdůvodnění:
1.  **Skupinová fáze**: Klasické tipování přesného skóre po 90 minutách (včetně remíz). To udržuje tradiční formát, na který jsou fanoušci zvyklí.
2.  **Vyřazovací fáze (Play-off)**: Uživatelé tipují přesné skóre po 90 minutách (kde může nastat remíza), ale zároveň mají možnost/povinnost uvést doplňkový tip **„Kdo postoupí“** (binární výběr týmu ze zápasu).
    - *Příklad*: Uživatel tipuje zápas Španělsko - Německo v osmifinále.
        - Tip na skóre po 90 min: `2 - 2` (Pokud to tak skončí, uživatel brzy získá bodový bonus za přesné skóre).
        - Tip na postup: `Německo` (Nezávisle na tom, zda Německo vyhraje v prodloužení nebo až na penalty). Podporuje to strategické uvažování a zabraňuje "mrtvým bodovým bodům" u nerozhodných play-off dramat.

---

## 5. Finální návrh pravidel bodování pro jednotlivé fáze (FIFA World Cup 2026)

Tento model představuje optimální sadu pravidel navrženou speciálně pro 104 zápasů rozšířeného Mistrovství světa 2026.

### ⚽ A. Základní skupiny (Group Stage)
*   **Formát tipu**: Výsledek po 90 minutách (včetně nastavení). **Remízy jsou povoleny**.
*   **Bodové ohodnocení**:
    *   **Přesné skóre** (např. tip `2-1`, výsledek `2-1`): **`5 bodů`**
    *   **Správný výsledek / Vítěz** (např. tip `3-1`, výsledek `2-1` OR tip `1-1`, výsledek `2-2`): **`2 body`**
    *   **Špatný tip** (jakýkoli jiný stav): **`0 bodů`**

### 🏆 B. Osmifinále & Čtvrtfinále (Round of 16 & Quarterfinals)
Zde se zvyšuje herní tlak a napětí, body za přesné skóre zůstávají stejné, ale přidává se pojistka pro postup.
*   **Formát tipu**: Výsledek po 90 minutách + Označení postupujícího týmu.
*   **Bodové ohodnocení**:
    *   **Přesné skóre** (v 90. minutě): **`5 bodů`**
    *   **Trefený vítěz** (v 90. minutě, např. tip `3-1` a skončí `1-0`): **`2 body`**
    *   **Trefený postupující** (bez ohledu na to, zda k tomu došlo v 90. min, prodloužení nebo penaltách): **`+1 doplňkový bod`**
    *   *Maximální bodový zisk z jednoho zápasu*: **6 bodů** (5b za přesné skóre + 1b za postupujícího).

### 🔥 C. Semifinále, Souboj o 3. místo & Finále (Semifinals & Finals)
Vyvrcholení šampionátu si žádá vyšší váhu bodů. Každá správná trefa má v této fázi cenu zlata a může rozhodnout celý leaderboard v lobby.
*   **Formát tipu**: Výsledek po 90 minutách + Označení postupujícího/vítěze poháru.
*   **Bodové ohodnocení**:
    *   **Přesné skóre** (v 90. minutě): **`8 bodů`** *(zvýšeno z 5)*
    *   **Trefený vítěz** (v 90. minutě): **`3 body`** *(zvýšeno ze 2)*
    *   **Trefený celkový vítěz / postupující**: **`+2 body`** *(zvýšeno z 1)*
    *   *Maximální bodový zisk z jednoho finálového zápasu*: **10 bodů** (8b za skóre + 2b za správného šampiona).

---

## 6. Doporučení pro vývojový tým k úpravě systému

Pro hladký přechod na tento fotbalový standard doporučujeme provést následující neinvazivní úpravy před spuštěním ostrého provozu:

1.  **Odstranit klientský zákaz shodného skóre** v `src/lib/db.ts` tím, že se smaže vyhazování výjimky při vyrovnaném stavu.
2.  **Rozšířit tabulku `predictions`** o sloupec `predicted_advancing_team_id` (UUID reference na participanty), který bude v play-off fázích ukládat volbu postupujícího.
3.  **Upravit `calculatePoints`** tak, aby uměl pracovat se sloupcem `predicted_advancing_team_id` a doplňoval 1, respektive 2 bonusové body na základě konečného příznaku postupu ze zápasů.
