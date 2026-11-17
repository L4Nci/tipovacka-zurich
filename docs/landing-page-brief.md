# Zadání: landing page Fan Tipovačka

Původní zadání 6. 11. 2026. **Pokyn vlastníka 9. 11.: začít stavět první
landing podle připraveného brandkitu, obsahu a front-end zadání.** První vydání
je izolovaný soukromý Sites web; pracovní hra na Netlify pokračuje samostatně.
Vychází z přijaté stálé lobby a [marketingového plánu](marketing-strategy-2026-11-06.md).

Aktualizace 8. 11.: [obsahový manuál](website-content-manual.md) doplňuje
konkrétní texty, návod, ukázky a rozdělení práce. [Revize profilu](profile-review-2026-11-08.md)
řeší návaznost na hráčskou vizitku. První implementace používá [brandkit v1](brandkit-v1.md)
a [front-end handoff](frontend-landing-handoff.md).

**První implementace, 9. 11.:** soukromé vydání je dostupné na
[Fan Tipovačka — landing v1](https://fan-tipovacka-landing-v1.l4nci.chatgpt.site).
Obsahuje CS/EN, lokální ukázku MMA bodování, FAQ a přechod do skutečné aplikace
přes registraci nebo kód pozvánky. Přístup vyžaduje účet vlastníka přes ChatGPT;
veřejná kampaň zatím neběží. [Ověření a rozdíly proti konceptům](landing-first-build-review-2026-11-09.md)
oddělují technicky ověřené chování od čekajícího přijetí vlastníkem.

## Cíl a první člověk

Pomoci organizátorovi party založit společnou tipovačku a pozvat ostatní.
Hráč přicházející z pozvánky má jít přímo do své lobby/soutěže. Primárně parta
kamarádů; navazující použití jsou komunita tvůrce a hospoda. Jedna značka,
stejný model lobby, samostatné pořadí každé soutěže. UFC používá roční ligu,
jednotlivé karty jsou její eventy s filtrem a vlastním pohledem na pořadí.

Pracovní hlavní sdělení: **„Kdo z vaší party opravdu rozumí sportu?“**
Vysvětlení: **„Tipujte zápasy, porovnávejte body a vyzvěte se znovu na dalším
turnaji. Rozpis i výsledky se aktualizují automaticky.“**
Tvrzení o konkrétním sportu zveřejnit až po ověření jeho celé datové cesty.

## Akce a nejkratší průchod

Hlavní CTA: **Založit tipovačku**. Vedlejší textový vstup: **Mám pozvánku**.
Nepřidávat další konkurenční CTA pro každý obchodní segment.

Organizátor: tematická stránka s předvoleným eventem → název lobby a soutěž →
přihlášení → otevřené tipy a snadno dostupná pozvánka. Před přihlášením
rozepsaný výběr neztratit. Nepovinný profil a avatar neblokují první tip;
nezbytné zobrazované jméno předvyplnit a upravit co nejjednodušeji.

Pozvaný hráč: přímo konkrétní lobby a event → viditelné kam jde → přihlášení →
první otevřený tip. Nevracet ho přes obecný rozcestník sportů nebo nové
zakládání lobby. Nevyžadovat znovu opsat kód, který už přinesl odkaz.

Po prvním tipu zobrazit potvrzení a zbývající úkoly ve stejné lobby. Po soutěži
nabídnout další soutěž téže partě; účast není automatická a body začínají od nuly.
UFC přidává nové karty do stejné roční ligy; nový rok je samostatná soutěž.
Jde o návrh cílového průchodu, ne potvrzení jeho současného nasazení.

## Obsah jedné hlavní stránky

1. Hlavní sdělení, krátké vysvětlení, hlavní CTA a skutečný produktový výřez
   tipování/pořadí. Člověk má hned poznat společenskou sportovní hru.
2. Jak se hraje: založit lobby → pozvat partu → tipovat a sledovat pořadí.
3. Ukázka jednoho tipu a jeho bodů; vysvětlit uzávěrku a automatické výsledky.
   Konkrétní pravidla vždy odpovídají zvolenému sportu.
4. Skutečně podporované soutěže s jasným stavem. Připravovaný sport nezobrazovat
   jako funkční. UFC ukázky už mohou vycházet z vydané roční ligy a volitelného
   ukončení s bodováním v2 5/3/1/0; historické karty mají vlastní původní pravidla.
5. Proč se vrátit: další zápasy, chybějící tipy ve vlastní lobby, nové pořadí
   dalšího eventu se stejnou komunitou.
6. Stručné FAQ: účet, soukromí lobby, body, uzávěrka, oprava výsledku a pozvánka.
7. Znovu hlavní CTA; patička s kontaktem, pravidly hry, soukromím a jazyky.

Tvůrce dostane navazující příklad „Tvoje tipy proti divákům“. Hospoda příklad
vlastní lobby a QR. Placený přístup, branding a sponzorované ceny jsou témata
k ověření, nikoli součást nabídky prvního vydání.

## Vizuální zadání a podklady od Viktora

**Potvrzeno vlastníkem 9. 11. 2026:** zachovat pracovní název Fan Tipovačka
a současný bílý/červený sportovní styl. Navázat na existující typografii,
karty a ovládání; návrhem zpřesnit hierarchii a práci s produktem. Ukázky musí být
čitelné na mobilu; dekorace nesmějí přebít vysvětlení nebo hlavní akci.

Další referenční weby jsou dobrovolné a neblokují pokračování. Veřejnou doménu
a finální veřejné texty doplnit před publikací; pracovní návrh může pokračovat
s potvrzeným názvem a stylem.

Novější podklad 9. 11.: vlastník dodal Azure `#3283BE`, Snow `#FEFDFE`
a Coral `#FD614B` pro [návrh brandkitu](brandkit-v1.md). Rozložení, CTA,
typografie a čitelnost mají pořád navazovat na existující sportovní aplikaci.

Původně plánované tři alternativní směry nahradil pokyn vlastníka začít první
implementaci vybraného brandkitu. Vznikly tři koordinované sekční koncepty
jednoho směru, implementace a mobilní/desktopová kontrola. Následuje zpětná vazba
vlastníka. Žádné vymyšlené recenze, partneři nebo počty hráčů.
Historickou ukázku použít jen v povoleném rozsahu a bez odhalení soukromých údajů.

## SEO, AI vyhledávání a jazyky

Veřejný text má být dostupný v počátečním HTML/statickém výstupu, ne až po
Clerk přihlášení. Veřejná marketingová část může mít vlastní prerender bez
přepisování herní aplikace. Veřejné stránky produktu, pravidel a skutečně
podporovaných eventů prolinkovat; nepublikovat stovky prázdných eventových URL.

Každý skutečný překlad má svou URL, html lang, title/description, canonical a
hreflang alternativy. Přepnutí jazyka zachová význam stránky. Nedodělaný jazyk
nezveřejnit jako přeloženou stránku. Soukromé lobby, kódy a účty nejsou SEO obsah.
Noindex ani robots nenahrazují oprávnění.

Google AI výsledky vyžadují běžnou indexovatelnou, užitečnou stránku; zvláštní
AI soubor nebo speciální schema negarantují zařazení. Totéž nelze automaticky
prohlásit za pravidlo všech vyhledávacích služeb. Povolit jen zvolené veřejné
crawlery a rozlišovat vyhledávání od případného trénovacího přístupu.

Technická architektura musí umožnit deset jazyků. Pracovní sada podle našeho
trhu: CS, SK, EN, ES, PL, DE, FR, PT, IT, TR. Nejde o žebříček deseti
nejrozšířenějších jazyků světa. První úplně ověřené překlady vydávat postupně;
RTL nebo další písma případně vyžadují samostatnou vizuální kontrolu.

## Měření a přijetí

Měřit návštěva → hlavní CTA → vznik lobby → připojení → první úspěšný tip.
Hlavní výsledek je hrající skupina a návrat na další příležitost. Registrace
bez hraní není aktivace. Každý kanál má veřejný krátký identifikátor kampaně,
nikoli tajný join_code v analytice. Souhlas a minimalizaci řeší
[pracovní plán](product-readiness-2026-11-06.md).

Návrh projde, když nový člověk dokáže vlastními slovy říct, pro koho hra je,
jak začít a proč se vrátit; organizátor i pozvaný hráč dokončí svůj průchod.
Ověřit mobil, klávesnici, čitelnost textu/CTA, chyby a návrat po přihlášení.
Technické ověření zahrnuje indexovatelnost, metadata, jazykové alternativy,
funkční pozvánku, rychlost a síťové chování při odmítnuté analytice.

Zadání neslibuje konverzní procento, návštěvnost, cenu Premium ani veřejnou
kapacitu. Tyto hodnoty stanovíme podle skutečných testů a provozního rozpočtu.

## Podklady

- [Google: AI features](https://developers.google.com/search/docs/appearance/ai-features).
- [Google: vícejazyčné stránky](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites).
- [Marketingová strategie](marketing-strategy-2026-11-06.md).
