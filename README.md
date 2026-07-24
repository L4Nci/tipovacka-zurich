🏆 Tipovačka 2026

Moderní webová aplikace pro soukromé sportovní tipovací ligy mezi přáteli, kolegy nebo rodinou.

Cílem projektu je nabídnout jednoduchou, rychlou a přehlednou platformu, kde si může každý vytvořit vlastní lobby, pozvat ostatní hráče a soutěžit o co nejlepší skóre během velkých sportovních událostí.

✨ Hlavní funkce

* 👥 Zakládání a správa soukromých tipovacích lobby
* ⚽ Podpora různých turnajů (FIFA World Cup, IIHF, EURO a další)
* 📊 Přehledný leaderboard s průběžným pořadím hráčů
* 🎯 Tipování výsledků jednotlivých zápasů
* 🏆 Bonusové dlouhodobé tipy (např. vítěz turnaje)
* 🔒 Automatické uzamčení tipů před začátkem utkání
* 📱 Responzivní design pro mobil i desktop
* 🌍 Připraveno pro vícejazyčné prostředí
* 🔄 Automatická synchronizace výsledků přes sportovní API
* 👑 Administrace zápasů, turnajů a bodování

🎮 Bodovací systém

Systém odměňuje přesnost tipů:

* přesný výsledek,
* správný vítěz a brankový rozdíl,
* správný vítěz,
* správná remíza ve skupinové fázi fotbalu,
* bonusové body za dlouhodobou predikci vítěze turnaje.

Bodovací pravidla jsou produkčně citlivá. Jejich zdrojem pravdy je aktuální implementace v kódu a související produkční pravidla, ne starší návrhové dokumenty.

🚀 Filosofie projektu

Tipovačka není klasická sázková kancelář.

Je navržena jako společenská platforma pro přátelské soutěžení, kde si skupina lidí může vytvořit vlastní uzavřenou ligu, porovnávat své tipy a sledovat vývoj pořadí v reálném čase.

Veškeré případné finanční vyrovnání mezi hráči probíhá mimo aplikaci.

🛠️ Technologie

* React
* TypeScript
* Vite
* Tailwind CSS
* Supabase
* Netlify
* GitHub
* TheSportsDB API

📈 Roadmap

Produkt už není MVP. Aktuální produktový směr je v [docs/ROADMAP.md](docs/ROADMAP.md).

Aktuální základy:

* ✅ Soukromé lobby a přihlašování
* ✅ Fotbalový turnaj FIFA World Cup 2026
* ✅ Základní hokejová turnajová podpora
* ✅ Automatické načítání výsledků
* ✅ Automatické doplňování playoff/TBA fixture
* ✅ Statistiky hráčů
* ✅ Vlastní avatar a profil
* ⏳ Historie sezón
* ⏳ Veřejné žebříčky, pokud je owner později potvrdí
* ⏳ Mobilní/PWA směr je otevřené produktové rozhodnutí

❤️ Proč vznikla?

Projekt vznikl z jednoduché myšlenky – zpříjemnit sledování sportovních akcí a odstranit chaos excelových tabulek a ručního počítání bodů.

Stačí vytvořit lobby, pozvat přátele, natipovat zápasy a nechat aplikaci počítat vše za vás.

## Contributor / Development workflow

Konkrétní práce se eviduje v GitHub Issues. Pro netriviální změny vytvoř nebo najdi Issue, drž se jeho scope a propoj Pull Request s daným Issue.

## Documentation map

Current source-of-truth documents:

* Product direction: [docs/ROADMAP.md](docs/ROADMAP.md)
* Concrete work and project memory: GitHub Issues
* Agent and production safety: [AGENTS.md](AGENTS.md) and [PROJECT_RULES.md](PROJECT_RULES.md)
* Issue workflow: [docs/ISSUE_WORKFLOW.md](docs/ISSUE_WORKFLOW.md)
* Authentication security and OAuth setup: [docs/auth-security.md](docs/auth-security.md) and [docs/oauth-setup.md](docs/oauth-setup.md)
* Lobby membership security: [docs/membership-security.md](docs/membership-security.md)
* Result sync and TheSportsDB provider behavior: [docs/thesportsdb-dry-run.md](docs/thesportsdb-dry-run.md)
* Fixture/TBA sync cron setup: [docs/fixture-sync-cron.md](docs/fixture-sync-cron.md)

Historical audits, migration plans, and earlier provider designs remain in the repository for context, but they are not operational instructions unless they explicitly say they are current.
