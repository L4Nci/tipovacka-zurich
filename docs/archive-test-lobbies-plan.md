# Archivace dvou testovacích lobby — připravený postup

3. 11. 2026 · Vlastník vybral archivaci a skrytí ve staré aplikaci při zachování dat. **Provedení: neproběhlo.** Tento dokument konkretizuje zásah pro samostatnou implementaci a kontrolu; nemění databázi ani nasazení.

## Přesný rozsah

Read-only kontrola původní Supabase `hkhkbtzdyjbdeeoiurvw` dne 3. 11. 2026:

| Lobby | ID | Členství / aktivní | Tipy na zápasy | Tipy na vítěze |
| --- | --- | --- | --- | --- |
| **Fotbaloví experti — zachovat jako reálnou historii** | `lobby-vlrsrxuh` | 11 / 11 | 1 032 | 10 |
| **test — archivovat a skrýt** | `lobby-5441ec5b3b0ac397fde70776` | 1 / 1 | 0 | 0 |
| **test 2 — archivovat a skrýt** | `lobby-f6f65d6ced20f3981cd2567e` | 1 / 1 | 0 | 0 |

Všechny tři mají vazbu na `fifa-world-cup-2026`. Změna globálního turnaje proto neslouží ke skrytí dvou testovacích lobby. Tabulka je kontrolní baseline, nikoli úplná záloha; před zápisem je potřeba nový snapshot a ověření aktuálního stavu.

## Proč to nelze dokončit existujícím archivním tlačítkem

- Reálné schéma `public.lobbies` nemá archivní příznak. To bylo ověřeno přes `information_schema.columns` i v [počáteční migraci](../supabase/migrations/001_initial_schema.sql).
- [`set_lobby_tournament_status_secure`](../supabase/migrations/017_tournament_management.sql) archivuje konkrétní turnaj v lobby, nikoli celou lobby. [`fetchUserLobbies`](../src/lib/db.ts) vrací lobby přes aktivní členství; [Home](../src/components/HomeDashboard.tsx) je stále vykreslí.
- `visibility = private` lobby členům neskryje. Ukončení členství by změnilo význam historických členství. [`deleteLobby`](../src/lib/db.ts) maže tipy a navazující data; neodpovídá požadavku zachovat data.

## Nejmenší úplné řešení

1. Vybrat poslední ověřený základ staré aplikace a uložit potřebný snapshot dat. Ověřit skutečně nasazený commit a migrace. Současný rozpracovaný backend nelze bez kontroly převzít kvůli vazbám na `020/021`; viz [rollout gates](onboarding-start-event-architecture.md#rollout-gates).
2. Doplnit reverzibilní archivní stav celé lobby, například `archived_at`. Připravit oprávnění pro archivaci a obnovu; prověřit související tabulky, RPC a přímé zápisy přes RLS.
3. Skrýt archivované lobby v běžném seznamu, hledání a připojování. Zablokovat nové členství a herní zápisy do archivované lobby. Existující členství, role, výsledky, tipy a body zachovat. Případný archivní náhled pro oprávněné uživatele je pouze ke čtení.
4. Ověřit změnu nejprve mimo historickou DB. Teprve odpovídající vydání staré aplikace propojit s potřebnou migrací a archivovat výhradně dvě ID uvedená výše. Nevydávat současně celou rozpracovanou novou verzi.
5. Zkontrolovat všechny původní počty a vazby. Obě testovací lobby zmizely z běžného seznamu; „Fotbaloví experti“ a jejich 1 032 + 10 tipů jsou nedotčení. Ověřit nepřístupnost nových zápisů a funkční návrat zrušením archivního stavu.

Pouhé filtrování dvou ID ve frontendu by vyžadovalo nasazení a neuzavřelo by vstup ani zápisy. Nejde o úplnou archivaci.

## Stav a návaznost

- Volba vlastníka **archivovat/skrytí/zachovat data** je potvrzená; neotvíráme ji znovu.
- Read-only audit, identifikace lobby a návrh postupu jsou hotové. Snapshot, migrace, kód a nasazení hotové nejsou.
- Nynější fáze je podle vlastníka plánování před stavbou. Provedení vyžaduje samostatně vymezenou změnu schématu, oprávnění a nasazení podle [AGENTS.md](../AGENTS.md) a [PROJECT_RULES.md](../PROJECT_RULES.md); není to dostupná jednorázová archivní operace.
- Ostatní historické lobby ani reálná data se neodstraňují. Postup patří do T02 [aktivního plánu](product-restart-plan.md).
