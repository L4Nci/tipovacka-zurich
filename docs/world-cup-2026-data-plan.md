# FIFA World Cup 2026 – Real Data Import Plan

> Historical import plan. This describes the original FIFA World Cup 2026 data
> preparation and import plan. Current live fixture/result updates are handled
> by the current sync modules and operational docs.

Tento dokument slouží jako komplexní datový plán, architektura a před-importní checklist pro spuštění produkčního nasazení a plného importu 104 zápasů pro **FIFA World Cup 2026** (MS ve fotbale 2026) do Supabase.

---

## 1. Audit Účastníků (Participants Audit)

### 1.1 Aktuální stav (Initial Base State)
V herní základní databázi (soubor `001_seed_base_data.sql`) existovalo pro ID sportu `football` celkem **15 účastníků** (včetně speciálního zástupného symbolu `football-tba`).

Seznam původních IDs:
- `football-tba` (Zástupný divoký tým / To Be Announced)
- `football-usa` (United States)
- `football-mex` (Mexico)
- `football-can` (Canada)
- `football-arg` (Argentina)
- `football-bra` (Brazil)
- `football-fra` (France)
- `football-eng` (England)
- `football-ger` (Germany)
- `football-esp` (Spain)
- `football-por` (Portugal)
- `football-ita` (Italy)
- `football-mar` (Morocco)
- `football-sen` (Senegal)
- `football-jpn` (Japan)

### 1.2 Chybějící týmy pro kompletní šampionát MS 2026
MS ve fotbale 2026 je historicky prvním turnajem, kterého se účastní celkem **48 národních týmů**. Po odečtení 3 hostitelských zemí (USA, MEX, CAN) a 11 stávajících předem nasazených zemí chybělo v databázi přesně **34 národních týmů** k dosažení plného stavu kvalifikovaných zemí.

Tento nedostatek byl plně vyřešen v navazujícím seedu `002_seed_world_cup_2026_participants.sql`, který doplňuje 34 prominentních světových reprezentací zastupujících všechny hlavní konfederace (UEFA, CONMEBOL, CONCACAF, CAF, AFC, OFC).

---

## 2. Jmenná Konvence ID Účastníků (Participant ID Convention)

Pro fotbalové účastníky je striktně vyžadována standardizovaná, malým písmem psaná a snadno odvoditelná jmenná konvence vycházející z oficiálních FIFA zkratek:

$$\text{ID} = \text{football-} + \text{<fifa\_code\_lowercase>}$$

### Příklady konvence:
- **USA** &rarr; `football-usa`
- **Mexiko** &rarr; `football-mex`
- **Kanada** &rarr; `football-can`
- **Brazílie** &rarr; `football-bra`
- **Belgie** &rarr; `football-bel`
- **Chorvatsko** &rarr; `football-cro`
- **Nizozemsko** &rarr; `football-ned`

---

## 3. Seed Účastníků (Seed SQL Blueprint)

Doplňující účastníci a univerzální zástupné celky (placeholders) jsou definovány v souboru:
`/supabase/seed/002_seed_world_cup_2026_participants.sql`

Skript obsahuje kompletní insert blok s klauzulí `ON CONFLICT (id) DO UPDATE SET`, čímž garantuje **100% idempotentnost**. Pokud týmy v databázi již existují, dojde k bezpečnému přepisu nebo zachování stávajících záznamů bez narušení cizích klíčů či již zapsaných tipů.

### 3.1 Strategie Zástupných Celků (Placeholder Strategy)
Vzhledem k dynamické povaze závěrečných dohrávek kvalifikace (interkontinentální play-off) nebo neukončeného losování skupin je zavedeno celkem **48 standardních zástupných placeholderů**:
- **`football-tba-01`** až **`football-tba-48`**
- Každý placeholder má definovaný sport jako `football`, název `TBA`, zkratku `TBA`, typ `team` a ikonu fotbalového míče `⚽`.

#### Kdy použít skutečný tým vs. placeholder
1. **Skutečný Tým**: Použijte vždy, jakmile je složení zápasu / složení skupiny jasně a oficiálně potvrzeno (např. hostitelé jako USA, Kanada, Mexiko, nebo přímí kvalifikanti).
2. **Placeholder (TBA-XX)**: Použijte, pokud:
   - Oficiální los konkrétní skupiny ještě neproběhl a chcete mít vygenerované zápasy v kalendáři (např. "Pot 1 Team A" vs "Pot 2 Team B").
   - Zápas play-off závisí na předchozích kolech turnaje (např. zápas č. 80 závisí na vítězích skupin, kteří v té chvíli nejsou známi).

### 3.2 Účastníci Turnaje (Tournament Participants Junction Table)
Aby tabulka `public.participants` zůstala čistým, univerzálním adresářem národních týmů (nezávislým na konkrétních turnajích), byla zavedena spojovací tabulka `public.tournament_participants`. 

Tato tabulka umožňuje přiřadit tým k určitému šampionátu, specifikovat jeho základní skupinu a seed.

#### Schéma a Sloupce
- **`id`**: Unikátní identifikátor záznamu (UUID).
- **`tournament_id`**: Vazba na `public.tournaments(id)`.
- **`participant_id`**: Vazba na `public.participants(id)`.
- **`group_code`**: Označení skupiny (`A` až `L`), povoleno NULL pro play-off nebo dočasně neumístěné týmy.
- **`seed_position`**: Pozice nasazení ve skupině (1 až 4).
- **`status`**: Stav týmu v turnaji (`active` / `qualified` / `eliminated`).

#### Integrita a Unikátnost
- **`unique_tournament_participant`**: Jeden tým může v konkrétním turnaji vystupovat pouze jednou.
- **`unique_tournament_group_seed`**: Každá pozice nasazení v konkrétní skupině turnaje (např. Skupina A, pozice 1) může patřit pouze jednomu týmu.

#### Kdy použít skutečný tým vs. placeholder v Tournament Participants
- **Skutečný Tým**: Vkládá se při inicializaci turnaje pro všechny jisté účastníky. Pokud je známá skupina, vyplní se `group_code` (např. `A`) a `seed_position` (např. `1`).
- **Placeholder**: Pokud pro některé pozice ve skupině ještě není znám konkrétní tým, přiřadí se zástupný účastník (např. `football-tba-01`). Jakmile tým postoupí nebo se kvalifikuje, záznam se aktualizuje nahrazením `participant_id` za reálný tým, přičemž `id` a herní sázky zůstanou neporušené.

---

## 4. Postup Aktualizace a Nahrazení Placeholderů v Čase

Jakmile dojde k odehrání zápasů skupinové fáze nebo je dokončena dodatečná kvalifikace, je nutné nahradit placeholdery skutečnými týmy v zapsaných zápasech.

### 4.1 Nahrazení placeholderu skutečným týmem v existujících zápasech
Pokud se namísto zástupného celku `football-tba-01` do zápasu kvalifikuje například Portugalsko (`football-por`), provedeme přímý update konkrétního zápasu v tabulce `public.matches`:

```sql
-- Příklad nahrazení domácího týmu v konkrétním zápase:
UPDATE public.matches
SET home_participant_id = 'football-por'
WHERE id = 'manual-fifa-2026-fwc2026-045';
```

### 4.2 Zachování integrity a Provider Match ID (`provider_match_id`)
Při změně soupeřů (přechod z TBA na reálné země) **se nesmí měnit primární identifikátor zápasu (`id` neboli `provider_name` + `provider_match_id`)**. 

*Důvod*: Pokud změníte ID zápasu, uživatelé, kteří si již tento zápas natipovali (předstihové tipování play-off), by přišli o herní data a jejich tipy v tabulce `public.predictions` by osiřely nebo byly odstraněny kaskádovým smazáním.

Pravidlo:
- **Zápasové ID (např. `manual-fifa-2026-fwc2026-045`) zůstává stálé po celou dobu životního cyklu turnaje.**
- Mění se výhradně sloupce `home_participant_id` a `away_participant_id`.
- Tím se dokonale zachovají všechny uživatelské tipy (`predictions`), leaderboard zůstane neporušen a tipy se vyhodnotí automaticky po zapsání reálného konečného výsledku.

---

## 5. Ostré Zápasy – CSV Import Workflow

Pro ostrý import 104 zápasů MS 2026 je v `/supabase/seed/world_cup_2026_matches.csv` připravena tato standardizovaná struktura:

```csv
tournament_id,stage,home_participant_id,away_participant_id,start_time_utc,provider_name,provider_match_id
fifa-world-cup-2026,Group Stage,football-usa,football-mex,2026-06-11T20:00:00Z,manual-fifa-2026,fwc2026-001
fifa-world-cup-2026,Group Stage,football-can,football-arg,2026-06-12T18:00:00Z,manual-fifa-2026,fwc2026-002
fifa-world-cup-2026,Group Stage,football-fra,football-eng,2026-06-12T21:00:00Z,manual-fifa-2026,fwc2026-003
```

### Specifikace atributů:
- **`tournament_id`**: Pevně nastaveno na `fifa-world-cup-2026` (propojení s nadefinovaným turnajem).
- **`provider_name`**: Každý ostrý import nese identifikační štítek zdroje **`manual-fifa-2026`**. To zajišťuje perfektní izolaci od testovacích záznamů (`manual-test`) nebo budoucích automatických API synchronizací.
- **`provider_match_id`**: Sekvenční unikátní ID ze zdroje: **`fwc2026-001` až `fwc2026-104`**.

---

## 6. Kontrola Dat & Před-importní Checklist (Validation Checklist)

Před tím, než správce či skript spustí produkční naplnění tabulky `public.matches`, musí být stoprocentně splněn a odškrtnut následující checklist:

### 🟩 1. Kontrola referenční integrity (Foreign Key Enforcements)
- [ ] Všechna IDs domácích (`home_participant_id`) i hostujících (`away_participant_id`) týmů v importním CSV souboru musí mít odpovídající záznam v tabulce `public.participants`.
- [ ] Jakákoliv chybějící ID (např. překlep v kódu jako `football-colombia` namísto `football-col`) způsobí pád databázové transakce, import bude včas odmítnut.

### 🟩 2. Stav Play-off zápasů a TBA placeholder
- [ ] V základní skupině (Group Stage) nesmí figurovat žádné neurčené týmy (`football-tba`). Všechny zápisy musí mít reálné soupeře.
- [ ] Pro vyřazovací fáze (Round of 32, Round of 16, Quarterfinals, Semifinals, Third Place Playoff, Final), kde před zahájením turnaje nejsou známa jména soupeřů, je povoleno a vyžadováno nastavit ID domácího/hostujícího týmu na hodnotu `football-tba`.

### 🟩 3. Časová pásma a ISO formáty (UTC Standards)
- [ ] Veškeré startovní časy zápasů v sloupci `start_time_utc` musí být validní řetězce odpovídající standardu ISO-8601 s definovaným časovým pásmem UTC vyjádřeným písmenem `Z` (např. `2026-06-11T20:00:00Z`).
- [ ] Lokální časy v místě konání (USA, Kanada, Mexiko) musí být korektně přepočítány na UTC standard.

### 🟩 4. Jedinečnost identifikátorů (Uniqueness Analysis)
- [ ] Kombinace hodnot ve sloupcích `provider_name` a `provider_match_id` musí být v rámci celého CSV souboru unikátní.
- [ ] Databáze hlídá unikátnost pomocí PostgreSQL indexu `idx_matches_provider_pg`. Duplicitní řádek v souboru by mohl způsobit nechtěné přepsání zápasů.

### 🟩 5. Kvantitativní bilance zápasů (Match Count Verification)
- [ ] Celkový počet řádků k importu pro kompletní šampionát FIFA World Cup 2026 musí činit přesně **104 zápasů**.
    - *Skupinová fáze*: 12 skupin po 4 týmech &rarr; 6 zápasů na skupinu &rarr; celkem 72 zápasů.
    - *Play-off*: 32 týmů vyřazovacím pavoukem &rarr; 32 zápasů (včetně zápasu o 3. místo).
    - Celkem: $72 + 32 = 104$ zápasů.
- [ ] Jakákoliv odchylka v počtu (méně či více zápasů v plánu) značí chybějící nebo duplicitní zápisy a musí být před importem manuálně opravena.
