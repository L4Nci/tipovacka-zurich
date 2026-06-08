# FÁZE F10.1 – Lobby-first UX Redesign a Datový Model

## Cíl
Přehodnotit stávající architekturu a uživatelské rozhraní tak, aby odráželo nový produktový mentální model:
**Lidé -> Lobby -> Turnaje -> Sport**

Místo toho, aby Lobby patřila k jednomu turnaji, Lobby se stane domovem pro skupinu přátel (např. *Brněnská banda*). V rámci této Lobby se budou moci spouštět nejrůznější turnaje (MS Hokej 2026, FIFA World Cup 2026, Liga Mistrů, atd.).

## Co to znamená pro Databázi (F10.0 Backend Refaktor)
Aktuálně má tabulka `lobbies` fixní vazbu: `tournament_id TEXT NOT NULL`. Tuto vazbu musíme povýšit.

**Plán úprav schématu:**
1. Z tabulky `lobbies` se odstraní sloupec `tournament_id`.
2. Vytvoří se nová vazební tabulka `lobby_tournaments` (lobby_id, tournament_id, status: active/archived).
3. Tabulka `predictions` a `longterm_predictions` již správně obsahují vazby na `lobby_id`, ale musíme zajistit, že endpointy a RLS pro čtení lobby dat nepočítají s jediným pre-definovaným `tournament_id`.

## Co to znamená pro UI (F10.1)
1. **Lobby Dashboard (Hlavní obrazovka po vstupu do Lobby):**
   - **Název Lobby** (př. Brněnská banda) a join code.
   - **Aktivní soutěže** (dlaždice s Turnaji, které právě probíhají - např. MS Hokej 2026, MS Fotbal 2026).
   - **Členové** skupiny.
   - **Hall of Fame** (celkové body kumulované za všechny historické turnaje v této skupině).
   - **Historie soutěží** (ukončené turnaje).
2. **Turnajový detail:**
   - Až po kliknutí na konkrétní "Aktivní soutěž" se zobrazí výchozí záložky `Matches`, `Leaderboard` a `Playoffs` pro tento konkrétní turnaj.

Tento přesun udělá z aplikace skutečnou "platformu pro soutěžení přátel", nikoliv jen jednoúčelovou stránku pro jeden turnaj.
