# Fan VIP: schválený cenový směr a průchod k upgradu

Pracovní podklad 10. 11. 2026. **Cenový směr schválený pro přípravu a ověření, nikoli aktivní paywall nebo zahájený prodej.** Navazuje na [VIP nabídku](vip-and-public-entry-proposal-2026-11-09.md), [P0/P1 bloky](public-launch-p0-p1-blocks-2026-11-09.md) a [měřicí kontrakt](player-activity-measurement-contract-2026-11-10.md). Připraveno bez změn plateb, účtů, databáze či zveřejnění nabídky.

**Aktuální rozhodnutí 10. 11.:** vlastník potvrdil první vlastní lobby zdarma, pozvané hráče zdarma a jeden osobní VIP za **49 Kč měsíčně nebo 499 Kč ročně**. Nahrazuje dřívější návrh A/B 29 versus 49 Kč měsíčně; roční interval si vybírá zákazník. Bez tvrdého limitu pěti hráčů. Jde o přípravu a ověření nabídky, nikoli aktivaci prodeje. [Kontrakt](billing-contract.md).

**Další rozhodnutí vlastníka:** jeden VIP obsahuje volbu našeho výchozího nebo vlastního bodování. Přesný limit VIP lobby a prodávající rozhodnuté nejsou; OSVČ je předběžná preference. Vlastní bodování nedává osobní násobič bodů: všichni v konkrétní soutěži mají stejnou předem potvrzenou verzi pravidel.

## Nabídka k ověření

**Zachovat první bezplatnou hru a ověřit jeden osobní Fan VIP za 49 Kč měsíčně nebo 499 Kč ročně.** Platí pořadatel za vlastní možnosti a hráč za své odlišení; pozvaní členové a veřejné CL/PL/UFC hrají zdarma. Neprodáváme vstup do turnaje, ceny ani výhodu při tipování.

Oba intervaly mají stejný obsah. Roční platba snižuje počet pevných platebních poplatků, ale sleva zároveň snižuje tržbu. 499 Kč je přibližně o 15 % méně než 12 × 49 Kč; neoznačovat ji za dva měsíce zdarma. Schválení vlastníkem není důkaz ochoty zákazníků zaplatit. Další VIP úrovně ani prodej jednotlivých emoji do tohoto ověření nepřidávat.

Současná aplikace nemá paywall ani omezení počtu vlastních lobby. **Existující Free účty/lobby mají zachované dosavadní možnosti a uložené tipy.** První vlastní lobby zdarma je potvrzený směr; konkrétní zavedení včetně zachování starých lobby se musí implementovat. VIP limit pěti lobby ani omezení pěti členy nejsou schválené.

## Tři modely: co by každý způsobil

| Model | Proč by mohl fungovat | Hlavní riziko | Doporučení pro nynější test |
| --- | --- | --- | --- |
| Platba už za založení první soukromé lobby | Jasný placený úkon; zjišťuje ochotu pořadatele zaplatit. | Pořadatel platí dřív, než parta pozná hodnotu. Neúspěch jedné platby zabrání pozvánkám celé skupiny. Silná bezplatná konkurence. „29 Kč za lobby“ navíc neříká, zda navždy, za kartu, sezonu nebo měsíčně. | Teď nezavádět. Případný další test musí určit dobu a rozsah; jednorázovou platbu nelze prezentovat jako stejný produkt jako měsíční VIP. |
| Free do 5 hráčů, potom upgrade pořadatele | Malá parta pozná hru před platbou; větší skupina má zřejmý důvod k upgradu. | Šestý pozvaný přichází s očekáváním hry a narazí na cizí platbu, často před uzávěrkou. Nutno určit započtení ownera, pending členů a souběžných vstupů; vzniká motivace dělit party. | Až samostatně, pokud bude doložený náklad nebo silná hodnota větší skupiny. Neplatí každý člen. Stávající skupiny zachovat; při expiraci nikoho nevyhazovat ani neblokovat uložené tipy. |
| Bezplatné výchozí hraní + jeden osobní VIP s owner funkcemi | Pozvánka i první tip zůstávají snadné. Jedna platba obslouží profil i pořadatelovy vlastní lobby. Snadno vysvětlit, kdo platí a co dostane. | Kosmetika a vlastní pravidla nemusí samy přimět k nákupu. Potřebují viditelnou ukázku; neslibovat budoucí funkce. | Preferovaný první test. Měříme hodnotu placených funkcí, ne ochotu zaplatit jen za odstranění překážky. |

Riziko aktivace je produktová hypotéza; nemáme naměřeno, že konkrétní klik ubere určité procento konverze. Limit 5 je obchodní volba, nikoli doložené optimum nebo technická nutnost.

## Co skutečně nabízí konkurence

Oficiální podklady načtené 10. 11. 2026. Nabídky a měnové edice se mohou změnit; pro vlastní prodej je znovu ověřit. Srovnání nezakládá nárok na cizí značky nebo data.

| Produkt / zdroj | Ověřený fakt | Co z něj vyvozujeme a co nevíme |
| --- | --- | --- |
| [Kicktipp — homepage](https://www.kicktipp.com/) | Nabízí bezplatné vytvoření tipovačky pro přátele/kolegy až pro **300 hráčů**. | Free limit 5 a placené první založení by potřebovaly velmi přesvědčivý vlastní přínos. Počet vlastněných skupin nebyl v tomto průzkumu ověřen; neoznačujeme jej za neomezený. |
| [Kicktipp — nápověda k bodům](https://www.kicktipp.com/info/service/help/2/213) a [vývojářský popis v App Store](https://apps.apple.com/us/app/kicktipp/id570703120) | Obecná nápověda popisuje různé bodové konfigurace. Vývojářský popis řadí přizpůsobitelná pravidla do nabídky free soukromé hry. | Společně ukazují konkurenční tlak na placené vlastní bodování. Nápověda sama není úplná matice oprávnění Free/Pro; netvrdíme, že každá její varianta je zdarma. Vlastní pravidla nejsou doložená unikátní placená inovace. |
| [Kicktipp Professional — ceník](https://www.kicktipp.com/info/professional/prices) | Profesionální účet pro 100 hráčů stojí 9,90 €/měsíc, pro 300 hráčů 19,90 €/měsíc; minimálně měsíc, automatické pokračování, ceny včetně DPH. | Jde o jiný profesionální produkt, nikoli cenu osobního VIP. Free 300 na homepage a placený Professional 100 nejsou zaměnitelné nabídky. |
| [Superbru Premium](https://www.superbru.com/premium) | Na přímo načtené UK/Europe edici £2,99/měsíc nebo £33,48/12 měsíců. Detail: Free 10 poolů na soutěž, Premium 15; zvláštní vzhled a viditelný volitelný Premium badge. | Podporuje možnost free hry + placeného odlišení, ne naši cenu či konverzi. Úvod stránky říká obecně bez omezení, detail má konkrétní limit; používáme detail. Region/měna se liší. Placené insights/algoritmické tipy nekopírovat do našeho principu bez sportovní výhody. |
| [RunYourPool — pricing](https://www.runyourpool.com/pricing/) | Oficiální indexovaný výsledek popisuje cenu podle formátu/počtu vstupů za sezonu. Přímá stránka při kontrole vracela 403; dostupný index je starý. | **Aktuální srovnatelná cena neověřena.** Nepřebíráme vytrženou cenu jiné hry ani z ní neodvozujeme Fan VIP. |

První placená hodnota tedy má být **hezčí osobní identita + připravený vlastní vzhled party + pohodlně vysvětlená pravidla pro pořadatele**, fungující v jedné aplikaci napříč nabízenými sporty. Je to hypotéza o vhodném balíku. Dnešní Free emoji/barvy, základní sdílení a stávající lobby za novou placenou inovaci nevydáváme.

## Poplatky a historické srovnání malé měsíční platby

Částky 29 Kč níže zachováváme jako podklad, proč byl původní návrh změněn; nejsou aktuální prodejní nabídkou ani zadáním k randomizaci cen.

Pro český standardní účet uvádí [Stripe Payments CZ](https://stripe.com/en-cz/pricing): standardní EEA karta **1,5 % + 6,50 Kč**, premium EEA **2,8 % + 6,50 Kč**, UK **2,5 % + 6,50 Kč**, ostatní mezinárodní **3,15 % + 6,50 Kč**; při potřebné měnové konverzi další **2 %**. Checkout je zahrnutý ve standardních Payments cenách; vlastní platební doména je volitelná placená služba, pro test ji nepotřebujeme. [Stripe Billing Pay-as-you-go](https://stripe.com/en-cz/billing/pricing) přidává **0,7 % Billing objemu** bez pevného měsíčního poplatku tohoto plánu; karetní poplatek tím nenahrazuje.

Následuje **orientační model po metodových poplatcích**, ne zisk ani příslib bankovního zúčtování. Předpoklad: CZK platba i vypořádání, žádná konverze, standardní ceník, každý poplatek samostatně zaokrouhlen na haléř `ROUND_HALF_UP`. Skutečné vyúčtování a součty mohou zaokrouhlovat jinak. Nezahrnuje DPH/daně, API/licence, provoz, podporu, akvizici, refundy/spory ani volitelné daňové/fakturační produkty. Daňový režim a konečnou spotřebitelskou cenu musí potvrdit prodávající s účetním.

```text
card_fee = round_half_up(cena × sazba + 6,50; 2)
billing_fee = round_half_up(cena × 0,007; 2)  # pouze model předplatného
zbytek = cena − card_fee − billing_fee
```

| Standardní EEA karta | 29 Kč | 49 Kč |
| --- | ---: | ---: |
| Karetní poplatek | 6,94 Kč | 7,24 Kč |
| Zbytek při jednorázové platbě bez Billing | 22,06 Kč | 41,76 Kč |
| Billing pro předplatné | 0,20 Kč | 0,34 Kč |
| **Zbytek z měsíční platby** | **21,86 Kč** | **41,42 Kč** |
| Podíl obou modelovaných poplatků na ceně | 24,62 % | 15,47 % |

U premium EEA by z měsíčních 29/49 Kč stejným postupem zbývalo 21,49/40,79 Kč; u UK 21,57/40,93 Kč a u ostatních mezinárodních karet 21,39/40,62 Kč před případnou konverzí. Nemáme ověřený budoucí mix karet, proto neuvádíme jednu údajně skutečnou průměrnou marži.

| Pouze model standardní EEA + Billing | 29 Kč/měsíc | 49 Kč/měsíc |
| --- | ---: | ---: |
| 100 úspěšných měsíčních plateb: vybráno → po těchto poplatcích | 2 900 → 2 186 Kč | 4 900 → 4 142 Kč |
| Kdyby měsíční náklad byl 500 Kč: potřebné platby k jeho pokrytí | 23 | 13 |
| Kdyby měsíční náklad byl 1 000 Kč: potřebné platby k jeho pokrytí | 46 | 25 |

500/1 000 Kč jsou ilustrativní náklady, nikoli zjištěný rozpočet. Počty jsou `ceil(náklad / zbytek z platby)` a neobsahují další náklady uvedené výše. Nejde o prognózu počtu kupujících.

Matematicky stačí u 49 Kč přibližně **52,8 % placené konverze varianty 29 Kč**, aby při stejném počtu způsobilých nabídek vznikl stejný zbytek po modelovaných poplatcích (`21,86 / 41,42`). Neznáme elasticitu, délku předplatného ani churn; nelze z toho vyhlásit vítěze.

## Udržitelnost schválené nabídky

**Zjištěný stav:** vlastník uvedl aktuální peněžní provozní náklad **0 Kč měsíčně**. Není tím doložena cena budoucích komerčních API/licencí, lidské práce, právní kontroly nebo veřejného provozu. Dřívější 500 / 1 000 / 3 000 Kč jsou modelové scénáře, nikoli zjištěné faktury.

Při stejných předpokladech Stripe výše:

| Interval | Cena účtovaná zákazníkovi | Platební poplatky + Billing | Po těchto poplatcích | Měsíční průměr pro provoz |
| --- | ---: | ---: | ---: | ---: |
| Měsíční | 49 Kč | 7,58 Kč | 41,42 Kč | 41,42 Kč |
| Roční | 499 Kč za 12 měsíců | 17,48 Kč | 481,52 Kč za rok | 40,13 Kč |

Roční inkaso financuje závazek služby na 12 měsíců; celé není okamžitý volný zisk. Pro jednoduché plánování používáme **40 Kč měsíčně na platící účet**, nikoli jako garantovanou marži. U Comgate je ve stejné kategorii EU karet roční zbytek před podílem měsíčního poplatku `(499 − 4,99) / 12 = 41,17 Kč`; jeho pevný poplatek patří do celkových nákladů jednou.

```text
náklad_C = měsíční náklady CELÉ aplikace při dané zátěži,
           včetně hráčů zdarma, pevného poplatku brány,
           domény/12, API/licencí, e-mailů a přiděleného rozpočtu AI
potřebné_VIP = ceil((náklad_C × 1,20) / 40)
```

20 % je navržená rozpočtová rezerva, nikoli daň nebo důkaz dostatečné kapacity. Při zdanění ceny, refundech, jiném mixu karet nebo dalších proměnných nákladech je třeba upravit čistý příspěvek a přepočítat model, bez dvojího odečtení téhož nákladu. Vývojové AI nástroje, jednorázové investice, odměnu vlastníka a marketing sledovat odděleně a zahrnout v požadovaném rozpočtu, mají-li se z tržeb hradit.

**Modelový příklad:** C = 3 000 Kč → cíl s rezervou 3 600 Kč → 90 platících VIP. Orientační první milník 25 platících znamená asi 1 000 Kč/měsíc po modelovaných platebních poplatcích a před dalšími daněmi/náklady. Není to počet registrací, prognóza konverze ani skutečná dnešní tržba.

## Výběr brány zůstává otevřený

**Následné rozhodnutí:** vlastník zvolil Stripe pro první TEST integraci na základě nového ročního modelu. Níže je historický výchozí rozbor; [novější srovnání](payment-gateway-selection-2026-11-10.md) a [MCP handoff](stripe-mcp-handoff-2026-11-10.md) určují aktuální postup. Na této volbě se nezakládá veřejný prodej.

**Aktualizace 10. listopadu:** vlastník chce před volbou prověřit peněženky,
poplatky, implementaci a daně. Stripe není schválená brána; žádost o jeho
testovací klíč je pozastavená. Schválená nabídka je nyní 49 Kč měsíčně / 499 Kč ročně; bezplatný vstup zůstává.

| Srovnatelný běžný tarif, bez zaváděcích akcí | Stripe Payments + Billing | Comgate Easy |
| --- | --- | --- |
| Použitá kategorie karty | Standardní EEA | Spotřebitelská Visa/MC vydaná v EU |
| Platba / měsíční předplatné | 1,5 % + 6,50 Kč a dalších 0,7 % Billing | 1 % + 0 Kč |
| Pevný měsíční poplatek | 0 Kč v těchto pay-as-you-go tarifech | 100 Kč při malém obratu; dle ceníku zdarma nad 100 tis. Kč a pro další e-shopy téhož klienta |
| Apple Pay / Google Pay | Podporované peněženky, závislé na zařízení/nastavení | Součást podporovaných karet; opakované platby zahrnují obě peněženky |
| Předplatné | Billing + hotový zákaznický portál | Opakované platby přes API, aktivace na žádost; kompletní správu obnovování/zrušení je nutné teprve navrhnout |

Zdroje ověřené 10. 11. 2026: [Stripe Payments](https://stripe.com/en-cz/pricing),
[Billing](https://stripe.com/en-cz/billing/pricing),
[Customer Portal](https://docs.stripe.com/customer-management),
[Apple Pay na webu](https://docs.stripe.com/apple-pay.md?platform=web),
[Google Pay](https://docs.stripe.com/google-pay.md?platform=web),
[Comgate Easy](https://www.comgate.eu/cs/ceniky-platebni-brany),
[Comgate opakované platby](https://help.comgate.eu/docs/opakovane-platby).
Tyto kategorie karet nejsou totožné pro všechny zákazníky; firemní a zahraniční
karty, měny, refundy a spory mají jiné sazby. U Comgate je třeba potvrdit konkrétní
smlouvu a povolení opakovaných plateb pro tento produkt.

Při **100 měsíčních platbách po 29 Kč** podle výše uvedených předpokladů:
Stripe přibližně **714 Kč** poplatků; Comgate **129 Kč** včetně 100 Kč měsíčně.
Při pouze 10 takových platbách Stripe přibližně 71,40 Kč, Comgate 102,90 Kč.
Jde o model platebních poplatků bez daní, provozu a nákladů implementace/podpory;
nelze z něj označit jednu bránu za univerzálně nejlevnější. Pro nízkou českou
měsíční cenu stojí Comgate za prioritní prověření, Stripe má výhodu hotové správy
předplatného a nulového pevného poplatku v použitém modelu.

GoPay zůstává alternativou. [Nabídka novým obchodníkům](https://www.gopay.com/cs/)
se liší od [obecného sazebníku účinného 1. 11. 2026](https://help.gopay.com/cs/tema/cenik-a-obchodni-podminky/aktualni-cenik-a-obchodni-podminky/sazebniky-poplatku/sazebnik-poplatku-platebni-brany-gopay-ucinnost-od-1-11-2026).
Bez potvrzené smluvní nabídky jim nepřiřazovat jednu údajně univerzální sazbu.

**Daně:** provize brány je poplatek za službu, nikoli další daň z prodeje.
[Apple](https://applepaypartners.apple.com/merchants/partner-with-us) neúčtuje
obchodníkovi dodatečný poplatek za přijetí Apple Pay; karetní poplatky brány
zůstávají. Apple Pay na našem webu není nákup přes App Store.
Daňový režim samotného prodeje a fakturovaných služeb poskytovatele je samostatná
otázka. Českému neplátci může přijetí zdanitelné služby od zahraniční osoby založit
povinnost registrace jako identifikovaná osoba — neplatí automaticky pro každou
finanční službu. [Aktuální podmínky na gov.cz](https://portal.gov.cz/informace/registrace-k-dph-INF-204).
Účetní musí před inkasem posoudit konkrétního prodávajícího, faktury za služby,
DPH a zahraniční spotřebitele. Volba brány tyto povinnosti sama neřeší a není
rozhodnutím mezi OSVČ a s.r.o.

## Dva intervaly stejného VIP pro malé ověření

| | Měsíční | Roční |
| --- | --- | --- |
| Cena / období | **49 Kč za měsíc**, měsíční předplatné | **499 Kč za 12 měsíců**, celý roční poplatek jasně před platbou; režim další obnovy výslovně v konečných podmínkách |
| Produkt | Jeden osobní Fan VIP | Tentýž Fan VIP |
| Obsah před nabídkou | Hotový a ukázaný VIP odznak/rámeček/paleta; připravený vzhled vlastních lobby; vlastní nebo výchozí bodování před začátkem soutěže | Stejný obsah, šablony i pravidla |
| Kdo platí | Účet, který chce VIP; owner funkce jen v jeho vlastních lobby | Stejné |
| Co zůstává Free | Veřejná hra, připojení do party, výchozí tipování/bodování, dnešní kosmetika a dosavadní možnosti existujících lobby | Stejné |
| Místo nabídky | Vědomá volba prémiového vzhledu nebo vlastních pravidel; možnost zůstat u výchozího | Stejné |
| Ukončení | Zrušení dalšího obnovování v účtu/portálu; nárok do zaplaceného konce, zákonné refundy/odstoupení samostatně dle finálních podmínek | Stejné |

Do testu nevkládat nehotové uploady, příslib neomezené kapacity, statistické rady, extra body, dřívější přístup k cizím otevřeným tipům nebo placenou prioritu v pořadí. Rozsah konkrétních šablon/editoru musí být při nabídce skutečně hotový a popsaný. Případné budoucí kvóty jsou samostatné rozhodnutí, které by změnilo experiment.

Oběma intervalům dát stejný obsah; zákazník si vybírá interval. Cenu neměnit obnovením stránky ani skrýt roční účtovanou částku za měsíčním přepočtem. Jde o ověření poptávky a použité hodnoty, ne randomizovaný kauzální test cen. Žádné falešné původní ceny, časovače nebo skrytá zkušební období. Podmínky konkrétního předplatného včetně další obnovovací ceny musí být známé před platbou; budoucí změnu ceny neposílat tiše do rozběhnutých předplatných.

## Mobilní flow bez překážky před hrou

**Veřejný návštěvník:** konkrétní soutěž → účet/přihlášení se zachováním cíle → připojení → první uložený tip. Žádný povinný profil, VIP ani platba. **Pozvaný člen:** konkrétní soukromá lobby → účet → členství nebo srozumitelný pending stav → její tipy. Pořadatelovo VIP nekupuje místo něj; neVIP člen dál hraje podle stejných pravidel.

**Pořadatel při zakládání nebo přípravě nové soutěže:**

1. Název party + soutěž; předvolené výchozí bodování a vzhled. Výrazná cesta „Pokračovat zdarma“. Autentizace zachová rozepsaný bezpečný návrh a správný kontext.
2. Dobrovolně otevře vzhled/pravidla. U vlastních bodů vidí skutečný výpočet na ukázce a „Platí pro všechny hráče této soutěže“. Bez VIP může zvolit výchozí variantu; jeho rozepsané hodnoty nezmizí při návratu.
3. Teprve volba VIP funkce otevře jednu stručnou nabídku: přesný obsah, cena, zvolený měsíční/roční interval, případné obnovování, zrušení, prodávající a potřebné právní odkazy. CTA jednoznačně říká platbu/předplatné. Žádný nový produktový účet.
4. Hostovaná platební stránka vybrané brány nabídne podporovanou kartu/peněženku podle skutečného zařízení, měny a nastavení. Pokud zvolíme Stripe, použít [Checkout](https://docs.stripe.com/payments/checkout). Předvyplnit známý kontakt, vyžádat jen potřebné údaje. Banka může vyžadovat 3DS; neslibovat univerzální „jeden klik“.
5. Ověřená serverová platební událost přidělí nárok právě ověřenému účtu. Návratová URL nic neodemkne. Při čekání „Ověřujeme platbu“, bezpečný opakovaný dotaz; opakování webhooku nesmí přidělit druhý produkt ani druhý nákup.
6. Návrat do stejného návrhu → kontrola a potvrzení konkrétní verze pravidel → pozvánka a první tip. Zrušení/neúspěch platby vrátí k návrhu a výchozí bezplatné cestě; nenutí nový checkout při každém návratu.

**Pravidla je nutné nabídnout před prvním tipem.** Nelze čekat s vysvětlením této VIP hodnoty až po něm a pak nabídnout změnu rozehrané soutěže. Po prvním přijatém tipu je její verze uzamčená; pozdější VIP může měnit bezpečnou kosmetiku a připravit pravidla nové soutěže. Expirace, neúspěšná obnova, refund ani převod vlastnictví nesmějí přepsat staré body/pravidla/tipy nebo vyloučit členy.

Správa předplatného má jedno místo v účtu; žádné povinné psaní podpory pro běžné zastavení obnovování. Při volbě Stripe využít [Customer Portal](https://docs.stripe.com/customer-management); u jiné brány ověřit konkrétní možnosti a náklady jejich doplnění. Přesný fallback placeného vzhledu po expiraci, pravidla refundu a případná platební grace period musí být v kontraktu před prodejem. Test zahrne dvojklik/duplicitní checkout, pomalý webhook, přepnutí účtu, 3DS, storno, refund a expiraci bez poškození Free hry.

## Jak test provést a nevyhlásit falešné vítězství

1. **Nejprve ukázka nabídky:** pět nezávislých možných pořadatelů, skutečná ukázka hodnoty a otázky „co bys použil / co by ti chybělo / za co platíš dnes“. Pokud nejsou hotové platby/právní podmínky, jasně označený koncept bez inkasa. „Koupil bych“ a klik na cenu nejsou nákup.
2. **Po P0 platební a právní přejímce:** malé skutečné ověření stejného VIP s volbou intervalu 49 Kč měsíčně / 499 Kč ročně. Např. deset nezávislých pořadatelů jako rozsah prvního pozorování, ne vypočtený potřebný vzorek. Zaznamenat časový kontext, zdroj náboru a dostupnost otevřených soutěží. Dva účty stejné osoby nejsou dva nezávislí kupující. Samosběrnou volbu měsíčního/ročního intervalu nevydávat za kauzální A/B výsledek.
3. **Jednotka je platící účet/pořadatel, nikoli každý pozvaný.** Zaznamenat počet způsobilých skutečně vystavených nabídek, placené a bezplatné volby, vybraný interval, důvod odmítnutí, pomoc, selhání a využitou VIP funkci. Další lobby téhož ownera nezvětší vzorek nezávislých kupujících. Přátelské platby na podporu projektu označit odděleně.
4. **Pozorovat i další skutečnou příležitost a první obnovu.** U měsíčního produktu nelze z prvního nákupu odvodit dlouhodobý výnos. Skupina bez další dostupné karty/kola není automaticky ztracená. Cenu a obsah při testu neměnit najednou.
5. **Vyhodnotit absolutní počty a rozhovory.** Malá známá parta není statisticky průkazný cenový test. Pokud lidé nabídku odmítají kvůli nejasné hodnotě, upravit balík/vysvětlení před hledáním levnějšího čísla. Případný budoucí řízený cenový A/B test je nové zadání podle získané baseline a požadované přesnosti.

| Ukazatel | Autorita / jmenovatel |
| --- | --- |
| Zaplacené VIP | Unikátní účet s ověřenou úspěšnou platbou a přiřazeným nárokem / způsobilí unikátní pořadatelé se zobrazenou konkrétní nabídkou. Oddělit cenu, původ/testery a asistenci. Checkout click ani návrat na success URL nestačí. |
| Použitá hodnota | Potvrzené použití konkrétní VIP funkce / zaplacení stejné kohorty; vlastní pravidla potvrzená před prvním tipem, ne otevřený editor. |
| Peníze | Skutečně potvrzené platby, refundy, poplatky a opakované platby ze zúčtování. Model výše je oddělený. MRR, cash inkaso a účetní výnos nejsou jedna metrika. |
| Aktivace hráče | První backendem přijatý platný tip před zámkem; ne registrace, login nebo scoring cron. |
| Aktivace party / A3 | Dle [společného kontraktu](player-activity-measurement-contract-2026-11-10.md): aktivace nové soukromé lobby = 3 různé netestovací tipující účty ve stejné soutěži do 7 dní; hodnotit jen dozrálé kohorty s příležitostí. A3/28 = soukromá lobby se 3 různými netestovacími tipujícími ve stejné soutěži v posledních 28 dnech; lobby jednou. A3/7 diagnosticky. Veřejný pool odděleně. |
| Návrat | Aktivovaní první příležitosti, kteří platně tipují i v další skutečně nabídnuté příležitosti / aktivovaní s takovou otevřenou příležitostí a dokončeným pozorováním. Uvést kolo/kartu i období; UFC nesoudit jen podle D7. |

Stop podmínky: stržená platba bez správného nároku, dvojí platba, únik soukromého kontextu, změna rozehraných pravidel nebo znemožnění bezplatného hraní pozvaným. Opravit před pokračováním. Žádný úspěch podle samotného počtu registrací; bez měření uvést **neměřeno**, ne nulu. Nepřidáváme nový tracker, cookies ani admin dashboard. UTM se řídí [povoleným kontraktem růstového testu](p1-community-experiment-pack-2026-11-09.md): bez jmen, e-mailů, UUID, join kódů a raw URL; platební identifikátory patří do chráněné obsluhy plateb, ne marketingové analytiky.

## Potvrzené a zbývající rozhodnutí

- **Free základ — potvrzeno10.11.:** první test bez platby za první lobby a bez limitu5 členů. Existující možnosti zachovat; případné nové limity určit samostatně před jejich nabídkou.
- **Cena a směr — potvrzeno 10. 11.:** jeden osobní VIP **49 Kč měsíčně / 499 Kč ročně**, stejný obsah podle popsaného návrhu. Nejde ještě o objednání nebo aktivaci cen. Přesný seznam dostupné kosmetiky, rozsah editoru a kvóta VIP lobby musí odpovídat skutečně hotovým funkcím.
- **Životní cyklus:** doba testu, cena při další obnově, zrušení, fallback vzhledu a pravidla při neúspěšné platbě; žádné zásahy do pokračující hry.
- **Prodávající a trh:** definitivně osoba/OSVČ/firma, identifikační/kontaktní údaje, první prodejní země a měny. OSVČ nevydávat za hotové rozhodnutí. Účetní/právní kontrola konečných cen, daní, spotřebitelského vztahu a věkové politiky; platební účet ověří skutečný prodávající.

Codex následně připraví konkrétní prodejní/entitlement kontrakt, testovací checkout/webhook a negativní testy. Skutečný placený experiment až po této přejímce a souhlasu s konkrétní nabídkou. Doména, production Clerk a licence komerčních dat/fotek zůstávají samostatné P0 brány; cenový podklad je neuzavírá.

**Ověřené:** oficiální ceníky/funkce výše, modelová haléřová matematika, návaznost na současné Free chování a dohodnuté KPI. **Vlastníkem sdělené:** dnešní peněžní provozní náklady 0 Kč. **Neověřené:** ochota platit, elasticita, skutečný mix/poplatky budoucích plateb, churn, budoucí náklady/CAC, aktuální srovnatelná cena RunYourPool a přesný limit vlastněných skupin Kicktipp. Žádný prodej, outreach ani cenový experiment dosud neproběhl.
