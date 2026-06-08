# FÁZE F9.1 – Audit účastníků MS ve fotbale 2026 (Participants Audit)

Tento dokument detailně mapuje srovnání stávajícího seznamu fotbalových účastníků (týmů) v databázi s dodaným oficiálním rozpisem skupinové fáze Mistrovství světa ve fotbale v roce 2026 (obsahujícím 48 reprezentací).

---

## 1. Konečný Stav Hodnocení: PASS (Přezkoumáno a zasetováno)

Nalezené neshody byly okamžitě vyřešeny tvorbou **idempotentního SQL seedu**, který doplňuje chybějící týmy pro kompletní 48členné obsazení turnaje.

---

## 2. Přehled 48 Týmů z Rozpisu a ID Mapování

Nalézáme kompletní sadu 48 týmů s jejich odpovídajícími mezinárodně uznávanými třípísmennými kódy FIFA a standardní ID konvencí `football-<fifa_code_lowercase>`.

| # | Název v Rozpisu | Název v AJ | Kód FIFA | Systémové ID | Stav v DB (před seedem) |
| :--- | :--- | :--- | :---: | :---: | :---: |
| 1 | Mexiko | Mexico | MEX | `football-mex` | **OK** (Base seed) |
| 2 | Jihoafrická republika | South Africa | RSA | `football-rsa` | **CHYBĚL** (Doplněn) |
| 3 | Jižní Korea | South Korea | KOR | `football-kor` | **OK** (WC seed) |
| 4 | Česko | Czech Republic | CZE | `football-cze` | **OK** (WC seed) |
| 5 | Kanada | Canada | CAN | `football-can` | **OK** (Base seed) |
| 6 | Bosna a Hercegovina | Bosnia and Herzegovina | BIH | `football-bih` | **CHYBĚL** (Doplněn) |
| 7 | USA | United States | USA | `football-usa` | **OK** (Base seed) |
| 8 | Paraguay | Paraguay | PAR | `football-par` | **OK** (WC seed) |
| 9 | Katar | Qatar | QAT | `football-qat` | **OK** (WC seed) |
| 10 | Švýcarsko | Switzerland | SUI | `football-sui` | **OK** (WC seed) |
| 11 | Brazílie | Brazil | BRA | `football-bra` | **OK** (Base seed) |
| 12 | Maroko | Morocco | MAR | `football-mar` | **OK** (Base seed) |
| 13 | Haiti | Haiti | HAI | `football-hai` | **CHYBĚL** (Doplněn) |
| 14 | Skotsko | Scotland | SCO | `football-sco` | **CHYBĚL** (Doplněn) |
| 15 | Austrálie | Australia | AUS | `football-aus` | **OK** (WC seed) |
| 16 | Turecko | Turkey | TUR | `football-tur` | **OK** (WC seed) |
| 17 | Německo | Germany | GER | `football-ger` | **OK** (Base seed) |
| 18 | Curaçao | Curaçao | CUW | `football-cuw` | **CHYBĚL** (Doplněn) |
| 19 | Nizozemsko | Netherlands | NED | `football-ned` | **OK** (WC seed) |
| 20 | Japonsko | Japan | JPN | `football-jpn` | **OK** (Base seed) |
| 21 | Pobřeží slonoviny | Ivory Coast | CIV | `football-civ` | **CHYBĚL** (Doplněn) |
| 22 | Ekvádor | Ecuador | ECU | `football-ecu` | **OK** (WC seed) |
| 23 | Švédsko | Sweden | SWE | `football-swe` | **OK** (WC seed) |
| 24 | Tunisko | Tunisia | TUN | `football-tun` | **OK** (WC seed) |
| 25 | Španělsko | Spain | ESP | `football-esp` | **OK** (Base seed) |
| 26 | Kapverdy | Cape Verde | CPV | `football-cpv` | **CHYBĚL** (Doplněn) |
| 27 | Belgie | Belgium | BEL | `football-bel` | **OK** (WC seed) |
| 28 | Egypt | Egypt | EGY | `football-egy` | **OK** (WC seed) |
| 29 | Saúdská Arábie | Saudi Arabia | KSA | `football-ksa` | **OK** (WC seed) |
| 30 | Uruguay | Uruguay | URU | `football-uru` | **OK** (WC seed) |
| 31 | Írán | Iran | IRN | `football-irn` | **OK** (WC seed) |
| 32 | Nový Zéland | New Zealand | NZL | `football-nzl` | **OK** (WC seed) |
| 33 | Francie | France | FRA | `football-fra` | **OK** (Base seed) |
| 34 | Senegal | Senegal | SEN | `football-sen` | **OK** (Base seed) |
| 35 | Irák | Iraq | IRQ | `football-irq` | **CHYBĚL** (Doplněn) |
| 36 | Norsko | Norway | NOR | `football-nor` | **OK** (WC seed) |
| 37 | Argentina | Argentina | ARG | `football-arg` | **OK** (Base seed) |
| 38 | Alžírsko | Algeria | ALG | `football-alg` | **OK** (WC seed) |
| 39 | Rakousko | Austria | AUT | `football-aut` | **OK** (WC seed) |
| 40 | Jordánsko | Jordan | JOR | `football-jor` | **CHYBĚL** (Doplněn) |
| 41 | Portugalsko | Portugal | POR | `football-por` | **OK** (Base seed) |
| 42 | DR Kongo | DR Congo | COD | `football-cod` | **CHYBĚL** (Doplněn) |
| 43 | Anglie | England | ENG | `football-eng` | **OK** (Base seed) |
| 44 | Chorvatsko | Croatia | CRO | `football-cro` | **OK** (WC seed) |
| 45 | Ghana | Ghana | GHA | `football-gha` | **OK** (WC seed) |
| 46 | Panama | Panama | PAN | `football-pan` | **CHYBĚL** (Doplněn) |
| 47 | Uzbekistán | Uzbekistan | UZB | `football-uzb` | **CHYBĚL** (Doplněn) |
| 48 | Kolumbie | Colombia | COL | `football-col` | **OK** (WC seed) |

---

## 3. Výsledky analýzy rozdílů (Nalezené & navrhované změny)

### A. Seznam chybějících týmů (Chybělo 12 týmů)
Následujících 12 zemí se objevilo v herním plánu turnaje, ale chybělo v dřívějších databázových seeds:
1. **Jihoafrická republika** (`football-rsa`) - Skupinový soupeř
2. **Bosna a Hercegovina** (`football-bih`) - Evropský vyzyvatel
3. **Haiti** (`football-hai`) - Karibský zástupce
4. **Skotsko** (`football-sco`) - Tradiční evropská země
5. **Curaçao** (`football-cuw`) - Karibský překvapivý účastník
6. **Pobřeží slonoviny** (`football-civ`) - Africký gigant
7. **Kapverdy** (`football-cpv`) - Atlantický ostrovní vyzyvatel
8. **Irák** (`football-irq`) - Blízký východ
9. **Jordánsko** (`football-jor`) - Asijský reprezentant
10. **DR Kongo** (`football-cod`) - Africký zástupce
11. **Panama** (`football-pan`) - Střední Amerika
12. **Uzbekistán** (`football-uzb`) - Středoasijský zástupce

### B. Seznam týmů s chybným / nesjednoceným ID
* Žádný tým nemal chybný kód. Všechny stávající i nově navržené ID jsou sjednoceny na formát `football-<fifa_code_lowercase>` (např. `football-cze` namísto jiných alternativ).

### C. Seznam týmů navíc (Týmy přítomné v DB, které nejsou v rozpisu)
Napsali jsme druhotné seeds obsahující i další země, které se neprobojovaly nebo nejsou součástí plánu MS 2026. Tyto týmy v DB **ponecháváme** z důvodu zachování integrity historie a jiných turnajů, ale neobsazujeme jimi herní plán MS 2026:
* Neaktivní v tomto turnaji: **Itálie** (`football-ita`), **Dánsko** (`football-den`), **Polsko** (`football-pol`), **Ukrajina** (`football-ukr`), **Maďarsko** (`football-hun`), **Slovinsko/Slovensko** (`football-svk`), **Chile** (`football-chi`), **Peru** (`football-per`), **Venezuela** (`football-ven`), **Jamajka** (`football-jam`), **Nigérie** (`football-nga`), **Kamerun** (`football-cmr`).

---

## 4. Připravený SQL Seed

Pro doplnění chybějících týmů byl vytvořen plně idempotentní soubor:
**`/supabase/seed/004_seed_fifa_2026_schedule_participants.sql`**

```sql
-- =========================================================================
-- ADDITIONAL PARTICIPANTS FOR FIFA WORLD CUP 2026 GROUP PHASE
-- File: supabase/seed/004_seed_fifa_2026_schedule_participants.sql
-- Description: Seeds the remaining 12 teams required for the FIFA World Cup 2026 Group Stage
--              to match the 48-team schedule exactly.
-- Standard Convention: football-<fifa_code_lowercase>
-- =========================================================================

INSERT INTO public.participants (id, sport_id, name, short_name, type, flag_code) VALUES
('football-rsa', 'football', 'South Africa', 'RSA', 'team', '🇿🇦'),
('football-bih', 'football', 'Bosnia and Herzegovina', 'BIH', 'team', '🇧🇦'),
('football-hai', 'football', 'Haiti', 'HAI', 'team', '🇭🇹'),
('football-sco', 'football', 'Scotland', 'SCO', 'team', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'),
('football-cuw', 'football', 'Curaçao', 'CUW', 'team', '🇨🇼'),
('football-civ', 'football', 'Ivory Coast', 'CIV', 'team', '🇨🇮'),
('football-cpv', 'football', 'Cape Verde', 'CPV', 'team', '🇨🇻'),
('football-irq', 'football', 'Iraq', 'IRQ', 'team', '🇮🇶'),
('football-jor', 'football', 'Jordan', 'JOR', 'team', '🇯🇴'),
('football-cod', 'football', 'DR Kongo', 'COD', 'team', '🇨🇩'),
('football-pan', 'football', 'Panama', 'PAN', 'team', '🇵🇦'),
('football-uzb', 'football', 'Uzbekistan', 'UZB', 'team', '🇺🇿')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  flag_code = EXCLUDED.flag_code,
  sport_id = EXCLUDED.sport_id;
```

---

## 5. Potvrzení o zachování funkčního rozsahu

* **Zápasy**: Žádné herní zápasy ani časy z rozpisu **nebyly v této fázi importovány** ani měněny.
* **Scoring**: Algoritmy bodování nebyly ovlivněny.
* **UI & Auth**: Uživatelské prostředí ani přihlašovací toky zůstaly beze změny.
