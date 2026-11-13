# Obsah webu a krátký hráčský manuál

Pracovní návrh k 8. 11. 2026. **Potvrzení vlastníka 9. 11.:** pro návrh
zachovat pracovní název **Fan Tipovačka** a současný bílý/červený sportovní styl.
Další referenční weby nejsou podmínkou pokračování. Veřejná doména zůstává
k doplnění před publikací; nyní nenavrhovat novou značku nebo barevnou identitu.
Nový podklad vlastníka 9. 11.: návrh brandkitu může rozvinout Azure `#3283BE`,
Snow `#FEFDFE` a Coral `#FD614B`; viz [brandkit v1](brandkit-v1.md).
Tento novější návrh palety doplňuje původní bílý/červený směr, neznamená
automatické přebarvení živé aplikace.
Navazuje na [landing brief](landing-page-brief.md), [revizi profilu](profile-review-2026-11-08.md)
a [marketingový plán](marketing-strategy-2026-11-06.md).

## Jedna hlavní nabídka

Pro organizátora party: založit společnou tipovačku a přivést ostatní.
Pro pozvaného: poznat svou partu a dostat se k prvnímu tipu. Tvůrce nebo hospoda
mohou používat tentýž model; nepotřebujeme tři konkurenční úvodní rozcestníky.

Hlavní CTA **Založit tipovačku**, vedlejší **Mám pozvánku**, malý odkaz
**Přihlásit se**. CTA znamená akční tlačítko. Technický plán níže pokrývá
i pohled CTO: jak veřejný web propojit s aplikací bez další DB a účtů.

## Cílová cesta

Organizátor: veřejná stránka → název party a soutěž → přihlášení → vznik lobby
→ první tip + dostupná pozvánka. Zachovat rozepsaný výběr po přihlášení.

Pozvaný: odkaz → kdo mě zve a do jaké soutěže → přihlášení, pokud je potřeba
→ připojení podle pravidel lobby → otevřené tipy. U lobby se schvalováním
pravdivě ukázat stav žádosti, neslibovat okamžité členství.

Editace profilu je nepovinná. Hráč z odkazu nemá znovu zadávat přinesený kód
ani vybírat sport na obecném rozcestníku. Jde o cílový návrh, ne tvrzení,
že současná auth-first aplikace už takto funguje.

## Sekce landing page a hotový první copy draft

| Sekce | Text / obsah | Akce a důkaz |
| --- | --- | --- |
| Úvod | **Kdo z vaší party opravdu rozumí sportu?** Založ společnou tipovačku, pozvi kamarády a porovnejte své tipy v pořadí. Rozpis a výsledky se aktualizují automaticky. | Založit tipovačku → zachovaný create intent; Mám pozvánku → vstup s kódem. Čitelná produktová ukázka, ne obecná fotka stadionu místo hry. |
| Jak to funguje | **Založ partu. Pozvi ostatní. Tipujte a sledujte pořadí.** Jedna komunita může hrát další soutěže. | Tři vysvětlující kroky; žádný nepodložený slib „hotovo za 3 kliky / 30 sekund“. |
| Ukázka hry | Ulož vítěze, volitelně přidej ukončení. Za vítěze i ukončení získáš 5 bodů, jen vítěze 3, jen ukončení 1. | Demo MMA v2 s popiskem Ukázková data + odkaz Jak se počítají body. Ostatní sporty mají vlastní pravidla. |
| Co můžete hrát | Fotbal: Liga mistrů a Premier League. Hokej: NHL. MMA: roční UFC liga s jednotlivými kartami. | Aktuální katalog znovu ověřit před publikací; odehraná soutěž není nadcházející nabídka. Extraligu/F1 neoznačovat za aktivní. |
| Proč se vrátit | **Stejná parta. Další zápasy. Nová výzva.** V lobby uvidíš, co ještě čeká na tip, a průběžné pořadí. | Ukázka domova s názvem lobby a chybějícími tipy; u UFC filtr jednotlivých karet a roční pořadí. |
| Reálný příběh | Jak hráli Fotbaloví experti — až po výběru povolených podkladů a souhlasu se zveřejněním. | Zatím interní námět. Žádná vymyšlená citace, partner ani publikum. |
| FAQ + závěr | Nejčastější otázky níže, znovu Založit tipovačku. | Kontakt, pravidla hry, soukromí, jazyk. Cena a omezení pilotu musí odpovídat skutečnému rozhodnutí. |

Tón je přímý, přátelský a krátký. Jednotné tykání pro první český návrh;
záměrně nepsat celý web jako sázkovou kancelář ani jako technickou dokumentaci.
Zda používat jiné oslovení je snadno změnitelná copy volba.

### English hero draft

**Who in your group really knows sports?**

Start a prediction league, invite your friends and see whose picks come out
on top. Fixtures and results update automatically.

**Start a league** · **I have an invite** · Sign in

V překladu může být lobby uživatelsky league/group podle kontextu; uložit
slovníček a nemíchat pro tutéž věc pět názvů. CTA musí vést na stejnou
zamýšlenou akci jako česká varianta, ne pouze na přihlašovací obrazovku.

## Krátký manuál pro hráče / obsah Jak se hraje

1. **Připoj se ke své partě.** Otevři pozvánku nebo zadej kód. Přihlas se;
   někde připojení schvaluje správce. Své tipy máš oddělené v každé lobby.
2. **Vyber soutěž a tipuj.** U fotbalu a hokeje vybíráš skóre podle pravidel
   soutěže. U UFC vybíráš vítěze; na kartách s novými pravidly můžeš přidat
   KO/TKO, Submisi nebo Na body. Nepovinnou volbu zrušíš dalším klepnutím.
3. **Zkontroluj uložení a uzávěrku.** Tip můžeš měnit jen do povoleného času.
   U UFC se celá karta zamyká při prvním zápase včetně prelims. Ve stávající
   aplikaci se časy zobrazují pro Prahu; jiný jazyk sám nemění časové pásmo.
4. **Sleduj body a pořadí.** Výsledky i ověřené opravy se načítají automaticky.
   Pravidla najdeš u soutěže. MMA v2: oba správně 5 / jen vítěz 3 / jen
   ukončení 1 / nic 0; draw/no contest/zrušený duel 0. Historické v1 karty
   mají původní 1 bod za vítěze. Neznámé ukončení může počkat na doplnění.
5. **Pokračujte společně.** Ve stejné partě lze hrát další soutěž. Každá má
   vlastní pořadí; UFC karty se sčítají v roční lize, další rok začíná zvlášť.

Návod rozdělit do krátkých odpovědí, které jdou otevřít u konkrétní otázky.
Nedávat před první tip povinný carousel nebo dlouhý onboarding.

### FAQ draft

- **Potřebuji účet?** Ano, aby se tipy bezpečně ukládaly a mohl ses k nim vracet.
- **Musím vyplnit profil?** Jméno tě představí ostatním; bio a vzhled jsou dobrovolné.
- **Vidí mé tipy ostatní?** Přístup se řídí členstvím v lobby a pravidly soutěže.
  Přesný okamžik zveřejnění popsat až podle ověřeného režimu každého sportu.
- **Co je veřejný profil?** Vizitka dostupná ostatním přihlášeným hráčům.
  Soukromý profil dál ukazuje spoluhráčům jméno a avatar. Nejde automaticky
  o veřejnou indexovanou stránku ani o zveřejnění e-mailu.
- **Můžu změnit tip?** Do jeho uzávěrky. Při změně soupeře UFC musíš tipovat znovu.
- **Co když se opraví výsledek?** Ověřená oprava zdroje může přepočítat body.
  Neuvádět živou shodu tří zdrojů; ta zatím není hotová.
- **Je to zdarma?** Publikovat až po určení hranic veřejného pilotu a nákladů.
  Neodvozovat Free/Premium nabídku pouze z existujících tabulek či feature flagů.

## Pravidla pro ukázky a čísla

- Použít dvě až tři čitelné ukázky: tipování, pořadí a domov s konkrétní lobby.
  Profil až po opravě statistik. První viewport musí vysvětlit vlastní hru.
- Použít demo lobby s fiktivními jmény a viditelným označením Ukázková data,
  nebo historickou ukázku, kterou vlastník výslovně povolí zveřejnit.
  Soukromé join kódy, e-maily, celé pozvánky a soukromé bio nezveřejňovat.
- Vysvětlující čísla: tři kroky, příklad bodů 5/3/1/0. Údaje jako počet hráčů,
  úspěšnost, retence a doba založení vyžadují měření a datum/definici.
- Hodnoty 14 283 hráčů, TOP 4 % a Partner ligy v lokálním produktovém preview
  jsou demonstrační. Nejsou důkaz používání ani uzavřená spolupráce.
- Nepsat deset dostupných jazyků, oficiální partnerství UFC/UEFA, zapnutý paywall,
  dostupné ceny nebo garantovanou škálovatelnost jen podle námětu či UI.
- U každé veřejné sekce vést krátký záznam: zdroj tvrzení, datum kontroly,
  stav funguje/návrh, potřebný asset, vlastník a schválený překlad.

## Technický plán a dohledatelnost

Veřejná landing a návod mají vracet skutečný obsah v HTML bez přihlášení.
Navržené jazykové cesty `/cs/` a `/en/`, návod např. `/cs/jak-se-hraje/`;
adresy jsou zatím návrh. Přihlášená aplikace, pozvánky a privátní data zůstávají
za stávajícími oprávněními. Prerender veřejných stránek lze přidat vedle Vite
aplikace; kvůli tomu nepřepisovat celou hru ani zakládat další databázi.
Při výběru rout ověřit dnešní Netlify rewrites a zachování odkazů.

Pro každý skutečný překlad: vlastní URL, `lang`, title/description, canonical,
reciproční `hreflang`, odkazy mezi jazyky a kompletní text. Chybějící překlad
nepublikovat jako hotovou jazykovou verzi. Připravit formát pro další jazyky,
ale první veřejnou angličtinu ověřit i na názvech odznaků a serverových zprávách.

Google pro AI Search uvádí běžné SEO, ne zvláštní AI soubor nebo speciální schema.
Nejde o garanci zobrazení nebo citace. Soukromé profily/lobby nejsou SEO obsah;
robots ani noindex nenahrazují oprávnění. Zdroje:
[Google AI features](https://developers.google.com/search/docs/appearance/ai-features),
[jazykové varianty](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites).

Měření cesty navrhnout jako návštěva → hlavní CTA → vznik/připojení lobby → první
úspěšně uložený tip → návrat k dalším zápasům. Událost prvního tipu potvrzuje
úspěšné uložení, ne kliknutí na tlačítko. Pro kanál veřejný campaign ID, nikoli
join kód, e-mail nebo bio. Konkrétní tracker a režim souhlasu rozhodnout před
jeho připojením; souhlas s tímto plánem žádný tracker nezapíná.

## Rozdělení práce

**Viktor:** před publikací doplnit veřejnou doménu, první reálnou partu a co
smíme zveřejnit. Pracovní název a styl jsou potvrzené; další reference jsou
dobrovolné. Před publikací
dodat provozní kontakt, provozovatele a podklady k podmínkám/soukromí; ty nevymýšlet.

**Codex:** oprava profilového kontraktu a návrh UI v samostatném balíku,
copy CZ/EN, struktura webu a hráčský návod, bezpečné demo podklady, následné
vizuální směry a implementace zvoleného směru. Prověřit CTA/pozvánku,
prerender, jazyky, přístupnost a měření před publikací.

**Spolu:** potvrdit definice statistik, vybrat vizuální směr a vyzkoušet dva
průchody s reálnými lidmi: organizátor a pozvaný hráč. První krok není velký
nový research ani další API. Tato etapa dodává podklady a plán; nové UI/web,
datové změny a zveřejnění jsou navazující implementace.
