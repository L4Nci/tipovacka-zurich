# FÁZE F9.3 – Ostrý import do Supabase a ověření

Tento dokument obsahuje SQL příkazy pro před-importní ověření účastníků a post-importní smoke test zápasů podle checklistu F9.

## 1. Před-importní ověření účastníků (Pre-flight check)

Před spuštěním importu, spusťte tyto dva dotazy ve vašem Supabase SQL editoru:

**Očekávaný výsledek: 49 záznamů (48 reálných týmů + 1 `football-tba`). V případě přítomnosti playoff tba-xx placeholderů se číslo adekvátně zvýší, ale základem je 48 + 1.**
```sql
SELECT count(*) 
FROM public.participants;
```

**Očekávaný výsledek: 12 (Všechny nově dogenerované týmy musí být v databázi).**
```sql
SELECT id
FROM public.participants
WHERE id IN (
  'football-rsa',
  'football-bih',
  'football-hai',
  'football-sco',
  'football-cuw',
  'football-civ',
  'football-cpv',
  'football-irq',
  'football-jor',
  'football-cod',
  'football-pan',
  'football-uzb'
);
```

## 2. Spuštění importu (Ostrý import)

Pokud výše uvedené kontroly dopadnou úspěšně, spusťte ostrý import připraveného feedu se 104 zápasy:

```bash
supabase db execute --file supabase/seed/import_matches.sql
```

(Alternativně lze zkopírovat obsah tohoto souboru a spustit rovnou v SQL editoru v Supabase dashboardu).

## 3. Post-importní Smoke Test

Pro potvrzení, že F9.3 proběhla bezchybně, spusťte:

**Očekávaný výsledek: 104 (72 skupinových + 32 playoff).**
```sql
SELECT count(*)
FROM public.matches
WHERE tournament_id = 'fifa-world-cup-2026';
```

## Ready for F10 (Lobby-first UX Redesign)
Jakmile tento smoke test projde, celá FÁZE F9 je kompletně hotová a přecházíme na UX/UI transformaci: **F10.1 Lobby-first UX redesign**.
