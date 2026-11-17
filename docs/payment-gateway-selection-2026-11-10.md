# Platební brána pro Fan VIP 49 / 499 Kč

Podklad ověřený 10. 11. 2026. **Doporučení k výběru testovací integrace, nikoli
schválená smlouva, založený účet, zapnuté platby nebo prodej.** Navazuje na
[schválenou nabídku](billing-contract.md). Vlastník uvedl nynější peněžní
provozní náklady 0 Kč; neznáme počet budoucích platících ani poměr intervalů.

**Následné rozhodnutí 10. 11.:** vlastník zvolil **Stripe pro TEST integraci**.
Srovnání níže zůstává zdůvodněním této volby. Jde o sandbox a simulované platby;
nepovoluje skutečné inkaso, novou obchodní smlouvu, live aktivaci ani přidělení
reálných VIP nároků. Interní testovací obrazovka je oddělená od běžné hry.

## Doporučení

**Pro první malý test doporučujeme Stripe Checkout + Billing + Customer Portal.**
Nová roční cena 499 Kč výrazně mění výsledek oproti dřívějšímu návrhu 29 Kč
měsíčně: pevný karetní poplatek se u ročního zákazníka platí jednou za rok.
Stripe má v použitých tarifech nulový pevný měsíční poplatek, hotovou správu
předplatného a opakování nezdařených úhrad. To je pro jediného provozovatele
rozumný výchozí kandidát; skutečnou úsporu vývoje jsme nevyčíslili.

**Comgate zůstává relevantní levnější varianta při větším počtu měsíčních plateb.**
Nezavádět současně dvě brány ani slibovat snadný převod uložených karet mezi
poskytovateli. Výběr znovu přepočítat podle skutečných intervalů, karet, nabídky
poskytovatele a nákladů obsluhy před dalším rozšířením.

## Ověřené běžné sazby

| Položka | Stripe Payments + Billing pay-as-you-go | Comgate Easy |
| --- | --- | --- |
| Kategorie v tomto modelu | Standardní EEA karta | Spotřebitelská Visa/Mastercard vydaná v EU |
| Karetní platba | 1,5 % + 6,50 Kč | 1 % + 0 Kč |
| Správa předplatného | Dalších 0,7 % Billing objemu | Model neobsahuje další tarif; opakované platby musí poskytovatel povolit |
| Pevný provoz | 0 Kč měsíčně v těchto tarifech | 100 Kč měsíčně při malém obratu, s výjimkami podle ceníku |
| Platební poplatek z 49 Kč | 7,58 Kč včetně Billing | 0,49 Kč před sdíleným měsíčním poplatkem |
| Platební poplatek z 499 Kč | 17,48 Kč včetně Billing | 4,99 Kč před sdíleným měsíčním poplatkem |

Zdroje: [Stripe Payments CZ](https://stripe.com/en-cz/pricing),
[Stripe Billing](https://stripe.com/en-cz/billing/pricing),
[Comgate Easy](https://www.comgate.eu/cs/ceniky-platebni-brany).
U Comgate se měsíční poplatek podle ceníku neplatí při měsíčním objemu nad
100 tis. Kč a u dalšího e-shopu stejného klienta. Pro tento pilot žádnou takovou
výjimku nepředpokládáme. Comgate Start a zaváděcí akce Easy existují, mají však
podmínky; do trvalé ekonomiky je nezapočítáváme bez potvrzené způsobilosti.

Kategorie karet obou modelů nejsou totožné pro všechny zákazníky. Částky nejsou
zisk: neobsahují daně/DPH, měnovou konverzi, refundy, spory, provoz aplikace,
práci ani náklady přechodu. Dílčí karetní a Billing poplatek zaokrouhlujeme zvlášť
na haléře `ROUND_HALF_UP`; skutečné vyúčtování se může v zaokrouhlení lišit.

## Poplatky při různém počtu platících

Všechny hodnoty níže jsou **modelový měsíční náklad brány v Kč**, ne tržby ani
naměřený počet uživatelů. Dvě oddělené situace: všichni platí 49 Kč každý měsíc,
nebo všichni zaplatí 499 Kč za rok a roční náklady rozpočítáme na 12 měsíců.
U Comgate předpokládáme 100 Kč za každý měsíc po celý rok, i při nerovnoměrném
ročním inkasu; skutečnou smlouvu je nutné potvrdit.

| Aktivní platící účty | Stripe: 49 Kč měsíčně | Comgate: 49 Kč měsíčně | Stripe: 499 Kč ročně, měsíční průměr | Comgate: 499 Kč ročně, měsíční průměr |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 7,58 | 100,49 | 1,46 | 100,42 |
| 10 | 75,80 | 104,90 | 14,57 | 104,16 |
| 25 | 189,50 | 112,25 | 36,42 | 110,40 |
| 100 | 758,00 | 149,00 | 145,67 | 141,58 |

Reprodukovatelný výpočet po zaokrouhlení poplatků jednotlivé platby:

```text
Stripe_měsíc = měsíční_VIP × 7,58 + roční_VIP × 17,48 / 12
Comgate_měsíc = 100 + měsíční_VIP × 0,49 + roční_VIP × 4,99 / 12
Comgate má nižší modelový poplatek, když:
7,09 × měsíční_VIP + (12,49 / 12) × roční_VIP > 100
```

Při stejných předpokladech tedy Comgate vychází levněji **od 15 výhradně
měsíčních VIP**, nebo **od 97 výhradně ročních VIP**. To je pouze průsečík
platebních poplatků, nikoli automatický důvod k migraci. Například při 25 ročních
VIP je modelový rozdíl asi 74 Kč měsíčně ve prospěch Stripe; při 25 měsíčních
VIP asi 77 Kč měsíčně ve prospěch Comgate. Neznámou práci a podporu za tyto
částky nevydáváme za nulovou.

## Integrace, peněženky a obsluha

| Oblast | Stripe | Comgate | Důsledek pro Fan Tipovačku |
| --- | --- | --- | --- |
| Hostovaná platba | Checkout; pro předplatné Billing a `mode: subscription` | Platební brána po serverovém založení platby | V aplikaci žádný vlastní formulář karty. |
| Peněženky | Apple Pay a Google Pay včetně podporovaných opakovaných plateb | Opakované platby zahrnují Apple Pay a Google Pay | Tlačítka závisejí na zařízení, kartě, doméně a nastavení; neslibovat jejich zobrazení všem. |
| Obnovování | Billing řeší plánované fakturace a má nastavitelné retry | Další úhrady volá obchodník přes API a řídí částku/periodu | U Comgate je nutná vlastní spolehlivá obsluha plánování, duplicit a neúspěchů. |
| Správa zákazníkem | Hotový Customer Portal pro platební metody a předplatné | Ověřené materiály popisují obchodníkův Klientský portál a pokyn zákazníka obchodníkovi ke zrušení | U Comgate není doložený ekvivalent hotového zákaznického subscription portálu; nabídnout zrušení v našem účtu by vyžadovalo vlastní implementaci. |
| Aktivace recurring | Konfigurace Billing a nabídky; live aktivace samostatně | Funkce na vyžádání po schválení poskytovatelem | Není automaticky dostupná jen založením API platby. |

Zdroje: [Stripe Customer Portal](https://docs.stripe.com/customer-management),
[automatické retry](https://docs.stripe.com/billing/revenue-recovery/smart-retries),
[Apple Pay web](https://docs.stripe.com/apple-pay.md?platform=web),
[Google Pay web](https://docs.stripe.com/google-pay?platform=web),
[Comgate recurring](https://help.comgate.eu/docs/opakovane-platby),
[Comgate REST recurring](https://apidoc.comgate.cz/api/rest/),
[Comgate FAQ](https://apidoc.comgate.cz/faq/),
[Comgate vysvětlení zrušení](https://www.comgate.eu/cs/blog/jak-na-opakovane-platby).

V obou případech nadále stavíme vlastní bezpečné mapování Clerk účtu, serverový
allowlist nabídky, ověření plateb, trvalé deduplikování událostí, reconciliaci a
nárok do skutečně zaplaceného konce. Poskytovatel nepřebírá správnost našich
RLS, expirace kosmetiky, vlastních pravidel ani izolace lobby. Comgate REST navíc
uvádí validaci přístupových IP; pro Netlify by bylo třeba potvrdit vhodnou
konfiguraci serverových volání, nikoli obcházet ochranu.

## Co lze připravit bez ostrého prodeje

- Stripe po vytvoření účtu nabízí sandbox; simulované platby nepřesouvají peníze.
  Pro live služby se následně ověřuje skutečný podnikatel a plní podmínky aktivace.
  [Sandbox](https://docs.stripe.com/testing),
  [aktivace účtu](https://docs.stripe.com/get-started/account/set-up).
- Comgate podporuje virtuální testovací platby a přechody PENDING/PAID/CANCELLED;
  potřebuje příslušný účet/oprávnění a `test: true`. REST při vynechání `test`
  použije produkční režim, proto musí budoucí testovací adapter režim vynucovat.
  Vydání účtu pro náš případ bez smlouvy ani povolení testovacího recurring jsme
  samostatně nepotvrdili. [Testování v portálu](https://help.comgate.eu/docs/navod-k-pouziti),
  [REST](https://apidoc.comgate.cz/api/rest/).
- Přístupové údaje dodává vlastník lokálně až pro zvoleného kandidáta; žádné
  klíče do chatu, frontendů nebo Sites. Zde nebyl založen účet, vyžádáno recurring,
  přijata smlouva, vložen klíč, vytvořena platba ani změněna DB.

GoPay do dalšího implementačního kola nyní nepřidáváme: jeho dříve ověřená
novoklientská nabídka a obecný sazebník se liší a nemáme konkrétní smluvní cenu.
To neznamená, že je nevhodný; pro první malý test nemáme doložený přínos dalšího
adapteru. Daňové otázky, prodávající, doména a licence před skutečným inkasem
zůstávají podle [billing kontraktu](billing-contract.md) otevřené.

## Stav rozhodnutí a hranice ověření

Ověřeny jsou oficiální sazby/funkce výše a haléřová matematika pro uvedené scénáře.
Neověřené zůstávají individuální schválení poskytovatele, naše skutečné úspěšné
platby/peněženky, poměr intervalů, churn a celkové náklady implementace. Návrh
Stripe pro první test není důkaz fungujícího checkoutu ani konečné rozhodnutí
vlastníka o veřejném prodeji. Původní výzkum měnil pouze tento podklad; následná
testovací implementace má vlastní ověření a zůstává bez skutečných VIP nároků.
