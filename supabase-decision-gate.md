# Supabase Decision Gate (Rozhodovací analýza migrace)

Tento dokument přináší detailní srovnání dvou možných scénářů vývoje a migrace projektu **Tipovačka 2.0 (Universal Lobby Manager)** ze současné databáze Turso (SQLite/libsql) na cloudové řešení **Supabase (PostgreSQL)**.

---

## Srovnávané varianty

* **Varianta A (Sequential Evolution):**  
  Dokončit kompletní vývoj v2 včetně scoringu, leaderboardů, dashboardu a finální multi-lobby logiky v stávajícím prostředí (Turso/SQLite) a teprve po stabilizaci a uvolnění celé v2 verze provést migraci na Supabase.
* **Varianta B (Early Cloud Inception):**  
  Přerušit rozjetý vývoj na Turso, provést migraci databáze na Supabase ihned a veškerou novou aplikační logiku (dashboard, scoring, leaderboard, lobbies, auth, RLS) implementovat rovnou na cílové cloudové architektuře.

---

## Detailní srovnání parametrů

### 1. Riziko (Risk)
* **Varianta A:** **Nízké.** Změny jsou prováděny v plně kontrolovaném, stabilním lokálním prostředí. Jakékoliv chyby v logice přepočtů, filtraci zápasů nebo lobby rozhraní lze snadno debugovat a izolovat od chyb infrastruktury.
* **Varianta B:** **Vysoké.** Dochází ke kumulaci rizik (tzn. "Compound Risk"). Pokud se v aplikaci po spuštění objeví chyba, vývojář musí současně zkoumat, zda se jedná o logickou chybu v novém v2 JavaScript/TypeScript kódu, nesprávně nakonfigurovanou RLS politiku v PostgreSQL, odlišnost v SQL dialektu PostgreSQL vs. SQLite, nebo problém se síťovou konektivitou k Supabase.

### 2. Časová náročnost (Time Demand)
* **Varianta A:** **Střední.** Celková časová náročnost je fázovaná. Nejprve se rychle dokončí aplikační rysy na Turso bez zdržení spojených se síťovou latencí cloudových DB, nastavením práv a cloudovou konfigurací. Následná migrace na Supabase pak proběhne jako jeden ucelený technický krok.
* **Varianta B:** **Vysoká (zbrzdění vývoje).** Přechod na Supabase v rané fázi vyžaduje okamžité vyřešení registrace uživatelů přes Supabase Auth, přepsání všech existujících lokálních SQL dotazů v Express API, konfiguraci RLS a nastavení lokálního vývojového prostředí pro offline práci. To odloží dodání samotných byznys funkcí (leaderboard, multi-lobby) o několik dní až týdnů.

### 3. Množství pozdějšího přepisování kódu (Subsequent Rewriting)
* **Varianta A:** **Vysoké (v oblasti DB dotazů).** Veškeré SQL dotazy pro v2 (scoring, leaderboard, lobby membership), které se napíší pro Turso, bude nutné při migraci přepsat na PostgreSQL syntaxi (např. nahrazení `INSERT OR IGNORE` za `ON CONFLICT`, ošetření booleanů a přísné typování timestamps).
* **Varianta B:** **Minimální.** Jakmile se aplikace jednou přepojí na Supabase SDK a PostgreSQL, veškerá nová logika (scoring, leaderboard a lobbies) se píše rovnou v cílové syntaxi. Nevzniká žádný technický dluh v podobě přechodného SQL kódu.

### 4. Bezpečnost (Security)
* **Varianta A:** **Střední.** Bezpečnost v2 verze na Turso se nadále spoléhá na ExpressJS backendové middleware. Hrozí riziko, že při rychlém vývoji multi-lobby systému vznikne chyba v aplikační autorizaci (např. hráč uvidí tipy z lobby, kde není členem).
* **Varianta B:** **Velmi vysoká.** Bezpečnost je od počátku garantována přímo na databázové úrovni pomocí PostgreSQL Row Level Security (RLS). RLS politiky jsou robustní a eliminují lidskou chybu v Expressu – i kdyby vývojář zapomněl v klientském kódu ošetřit přístupová práva, databáze data neoprávněnému uživateli fyzicky nevydá.

### 5. Práce s Autentizací (Auth Integration)
* **Varianta A:** **Zdlouhavá dvojí práce.** Vývojář musí nejprve doimplementovat registraci a přihlašování do v2 multi-lobby systému na bázi legacy `players` tabulky (potenciálně s JWT/Cookies v Expressu). Při migraci na Supabase se pak celá tato část zahodí a přepíše na Supabase Auth.
* **Varianta B:** **Efektivní a čistá.** Kompletní autentizace se vyřeší okamžitě přes Supabase Auth, čímž odpadá nutnost udržovat v Expressu přihlašovací sezení, hashovat hesla a spravovat expirační tokeny.

### 6. Práce s RLS (Row Level Security)
* **Varianta A:** **Odložená na konec.** RLS se v aplikaci neobjeví, dokud se nezačne migrovat. To znamená, že po celé měsíce vývoje se klientská aplikace chová jinak než finální produkční verze. Ladění RLS na konci může odkrýt zásadní architektonické problémy v tom, jak klient data dotazuje.
* **Varianta B:** **Kontinuální integrace.** RLS politiky rostou ruku v ruce s novými tabulkami a API endpointy. Jakékoliv problémy s oprávněním (např. přístup k tipům jiných členů v soukromé lobby) jsou odhaleny okamžitě během vývoje dané funkce, nikoliv až těsně před releasem.

### 7. Kompatibilita s budoucím SaaS
* **Varianta A:** **Nepřímá.** Lokální multi-lobby na SQLite se sice chová jako multi-tenant aplikace, ale chybí jí robustní škálovatelnost, připojení třetích stran a bezpečné sdílení dat napřímo s klientem.
* **Varianta B:** **Plná připravenost.** Supabase je navržena pro SaaS aplikace. Oddělení uživatelských profilů, integrace OAuth (Google, Discord) a nativní podpora pro realtime subscriptions předurčují aplikaci k okamžitému spuštění v SaaS režimu.

### 8. Jednoduchost testování (Ease of Testing)
* **Varianta A:** **Snadná.** Testování probíhá lokálně, bez závislosti na internetovém připojení a bez nutnosti spravovat vícero cloudových prostředí (Dev/Prod). SQLite databázi lze pro testy snadno smazat a znovu seednout během sekundy.
* **Varianta B:** **Složitější.** Každý testovací scénář vyžaduje komunikaci s cloudem nebo spuštění lokálního Supabase emulátoru (vyžaduje Docker). Správa a čištění testovacích stavů v PostgreSQL je komplexnější.

### 9. Doporučení pro tento konkrétní projekt
Tento projekt se nachází v kritickém bodu zlomu. V uplynulých fázích jsme připravili "Shadow schémata" pro novou generaci dat (v2 zápasy, v2 předpovědi, lobbies, lobby members). Doposud jsme ale nepřepojili kód aplikace.

Pokud bychom zvolili **Variantu A**, museli bychom nyní v Expressu naprogramovat rozsáhlou a složitou autorizační logiku, která by hlídala, kdo je členem které lobby a jaké zápasy smí tipovat, a následně tuto logiku celou zahodit a přepsat na RLS v Supabase. To je zjevné plýtvání vývojářským časem.

---

## Finální vyhodnocení (Srovnávací matice)

| Parametr / Kritérium | Varianta A (Dokončit na Turso) | Varianta B (Migrovat na Supabase nyní) | Vítěz pro náš projekt |
| :--- | :---: | :---: | :---: |
| **Technické riziko** |  Nízké |  Vysoké | **A** |
| **Časová efektivita** |  Nižší (dvojí práce s Auth/API) |  Vyšší (jednorázový vývoj) | **B** |
| **Množství přepisování** |  Extrémní (přepis SQL i Auth) |  Nulové | **B** |
| **Zabezpečení (RLS vs Middleware)** |  Střední / Závislé na Expressu |  Nativně neprůstřelné | **B** |
| **Stabilita architektury** |  Dočasný monolit |  Moderní Serverless / Cloud Native | **B** |
| **Kompatibilita s vizí SaaS** |  Nízká |  Stoprocentní | **B** |

---

## 🏁 Závěrečné doporučení

I přes mírně zvýšené počáteční riziko infrastruktury doporučujeme:

### **MIGROVAT NYNÍ NA SUPABASE (Varianta B)**

#### Hlavní důvody pro toto rozhodnutí:
1. **Zamezení duplicitního vývoje:** Pokud bychom pokračovali na Turso, museli bychom vytvořit složité Express routy pro správu lobbies, jejich zabezpečení a propojení na legacy players. Tyto routy by byly vzápětí kompletně smazány při přechodu na Supabase.
2. **Přirozený růst RLS:** Implementace RLS politik pro lobbies a lobby members za chodu je řádově bezpečnější a čistší než jejich "naroubování" na již hotovou a složitou aplikaci na konci vývoje.
3. **Příprava na produkční provoz:** Rozdíly v SQL dialektech v2 tabulek (zejména timestamps a booleans) vyřešíme hned na začátku a novou logiku scoringu a leaderboardu už budeme psát s jistotou, že cílová PostgreSQL databáze se chová přesně tak, jak očekáváme.
