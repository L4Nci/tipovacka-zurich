# FIFA World Cup 2026 Match Import Pipeline Manual

This document describes the design, execution, verification, and maintenance of the automated/manual import pipeline for matches in the Tippy Platform.

---

## 1. How to Prepare the CSV

An import CSV is hosted at:
`supabase/seed/world_cup_2026_matches.csv`

The CSV contains the following columns:

| Column Name | Type | Description | Example Target |
| :--- | :--- | :--- | :--- |
| **`tournament_id`** | `TEXT` | ID of the target tournament | `fifa-world-cup-2026` |
| **`stage`** | `TEXT` | Tournament round or phase | `Group A` |
| **`home_participant_id`** | `TEXT` | Foreign key referencing the home team | `football-usa` |
| **`away_participant_id`** | `TEXT` | Foreign key referencing the away team | `football-mex` |
| **`start_time_utc`** | `TIMESTAMPTZ` | Official kick-off time in UTC | `2026-06-11T20:00:00Z` |
| **`provider_name`** | `TEXT` | The API or manual source identifier | `manual-fifa-2026` |
| **`provider_match_id`** | `TEXT` | Unique match number from source provider | `fwc2026-g001` |

---

## Časový převod CEST → UTC

Zadaný český fotbalový rozpis je v letním čase **CEST (UTC+2)**. Pro zachování přesnosti a jednotného času v databázi napříč různými lokacemi jsou všechny časy konvertovány do **UTC standardu**. To pomáhá zabránit hádaní při časových posunech ve městech konání (USA, Mexiko, Kanada).

Pravidla použitého převodu v CSV a importním feedu:
- Odečtení -2 hodin od českého času.
- Český čas **21:00** → UTC **19:00** (stejný den)
- Český čas **04:00** → UTC **02:00** (stejný den)
- Český čas **00:00** → UTC **22:00** (předchozí den)
- Český čas **01:00** → UTC **23:00** (předchozí den)
- Český čas **02:00** → UTC **00:00** (stejný den)
- Český čas **03:00** → UTC **01:00** (stejný den)
- Český čas **06:00** → UTC **04:00** (stejný den)

*Poznámka:* Časy pro playoff (tzv. "tba" zápasy) jsou dočasné placeholder hodnoty a nejsou zatím plně ověřené. Budou přesně naplánovány, jakmile začne vyřazovací fáze.

**Important for 2026:**
We import all 104 matches. The 72 group-stage matches have assigned participants. The 32 playoff matches have `home_participant_id = football-tba` and `away_participant_id = football-tba` initially.

---

## 2. Checking Participant IDs

All participant entries MUST exist in the `public.participants` table beforehand. To list or check current IDs:

```sql
SELECT id, name, short_name 
FROM public.participants 
WHERE sport_id = 'football';
```

---

## 3. How to Run the Import

To run the import inside Supabase, or using any compatible SQL agent/CLI/editor, open constraints and execute:
```bash
# Execute the generated SQL migration/seed file
supabase db execute --file supabase/seed/import_matches.sql
```

The script will:
1. Verify the existence of the configured Tournaments.
2. Read the configured 104 matches directly embedded in `import_matches.sql` via `VALUES`.
3. Automatically calculate the prediction cutoff point `lock_time_utc` as `start_time_utc - INTERVAL '5 minutes'`.
4. Upsert matches, ensuring compatibility via `ON CONFLICT (provider_name, provider_match_id) DO UPDATE`.

---

## 4. How to Verify Imported Matches (104 Matches)

To verify the loaded data:

```sql
-- Count how many matches are loaded with the manual provider (should be 104):
SELECT count(*) 
FROM public.matches 
WHERE provider_name = 'manual-fifa-2026';

-- Ensure 72 group matches are imported:
SELECT count(*) 
FROM public.matches 
WHERE provider_name = 'manual-fifa-2026' AND stage LIKE 'Group%';

-- Ensure 32 playoff matches are imported:
SELECT count(*) 
FROM public.matches 
WHERE provider_name = 'manual-fifa-2026' AND stage NOT LIKE 'Group%';
```

---

## 5. Rollback of Matches

To cleanly remove all imported FIFA 2026 matches execute `supabase/seed/rollback_fifa_2026_matches.sql` or run:

```sql
DELETE FROM public.matches 
WHERE provider_name = 'manual-fifa-2026';
```

---

## 6. Updating TBA Playoff Matches During the Tournament

When teams advance from Group Stage to Playoff, their respective matches will already exist (e.g., `fwc2026-r32-01`).

You **must not** change `provider_match_id`.

To update a playoff match with real teams, you simply update the values matching that specific `provider_match_id`:

```sql
UPDATE public.matches
SET 
  home_participant_id = 'football-arg',
  away_participant_id = 'football-bra'
WHERE provider_name = 'manual-fifa-2026'
  AND provider_match_id = 'fwc2026-sf-01';
```

Or you can modify the CSV (`home_participant_id`, `away_participant_id`), regenerate `import_matches.sql`, and re-run. The `ON CONFLICT DO UPDATE` block will overwrite the `football-tba` values with the new specific teams while keeping points and IDs intact.
