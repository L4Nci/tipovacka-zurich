# Výsledky, samoopravy a více zdrojů

Přijatý směr 5. 11. 2026: běžný provoz je automatický. Ruční zápisy nejsou běžný
pracovní postup a samy nesmějí navždy vyřadit zápas spravovaný API ze synchronizace.

## Dnešní implementace: jeden zdroj

Liga mistrů používá football-data.org a cron každých 15 minut. Jeho dokončené
výsledky jsou autoritou pro tento API katalog. Historické jiné soutěže tím neměníme.

- Novější platná revize API může opravit výsledek i body ve všech lobby.
- Stejná již ověřená revize se stejnými uloženými API fakty opraví lokálně chybné
  skóre. Označení `manual-admin` je původ zápisu, nikoli automatický trvalý zákaz opravy.
- U dokončených zápasů se kontrolují očekávané body i při nezměněném výsledku.
  Opraví se pouze skutečně nesedící body; opakování nic nepřičítá a nemění hráčovy tipy.
- Starší revize se ignoruje. Revize jsou časová razítka jednoho konkrétního providera.
- Rozporné API fakty dokončeného zápasu pod stejnou revizí znamenají konflikt.
  Stejně tak automaticky neodvoláváme již přijatý dokončený výsledek na stav rozehráno.
  Znovu načítáme zdroj; cron po dvou neúspěších upozorní správce.
- Zápas, soutěž, týmy a fáze musejí sedět. Výsledek musí odpovídat platným API
  složkám a pravidlu `football-final-shootout-v1`; uzávěrky tipů zůstávají zachované.

Samooprava podle jednoho API neodhalí chybu ve výsledku, kterou API samo stále
posílá jako platný výsledek. Tu vyřeší jeho oprava nebo nezávislé další ověření.
Není potřeba ručně kontrolovat každý zápas; nejednoznačné případy mají vyvolat upozornění.

Migrace `20261105151206_football_data_self_healing.sql` je aplikovaná ve stávající DB.
`local_repairs` počítá zápasy s navrženou/provedenou opravou podle stejného ověřeného
snímku. `predictions_updated` udává skutečně změněné bodové řádky, nikoli připsané
bonusové body. Historické `manual_skipped` zůstává v odpovědi pro kompatibilitu a je 0.

## Budoucí vícezdrojová vrstva: přijatý princip, zatím neimplementováno

Příklad vlastníka: dva ze tří čerstvých nezávislých zdrojů uvádějí dokončený
výsledek 3:1. Po ověření shodného zápasu a typu skóre přijmeme 3:1. Při pozdější
změně shody se výsledek i body automaticky přepočítají.

Před hlasováním musí adaptery sjednotit identitu zápasu, orientaci domácí/hosté,
fázi/dvojutkání, stav a skórovací pravidlo: 90 minut, prodloužení a samotné penalty
nejsou zaměnitelné. Posuzuje se čerstvost každého zdroje zvlášť; časová razítka
různých API nejsou společná globální revize. Dvě kopie stejného datového feedu
nepředstavují dvě nezávislá potvrzení.

Zdroje budou ukládat jednotlivá pozorování, nad nimi jeden rozhodovací krok vybere
potvrzený výsledek. Tři samostatné crony nebudou přepisovat `matches` podle toho,
kdo doběhl poslední. Bez dostatečné shody se zachová poslední potvrzený výsledek,
nový se neoboduje naslepo a problém se znovu ověřuje / nahlásí.

Konkrétní další API, hranice čerstvosti, výpadek jednoho zdroje a pravidlo rozporu
1:1:1 jsou rozhodnutí před implementací této vrstvy. Samotná preference novějšího
data většinové ověřování nenahrazuje. Současný pilot nepředstírá připojení tří API.
