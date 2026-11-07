# Bezpečnostní připravenost — kontrolní matice

6. 11. 2026. **Celý produkt není bezpečnostně uzavřený.** Žádný rozumný audit
neslibuje všechny možné scénáře. Stav musí stát na konkrétních ověřených hranicích.

Standard zdrojový sken cf13e29d-cbd4-4b15-adee-4bbd7b87ec24 má dílčí pokrytí.
Bezpečnostní subagent a jeho nezávislý pracovník narazili na limit; hlavní agent
převzal ověření jejich konkrétního nálezu a report. Neproběhl kompletní nezávislý
penetrační test ani certifikace veřejného provozu.

| Hranice | Doložené ověření | Co zbývá |
| --- | --- | --- |
| Clerk podpis/issuer/origin | Čtecí revize verifieru, existující lokální testy z předchozí etapy | Produkční Clerk, platné/expirující/revokované skutečné session |
| Platform admin vs. hráč/owner lobby | Autoritativní role, 17 Clerk testů; všech 7 nasazených admin endpointů odmítlo chybějící/neplatný token | HTTP průchody s platným skutečným hráčským a admin Clerk účtem napříč operacemi |
| RLS tabulek | Hostovaná metadata: všech 20 tehdejších public tabulek zapnuté RLS | Správnost každé policy a všech SECURITY DEFINER cest, ne jen zapnutí |
| Cizí lobby / odebraný člen | Existující kontroly členství a rollback sady z předchozí práce | Průchod se skutečnými účty a záměrně cizími ID napříč všemi RPC |
| Staré zápasové tipy/uzávěrky | Kontroly starého i nového řádku a výsledku v DB | Hraniční souběhy a kompletní kontrola každé alternativní cesty |
| Starý tip na vítěze turnaje | Opraveno v hostované DB migrací `20261106165806`; útok potvrzen před opravou, po opravě odmítnut; rollback sada a nezávislá revize | Skutečné prohlížečové relace a hraniční souběhy nejsou touto SQL sadou pokryté |
| Nový MMA pilot | 7 zdrojových/sync testů, skutečně prošlá bootstrap DB/RLS sada s ROLLBACK; ověřeno odstranění fixtures | Nasazená cesta se skutečným Clerk účtem a souběhy/živé výsledky |
| Klíče | Server-only proměnné; finální frontend bundle neobsahoval 6 kontrolovaných secret hodnot | Nastavení Netlify, logy a přístupová práva/rotace |
| Závislosti | `npm audit`: 11 hlášených balíčků, včetně 1 critical a 6 high; nepřibyly instalací překladů | Dosah na aplikaci zatím není potvrzen; samostatná [triage #26](https://github.com/L4Nci/tipovacka-zurich/issues/26) |
| Historické přihlášení | Kompatibilita Supabase UUID je záměrně stále v DB | Rozhodnutí o vyřazení, revokaci a obnově admin účtu; nespoléhat na skrytý starý formulář |
| Cookies/analytics | Analytics SDK zatím nezapojené; portréty načítají veřejné soubory z `d33t2v9cbr12gb.cloudfront.net` bez referreru | Skutečný cookie/network inventář včetně externího image CDN, souhlasy, odvolání, správce, retence, export/výmaz a procesory |
| Zneužití a kapacita | Dílčí aplikační a provider limity | Rate/abuse test, zátěž před uzávěrkou, quota alerty, dohled |
| Obnova a incident | Předchozí zálohy existují | Vyzkoušet obnovu, revokaci klíče, zastavení zápisů a návrat verze |

Nové MMA SQL testy kontrolují vlastní a cizí lobby, immutable kontext,
podvržení bodů, zákaz hráčského zápisu sportovních faktů, stale lineup,
změnu soupeře, opravu výsledku, self-healing bodů, staré snapshoty a uzávěrku.
Bootstrap sada skutečně prošla před prvním importem; SQL fixtures jsou jen pro
prázdný MMA katalog. Scope a limity popisuje [runbook](mma-pilot-runbook.md).
To nezavršuje nezávislý audit celé aplikace ani přijetí produktu vlastníkem.

Kvantifikace pokrytí se nesmí nahrazovat tvrzením „všechny možné i nemožné
scénáře“. Před kampaní se tato matice uzavírá po konkrétních řádcích.

## Oprava sezonního vítěze, 6. 11. 2026

`supabase/tests/longterm_prediction_context_guard.sql` skutečně prošla v jediné
transakci zakončené ROLLBACK po nasazení opravy. Ověřuje přesun zamčeného tipu
s 10 i 0 body, přesuny otevřeného tipu mezi lobby/soutěžemi, změnu identity,
podvržení bodů, přesnou uzávěrku, cizího hráče i v rolích owner/admin, odebrané
a odešlé členy, čekajícího žadatele a zákaz mazání. Běžný insert, opakovaný upsert,
změna volby před uzávěrkou a serverové bodování 10 → 0 → 10 zůstaly funkční.
Nezávislý read-only reviewer nenašel obcházení ani regresi této opravy.

Znovu prošla `supabase/tests/clerk_identity_bridge.sql` a `npm run test:clerk`
(17 testů a autorizační scénáře endpointu sezonního vítěze). SQL sady emulují
ověřené claims; samy neověřují podpis JWT ani skutečný OAuth průchod.
Otisky všech řádků `predictions`, `matches`, `profiles` a obsah
`longterm_predictions` před a po zásahu byly stejné. Testovací fixtures nezůstaly.

Sedm nasazených admin endpointů odmítlo všech 14 HTTP pokusů bez přihlášení
nebo s neplatným Bearer tokenem (vždy 401). Použita neexistující ID a pouze
preview/dry-run požadavky. To neověřuje každou akci platného přihlášeného účtu.
Ve finálním statickém JS buildu nebyla nalezena žádná ze šesti neprázdných
serverových secret hodnot kontrolovaných proti lokálnímu `.env`; hodnoty se
nevypisovaly. Audit logů a rotace klíčů zůstávají samostatné úkoly.

Supabase advisor stále hlásí záměrně veřejné feature flags, klientská SECURITY
DEFINER RPC a vypnutou ochranu kompromitovaných hesel historického Supabase Auth.
Pouhá přítomnost těchto upozornění nedokazuje chybu ani jejich bezpečnost;
u dalších RPC a zbývajících řádků matice práce pokračuje.
