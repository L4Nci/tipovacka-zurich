# VIP, veřejný vstup a provozní minimum
Návrh 9. 11. 2026, doplněný rozhodnutím 10. 11. Navazuje na [P0/P1 audit](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/docs/public-launch-p0-p1-audit-2026-11-09.md) a [pracovní bloky](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/docs/public-launch-p0-p1-blocks-2026-11-09.md). Cena má novější potvrzený směr níže; detail funkcí/limitů není implementovaný paywall ani spuštěný prodej.

**Rozhodnutí vlastníka 10. 11.:** VIP má obsahovat možnost zvolit naše výchozí
bodování nebo nastavit vlastní. Toto je potvrzená součást P0. Původně zvažované
placené první založení, Free do pěti hráčů a cenový A/B test 29/49 Kč měsíčně
nahrazuje níže potvrzený směr. Prodejce zatím preferuje OSVČ, ale definitivně
nerozhodl.

**Následně potvrzeno 10. 11.:** první vlastní lobby a pozvaní hráči zdarma;
jeden osobní VIP **49 Kč měsíčně / 499 Kč ročně**, stejný obsah s volbou intervalu,
bez pětičlenného paywallu. Nynější peněžní provozní náklady vlastník uvedl 0 Kč.
[Schválený směr a otevřené parametry](billing-contract.md). Ostrý prodej není zapnutý.

## Co je potvrzené a co navrhujeme
Potvrzené: placené funkce už P0, bez sportovní výhody; viditelné odlišení platícího hráče; zájem o vlastní vzhled lobby, profilu a více vlastních lobby. Bezpečnost/RLS/klíče mají přednost před admin dashboardem; veškeré jeho UI a navigace jsou odložené. Odstranění starých loginů již proběhlo se zachováním historie; [výsledky](clerk-only-retirement-runbook-2026-11-09.md).

Doporučení: **jeden osobní produkt Fan VIP**, měsíční a roční varianta stejného produktu. VIP přidá kosmetiku hráči a možnosti pořadatele pouze v lobby, které opravdu vlastní. Ostatní členové hrají zdarma. Zatím žádné další Creator/Business tarify, virtuální měna ani prodej jednotlivých emoji.

## Navržená nabídka
| Oblast | Free | Fan VIP | Rozsah |
| --- | --- | --- | --- |
| Tipování a soutěžení | Základní hra, výsledky, pořadí, pozvánky a veřejné free výzvy | Stejná pravidla a šance | Free jádro nezpoplatňovat. |
| Profil | Dnešní emoji a základní barvy | Nové rámečky, palety, originální ikony a malý VIP odznak | P0 doporučení. Nezamykat dnešních39 emoji a10 barev. |
| Viditelnost v pořadí | Jméno/avatar | Odznak a decentní rámeček/barva | P0. Body, řazení a řešení shody stejné; VIP badge odlišit od sportovní trofeje. |
| Vlastní lobby | Dnešní výchozí vzhled | Připravená pozadí a akcent/paleta | P0. Čitelnost textu a významové barvy chránit šablonou. |
| Vlastní obrázek/logo | Systémový vzhled | Později vlastní upload | Samostatný malý bezpečnostní blok: Storage autorizace, typ/velikost souboru, sanitizace, práva a hlášení obsahu. |
| Počet vlastních lobby | První vlastní lobby zdarma — schválený směr | Více vlastních lobby; pracovní návrh pěti není potvrzený | Dnes žádný takový limit neexistuje; dosavadní lobby zachovat. Limity se netýkají počtu lobby, do kterých se hráč přidá. |
| Pravidla vlastní soutěže | Naše výchozí pravidla | Naše pravidla nebo vlastní nastavení bodování | Potvrzená součást VIP v P0 od10.11.; implementovat verzovaně pro celou soutěž, s náhledem a ochranou rozehraných/historických pravidel. Přesný editor není tímto tvrzením hotový. |
| Sdílení | Odkaz, QR, základní karta | Další vizuální šablony pozvánky/výsledku | Dobrý P1 doplněk. Základní sdílení musí zůstat snadné zdarma. |
| Osobní statistiky | Základní přehled | Hezčí historický souhrn/share karta | P1 kandidát; žádná placená exkluzivní data cizích otevřených tipů či predikční výhoda. |

První placený balík má mít několik viditelných a hotových věcí, ne dlouhý seznam „brzy“. Nenabízet „bez reklam“, když žádné reklamy nemáme. „Neomezené lobby“ neslibovat před provozním ověřením.

## Férovost a životní cyklus
- VIP je serverový nárok. Samotný emoji ve jménu ani klientské `isVIP` nesmí vyrobit placený odznak.
- Nové prémiové styly mají jednoznačné asset/style ID a serverovou kontrolu při změně; nespoléhat na schování tlačítka. Stávající Free data nepřepisovat.
- Jedna pravidlová verze platí pro všechny členy konkrétní soutěže. Výsledková oprava vždy používá tuto verzi.
- Pro veřejný provoz navrhujeme konfiguraci potvrdit před prvním tipem a potom ji uzamknout. V ladicím prostoru může existovat řízená změna s náhledem dopadu a verzovaným přepočtem podle zvláštního souhlasu; žádná tichá editace rozehrané soutěže.
- Body různých konfigurací nelze prostě sečíst do srovnatelného globálního žebříčku. Oficiální veřejná výzva má společná pevná pravidla.
- Konec VIP nezmění body, uložené tipy, pravidla rozehrané soutěže ani členství. Přestane odemykat nové prémiové konfigurace; osobní premium styling může po konci období přejít na Free. Nastavení nesmazat.
- Nadlimitní existující lobby se při expiraci nesmažou ani nezamknou pro hraní. Zablokuje se pouze další zakládání podle potvrzeného limitu.
- Při převodu vlastnictví se nová změna VIP vzhledu řídí nárokem nového vlastníka; již zveřejněná pravidla hry zůstávají. Přesný vizuální fallback při převodu/expiraci patří do nabídky před prodejem.
- Platform admin, lobby owner a VIP jsou tři nezávislé věci.

## Platby s malým třením
**Doporučení pro první implementaci:** Stripe Checkout + Billing pro předplatné; jedno místo pro správu v Customer Portalu. Hosted platební stránka je vhodný první krok: hotové UI, možnost karty a podporovaných peněženek; žádný vlastní formulář karty. Zobrazené metody závisí na zařízení, měně a nastavení.

Cesta: přihlášený hráč otevře konkrétní VIP výhodu → vidí nabídku/cenu/obnovování → zaplatí → vrátí se do stejného kontextu. Nevyžadovat druhý produktový účet. Předvyplnit známý kontakt, vybírat jen potřebné údaje. VIP nenutit před prvním bezplatným tipem.

Platba není garantovaně „jeden klik“; ověření bankou může být povinné. Měřit zahájení→potvrzenou platbu a konkrétní chyby, neslibovat pevný pokles konverze za každý klik. Návratová URL není doklad platby: nárok vzniká ověřenou serverovou událostí. Refund/storno/expirace i opakované události musí mít test.

[Stripe Checkout](https://docs.stripe.com/payments/checkout), [zákaznický portál](https://docs.stripe.com/customer-management).

**Proč zatím nepoužít Clerk Billing:** jeho aktuální přehled uvádí pouze USD, chybějící podporu daní/DPH a nemožnost dokončit 3DS challenge. Pro plánovaný evropský produkt je přímý Stripe vhodnější kandidát. Před integrací znovu ověřit aktuální stav. Neznamená to, že by Clerk přestal řešit přihlášení. [Clerk Billing FAQ](https://clerk.com/docs/guides/billing/overview).

Seller, cena, daně/země a předplatné musí být rozhodnuté před skutečným inkasem. Stripe Checkout/Billing sám nepřenáší všechny povinnosti prodávajícího na Stripe. Merchant-of-record varianta je případná samostatná alternativa s jiným obchodním vztahem; tento návrh ji neobjednává.

## Clerk Development → Production
Nynější testovací instance dovoluje localhost a používá development doménu. Pro veřejný start potřebujeme vlastní doménu, DNS, produkční instance keys, vlastní Google OAuth a nastavení redirectů. Production je typ prostředí; placený tarif je jiné rozhodnutí. Aktuální Hobby má vlastní doménu, zatímco některé funkce včetně Clerk MFA jsou placené. [Clerk deployment](https://clerk.com/docs/guides/development/deployment/production), [tarify](https://clerk.com/pricing).

Vývojové a produkční uživatelské databáze jsou oddělené; nestačí zkopírovat klíč a očekávat stejné subjekty. Před startem navrhnout ověřený přechod nynějších interních hráčských UUID, nových Clerk identit a admina. Nepropojovat účty automaticky jen shodou e-mailu. Při přechodu řízeně vyřadit nepotřebný dev issuer. [Clerk prostředí](https://clerk.com/docs/guides/development/managing-environments).

Nevytváří se druhá Supabase DB. Do veřejného startu může pracovní Netlify a localhost dál používat development konfiguraci. Produkční nastavení vyžaduje rozhodnutou/doménu vlastněnou provozovatelem a samostatné ověření.

## Veřejný vstup bez vlastní party
Upřesnění9.11.: cílově nabídnout Ligu mistrů, Premier League i roční UFC pod
jedním veřejným vstupem. Každá soutěž má vlastní pravidla a pořadí; body mezi
fotbalem a MMA se nesčítají. Kampaně vedou přímo do vybrané soutěže. Technické
ověření po formátech není rozhodnutí odstranit některou z cílové nabídky.

Ano globálnímu vstupu podle sportu: **Fotbal / Hokej / MMA → konkrétní soutěž nebo roční liga → její tipy a pořadí**. Např. PL a UFC2026 mají vlastní formát, nikoli smíchané raw body.

P0 cílově CL/PL/UFC free/no-prize; nejprve ověřit celý průchod na fotbale,
potom MMA, se společným vstupem a samostatnými pořadími. P1 rozšíří další
soutěže a katalog. MMA veřejný formát není stejný jako historický score-based
Official model a potřebuje vlastní kompatibilní adaptaci.

Tři vstupy mají tři zřejmé cíle:
1. Kampaní přivedený hráč → slíbená veřejná výzva → účet → první tip.
2. Osobní invite → správná lobby/soutěž → účet → připojení → první tip.
3. Pořadatel → účet → založení lobby → první pozvánka.

Po přihlášení zachovat původní cíl. Profilové bio, kosmetiky, VIP a dlouhý tutorial se nevyplňují povinně před prvním tipem. Základní pravidla a skutečný stav uzávěrky musí být srozumitelné před uložením.

## Admin přehled bez další aplikace
**Odloženo na výslovný pokyn vlastníka9.11.** Následující návrh je pouze
budoucí podklad, není úkolem před nynějším vývojem veřejného funnelu. Neřešit
teď dashboard, centrální Admin odkaz ani interní počet uživatelů. Ruční zápis
výsledků má v budoucím UI ustoupit jednoduchému stavu automatické synchronizace;
status UI se rovněž nyní nestaví. Backendové kontroly a alerty nejsou tímto
odloženy. Stávající endpointy ani data se tímto dokumentem nevypínají/nepřepisují.

V repozitáři již existuje [AdminOperationsPanel](/Users/viktor/Documents/Codex/2026-06-08/github-plugin-github-openai-curated-cd/work/tipovacka-zurich/src/components/AdminOperationsPanel.tsx) a `get_admin_operations_summary`. Jeho rozšíření ani navigaci nyní neimplementovat. Starší následující seznam je budoucí námět; aktuální provozní minimum řeší alerty a runbook bez nového UI.

Dnešní UI „Uživatelé“ stále čte `users` z `auth.users` přes
`get_admin_operations_summary`; po retirementu proto ukazuje0. Ověřeno na
nasazené definici RPC a v Safari. Není to počet Clerk účtů. Zvlášť existuje15
historických+současných profilů a2 enabled Clerk identity. Opravu zdroje metriky
řešit jako malý samostatný úkol; rozlišovat registraci, login a skutečný tip.

Minimum před startem:
- Dnešní počet účtů/nových registrací a skutečně tipujících; login není aktivace.
- A3/28 a návrat podle příležitosti, zvlášť private/Official; první baseline až po správném sběru hráčských událostí.
- U každého provideru poslední pokus, poslední úspěch, running/completed/error, bezpečná stručná chyba a stáří dat. Zelený HTTP200 celého cronu neznamená úspěch všech lig.
- Aktivní VIP, potvrzené nákupy, expirace/refundy a selhání webhooku; žádné číslo karty či soukromé checkout URL.
- Poslední záloha a jednoduchý doložený restore postup; mimo UI stačí bezpečný runbook a řízená zkouška.

„Kompletní logy“ nahradit účelnými redigovanými provozními událostmi s retencí a přístupem pouze pro admina. Žádné JWT, klíče, emailové obsahy, osobní join kódy či celé URL do analytiky. Rozsáhlé ref/kanálové dashboardy a replay nejsou nutné pro P0.

## Právní texty a kredity v úsporném UI
Podmínky, soukromí a přehled licencí mají mít stabilní odkazy v patičce/menu; údaje potřebné pro registraci a platbu také u příslušného kroku. Není potřeba velký právní blok uvnitř každé herní karty.

U MMA fotek však UFCalendar výslovně požaduje autora/licenci u zobrazení fotografie a označení úprav. Samotné pohřbení do obecných podmínek nepovažujeme za ověřené splnění. Návrh: jeden kompaktní kreditní prvek pro kartu + detail licencí; použití samotnéhoⓘ ověřit pro konkrétní podmínky. Stávající kredity neodstraňovat, dokud není varianta potvrzená. [UFCalendar§5–6](https://www.ufcalendar.com/developers/terms).

Umístění kreditu nenahrazuje oprávnění k použití. NHL/klubové značky se řeší zvlášť podle existujícího auditu. Právní texty budou návrhy k odborné kontrole.

## Navazující bloky a rozhodnutí
1. B01 uzavřít dependency patch a nezávislou kontrolu.
2. B02 Clerk-only přístup, určený Clerk admin, odstranění starých loginů/sessions se zachováním historie; cílené RLS/keys kontroly.
3. B03 potvrdit jeden VIP a přesný P0 seznam, limit lobby, model/cenu/seller.
4. B04–B06 identity nároků, testovací checkout a životní cyklus. Vlastní bodování je potvrzené v P0; realizovat jej jako samostatný ověřený blok.
5. B10/B11 jedna veřejná výzva; B12–B16 čtyři jazyky, brand, mobilní funnel a minimální měření.
6. Před startem runtime cookie inventář, základní provozní dohled/obnova a odborné uzavření prodeje. Admin panel až na nové zadání.

**Neuzavřené:** cena/intervaly, přesný limit nových lobby, přesný rozsah editoru potvrzeného vlastního bodování a zda vlastní upload patří do prvního VIP, seller, finální doména. Žádná z těchto položek neblokuje schválené bezpečnostní opravy.

