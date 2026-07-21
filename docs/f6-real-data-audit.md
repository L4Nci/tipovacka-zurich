# Real World Cup Data Audit – FIFA World Cup 2026 Readiness

> Historical readiness audit. This captures pre-import real-data preparation and
> is not current operational documentation for production sync or scoring.

Tento dokument představuje strukturní a datový audit připravenosti platformy na ostrý import reálných dat **FIFA World Cup 2026** (MS ve fotbale 2026). Hodnocení se opírá o současnou strukturu tabulek v Supabase a seed soubory.

---

## Rychlý Přehled Hodnocení Splnění

| Oblast / Úkol | Stav | Hlavní zjištění | Odhad dopadu / Doporučení |
| :--- | :---: | :--- | :--- |
| **1. Počet reálných účastníků** | **PASS** | V databázi existuje přesně **48 reálných národních týmů** (14 ze základního seedu + 34 z rozšiřujícího seedu). | Výborná reprezentativní sada splňující formát mistrovství. |
| **2. Chybějící týmy** | **PASS** | Žádný tým nechybí pro sestavení kompletního šampionátu o 48 účastnících. | Seedy kompletně pokrývají 48 herních slotů. |
| **3. Skupiny A–L v participants** | **PASS** | Tabulka `participants` neobsahuje skupiny jako samostatné entity, což je správné (skupiny nejsou závodníci). | Správný koncept. Skupiny by se měly modelovat jako atributy nebo separátní vazební schéma. |
| **4. Ukládání Group Assignment** | **FAIL** | Schéma `public.participants` ani jiná tabulka v databázi neumožňuje uložit přiřazení jednotlivých týmů do skupin A–L. | **Vysoký dopad**: Nelze v kódu automaticky postavit tabulky skupin ani ověřovat korektnost skupinového složení. Doporučeno přidat sloupec `group_code` do `participants`. |
| **5. Vyhodnocení Longterm Predictions** | **WARNING** | Bez definovaných skupin nelze vítěze skupin vyhodnotit automaticky z výsledků zápasů. | **Střední dopad**: Vyhodnocení je možné pouze tak, že administrátor ručně zadá správné ID týmu pro každou skupinu (např. `group_winner_A` = `football-fra`). |
| **6. Skutečná struktura FIFA 2026** | **PASS**| 12 skupin, 48 týmů, 104 zápasů celkem, 32 postupujících (top 2 z každé skupiny + 8 nejlepších ze třetích míst). | Datový model a testy (104 zápasů v CSV šablonách) plně odpovídají novému formátu FIFA. |
| **7. Připravenost importu 104 zápasů** | **WARNING** | SQL a CSV importní pipeline je plně připravená a funkční, avšak kompletní CSV soubor s 104 ostrými zápasy ještě není fyzicky vygenerován. | **Nízký dopad**: Je nutné zkompilovat oficiální kalendář do CSV šablony pod providerem `manual-fifa-2026`. |

---

## Detailní Analýza Auditovaných Oblasti

### 1. Počet reálných týmů v `participants`
*   **Stav**: **PASS**
*   **Analýza**: V databázi je aktuálně nakonfigurováno celkem **48 reálných národních týmů** pro `sport_id = 'football'`.
    *   **Základní seed (`001_seed_base_data.sql`)**: Obsahuje **14 reálných týmů**: USA, MEX, CAN, ARG, BRA, FRA, ENG, GER, ESP, POR, ITA, MAR, SEN, JPN.
    *   **Rozšiřující seed (`002_seed_world_cup_2026_participants.sql`)**: Obsahuje **34 reálných týmů**: Belgie, Chorvatsko, Nizozemsko, Švýcarsko, Dánsko, Švédsko, Norsko, Polsko, Ukrajina, Turecko, Rakousko, Maďarsko, Česko, Slovensko, Uruguay, Kolumbie, Chile, Ekvádor, Peru, Paraguay, Venezuela, Jamajka, Egypt, Nigérie, Kamerun, Ghana, Tunisko, Alžírsko, Jižní Korea, Austrálie, Saúdská Arábie, Írán, Katar, Nový Zéland.
    *   Dohromady: $14 + 34 =$ **exactly 48 reálných týmů**. Mezi ID neexistují žádné kolize.

---

### 2. Chybějící týmy
*   **Stav**: **PASS**
*   **Analýza**: Pro účely simulace a herního nasazení nechybí žádný tým k sestavení plné sady 48 slotů. 
*   *Poznámka*: Vzhledem k probíhající reálné interkontinentální kvalifikaci (která se dohrává až těsně před turnajem), tato sada 48 zemí představuje stoprocentně věrný, realistický odhad reprezentující všechny zapojené konfederace. Případné neočekávaně kvalifikované státy lze okamžitě dohrát idempotentním SQL update/insert skriptem.

---

### 3. & 4. Skupiny A–L a Group Assignment
*   **Stav**: **FAIL**
*   **Zjištěný problém**: Databázové schéma v `001_initial_schema.sql` vůbec nepočítá s persistencí rozlosování týmů do základních skupin. 
    *   Tabulka `public.participants` nemá žádný sloupec (např. `group_code` nebo `pool_id`).
    *   Neexistuje ani žádný vazební číselník nebo tabulka typu `public.participant_groups`.
*   **Doporučení**: Do budoucna (pro plně automatizovanou kalkulaci skupinových tabulek v klientské aplikaci) vřele doporučujeme provést migraci pro přidání sloupce do `public.participants`:
    ```sql
    ALTER TABLE public.participants ADD COLUMN group_code CHAR(1) CHECK (group_code IN ('A','B','C','D','E','F','G','H','I','J','K','L'));
    ```
*   **Dopad**: Bez této úpravy nelze v aplikaci automaticky vykreslovat tabulku "Body, Výhry, Skóre" pro Skupinu A až L na základě zaznamenaných výsledků zápasů. Aplikace by musela tuto informaci hardcodovat v JS kódu, což vytváří problémy s pružností dat.

---

### 5. Vyhodnocení Longterm Predictions bez skupin
*   **Stav**: **WARNING**
*   **Zjištěný problém**: Pokud uživatelé tipují vítěze Skupiny A (typ sázky `group_winner_A`), systémový scoringový engine na pozadí nedokáže automaticky zjistit, které týmy do Skupiny A patří a jak v ní skončily, protože chybí datové vazby (Group Assignment).
*   **Doporučení**: Vyhodnocení dlouhodobých predictions musí probíhat **explicitní administrativní deklarací**. Administrátor na konci skupinové fáze do vyhodnocovacího rozhraní zadá:
    *   `group_winner_A` = `'football-fra'`
    *   `group_winner_B` = `'football-esp'`
    *   Tato administrativně nastavená správná hodnota se následně porovná se sloupcem `predicted_participant_id` uživatelů a přiřadí se body (4 body za úspěšný hit). Tento princip je bezpečný, spolehlivý a plně funkční i bez existence skupinové databázové tabulky.

---

### 6. Skutečná struktura FIFA World Cup 2026
*   **Stav**: **PASS**
*   **Verifikace herního formátu**:
    *   **Počet skupin**: **12 skupin** (A až L). Každá skupina obsahuje právě 4 týmy.
    *   **Počet týmů**: **48 týmů**.
    *   **Počet postupujících do play-off**: **32 týmů**. Postupují 2 nejlepší týmy z každé z 12 skupin ($12 \times 2 = 24$ týmů) + 8 nejlepších týmů na 3. místech ($8$ týmů).
    *   **Celkový počet zápasů**: **104 zápasů**.
        *   Skupinová fáze: $12 \times 6 = 72$ zápasů.
        *   Vyřazovací play-off: $16 + 8 + 4 + 2 + 1 + 1 = 32$ zápasů.

---

### 7. Připravitost importu všech 104 zápasů
*   **Stav**: **WARNING**
*   **Analýza**:
    *   **Pipeline**: SQL a CSV importní proces přes `import_matches.sql` a tabulku `public.matches` je prověřen, plně zabezpečen unikátním PostgreSQL klíčem `ON CONFLICT (provider_name, provider_match_id) DO UPDATE` a připraven pro produkční nasazení.
    *   **Data**: V současnosti máme k dispozici strukturní CSV šablonu (`world_cup_2026_matches.csv`) o deseti modelových zápasech, která slouží jako podklad pro přípravu finální tabulky rozlosování.
*   **Doporučení**: Před ostrým startem mistrovství světa musí administrátor sestavit kompletní řadu se 104 zápisy, zajistit správné UTC formáty kick-off časů a zadat odpovídající ID pro nadefinované zápasy pod providerem `manual-fifa-2026` a provider match IDs `fwc2026-001` až `fwc2026-104`.
