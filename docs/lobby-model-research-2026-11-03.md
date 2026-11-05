# Tipovačka — parta, soutěže, pozvánky a kosmetika

3. 11. 2026 · Rešerše uzavřená přijetím modelu B. Produktová volba je přijatá; implementace a placené balíčky tím schválené nejsou.

Vlastník po teoretickém porovnání výslovně přijal **B: stálou lobby pořadatele se soutěžemi uvnitř a pozvánkou přímo do soutěže**. Stejný model umožní také Kobru, jednorázového sponzora a branding. Výběr se znovu neotvírá; aktuální cílová logika je v [roadmapě](ROADMAP.md#accepted-organizer-model--2026-11-03) a úkoly v [aktivním plánu](product-restart-plan.md). Prototypy nyní nestavíme.

## Přehled

**Přijatý výsledek: stálá parta, uvnitř samostatné soutěže a pozvánka přímo do konkrétní soutěže.** Profil a kosmetika patří hráči napříč soutěžemi. Pořadí a body patří konkrétní soutěži party.

Vlastník potvrdil **Ligu mistrů jako první pilot, Premier League jako následující soutěž**. Model B je produktovým základem pro opakované hraní, pozvánky a pozdější kosmetické Premium. Přijetí modelu neurčuje placené balíčky ani konkrétní přestavbu stávajícího kódu.

Pozvánka na nový event není podmíněná vytvořením nové komunity. Lze poslat novou pozvánku „Hraj s námi Ligu mistrů“ a zachovat partu, její historii i profil hráče. Na druhou stranu samotná stálá parta nezaručuje návrat: nabídka další soutěže musí mít jasnou příležitost a další krok.

**Síla závěru:** doporučení odpovídá doloženým produktovým vzorům a současnému základu aplikace. Nemáme srovnávací data o retenci ani platbách těchto modelů v Tipovačce. Neexistuje zde prokázaný univerzálně nejlepší trychtýř.

### Co už umožňuje náš základ

V aktuálním kódu je lobby trvalou skupinou a přes `lobby_tournaments` se připojuje ke sdíleným turnajům. Tipy obsahují lobby a zápas, pořadí se načítá pro turnaj. Nemusíme kvůli stálé partě automaticky zahazovat celou architekturu. Ověřit či doplnit je potřeba hlavně cestu z pozvánky, účast v konkrétní sezoně, přehled aktivních soutěží a návaznost na další event. Viz [načítání lobby](../src/lib/db.ts), [správa turnajů](../supabase/migrations/017_tournament_management.sql).

## Srovnání produktů

Následující fakta jsou z veřejné dokumentace provozovatelů, nikoli z přihlášeného testu. Vlastnosti konkurence samy nedokládají obchodní úspěšnost.

### Superbru — nejbližší popsaný model

Dokumentace odděluje trvalý Club od poolu konkrétního turnaje. Klub uchovává historii pořadí a medailí. Při založení poolu se mohou převzít klubové údaje a pozvat někteří nebo všichni členové. Členství v klubu není nutné pro účast v poolu a člen si vybírá, co hraje. [About Clubs](https://www.superbru.com/home/about_clubs.php)

Jiná oficiální FAQ uvádí, že jedna sada tipů do turnaje platí pro všechny pooly hráče v daném turnaji. To je skutečná alternativa k našim samostatným tipům v každé lobby. [Pools FAQ](https://superbru.reamaze.com/kb/pools)

**Co si vzít:** partu lze zachovat a přitom znovu zvát na jednotlivé eventy. **Co nepřebírat automaticky:** všechny role, hosty, vícenásobné pooly a globální tipování; pro pilot by mohly přidat zbytečné volby. Stránka o Clubs je starší, bez data poslední aktualizace; aktuální dostupnost celého klubového průchodu nebyla ověřena přihlášením.

### Kicktipp — pokračování komunity do nové sezony

Restart vytvoří novou tipovací sezonu existující hry. Hráči pokračují bez nového přihlášení a staré výsledky zůstávají v archivu. Minulý vítěz může dostat medailový tag v nové sezoně. [Tips before restart](https://www.kicktipp.com/info/service/help/2/203)

**Co si vzít:** nová sezona může začínat novými body a přitom zachovat sociální paměť. Medaile je doložený statusový prvek, nikoli doklad ochoty za takový prvek platit. Tento zdroj nedokládá univerzální klub napříč všemi sporty.

### ESPN Tournament Challenge — obnova eventové skupiny

Po obnovení loňské skupiny zakladatelem se podle FAQ původní účastníci automaticky přidají. Samotná platná účast v aktuálním eventu ale vyžaduje letošní bracket a jeho přiřazení ke skupině. [Obnova skupiny](https://support.espn.com/hc/en-us/articles/4755374690452-How-do-I-re-join-last-year-s-Group), [vstup do skupiny](https://support.espn.com/hc/en-us/articles/360040660171-How-to-Join-a-Tournament-Challenge-Group)

**Co si vzít:** rozlišovat členství v komunitě a skutečnou účast v aktuální soutěži. Automatické obnovení nepovažovat za důkaz aktivního hráče. ESPN TC je jiný formát hry než naše tipování skóre.

### Discord — inspirace pro status a nákup

Discord prodává dekorace profilu, které lze používat i bez aktivního Nitro předplatného; některé členské dekorace mají odlišná pravidla. Boosty zase propojují výhody komunity s odznakem podporovatele na profilu. [Avatar Decorations FAQ](https://support.discord.com/hc/en-us/articles/13410113109911-Avatar-Decorations-FAQ), [Server Boosting FAQ](https://support.discord.com/hc/en-us/articles/360028038352-Server-Boosting-FAQ)

**Co si vzít:** oddělit vlastněnou kosmetiku hráče, předplatitelský status a vzhled celé party. Není nutné všechno prodávat stejným způsobem. Discord není sportovní tipovačka; tyto zdroje nedokládají naše budoucí konverze ani cenu.

### Dvě cesty pro Tipovačku

| Model | Silná stránka | Náklad nebo riziko |
| --- | --- | --- |
| A — nový event, nová lobby | Jedna srozumitelná pozvánka na konkrétní hraní | Znovu sestavujeme partu a tříštíme historii; opakované členství může být překážka. Globální kosmetika je ale možná i zde |
| B — stálá lobby pořadatele, pozvánka do konkrétní soutěže | Kontext eventu i pokračující skupina; samostatné body a pořadí, navazující historie a identita | Musíme dobře vysvětlit vztah lobby a soutěže a odlišit členství od účasti. Obecná pozvánka bez kontextu může vstup zhoršit. **Přijato vlastníkem** |

V tomto dokumentu nyní sjednocujeme označení s debatou: A je nová lobby pro každý event, B je stálá lobby s eventovými pozvánkami. Původní varianta C byla zpřesněním vstupu do B; nenavrhujeme třetí režim. Nová lobby v B vzniká při změně pořadatele nebo sociálního okruhu — například kamarádi versus kolegové — nikoli povinně při změně sportovního kalendáře.

### Kobra, sponzor a cena v jediném modelu

**Přijatý model B: lobby pořadatele → jedna nebo více soutěží → účastníci a pořadí dané soutěže.** Pořadatelem může být člověk, hospoda i platforma; sponzor může konkrétní soutěž podpořit, aniž by tím získal správcovská oprávnění.

| Příklad | Použití stejného modelu |
| --- | --- |
| Parta kamarádů | Vlastní lobby, Liga mistrů a později Premier League; historie zůstává |
| Hospoda Kobra | Lobby Kobra s vlastní identitou; uvnitř Liga mistrů, později hokej. Každá soutěž má vlastní pořadí a může mít deklarovanou cenu |
| Jednorázová sponzorovaná akce | Lobby pořadatele má jedinou soutěž, jejího partnera a cenu. Pozvánka vede rovnou do soutěže. Po skončení zůstane archiv; další soutěž není povinná |

Branding lobby vyjadřuje dlouhodobou identitu pořadatele; partner a cena patří konkrétní soutěži. Pro hráče zůstává stejný průchod přihlášení, tipu a pořadí. Obchodní možností je pozdější placený vzhled pro pořadatele, vedle kosmetiky jednotlivého hráče; cena ani balíček nejsou určené.

**Proč B vítězí pro současné zadání:** pokrývá pravidelné hraní Kobry a přitom dovoluje odehrát pouze jeden sponzorovaný event. A má výhodu přirozeně jednoduchého jednorázového cyklu a odděleného publika každé akce; pro Kobru ale znamená opakované vytváření skupiny nebo dodatečný mechanismus její obnovy. Nevýhodou B je existence lobby i u jednorázové akce. Tu není třeba hráči nabízet jako další rozhodnutí — eventová pozvánka ukáže pořadatele a dovede přímo do hraní.

Příbuzný vzor sponzorovaných klubů dokumentuje [Superbru](https://www.superbru.com/home/about_clubs.php). [Kicktipp Professional](https://www.kicktipp.com/info/professional/) nabízí firemní vzhled a hraní napříč soutěžemi. Tyto nabídky dokládají použitelné produktové vzory, nikoli poptávku nebo výnosy Tipovačky.

Sponzorované použití není další herní engine, ale má dodatečné požadavky na zveřejnění, oprávnění, pravidla cen a provoz. Ty zůstávají mimo první pilot; nepředpokládáme vlastní domény, firemní hierarchie, partnerský portál ani správu předávání cen. Existující lokální Official Events mají oddělenou doménu podle [současné dokumentace](official-public-tournaments.md); tento budoucí návrh je nepřepisuje a žádnou migraci nepovoluje.

### Co říká obecnější výzkum

Ren a kol. ve studii z roku 2012 uvádějí šestiměsíční experiment, ve kterém funkce podporující identitu skupiny a mezilidské vazby zvýšily návštěvnost a vztah ke komunitě. To podporuje zkoumání společné identity a historie; není to test našich variant, dnešní sportovní aplikace ani kosmetických plateb. Z této studie neodvozujeme očekávané procento zlepšení. [Publikovaný abstrakt, MIS Quarterly](https://aisel.aisnet.org/misq/vol36/iss3/11/)

## Doporučený průchod a monetizace

### Dvě vstupní cesty, stejná hra

**Pozvaný hráč:** odkaz na soutěž → „Fotbaloví experti · Liga mistrů · od tohoto kola“ → přihlášení a minimum profilu → první uložený tip → vlastní pozice a další zápasy.

**Nový organizátor:** stránka Ligy mistrů → „Hrát s vlastní partou“ → přihlášení → název party a jasná výchozí pravidla → pozvánka → první společně odehrané kolo.

Pozvánka má zachovat kontext party a konkrétní soutěže přes přihlášení, registraci i návrat. Ve veřejném náhledu stačí název, soutěž, začátek a pravidla; seznam členů a jejich tipy patří až oprávněným hráčům. Žádný obchod ani dlouhý profil před prvním tipem.

Pro jednoduchý pilot navrhujeme jedno členství v partě a výslovnou účast v každé soutěži. Nový příchozí před potvrzením vidí, ke které partě se přidává; členství ho automaticky nepřihlásí ke všem budoucím sportům. Varianta pouze eventového hosta zůstává otevřená, dokud ji neodůvodní konkrétní skupiny. V pilotu nechceme dvě různé pozvánky, které si musí začátečník vybírat.

### Návrat v rámci eventu

**Další zápasy → tip → výsledek a změna vlastního pořadí → další kolo.** Domovská stránka má přednostně ukázat, co je potřeba tipnout, kdy to končí a jak si hráč stojí. Soutěžní tabulka má ukázat kosmetiku i ostatní hráče bez vytlačení podstatných údajů.

Připomenutí dalšího kola musí být samostatná produktová volba s určeným kanálem. Denní návštěvnost není vhodný jediný cíl pro soutěž s nepravidelnými hracími dny.

### Přechod na další event

Po skončení: konečné pořadí a získaná trofej → jasná nabídka „S touhle partou hrát Premier League“ → organizátor spustí novou soutěž → stávající členové se přihlásí a mohou pozvat nové lidi.

Tím vzniká nová příležitost sdílet pozvánku bez kopírování celé party. Důvod ke sdílení je nová hra, rivalita a konkrétní datum; samotné generování nových lobby tyto důvody nezaručuje. Další event se nemá přidávat jen proto, že pro něj existuje API.

### Co má přetrvat a co začíná znovu

| Přetrvává | Začíná zvlášť pro soutěž / sezonu |
| --- | --- |
| Účet, zobrazované jméno, avatar a vlastněná kosmetika | Účast hráče, tipy a bodované období |
| Členství v partě, identita a dostupná historie party | Pořadí a pravidla konkrétního hraní |
| Získané trofeje s uvedením soutěže a sezony | Nová pozvánka a příležitost přizvat další hráče |

Souhrn kariéry může ukazovat získané trofeje. Prostý součet fotbalových, MMA a F1 bodů do globálního pořadí zatím nenavrhujeme. Trofej konkrétní party není automaticky veřejná globální medaile.

### Jakou monetizaci má smysl ověřovat

| Nabídka | Proč by ji někdo mohl chtít | Co ještě musíme prokázat |
| --- | --- | --- |
| Osobní kosmetika, případně jednorázově | Rámeček/avatar/jmenovka viditelné v pořadí; přenáší se mezi partami a eventy | Hráči ji vnímají, chtějí ji používat a jsou ochotni skutečně zaplatit |
| Supporter / VIP předplatné | Průběžný status a pravidelná nová hodnota pro opakované hráče | Existuje dostatečně časté používání a trvalá hodnota; jen nový název VIP není důvod k předplatnému |
| Vzhled celé party placený jedním členem | Někdo podpoří společný prostor a všichni vidí vlastní identitu party | Kdo je ochoten platit a zda výhoda přežije event; analogie Discordu není doklad poptávky |

**Pracovní pořadí:** nejprve ověřit viditelnost a používání několika kosmetických variant, následně jeden jednoduchý placený koncept. Nezačínat třemi měnami, úrovněmi VIP, battle passem ani platebním systémem. Ceny a balíčky tímto nejsou vybrané. Budoucí ekonomika musí počítat s náklady na sportovní data, provoz a platby; máme zkoumat skutečné výnosy, nikoli pouze registrace.

Herní výsledky a získané trofeje musí být od koupeného statusu rozeznatelné. Monetizace nemění body ani uzávěrky. Případná ukázka připravované kosmetiky bude výslovně označená jako ukázka; kliknutí na ni není uskutečněný nákup ani důkaz ochoty platit.

### Co ověřit před přestavbou

1. **Produktový výběr hotový:** A a B byly porovnané teoreticky na scénářích party, Kobry a jednorázového sponzora; vlastník přijal B. Před stavbou dopracovat vstupní kontrakt a otevřená pravidla pilotu. Žádné prototypy nyní nestavět; případné uživatelské ověření bude až samostatně zvolený další krok.
2. **První funkční pilot:** vlastník přijal Ligu mistrů 2026/27 na tři celá hrací kola, všichni od nuly a bez bodovaného tipu na sezonního vítěze. Konkrétní kola a termíny vybrat až po dokončení aplikace. Po pilotu zhodnotit srozumitelnost, tipování, návrat a nutné ruční zásahy.
3. **Ověření návratu mezi eventy:** nabídnout téže partě Premier League. Bez druhé soutěže první pilot prokáže jen návrat na další kolo, nikoli životaschopnost celého modelu party.
4. **Později nezávislé skupiny:** pracovní návrh tři až pět různých organizátorů bez osobní podpory autora. Výsledky brát kvalitativně a jako první signál, nikoli statistický důkaz nadřazenosti modelu nebo prodejnosti.

### Minimum měření

| Otázka | Co budeme sledovat | Hranice interpretace |
| --- | --- | --- |
| Funguje pozvánka? | Z unikátních zaznamenaných otevření pozvánky kolik lidí dokončí první tip; oddělit nové a vracející se účty | Známe otevření odkazu, ne všechny příjemce v cizím chatu. Před přihlášením bude rozlišení návštěvníků jen přibližné |
| Vznikne společná hra? | Kromě organizátora tipuje alespoň jeden další hráč před uzávěrkou stejného kola | To je minimální provozní definice aktivní party, nikoli důkaz obchodního úspěchu |
| Vracejí se hráči? | Z účastníků s tipem v prvním sledovaném kole kolik tipuje v následujícím dostupném kole | Zohlednit hrací kalendář; nepřevádět pauzu mezi koly na automatický churn |
| Přežije parta event? | Kolik původních účastníků začne v další nabídnuté soutěži; zda pozvou skutečně nové hráče | Odlišit obnovené členství, přijetí pozvánky a první tip. Přechod mezi různými sporty může mít nižší zájem |
| Má kosmetika hodnotu? | Všimnutí, vybavení a opakované používání ukázky; později skutečné nákupy | Zájem nebo odpověď na otázku o ceně nejsou tržby; v malé partě nepředstírat spolehlivý konverzní odhad |

Události měření budeme definovat před funkčním pilotem; žádná analytická integrace zde nebyla nasazena. Historických 1 032 tipů od „Fotbalových expertů“ lze využít jako reálné herní příklady. Bez záznamů otevření pozvánek a návštěv z nich nelze dopočítat celý akviziční trychtýř nebo porovnat jiné modely lobby.

### Rozhodnutí po rešerši

- Vlastník přijal B včetně Kobry a jednorázového sponzora. Teoretické porovnání je uzavřené; nyní se rozhodnutí promítá do logiky a plánu. Prototypy se nestaví a volbu A/B znovu neotvíráme.
- Vlastník přijal samostatné tipy v každé lobby, včetně stejného zápasu ve více partách. Tuto volbu znovu neotvíráme.
- Vlastník následně přijal tříkolový pilot Ligy mistrů 2026/27 od nuly a bez bodovaného tipu na sezonního vítěze. Požaduje úplný konečný výsledek a při rozstřelu preferuje bodovat jeho skóre, např. 5:4. Oficiální sportovní fakta zůstanou zvlášť; možnost změny se má řešit verzí pravidel pro novou soutěž. Úplný kontrakt dopracuje T05 v [aktivním plánu](product-restart-plan.md). Přijetí B samo žádná sportovní pravidla ani historické body nepřepsalo.
- Archivace testovacích lobby už je vlastníkem vybraná. Konkrétní technický postup je [samostatně připravený](archive-test-lobbies-plan.md); zatím nebyla provedena.

## Zdroje a limity

Ověřeno 3. 11. 2026. Použité podklady: zadání vlastníka, repozitář a předchozí živý audit, read-only stav původní DB a veřejné primární zdroje. CRM, obchodní hovory a interní zprávy nejsou pro tuto otázku relevantní. Neproběhly rozhovory s novými zákazníky, přihlášený konkurenční test ani srovnávací experiment. Nevytváříme tržní velikost ani žebříček tržeb konkurentů.

1. [Superbru — About Clubs](https://www.superbru.com/home/about_clubs.php): stálá komunita, eventové pooly, pozvánky, historie a dobrovolná účast. Starší dokumentace bez data aktualizace; vzor, nikoli ověřený aktuální průchod aplikací.
2. [Superbru — Pools FAQ](https://superbru.reamaze.com/kb/pools): sdílené tipy napříč pooly v jednom turnaji. Starší zmínky o placeném Season Ticket nepoužíváme k cenovým závěrům.
3. [Kicktipp — Tips before restart](https://www.kicktipp.com/info/service/help/2/203): zachování hráčů a historie mezi sezonami, medailový tag.
4. [ESPN — Rejoin last year's Group](https://support.espn.com/hc/en-us/articles/4755374690452-How-do-I-re-join-last-year-s-Group): obnova skupiny, článek z roku 2024.
5. [ESPN — Join a Tournament Challenge Group](https://support.espn.com/hc/en-us/articles/360040660171-How-to-Join-a-Tournament-Challenge-Group): přiřazení letošního bracketu a účast v pořadí; článek aktualizovaný v roce 2026.
6. [Discord — Avatar Decorations FAQ](https://support.discord.com/hc/en-us/articles/13410113109911-Avatar-Decorations-FAQ): vlastněná kosmetika versus členské dekorace; aktualizace z února 2026.
7. [Discord — Server Boosting FAQ](https://support.discord.com/hc/en-us/articles/360028038352-Server-Boosting-FAQ): skupinové výhody a status podporovatele; aktualizace ze září 2026. Nezobecňujeme dočasné nabídky ani experimentální funkce.
8. [Ren a kol., MIS Quarterly 2012](https://aisel.aisnet.org/misq/vol36/iss3/11/): obecná empirická podpora zkoumání identity skupiny. Dostupný abstrakt; celé PDF se při této rešerši nepodařilo načíst. Neodvozujeme z něj velikost efektu pro Tipovačku.
9. [Kicktipp — Professional](https://www.kicktipp.com/info/professional/): firemní vzhled a hraní napříč soutěžemi. Z nabídky neodvozujeme konkrétní cenu, výnosy ani naši poptávku.

**Další krok:** uzavřít otevřená pravidla pilotu a podle přijatého B dopracovat účet, profil, pozvánku, členství a účast v soutěži v T03/T04. Stavba prototypů nyní není zadáním.
