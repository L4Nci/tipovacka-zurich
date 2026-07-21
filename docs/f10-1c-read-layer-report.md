# F10.1C – Read Layer Migration to lobby_tournaments

> Historical migration report. This documents an intermediate read-layer step.
> Verify current multi-lobby/tournament behavior against `src/lib/db.ts`,
> `src/App.tsx`, and current product docs before using it operationally.

## 1. Současný stav (Read Layer)

Zavedli jsme zpětně kompatibilní read layer, který umožňuje, aby jeden lobby obsahoval více turnajů, s fallbackem na data z původního legacy `tournament_id` z tabulky `lobbies`. Cílem bylo zajistit, aby frontend už datově rozuměl multi-tournament struktuře (přes pole `tournaments` resp. vrácené `active_tournaments` a `archived_tournaments`). 

Důležité změny v `src/lib/db.ts`:

- **Typy (`src/types.ts`)**: Upravili jsme `LobbyTournament` pro mapování dat od Supabase. K tabulce `Lobby` jsme přidali volitelné pole `tournaments?: LobbyTournament[]`, kam jsou nově servírovány aktivní turnaje pod lobby.
- **`fetchUserLobbies`**: Nyní čte `lobby_tournaments` jako vnořený struct ze Supabase. Pokud struktura neexistuje nebo je prázdná, aplikace simulovaně vytvoří fallback záznam pomocí legacy `lobbies.tournament_id`. Vrací tedy seznam všech spárovaných turnajů vedle single property `tournament_id`.
- **`fetchLobbyDashboard`**: Dříve single-point dotaz do `lobbies`. Nyní načítá `lobby_tournaments` a separuje turnaje z resultu na objektu do `active_tournaments` a `archived_tournaments`. Pokud `lobby_tournaments` neexistují, vytváří automatický zástupný formát s jedním `active` turnajem s použitím původního `tournament_id`. Vše navíc přijímá volitelný argument `explicitTournamentId`, jak má reagovat.

## 2. Co ještě používá legacy tournament_id:

- V logice komponenty a dashboardu se na data z explicitních turnajů nespojuje nic napřímo.
- Frontend React stav a lokální state `activeTournamentId` zatím vůbec nefunguje či plně spoléhá na implicitní model starého UI a `tournament_id` z první úrovně `Lobby` objektu. Stejně tak fallback u `fetchLobbyDashboard`.
- Tvorba nových predikcí pro odlišné turnaje ve stejné lobby může být matoucí, pokud backend nemá jasně předáno jaké je `activeTournamentId` v daném view stavu uživatele.

## 3. Co zůstává na F10.1D (State Management & UI):

- Úpravy `App.tsx` tak, že `activeLobbyId` musí být svázáno i s `activeTournamentId`.
- Při změně lobby musí dojít buď k pamatování posledního turnaje pro tuto lobby, nebo jeho resetování a nabídnutí např. "Zvolte turnaj".
- Zobrazení listu turnajů napojených do lobby (vizuální reprezentace dat vrácených z `fetchUserLobbies` u `active_tournaments`).
- Úprava funkcí z `fetchLobbyDashboard` na skutečně switchování turnajového stromu dle UI.
- Oddělit `fetchMatches` tak, aby čerpalo z active tournament selection místo top-level objektu.

## 4. Testovací scénáře:

1. Zápis **starých** i **nových dat** probíhá bez rozbití - fallback plní virtuální list pole pomocí legacy property `lobby.tournament_id` s umělým statusem "active", když backend `lobby_tournaments` nenalezl.
2. Helper `addTournamentToLobby` funguje a duplicitně se nevytváří data díky SQLite Supabase O.C. DO NOTHING a ON CONFLICT.
3. Fetch dashboardu a dat je plně bezpečný na stávající score-keeping i predikční pole.
