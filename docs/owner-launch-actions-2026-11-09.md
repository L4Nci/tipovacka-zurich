# Co potřebujeme od Viktora před spuštěním

Stav podkladů 9. 11., doplněno 10. 11. 2026. Tento seznam doplňuje [P0/P1 bloky](public-launch-p0-p1-blocks-2026-11-09.md), nenahrazuje jejich ověření. Je to rozhodovací a předávací seznam; ne potvrzení hotového P0/P1 ani pokyn k publikaci.

## Čtyři rozhodnutí, která odblokují další práci

| Pořadí | Viktor dodá / rozhodne | Co už víme | Co připraví Codex |
| --- | --- | --- | --- |
| 1. Nabídka VIP | Zbývající prodejní parametry: přesný P0 seznam kosmetiky, kvóta nových VIP lobby, rozsah editoru bodování, případný upload a pravidla obnovy/expirace. | Jeden osobní VIP **49 Kč měsíčně / 499 Kč ročně**, první vlastní lobby a pozvaní hráči zdarma jsou potvrzené 10. 11.; nahrazuje test 29/49 Kč měsíčně. Vlastní nebo naše bodování pod VIP je potvrzené; platba nedává osobní výhodu v bodech. Počet VIP lobby není schválený a stávající historie zůstává. | Stručný finální prodejní kontrakt, nároky a životní cyklus dle [billing kontraktu](billing-contract.md). Bránu teprve vybrat; nynější peněžní provozní náklady vlastník uvedl 0 Kč. |
| 2. Prodávající | Provozovatele/prodávajícího, veřejný kontakt, země prvního prodeje a věkovou politiku; podnikatelskou formu potvrdit s odborníkem. | Zatím Viktor; 10.11. předběžně preferuje OSVČ, ale OSVČ/firma není rozhodnutá. Žádnou identitu ani daňový režim nevymýšlíme. | Návrhy podmínek, soukromí, cookie inventáře, reklamací/odstoupení a exportu/výmazu podle skutečného fungování. |
| 3. Doména | Vybrat a vlastnit finální doménu; umožnit nastavení DNS v příslušném účtu. Nákup provádí nebo výslovně schvaluje Viktor. | Vlastní doména zatím není. Pracovní Netlify lze dál používat pro ladění. | Připravit přesný DNS/Clerk production/OAuth/redirect plán; ověřit bezpečný přechod nynějších profilů. Nevzniká druhá Supabase DB. |
| 4. První test | Jeden dosažitelný organizátor (např. Kobra, pouze pokud je kontakt), pět dobrovolníků jako velikost prvního testu a jejich souhlas s účastí. Určit vlastní/testovací účty pro výluky. | Cílový veřejný vstup je CL/PL/UFC. První distribuci testujeme v jednom jazyce a soutěži. Pět lidí není prognóza konverze. | Jednu ukázku, schválený veřejný odkaz a [malý růstový experiment](p1-community-experiment-pack-2026-11-09.md). Zprávy a posty zůstávají koncepty do schválení. |

Není nutné odpovědět dlouhým zadáním. Stačí vyplnit čtyři řádky: **VIP / prodávající a země / doména / první organizátor**. Identifikační podklady patří do bezpečného pracovního předání; hesla, klíče a ověřovací kódy neposílat do chatu.

## Co uděláme my a co potřebuje odborníka

| Výstup | Codex | Viktor / externí kontrola | Podmínka přijetí |
| --- | --- | --- | --- |
| Bezpečnost, RLS, izolace lobby, klíče a dependency patch | Cílené opravy, negativní testy, přezkoumatelný důkaz a seznam nepokrytých scénářů. | Viktor ověří reálný průchod; externí penetrační test může dodat nezávislé ověření před větším dosahem. | Uzavřené konkrétní nálezy a runtime cesty, nikoli tvrzení „všechny možné scénáře“. |
| Platby | Testovací Checkout/webhook, serverové nároky, refund/expirace/duplicitní události podle rozhodnuté nabídky. | Viktor zřídí a ověří účet platební služby jako skutečný prodejce. Účetní posoudí doklady, DPH/země; právník prodejní vztah. | Testovací nákup a odnětí nároku fungují; nabídka a právní podklady schválené před skutečným inkasem. |
| Právo a soukromí | Inventář skutečných technologií, návrhy textů a technické procesy. | Český právník se zkušeností s online službou zkontroluje spotřebitele/GDPR/věk; účetní své daňové části. | Text odpovídá skutečnému provozu a prodávajícímu. Souhlasová lišta sama neuzavírá právo. |
| Sportovní data, fotky a značky | Registr zdrojů, verzí podmínek, použití a kreditů; technická omezení/cache podle podmínek. | Viktor zajistí případná oprávnění poskytovatelů; sporné komerční použití a atributy zkontroluje právník/držitel práv. | Každý používaný typ obsahu má doložený titul a splněné podmínky. Odkaz do patičky nepřebije povinný kredit u fotky. |
| CS/EN/DE/PL | Katalogy, jazykové routy, metadata, zachovaný kontext po loginu a test dlouhých textů. | Člověk znalý příslušného jazyka zkontroluje celé flow a význam pravidel; právní překlady odborník. | Od kampaně přes registraci a tip po výsledek/checkout nezůstává smíchaný nebo významově odlišný text. Připravený katalog není automaticky přijatý překlad. |
| Brand, landing a ukázka | Sjednotit tokeny, skutečné bezpečné ukázky, texty, přístupnost a mobilní testy podle stávajícího brandkitu. | Viktor vybere finální variantu; externí designér je volitelný pro originální značku, není podmínkou dalšího kódování. | Ukázka není vymyšlené používání; žádné soukromé údaje, cizí klipy bez oprávnění nebo fiktivní partnerství. |
| Provoz a měření | Minimální alerty, zálohovací/obnovovací důkaz, redigované logy a pravdivé hráčské události. | Viktor určí příjemce alertů a odsouhlasí účel/retenci s právní revizí. | Selhání dílčího provideru se neztratí v HTTP 200; scoring cron nevypadá jako návrat hráče. |

Konkrétní právní a licenční otázky jsou v [právně-technické revizi](public-launch-security-privacy-legal-2026-11-09.md). Tento dokument nedává nové právní stanovisko.

## Co už znovu nezařizovat

- Staré Supabase loginy jsou vyřazené; historická data zůstala. [Retirement runbook](clerk-only-retirement-runbook-2026-11-09.md). Nežádat znovu mazání historických profilů jen proto, že nejsou novým Clerk účtem.
- Pracujeme v jednom existujícím Supabase projektu. Druhou beta DB nezakládat.
- Souhrn chybějících tipů podle lobby a roční UFC už mají implementovaný základ. Nenavrhovat je znovu jako novou růstovou funkci.
- Admin dashboard, jeho navigace, metrikové UI i budoucí barevný status cronu jsou odložené. Potřebné bezpečnostní a provozní kontroly běží nezávisle.
- Referenční weby a další skills nejsou blokátor. Používáme připravený obsah, brandkit a konkrétní ověření výsledku.

## Co odškrtne Viktor při společné přejímce

Tohle je plán přejímky, ne záznam provedených testů. U každého kroku se zaznamená verze, zařízení, datum a výsledek.

- [ ] Na svém iPhonu/Safari a s druhým testerem na Androidu projít veřejný odkaz → přihlášení → správná soutěž → uložený tip; bez povinné editace profilu.
- [ ] Soukromá pozvánka zachová správnou lobby; cizí účet neuvidí nepovolená data. Schvalovaná žádost se nevydává za hotové členství.
- [ ] U CL/PL i UFC jsou srozumitelná pravidla, skutečný termín a automatický výsledek/oprava. Výsledky se ručně nezadávají jako běžný provoz.
- [ ] VIP má přesně slíbenou kosmetiku/owner funkci, platba ani expirace nemění body či členství; test nákup/refund prošel.
- [ ] Právník/účetní a jazykoví korektoři uzavřeli své konkrétní podklady; neoznačovat jejich kontrolu za hotovou bez potvrzení.
- [ ] Schválit konkrétní verzi k vydání a konkrétní veřejný příspěvek. Tento checklist ani `/goal` sám žádný příspěvek nepublikuje.

## Krátké předání po každém bloku

**Co funguje → důkaz/test → známá mezera → nejbližší rozhodnutí od Viktora.** P0 se uzavře až podle [B17](public-launch-p0-p1-blocks-2026-11-09.md#b17--acceptance-a-veřejné-vydání--sm), P1 experiment až po dvou skutečných příležitostech a vyhodnocení. Příprava dokumentu nebo překladu není důkaz dokončené kampaně.
