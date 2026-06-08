# F10.1B – Dual Write pro Lobby → Tournaments Architecture

## 1. Proč Dual Write existuje?

Aplikace byla původně navržena na datový model `1 lobby = 1 turnaj`, kdy každá lobby měla hardcodovaný vizuální a funkční záměr pro jeden turnaj (`lobbies.tournament_id`).
Dlouhodobá vize ovšem počítá s tím, že lobby je dlouhodobá komunita napojitelná na více turnajů najednou (`lobby_tournaments`).

Jelikož v současnosti celý frontend routing, `fetchMatches`, `fetchPredictions` a state v `App.tsx` spoléhají implicitně na vazbu `tournament_id` schovanou přímo v `lobbies`, odstranit by ji znamenalo rozbít většinu klíčových částí UI v jeden okamžik.
Dual-write znamená, že po nějakou dobu funguje paralelně dosavadní single-tournament state i nový multi-tournament state pro udržení stabilní produkční větve a zavedení do budoucna.

## 2. Jak dlouho má Dual Write zůstat?

Bude zachován (ideálně v rámci několika měsíců), dokud neproběhnou všechny fáze plánované implementace (zejména F10.1C, F10.1D, a dokud nebudou ověřeny v produkčním prostředí další turnaje).
Mazání provádíme až po úspěšném průchodu plným turnajovým cyklem, kdy víme, že M:N model turnaje zafungoval bez dopadu na tabulky `predictions` a live ratingy.

## 3. Proč zatím nemažeme `lobbies.tournament_id`?

Bez něj by aplikace nebyla schopna zjistit (ve starším codebasem) ani výchozí `tournamentId` a tím by zcela padal active state u clienta pokud je vrácena `lobbie` bez pole spojených turnajů. Během procesu přechodu starý kód `tournament_id` využívá a nový kód pouze potichu backfilluje vazby, aniž by byl zatížen.

## 4. Dodaný obsah ve F10.1B:

1. **Migrece #004 (`lobby_tournaments` table a RLS)**: Bezpečné zavedení tabulky vazeb pro Supabase (s RLS nastavením na read pro ověřené členy a insert/updates pro owners) včetně back-fill insert query z existujících lobby.
2. **Localhost fallback**: Úprava startup příkazu v `server.ts` s idempotentním seedováním tabulky s generovanými IDs ve formátu UUID a zpětném plnění tabulky nad SQLite databází.
3. **Dual write mechanismy**: Obnova funkce `createLobby()` o paralelizovaný zápis na `lobby_tournaments` ihned vedle `lobbies`.
4. **Rozšířené funkce pro F10.1C**: Helper funkce `addTournamentToLobby(lobbyId, tournamentId)`.

## 5. Jaký bude další krok (F10.1C DB Layer)?

V další fází (F10.1C) začneme postupně modifikovat fetch funkce (třeba `fetchLobbyDashboard`, `fetchLobbyLeaderboard` a `fetchMatches`) tak, aby pro aktivní zprávy uměly nahlížet do M:N tabulky a ignorovaly nebo využívaly starý ref dle potřeby a zároveň do `src/types.ts` přidáme patřičné interface parametry. UI si mezitím ponechá stejný state a nezatěží koncového uživatele nutností překlikávat turnaje.
