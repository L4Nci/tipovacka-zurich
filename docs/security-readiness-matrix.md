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
| Platform admin vs. hráč/owner lobby | Server načítá autoritativní roli; role se nesmí přímo měnit klientem | Konkrétní negativní HTTP scénáře všech administrativních operací |
| RLS tabulek | Hostovaná metadata: všech 20 tehdejších public tabulek zapnuté RLS | Správnost každé policy a všech SECURITY DEFINER cest, ne jen zapnutí |
| Cizí lobby / odebraný člen | Existující kontroly členství a rollback sady z předchozí práce | Průchod se skutečnými účty a záměrně cizími ID napříč všemi RPC |
| Staré zápasové tipy/uzávěrky | Kontroly starého i nového řádku a výsledku v DB | Hraniční souběhy a kompletní kontrola každé alternativní cesty |
| Starý tip na vítěze turnaje | Potvrzený podmíněný nález přesunu kontextu, P3 | Kontext zmrazit, kontrolovat původní uzávěrku a přidat negativní test; oprava dosud neprovedena |
| Nový MMA pilot | 7 zdrojových/sync testů, skutečně prošlá bootstrap DB/RLS sada s ROLLBACK; ověřeno odstranění fixtures | Nasazená cesta se skutečným Clerk účtem a souběhy/živé výsledky |
| Klíče | Server-only proměnné, žádný server-secret env název ve frontendu při čtecí kontrole | Finální bundle, nastavení Netlify, logy a přístupová práva/rotace |
| Historické přihlášení | Kompatibilita Supabase UUID je záměrně stále v DB | Rozhodnutí o vyřazení, revokaci a obnově admin účtu; nespoléhat na skrytý starý formulář |
| Cookies/analytics | Analytics SDK zatím nezapojené | Skutečný cookie/network inventář, souhlasy, odvolání, správce, retence, export/výmaz a procesory |
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
