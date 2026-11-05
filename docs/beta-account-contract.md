# T03 — účet, profil a oprávnění bety

4. 11. 2026 · **Kontrakt hlavní aplikace; skutečná Clerk registrace a dokončení profilu ověřené v hlavní DB, širší živé ověření nedokončeno.** Jeden stávající Supabase projekt, Clerk + Supabase. Aktuálně development Clerk na localhostu; lokální konfigurace je běžný `.env`, deployment používá proměnné Netlify. Historický název souboru neznamená samostatnou beta aplikaci.

## 1. Identita v jednom stávajícím projektu

Před Clerk migrací bylo `profiles.id` UUID s FK do `auth.users` (`001`); profil vytvářel Auth trigger (`009`). RLS/RPC používaly `auth.uid()` jako UUID (`010`–`015`). Stávající chráněné serverové endpointy nyní ověřují Clerk session přes veřejné JWKS a chráněné mapování na interní UUID; nepoužívají Supabase Auth fallback. Clerk `sub = user_*` není UUID ani řádek `auth.users`. Přepnutí loginu proto nestačí.

**Přijatý migrační směr:** zachovat existující profily, UUID a herní data; přidat chráněnou jedinečnou vazbu `(issuer, subject) → player_id` pro Clerk. Nové Clerk profily musí vznikat bez povinného řádku v `auth.users`; migrace `20261104095025_clerk_identity_bridge.sql` už odstranila povinnou FK na `auth.users` a přidala chráněné mapování, bootstrap a profilové RPC, resolver i převod existujících RLS/RPC. Historické řádky zůstaly zachované. Herní FK dál používají interní UUID. Nové Clerk účty se automaticky nepropojují e-mailem. Všechna RLS/RPC používající `auth.uid()` musí projít inventářem před povolením Clerk přístupu.

Použít [nativní Clerk Third-Party Auth](https://supabase.com/docs/guides/auth/third-party/clerk), `accessToken: session.getToken()` a DB roli `authenticated`; ta neznamená platformního admina. Nepoužívat deprecated Supabase JWT template. [Integrace](https://clerk.com/docs/guides/development/integrations/databases/supabase) sama nesynchronizuje profily. Aplikace používá stejný schválený Supabase projekt. Vybraná Clerk instance musí souhlasit ve frontendovém klíči, backendovém issueru a Supabase Third-Party Auth; testovací i produkční klíče jsou podporované, nesmějí se míchat. Chybějící konfigurace nesmí přepnout identitu nebo projekt.

## 2. Profilová pole — doporučený zdroj pravdy

| Pole | Autorita a změna |
| --- | --- |
| E-mail, ověření, heslo, OAuth identity, sessions | Clerk; změny přes jeho účet. E-mail nekopírovat do veřejného herního profilu, nepoužívat jako klíč |
| `player_id`, vazba issuer/subject | Server/DB; neměnné, klient je nepřiděluje |
| `display_name` | Naše DB; do dokončení profilu null, potom editovatelné, neunikátní, 2–40 znaků po trim, prostý text. Unikátní handle pilot nepotřebuje |
| Avatar | Naše DB; pro betu emoji + barva z nabídky. Clerk fotku automaticky nepřebírat; upload odložit |
| `locale` | Naše DB, `cs`/`en`; před loginem výchozí jazyk prohlížeče nebo lokální volba, po loginu profil |
| Bio, viditelnost | Doporučení: pilot bez veřejného katalogu, základní identita pouze v oprávněném herním kontextu; bio/public statistiky zatím odložit |
| Role, body, historie, získané odznaky | Serverová doména; editace jména/avataru je nemění |

## 3. Bootstrap a ověřování

1. Clerk dokončí přihlášení; klient předá session token. [Backend verifier](../server/lib/clerkIdentity.ts) používá jose, veřejné issuer JWKS, ověření podpisu RS256, platnosti, očekávaného issueru, session a přesného `azp` allowlistu. Nevyžaduje Clerk secret pro Backend API. Viz [Clerk ověřování](https://clerk.com/docs/guides/sessions/manual-jwt-verification). `userId`, role ani dekódovaný neověřený JWT z klienta nejsou autoritou.
2. Implementovaná atomická RPC `bootstrap_my_account()` odvodí identitu z JWT již ověřeného Supabase. Pro povolený issuer vytvoří mapování a minimální profil s rolí `player`, nebo vrátí existující. Unikátní constraint + transakce zajistí stejné UUID při souběhu, retry i refreshi. Nepřepisuje uživatelské jméno/avatar při dalším loginu.
3. Chybějící jméno vede na dokončení profilu s retry; žádná nekonečná kostra. Pozvánka si zachová lobby i soutěž přes callback a onboarding; přihlášení samo nepřidává členství.
4. Privátní DB resolver `current_player_id()` čte důvěryhodné `(iss, sub)` a aktivní chráněné mapování; jeho UUID použijí RLS i RPC. Chybějící/blokované mapování znamená zákaz. Přímé zápisy mapování a rolí jsou zakázané. Úzké privilegované funkce mají pevný `search_path` a minimální grants; service secret zůstává serverový.

Bootstrap nesmí čekat na webhook. [Clerk webhooks](https://clerk.com/docs/guides/development/webhooks/overview) jsou asynchronní, mohou se opakovat a přijít mimo pořadí. Případné zpracování ověřuje podpis, deduplikuje události a nesmí obnovit zrušenou identitu. `user.deleted` nesmí automaticky kaskádově smazat herní historii.

## 4. Členství, účast a role

Členství `active/left/removed` patří stálé lobby; pending žádost není aktivní členství. Účast patří konkrétní soutěži v lobby a nevzniká automaticky všem členům při nové sezoně. Doporučení T04: potvrzení eventové pozvánky atomicky vyřeší členství a účast; čekající/odebraný člen nemůže tipovat. Predikce vyžaduje vlastní UUID, aktivní členství i účast, správnou soutěž/zápas a uzávěrku. Stejný zápas v jiné lobby má nezávislý tip.

| Role | Serverem vynucené oprávnění |
| --- | --- |
| Nepřihlášený | Přihlášení a bezpečný náhled pozvánky; žádné soukromé tipy, seznamy či role |
| Hráč | Vlastní profil i bez členství; tipy v aktivní účasti před uzávěrkou; pořadí své soutěže; cizí tipy podle T05 |
| Správce lobby | Správa členství v rozsahu dnešního `012`; bez úprav cizích tipů, bodů či globálních výsledků |
| Vlastník lobby | Pořadatel, soutěže a členství vlastní lobby; vlastnictví odvozené z `owner_id` |
| Platformní admin | Kontrolovaný zápis/opravování sportovních výsledků; nepřepisuje hráčské tipy |

Role se nesmějí povyšovat editací profilu nebo klientskými metadaty. Partner/sponzor nedostává automaticky roli. Čtení profilů musí vynucovat DB, včetně přímého SELECT; historický široký profile SELECT z `001` není cílové soukromí bety. E-mail, Clerk ID a platformní role nejsou součástí hráčského profilu ostatních.

## 5. Dotčená implementace a přejímka

Dotčené: `src/lib/{supabase,auth,authLifecycle,db,productFeatures}.ts`, `src/{App.tsx,types.ts}`, AuthScreen/ProfileScreen/ProfileCommunityPanel, `server.ts`, `server/lib/{platformAuthorization,tournamentWinner}.ts`, `netlify/functions/{match-result,set-tournament-winner}.ts`. Inventář `auth.uid()` zahrne body guards/read modely. Převést `is_admin`, `is_lobby_member`, `create_lobby_secure`, `join_lobby_secure`, lifecycle RPC, `get_profile_summary`, `get_my_profile_overview`, `update_my_community_profile` a prediction policies. Účast je nový kontrakt. Původní migrace nepřepisovat; baseline určí T02/T07.

- [x] Skutečná Clerk registrace a dokončení vlastního profilu přes nativní Supabase Third-Party Auth; chráněná vazba na interní UUID a role `player` potvrzené read-only kontrolou hlavní DB a screenshoty vlastníka.
- [ ] Dvojí/souběžný bootstrap vrací jeden profil/UUID; další login nepřepíše úpravy.
- [ ] Neplatný/cizí/expirovaný token a podvržené UUID/role neprojdou; chybějící oprávnění vrací 401/403.
- [ ] Změna e-mailu/jména nemění členství, účast ani tipy; logout vyčistí citlivý klientský stav.
- [ ] Pozvánka přežije login/refresh; neplatná pozvánka a selhání profilu mají cestu k nápravě v CZ/EN.
- [ ] Člen bez účasti netipuje; dvě lobby se stejným zápasem neovlivní své tipy/body.
- [ ] Přímý API přístup nevydá cizí soukromé údaje; pouhé otevření profilu nezapisuje achievements.
- [ ] Migrace zachová počty, UUID a hodnoty historických tipů/bodů v témže projektu.

Aktuální read-only kontrola potvrzuje 15 profilů a dvě Clerk identity s rolí `player`. Vlastník ověřil opětovné přihlášení a členství obou Google účtů v nové lobby; třetí účet používá historický Supabase Auth a má dosavadní platformní roli admina. Rozšířená SQL sada s rollbackem ověřuje dva aktivní členy stejné lobby, oddělené editace tipů, zákaz cross-player zápisu, opakované připojení, ochranu vlastníka a zákaz tipování po známém výsledku i při budoucí uzávěrce. SQL claims jsou simulované; skutečné Clerk API 403 a celý živý herní průchod zbývají ověřit. Produkční Clerk instance/doména a nasazení zůstávají samostatným krokem.

**OWNER:** potvrdit doporučený minimální profil/soukromí a T04 vstup do účasti; před zpřístupněním mazání účtu určit zachování/anonymizaci historie a vlastnictví lobby. **TECH:** názvy tabulek/RPC, UUID mapování, validace, idempotence a testy jsou běžné implementační volby.
