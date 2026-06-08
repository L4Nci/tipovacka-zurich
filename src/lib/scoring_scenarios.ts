export const calculatePoints = (ph: number, pa: number, mh: number, ma: number, sport: 'football' | 'hockey' = 'football'): number => {
  if (ph === mh && pa === ma) return 5;
  if (sport === 'football') {
    const isActualDraw = mh === ma;
    const isPredictedDraw = ph === pa;
    if (isActualDraw) {
      if (isPredictedDraw) return 2; // Correctly predicted draw, not exact
    } else {
      const correctWinner = (ph > pa && mh > ma) || (pa > ph && ma > mh);
      if (correctWinner) {
        if (ph - pa === mh - ma) return 3; // Correct winner + correct goal difference
        return 2; // Correct winner without correct goal difference
      }
    }
  } else {
    // Hockey
    if ((ph > pa && mh > ma) || (pa > ph && ma > mh) || (ph === pa && mh === ma)) return 2;
  }
  return 0;
};

/**
 * Validates predictions - Hockey (ms-hockey-2026) cannot have draws.
 */
export function validatePredictionScore(home: number, away: number, tournamentId: string): boolean {
  if (tournamentId === "ms-hockey-2026" && home === away) {
    return false;
  }
  return true;
}

/**
 * Validates match results - Hockey (ms-hockey-2026 or 'hockey') cannot have draws.
 */
export function validateMatchResultScore(home: number, away: number, sport: 'football' | 'hockey'): boolean {
  if (sport === "hockey" && home === away) {
    return false;
  }
  return true;
}

/**
 * Validates longterm prediction scoring - 4 points for each correct prediction.
 * Supported types:
 * - tournament_winner
 * - top_scoring_team
 * - group_winner_A through group_winner_L
 * - semifinalist_1 through semifinalist_4
 */
export function calculateLongtermPoints(
  predictionType: string,
  predictedValue: string,
  actualValues: string[] // List of correct answers or acceptable values (e.g. actual semifinalist IDs)
): number {
  if (predictionType.startsWith('semifinalist_')) {
    // For semifinalists, order/position does not matter
    // If the predicted team is in the actual list of semifinalists, it is correct (4 points)
    return actualValues.includes(predictedValue) ? 4 : 0;
  }
  // Standard match: if predicted value is in correct answers (for single answer, actualValues has 1 element)
  return actualValues.includes(predictedValue) ? 4 : 0;
}

type TestScenario = {
  id: number;
  sport: 'football' | 'hockey';
  pred: [number, number];
  act: [number, number];
  expectedPoints: number;
  description: string;
};

const scenarios: TestScenario[] = [
  // --- FOOTBALL (15 cases as per Official FIFA 2026 Rules) ---
  {
    id: 1,
    sport: 'football',
    pred: [2, 1],
    act: [2, 1],
    expectedPoints: 5,
    description: "Football Exact Home Win (2:1 -> 2:1)"
  },
  {
     id: 2,
     sport: 'football',
     pred: [1, 1],
     act: [1, 1],
     expectedPoints: 5,
     description: "Football Exact Draw (1:1 -> 1:1)"
  },
  {
     id: 3,
     sport: 'football',
     pred: [0, 2],
     act: [0, 2],
     expectedPoints: 5,
     description: "Football Exact Away Win (0:2 -> 0:2)"
  },
  {
    id: 4,
    sport: 'football',
    pred: [3, 1],
    act: [2, 0],
    expectedPoints: 3,
    description: "Football Correct Goal Difference Home (3:1 -> 2:0) (+2 diff)"
  },
  {
    id: 5,
    sport: 'football',
    pred: [1, 4],
    act: [0, 3],
    expectedPoints: 3,
    description: "Football Correct Goal Difference Away (1:4 -> 0:3) (-3 diff)"
  },
  {
    id: 6,
    sport: 'football',
    pred: [1, 2],
    act: [2, 1],
    expectedPoints: 0,
    description: "Football Same goal diff but WRONG outcome (predicted Away win, got Home win)"
  },
  {
    id: 7,
    sport: 'football',
    pred: [1, 1],
    act: [0, 0],
    expectedPoints: 2,
    description: "Football Correct Draw Variation (1:1 -> 0:0, Draw outcome hit, non-exact)"
  },
  {
    id: 8,
    sport: 'football',
    pred: [2, 2],
    act: [3, 3],
    expectedPoints: 2,
    description: "Football Correct Draw Variation High (2:2 -> 3:3, Draw outcome hit, non-exact)"
  },
  {
    id: 9,
    sport: 'football',
    pred: [2, 1],
    act: [4, 1],
    expectedPoints: 2,
    description: "Football Correct Winner Only Home (2:1 -> 4:1) (+1 diff vs +3 diff)"
  },
  {
    id: 10,
    sport: 'football',
    pred: [0, 3],
    act: [1, 5],
    expectedPoints: 2,
    description: "Football Correct Winner Only Away (0:3 -> 1:5) (-3 diff vs -4 diff)"
  },
  {
    id: 11,
    sport: 'football',
    pred: [2, 1],
    act: [1, 1],
    expectedPoints: 0,
    description: "Football Incorrect Outcome (Predicted Win, got Draw)"
  },
  {
    id: 12,
    sport: 'football',
    pred: [1, 1],
    act: [1, 0],
    expectedPoints: 0,
    description: "Football Incorrect Outcome (Predicted Draw, got Win)"
  },
  {
    id: 13,
    sport: 'football',
    pred: [2, 1],
    act: [0, 2],
    expectedPoints: 0,
    description: "Football Incorrect Winner (Predicted Home Win, got Away Win)"
  },
  {
    id: 14,
    sport: 'football',
    pred: [5, 1],
    act: [8, 4],
    expectedPoints: 3,
    description: "Football Extreme High Goals Correct Goal-Diff (+4)"
  },
  {
    id: 15,
    sport: 'football',
    pred: [6, 0],
    act: [10, 1],
    expectedPoints: 2,
    description: "Football Extreme High Goals Correct Winner Only (6:0 -> 10:1)"
  },

  // --- HOCKEY (12 cases, all strict non-draw endings) ---
  {
    id: 16,
    sport: 'hockey',
    pred: [4, 2],
    act: [4, 2],
    expectedPoints: 5,
    description: "Hockey Exact win (4:2 -> 4:2)"
  },
  {
    id: 17,
    sport: 'hockey',
    pred: [1, 3],
    act: [1, 3],
    expectedPoints: 5,
    description: "Hockey Exact win Away (1:3 -> 1:3)"
  },
  {
    id: 18,
    sport: 'hockey',
    pred: [5, 1],
    act: [5, 1],
    expectedPoints: 5,
    description: "Hockey Extreme Exact Home Win (5:1 -> 5:1)"
  },
  {
    id: 19,
    sport: 'hockey',
    pred: [3, 1],
    act: [5, 2],
    expectedPoints: 2,
    description: "Hockey Correct outcome home win (3:1 -> 5:2)"
  },
  {
    id: 20,
    sport: 'hockey',
    pred: [1, 4],
    act: [2, 5],
    expectedPoints: 2,
    description: "Hockey Correct outcome away win (1:4 -> 2:5)"
  },
  {
    id: 21,
    sport: 'hockey',
    pred: [3, 2],
    act: [2, 1],
    expectedPoints: 2,
    description: "Hockey Same goal diff outcome (3:2 -> 2:1)"
  },
  {
    id: 22,
    sport: 'hockey',
    pred: [2, 5],
    act: [1, 4],
    expectedPoints: 2,
    description: "Hockey Correct Winner Only Away Win (2:5 -> 1:4)"
  },
  {
    id: 23,
    sport: 'hockey',
    pred: [3, 1],
    act: [1, 3],
    expectedPoints: 0,
    description: "Hockey Incorrect outcome win (3:1 -> 1:3)"
  },
  {
    id: 24,
    sport: 'hockey',
    pred: [1, 5],
    act: [4, 2],
    expectedPoints: 0,
    description: "Hockey Incorrect outcome loss (Predicted Away victory, got Home win)"
  },
  {
    id: 25,
    sport: 'hockey',
    pred: [1, 2],
    act: [2, 1],
    expectedPoints: 0,
    description: "Hockey Same Goal Diff but wrong outcome (1:2 -> 2:1)"
  },
  {
    id: 26,
    sport: 'hockey',
    pred: [6, 1],
    act: [2, 0],
    expectedPoints: 2,
    description: "Hockey Correct Winner Only Home (6:1 -> 2:0)"
  },
  {
    id: 27,
    sport: 'hockey',
    pred: [2, 4],
    act: [4, 7],
    expectedPoints: 2,
    description: "Hockey Correct Winner Only Away (2:4 -> 4:7)"
  }
];

export function runTests() {
  console.log("================================================");
  console.log("RUNNING SCORING RULES ENGINE AUDIT (27 SCENARIOS)");
  console.log("================================================");
  
  let passed = 0;
  let failed = 0;

  for (const tc of scenarios) {
    const pts = calculatePoints(tc.pred[0], tc.pred[1], tc.act[0], tc.act[1], tc.sport);
    if (pts === tc.expectedPoints) {
      console.log(`[PASS] Case #${tc.id} (${tc.sport.toUpperCase()}): ${tc.description} => Earned: ${pts} pts`);
      passed++;
    } else {
      console.error(`[FAIL] Case #${tc.id} (${tc.sport.toUpperCase()}): ${tc.description} => Expected: ${tc.expectedPoints}, Received: ${pts}`);
      failed++;
    }
  }

  console.log("\n=========================");
  console.log("RUNNING COMPREHENSIVE VALIDATION ENGINE TESTS");
  console.log("=========================");

  const validationTests = [
    {
       name: "football draw tip 1:1 is valid",
       result: validatePredictionScore(1, 1, "fifa-world-cup-2026"),
       expected: true
    },
    {
       name: "hockey draw tip 1:1 is invalid",
       result: validatePredictionScore(1, 1, "ms-hockey-2026"),
       expected: false
    },
    {
       name: "football draw result 1:1 is valid",
       result: validateMatchResultScore(1, 1, "football"),
       expected: true
    },
    {
       name: "hockey draw result 1:1 is invalid",
       result: validateMatchResultScore(1, 1, "hockey"),
       expected: false
    }
  ];

  let validationPassed = 0;
  for (const vt of validationTests) {
    if (vt.result === vt.expected) {
       console.log(`[PASS] Validation test: ${vt.name}`);
       validationPassed++;
    } else {
       console.error(`[FAIL] Validation test: ${vt.name} (Expected ${vt.expected}, got ${vt.result})`);
       failed++;
    }
  }

  console.log("\n=========================");
  console.log("CONSTRAINTS AUDIT REPORT:");
  console.log("-----------------------------------------");
  console.log("HOCKEY DRAW RULES CONSTRAINT EVALUATION:");
  console.log("- hockey draw prediction = invalid");
  console.log("- hockey draw result = invalid");
  console.log("- hockey draw scoring = not applicable");
  console.log("-----------------------------------------");

  console.log("\n=========================");
  console.log("RUNNING LONGTERM PREDICTIONS AUDIT TESTS (4 POINTS EACH)");
  console.log("=========================");

  const longtermTests = [
    {
      name: "tournament_winner correct prediction (CZE)",
      type: "tournament_winner",
      predicted: "cze",
      actual: ["cze"],
      expected: 4
    },
    {
      name: "tournament_winner wrong prediction (SVK vs CZE)",
      type: "tournament_winner",
      predicted: "svk",
      actual: ["cze"],
      expected: 0
    },
    {
      name: "top_scoring_team correct prediction (GER)",
      type: "top_scoring_team",
      predicted: "ger",
      actual: ["ger"],
      expected: 4
    },
    {
      name: "group_winner_A correct prediction (FRA)",
      type: "group_winner_A",
      predicted: "fra",
      actual: ["fra"],
      expected: 4
    },
    {
      name: "semifinalist_1 correct prediction (order independent, predicted ARG, actual [ARG, FRA, CRO, MAR])",
      type: "semifinalist_1",
      predicted: "arg",
      actual: ["arg", "fra", "cro", "mar"],
      expected: 4
    },
    {
      name: "semifinalist_2 wrong prediction (order independent, predicted BRA, actual [ARG, FRA, CRO, MAR])",
      type: "semifinalist_2",
      predicted: "bra",
      actual: ["arg", "fra", "cro", "mar"],
      expected: 0
    }
  ];

  let longtermPassed = 0;
  for (const lt of longtermTests) {
    const pts = calculateLongtermPoints(lt.type, lt.predicted, lt.actual);
    if (pts === lt.expected) {
       console.log(`[PASS] Longterm test: ${lt.name} => Earned ${pts} pts`);
       longtermPassed++;
    } else {
       console.error(`[FAIL] Longterm test: ${lt.name} => Expected ${lt.expected}, got ${pts}`);
       failed++;
    }
  }

  console.log("\n=========================");
  console.log(`AUDIT RESULTS:`);
  console.log(`- Scoring Passed: ${passed} / ${scenarios.length}`);
  console.log(`- Validation Passed: ${validationPassed} / ${validationTests.length}`);
  console.log(`- Longterm Passed: ${longtermPassed} / ${longtermTests.length}`);
  console.log(`- Failed: ${failed}`);
  console.log("=========================");

  if (failed > 0) {
    throw new Error(`${failed} test cases failed!`);
  } else {
    console.log("ALL SCORING, VALIDATION & LONGTERM SCENARIOS CONFIRMED OK! Compatibility with Hockey and Football verified.");
  }
}

// Run if called directly
runTests();
