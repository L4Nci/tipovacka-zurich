# FÁZE F9.2.2 – Full CSV Integrity Audit Before Import

> Historical import audit. This records a pre-import CSV integrity check and is
> not current operational documentation for live sync or fixture updates.

## Celkový stav
- **Status:** WARNING (Ready with notes)
- **Počet chyb (FAIL):** 0
- **Počet upozornění (WARNING):** 32
- **Připraveno k importu:** YES



## 1. Počet řádků
- **Zápasy (Data rows):** 104 (Očekáváno 104)
- **Hlavička přítomna:** Ano

## 2. Skupinová fáze
- **Celkem zápasů:** 72 (Očekáváno 72)
- **Rozpad:**
  - Group A: 6 zápasů
  - Group B: 6 zápasů
  - Group C: 6 zápasů
  - Group D: 6 zápasů
  - Group E: 6 zápasů
  - Group F: 6 zápasů
  - Group G: 6 zápasů
  - Group H: 6 zápasů
  - Group I: 6 zápasů
  - Group J: 6 zápasů
  - Group K: 6 zápasů
  - Group L: 6 zápasů

## 3. Playoff fáze
- **Celkem zápasů:** 32 (Očekáváno 32)
- **Rozpad:**
  - Round of 32: 16 zápasů
  - Round of 16: 8 zápasů
  - Quarterfinal: 4 zápasů
  - Semifinal: 2 zápasů
  - Third Place: 1 zápasů
  - Final: 1 zápasů

## 4. Ukázka prvních a posledních 10 řádků
**Prvních 10:**
```text
fifa-world-cup-2026,Group A,football-mex,football-rsa,2026-06-11T19:00:00Z,manual-fifa-2026,fwc2026-g001
fifa-world-cup-2026,Group A,football-kor,football-cze,2026-06-12T02:00:00Z,manual-fifa-2026,fwc2026-g002
fifa-world-cup-2026,Group B,football-can,football-bih,2026-06-11T18:00:00Z,manual-fifa-2026,fwc2026-g003
fifa-world-cup-2026,Group B,football-usa,football-par,2026-06-11T21:00:00Z,manual-fifa-2026,fwc2026-g004
fifa-world-cup-2026,Group C,football-qat,football-sui,2026-06-12T00:00:00Z,manual-fifa-2026,fwc2026-g005
fifa-world-cup-2026,Group C,football-bra,football-mar,2026-06-13T22:00:00Z,manual-fifa-2026,fwc2026-g006
fifa-world-cup-2026,Group D,football-hai,football-sco,2026-06-12T15:00:00Z,manual-fifa-2026,fwc2026-g007
fifa-world-cup-2026,Group D,football-aus,football-tur,2026-06-12T18:00:00Z,manual-fifa-2026,fwc2026-g008
fifa-world-cup-2026,Group E,football-ger,football-cuw,2026-06-12T21:00:00Z,manual-fifa-2026,fwc2026-g009
fifa-world-cup-2026,Group E,football-ned,football-jpn,2026-06-13T00:00:00Z,manual-fifa-2026,fwc2026-g010
```

**Posledních 10:**
```text
fifa-world-cup-2026,Round of 16,football-tba,football-tba,2026-07-20T19:00:00Z,manual-fifa-2026,fwc2026-r16-07
fifa-world-cup-2026,Round of 16,football-tba,football-tba,2026-07-21T19:00:00Z,manual-fifa-2026,fwc2026-r16-08
fifa-world-cup-2026,Quarterfinal,football-tba,football-tba,2026-07-22T19:00:00Z,manual-fifa-2026,fwc2026-qf-01
fifa-world-cup-2026,Quarterfinal,football-tba,football-tba,2026-07-23T19:00:00Z,manual-fifa-2026,fwc2026-qf-02
fifa-world-cup-2026,Quarterfinal,football-tba,football-tba,2026-07-24T19:00:00Z,manual-fifa-2026,fwc2026-qf-03
fifa-world-cup-2026,Quarterfinal,football-tba,football-tba,2026-07-25T19:00:00Z,manual-fifa-2026,fwc2026-qf-04
fifa-world-cup-2026,Semifinal,football-tba,football-tba,2026-07-26T19:00:00Z,manual-fifa-2026,fwc2026-sf-01
fifa-world-cup-2026,Semifinal,football-tba,football-tba,2026-07-27T19:00:00Z,manual-fifa-2026,fwc2026-sf-02
fifa-world-cup-2026,Third Place,football-tba,football-tba,2026-07-28T19:00:00Z,manual-fifa-2026,fwc2026-third-place
fifa-world-cup-2026,Final,football-tba,football-tba,2026-07-29T19:00:00Z,manual-fifa-2026,fwc2026-final
```

## 5. Náhodná kontrola 20 časů (UTC validace)
```text
1. fwc2026-g058 | Group E | football-cuw vs football-ned | Konvertovaný čas: 2026-06-22T18:00:00Z
2. fwc2026-g045 | Group K | football-por vs football-eng | Konvertovaný čas: 2026-06-20T00:00:00Z
3. fwc2026-g069 | Group K | football-cro vs football-por | Konvertovaný čas: 2026-06-24T21:00:00Z
4. fwc2026-g017 | Group I | football-fra vs football-sen | Konvertovaný čas: 2026-06-14T15:00:00Z
5. fwc2026-g015 | Group H | football-ksa vs football-uru | Konvertovaný čas: 2026-06-14T00:00:00Z
6. fwc2026-g070 | Group K | football-cod vs football-eng | Konvertovaný čas: 2026-06-25T00:00:00Z
7. fwc2026-g024 | Group L | football-uzb vs football-col | Konvertovaný čas: 2026-06-15T21:00:00Z
8. fwc2026-g062 | Group G | football-cpv vs football-bel | Konvertovaný čas: 2026-06-23T15:00:00Z
9. fwc2026-g038 | Group G | football-egy vs football-cpv | Konvertovaný čas: 2026-06-18T18:00:00Z
10. fwc2026-g050 | Group A | football-rsa vs football-kor | Konvertovaný čas: 2026-06-21T00:00:00Z
11. fwc2026-g005 | Group C | football-qat vs football-sui | Konvertovaný čas: 2026-06-12T00:00:00Z
12. fwc2026-g007 | Group D | football-hai vs football-sco | Konvertovaný čas: 2026-06-12T15:00:00Z
13. fwc2026-g057 | Group E | football-jpn vs football-ger | Konvertovaný čas: 2026-06-22T15:00:00Z
14. fwc2026-g010 | Group E | football-ned vs football-jpn | Konvertovaný čas: 2026-06-13T00:00:00Z
15. fwc2026-g042 | Group I | football-nor vs football-sen | Konvertovaný čas: 2026-06-19T15:00:00Z
16. fwc2026-g021 | Group K | football-por vs football-cod | Konvertovaný čas: 2026-06-15T12:00:00Z
17. fwc2026-g064 | Group H | football-uru vs football-irn | Konvertovaný čas: 2026-06-23T21:00:00Z
18. fwc2026-g023 | Group L | football-gha vs football-pan | Konvertovaný čas: 2026-06-15T18:00:00Z
19. fwc2026-g001 | Group A | football-mex vs football-rsa | Konvertovaný čas: 2026-06-11T19:00:00Z
20. fwc2026-g002 | Group A | football-kor vs football-cze | Konvertovaný čas: 2026-06-12T02:00:00Z
```

## 6. Upozornění (WARNINGS)
*Playoff časy jsou dočasné placeholdery k pozdějšímu upravení.*
- Playoff time placeholder: fwc2026-r32-01 at 2026-06-28T19:00:00Z
- Playoff time placeholder: fwc2026-r32-02 at 2026-06-29T19:00:00Z
- Playoff time placeholder: fwc2026-r32-03 at 2026-06-30T19:00:00Z
- Playoff time placeholder: fwc2026-r32-04 at 2026-07-01T19:00:00Z
- Playoff time placeholder: fwc2026-r32-05 at 2026-07-02T19:00:00Z
- ... (a dalších 27 playoff zápasů)
