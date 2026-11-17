# Veřejné spuštění: bezpečnost, cookies a právo

**Následná bezpečnostní realizace9.11.:** po novém výslovném souhlasu vlastníka
je nasazen Clerk-only resolver, odstraněné staré native loginy a určený Clerk
admin. Historie zůstala zachovaná; [retirement runbook](clerk-only-retirement-runbook-2026-11-09.md)
obsahuje výsledky. Dependency patch nyní lokálně dává npm audit0 a prošel testy
a oběma buildy; není vydaný. Níže uvedený původní scan a inventář jsou snapshot
před těmito opravami, nikoli nový scan celého změněného produktu.

Revize 9. 11. 2026. Pracovní podklad pro českého provozovatele a první CZ/EU
spuštění; konečné obchodní podmínky a zařazení placených funkcí má před prodejem
zkontrolovat český právník. Nejde o osvědčení bezpečnosti ani hotové právní texty.

## Rozhodnutí vlastníka

- Provozovatel zatím Viktor; fyzická osoba/OSVČ/firma a identifikační údaje zbývají upřesnit.
- Již při prvním veřejném spuštění mají být placené kosmetiky/VIP bez vlivu na
  výhru a rozšířené funkce pro majitele lobby/tvůrce. Cena, jednorázový nákup vs.
  předplatné a konkrétní balíček ještě nejsou rozhodnuté.
- Nejde o schválení placeného vstupu do turnaje. Sponzorované ceny, výběr vkladů
  a rozdělování plateb mezi tvůrce vyžadují samostatný návrh.
- V této revizi se mění pouze vizuální vstup do aplikace. Nezapínají se platby,
  analytika, nové souhlasy, nové policies ani mazání účtů.

**Doporučení:** další etapou má být uzavření bezpečnosti a minimálního právního
balíku pro placenou verzi. Cookie lišta sama žádnou z těchto věcí nevyřeší.

## Co revize skutečně ověřila

Čtecí kontrola zdrojů aplikace, existujících migračních/testovacích podkladů,
samostatný Codex Security standard scan, dotaz na hostovaná RLS metadata/advisory
a veřejná HTML odpověď pracovního Netlify webu. Žádné zápisy do DB ani útoky
proti reálným účtům. Podrobné bezpečnostní pokrytí není plný penetrační test;
aktuální a historické ověření se nesmí zaměňovat.

Standard scan `97dad957-098d-4f2f-8feb-c4c63b2f8e0e` je dokončený:
**0 potvrzených reportovatelných zranitelností v kontrolované části**, 68 plně
čtených souborů a další pouze selektivně; nikoli audit celého repozitáře.
[Kanonický report](/Users/viktor/.codex/state/plugins/codex-security/scans/tipovacka-zurich/b76db1b12d6930867b529beda5cf49bae17704c2_20261109T131953Z_dej_yky4/report.md).
Výsledek platí pro zachycený počáteční stav; během revize vznikaly vizuální a
dokumentační změny. Finální branding se ověřuje zvlášť, nevydává se za součást
uzavřeného bezpečnostního skenu. Spotřebu tokenů nástroj neposkytl.

| Pozorování | Význam / další krok |
| --- | --- |
| Všech 25 public tabulek v hostované DB má RLS zapnuté. | Dobrý základ, nikoli důkaz správnosti každé policy/RPC. |
| Advisor hlásí veřejné feature flags a 32 přihlášeným dostupných SECURITY DEFINER funkcí. | Část je záměrný návrh; ověřovat autorizaci každé funkce, plošně je nevypínat. [Supabase vysvětlení](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). |
| RLS bez policy u katalogů/entitlements a soukromých stavů. | Samo o sobě neznamená únik; přímý přístup je typicky zakázaný a obsluhují jej kontrolované RPC. |
| Clerk se lokálně načítá v Development mode; historická konfigurace používá development instanci. | Před placeným veřejným provozem připravit a skutečně ověřit produkční Clerk/doménu, origins a Supabase issuer. |
| Bridge stále podporuje historické Supabase JWT identity. | Rozhodnout a provést řízené vyřazení, nebo tuto druhou cestu dál zabezpečovat. Schovaný formulář ji nevypíná. |
| `subscriptions.user_id` stále odkazuje na `auth.users`, nové Clerk profily mají interní UUID. | Konkrétní překážka placené verze; billing identitu navázat na interní hráčský účet a otestovat. |
| Aktuální klient nemá Supabase Auth session fallback (`persistSession: false`). | Neopisovat starou dokumentaci, která považuje browser Supabase session za jediný zdroj identity. |
| V UI je skrytá danger sekce Clerku a není implementovaný export/výmaz dat produktu. | Doplnit ověřenou žádost a celý serverový proces; nezapínat samotné Clerk Delete account bez návazností. |
| Netlify HTML odpověď: HTTPS/HSTS ano; CSP, CSP Report-Only, X-Frame-Options, Referrer-Policy, Permissions-Policy, nosniff chybí. | Příležitost k hardeningu, ne sama potvrzený exploit. CSP nejprve Report-Only a kompatibilita s Clerk/OAuth, CDN a API. |
| První statická HTML odpověď neobsahovala Set-Cookie. | Neprokazuje absenci cookies po spuštění JS nebo přihlášení. |
| Čerstvý `npm audit`: 11 hlášených balíčků, 1 critical / 6 high / 2 moderate / 2 low. | Samostatný registry inventář, nikoli 11 potvrzených zranitelností aplikace. Dosah a minimální bezpečné aktualizace uzavřít v [#26](https://github.com/L4Nci/tipovacka-zurich/issues/26); žádný `audit fix` nebyl spuštěn. |

## Technické podmínky před veřejným prodejem

| Priorita | Úkol | Dokončeno teprve když |
| --- | --- | --- |
| P0 | Produkční identita a správa přístupů | Clerk production, povolené origins/redirecty, issuer a účetní bridge fungují; admin MFA; sdílené testovací přístupy revokované; legacy auth má uzavřené rozhodnutí. |
| P0 | Oprávnění napříč lobby | Reálné účty hráč A/B/owner/admin: cizí ID, odebraný/čekající člen, zamčený tip, profil a sezonní vítěz odmítnuté i přímou Data API/RPC cestou. Žádná role nezíská body/premium klientským zápisem. |
| P0 pro platby | Billing a entitlements | Interní identita, ověřený podpis webhooku, idempotence/replay a pořadí událostí; nárok vzniká pouze na serveru; refund/expirace/storno odeberou správný nárok. Return URL z platební brány nic sama neaktivuje. |
| P0 | Práva k účtu a retence | Ověřená žádost o kopii, opravu a výmaz; odvolání session, vyřešení vlastníka lobby, profil/tipy/identity i případný billing; zálohy a povinné doklady mají vlastní retenční pravidlo. |
| P0 před veřejným spuštěním | Hlavičky a ochrana před zneužitím | CSP/anti-framing/referrer/nosniff ověřené; limity a kvóty pro účet/lobby/join/RPC, časové limity payloadů, dohled nad chybami. Rate limiter jen na Netlify nechrání přímé DB RPC. |
| P0 před veřejným spuštěním | Závislosti, klíče a obnova | Uzavřená dosažitelnost auditovaných dependency advisories, žádné secrety v bundle/logu, oddělené cron/provider klíče, alert při selhání syncu; skutečný restore a rotace klíče vyzkoušené. |

Záloha není automaticky součástí bezplatného plánu: Supabase doporučuje Free
projektům vlastní pravidelné exporty mimo projekt. Naplánovat i ověření obnovy.
[Supabase backups](https://supabase.com/docs/guides/platform/backups).

## Cookies a měření: současný inventář

Jde o **zdrojový inventář a omezenou HTTP kontrolu**, ne kompletní záznam všech
cookies prohlížeče. Před vydáním zopakovat čistou relaci před přihlášením,
registraci, login/logout, OAuth a checkout; zaznamenat název, doménu, účel,
expiraci a Secure/HttpOnly/SameSite bez kopírování hodnot tokenů.

| Technologie | Nynější nález | Co udělat |
| --- | --- | --- |
| Clerk auth | Nutná autentizace; dodavatel popisuje např. `__session`, `__client_uat`. | Přesný seznam/atributy získat z naší production konfigurace, ne převzít cookies dashboardu Clerku. [Clerk cookies](https://clerk.com/docs/guides/how-clerk-works/cookies). |
| Jazyk | localStorage `lang` | Uchovává uživatelskou volbu; vysvětlit účel a zvolit retenci. |
| Návrat do hry | localStorage `activeLobbyId`, sessionStorage `activeTournamentId` | Posoudit nezbytnost a dobu uchování, čistit při logout/odchodu. |
| Supabase SDK | Nový klient nepersistuje Supabase Auth session. | Neuvádět automaticky staré `sb-*-auth-token` jako aktivní součást nového flow; ověřit zbytky v existujících relacích. |
| Analytika/pixely/replay | V aktivním vlastním kódu nenalezené GA/Meta/PostHog/Clarity apod. | Hostingové logy a služby SDK jsou odlišná vrstva; nelze tvrdit „žádné zpracování dat“. |
| Clerk telemetry | Provider nemá `telemetry={false}`; docs uvádí volitelnou telemetry development instancí. | Pro minimalizaci doporučeno vypnout; nejde o nalezený marketingový pixel. [Clerk telemetry](https://clerk.com/legal/telemetry). |
| Externí obrázky | Vlajky, klubové znaky, MMA CDN. `no-referrer` je použité u hlavních assetů. | Příjemce stále vidí síťový požadavek/IP; inventář skutečných hostů a práv. Self-hosting jen při dovolené licenci/cache. |
| Sites landing | Aktivní landing nepoužívá vlastní analytics/cookie UI; nepoužitý starter sidebar není důkaz runtime cookie. | Soukromá ChatGPT brána má vlastní identitu/cookies; neplést ji s finální veřejnou doménou hry. |

Pokud zůstanou jen nezbytné technologie, souhlasová lišta není nutná, informace
o zpracování ano. Stejná pravidla se vztahují i na localStorage a fingerprinting.
Netechnické měření spouštět až po souhlasu: Přijmout/Odmítnout stejně dostupně,
volitelné účely předem vypnuté, snadné odvolání. [ÚOOÚ — cookies](https://uoou.gov.cz/verejnost/qa-otazky-a-odpovedi/cookies).

**Navržený začátek:** agregované počty návštěv/CTA/aktivací bez reklamních pixelů,
replaye, persistentních identifikátorů a fingerprintingu. Než to označíme za
režim bez souhlasu, posoudit konkrétní řešení a právní titul. Do analytiky/logů
nepatří e-mail, token, join kód ani celá URL `/join/...`. Kampaně mají veřejný
identifikátor. Souhlas nelze nahradit názvem produktu „cookieless“.

## Právní minimum a konkrétní výstupy

1. **Provozovatel a kontakt.** Doplnit skutečného prodávajícího, adresu,
   identifikační/registrové údaje podle zvolené formy a přímý kontakt.
   Upřesnit podnikatelské oprávnění s účetní/právníkem před přijetím plateb.
   [Informační povinnosti, čl. 5](https://eur-lex.europa.eu/legal-content/En/ALL/?uri=CELEX%3A32000L0031).
2. **Ochrana osobních údajů CZ/EN.** Správce, účely/právní tituly, skutečné
   příjemce, předávání, dobu uchování, práva a kontakt uvést před získáním dat.
   Účet, zajištění provozu, platba a marketing mají vlastní účely; univerzální
   povinný checkbox „souhlasím s GDPR“ je nenahradí. [GDPR čl. 5, 6, 12–14](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679).
3. **Pravidla produktu a VOP.** Popsat bezplatnou i placenou část, uzávěrky,
   verze bodování, opravy API, výpadky, ukončení účtu a moderaci. Žádná smluvní
   věta nevymaže povinná práva spotřebitele. [ČOI — digitální služby](https://coi.gov.cz/faq/smlouvy-o-poskytovani-digitalniho-obsahu-ci-sluzby/).
4. **Placený checkout.** Před potvrzením musí být zřejmá funkce, úplná cena,
   délka, případné obnovování a ukončení; závazek platby jasně označit, zaslat
   smlouvu/potvrzení na trvalém nosiči a evidovat verzi podmínek.
   [ČOI — nákup online](https://coi.gov.cz/faq/a-nakup-pres-internet-2/).
5. **Odstoupení, reklamace a zrušení obnovování.** Kosmetický digitální obsah
   a průběžná VIP služba se nemají bez posouzení řídit totožnou výjimkou.
   U služby samotná aktivace automaticky neruší právo odstoupit. Připravit
   formulář/postup, vyřízení vad/refundu a ADR ČOI; evidovat případnou výslovnou
   žádost o okamžité plnění. [ČOI — služby a odstoupení](https://coi.gov.cz/podani-stiznosti-podnetu-dotazu/).
   Unijní úprava od 19. 6. 2026 požaduje online funkci odstoupení v příslušných
   online smlouvách; před checkoutem ověřit aktuální české provedení a přesnou
   použitelnost, funkci navrhnout již nyní. [Směrnice 2023/2673, čl. 11a a transpozice](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32023L2673).
   Nekopírovat starý ODR odkaz, platforma byla zrušena. [Nařízení 2024/3228](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A32024R3228).
6. **Dodavatelé a předávání.** Evidovat zpracovatelské smlouvy, subprocesory a
   role Clerk/Supabase/Netlify, později platební a analytické služby.
   EU databáze neznamená všechny toky pouze v EU. Clerk aktuálně uvádí US hosting;
   ověřit použitelný mechanismus předání, nikoli tvrdit „Clerk je EU-only“.
   [EDPB — procesory](https://www.edpb.europa.eu/sme/learn-the-basics/data-controller-or-data-processor_en),
   [Clerk DPA](https://clerk.com/legal/dpa), [Clerk security](https://clerk.com/security),
   [Supabase data residency](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq),
   [Netlify trust](https://www.netlify.com/trust-center/).
7. **Práva, retence a incidenty.** Stanovit konkrétní retence profilů, tipů,
   bezpečnostních logů, záloh a dokladů. Žádosti vyřizovat zpravidla do měsíce;
   nemusí být vše self-service, ale proces musí existovat a fungovat.
   [Komise — žádosti](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/dealing-requests-individuals_en?prefLang=bg).
   Incidenty evidovat a vyhodnotit oznamovací povinnost; riziková porušení hlásit
   do 72 hodin od zjištění, vysoce riziková také dotčeným lidem.
   [Your Europe — GDPR](https://europa.eu/youreurope/business/governance-and-sustainability/digital-and-data-compliance/data-protection-gdpr/index_en.htm).
8. **Newsletter zvlášť.** Založení účtu není automatický souhlas s marketingem.
   Pro pilot navrhuji samostatný dobrovolný opt-in s evidencí a jednoduchým
   odhlášením. Pozvánku může sdílet hráč; neposílat hromadná oslovení z účtů bez
   posouzení zákonného titulu a pravidel obchodních sdělení.
   [ÚOOÚ — obchodní sdělení](https://uoou.gov.cz/index.php/profesional/qa-otazky-a-odpovedi/obchodni-sdeleni).

## Další požadavky podle konkrétní podoby produktu

- **Věk:** určit veřejnou věkovou politiku a pravidla nákupu nezletilými. Hranice
  souhlasu dítěte podle GDPR není univerzální věková hranice smlouvy ani hazardu.
  [GDPR čl. 8](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679).
- **UGC/DSA:** bio a popisy lobby jsou uživatelský obsah. Posoudit, zda jde o
  hosting/online platformu a jaké výjimky platí. Kontaktní místo, nahlášení
  obsahu a odůvodnění moderace připravit podle použitelného režimu; mikropodnik
  nemá automatickou výjimku ze všeho. [ČTÚ — povinnosti](https://ctu.gov.cz/povinnosti-poskytovatelu-sluzeb).
- **Přístupnost:** e-commerce může spadat pod zákon 424/2023; služby mikropodniku
  mají výjimku, jejíž splnění je třeba doložit. Neprohlašovat automatickou
  povinnost celé WCAG certifikace. V kódu je dnes blokovaný zoom (`index.html`);
  to je konkrétní úkol k opravě a otestování. [MPO — rozsah a výjimky](https://mpo.gov.cz/cz/podnikani/pristupnost-vyrobku-a-sluzeb/pristupnost-vyrobku-a-sluzeb-po-ucinnosti-zakona--286983/).
- **Daně:** platební poskytovatel nenahrazuje nastavení účetnictví. Před prodejem
  do dalších zemí určit daňový režim digitální služby, doklady a případné OSS
  s účetní. OSS je nástroj, nikoli automaticky povinná registrace pro každý
  první nákup. [Finanční správa — OSS](https://financnisprava.gov.cz/cs/mezinarodni-spoluprace/mezinarodni-spoluprace-a-dph/one-stop-shop-oss).
- **Ceny a vklady později:** kosmetika/předplatné nejsou automaticky sázka.
  Placená účast související s výhrou vyžaduje nové posouzení před aktivací;
  o zařazení nerozhodne označení „skill game“. [MF — definice](https://finfoveskole.gov.cz/cs/dan-z-hazardnich-her).
- **DPO/DPIA:** posoudit podle skutečného rozsahu a rizika; nenakupovat pověřence
  jen proto, že máme účty. [Komise — SME](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr_en?prefLang=nl).

## Data, fotografie a značky: samostatná podmínka spuštění

Funkční URL obrázku nepředstavuje licenci. Založit registr zdroj → použitá data
nebo obrázek → verze podmínek → oprávnění → kredit → konec licence.

- **football-data.org:** podmínky vyžadují uvedení zdroje; v aktivním frontend
  kódu jsem kredit nenalezl. Práva k logům a fotografiím musí vyřešit uživatel
  API samostatně. Doplnit kredit a doložit oprávnění, případně použít neutrální
  náhrady. [Podmínky §7 a §9](https://www.football-data.org/about).
- **NHL:** komerční oprávnění pro současný zdroj a klubové značky není doložené.
  [Podmínky NHL](https://www.nhl.com/info/terms-of-service).
- **UFCalendar:** aktuální API podmínky dovolují komerční vlastní produkt i
  Free plánu. Zakazují další distribuci datové služby a vyžadují obrazové
  kredity. Ověřit, že klíč je skutečně Free, nikoli evaluační trial. Fotografie
  posuzovat podle konkrétní Commons licence, včetně označení úpravy a případného
  ShareAlike. Náš whitelist/komponenta jsou dobrý základ, nikoli prověření
  právního původu každé jednotlivé fotky.
  [API podmínky §3–6](https://www.ufcalendar.com/developers/terms).
- Názvy soutěží nepoužívat jako tvrzení o oficiálním partnerství. Sponzorovaný
  branding jiného pořadatele vyžaduje jeho oprávnění ke značce a pravidla kampaně.

## Navržené pořadí práce

1. Viktor určí prodávajícího, kontakt, země pilotu, věk a obsah placených balíčků
   včetně typu platby. Já připravím přesný obsah stránek a checkout kontrakt;
   právník/účetní zkontrolují své části.
2. Uzavřít produkční identitu, legacy účty, oprávnění a billing interní identitu.
   Současně vyřešit licence dat/log a minimální dohled/zálohy.
3. Implementovat ověřený export/výmaz a retenční pravidla, právní stránky CZ/EN,
   evidenci přijatých podmínek a podpůrný kontakt.
4. Teprve na vybraném platebním modelu implementovat checkout/webhook/entitlements,
   refundy a zrušení. Testovací platby, nikoli skutečné inkaso během vývoje.
5. Dokončit runtime inventář cookies; měření a případné souhlasy podle reálné
   technologie. Ověřit anonymní i přihlášený průchod v Safari a Chromium.
6. Předsales kontrola: nový člověk → správné podmínky → testovací nákup → nárok
   → refund/expirace → žádost o data/výmaz, plus cross-lobby a incident/restore.

Nasazení brandového vstupu je malý samostatný balík. Žádný bod tohoto plánu
neznamená, že se už zapnulo placení nebo že je produkt právně přijatý.
