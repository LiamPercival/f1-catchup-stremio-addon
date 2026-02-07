// Verification script for TVDB Episode Logic
// Based on: https://thetvdb.com/series/formula-1-1
// Verified counts:
// 2023: 6 Testing Episodes
// 2024: 5 Testing Episodes
// 2025: 6 Testing Episodes

const TVDB_SERIES_ID = 387219;

// Number of testing episodes at the start of each season
const TESTING_EPISODES = {
    2023: 6,
    2024: 5,
    2025: 6
};

// Map F1 Catchup session IDs to their 1-based index in a race weekend
// Standard: FP1(1), FP2(2), FP3(3), Quali(4), Race(5)
// Sprint:   FP1(1), SprintQuali(2), Sprint(3), Quali(4), Race(5)
const SESSION_INDEX = {
    "fp1": 1,
    "fp2": 2,
    "fp3": 3,
    "sprintquali": 2, // Sprint Shootout / Sprint Qualifying
    "sprint": 3,      // Sprint Race
    "qualifying": 4,
    "grandprix": 5
};

function getTvdbEpisode(year, round, sessionId) {
    if (!TESTING_EPISODES[year]) {
        console.warn(`Year ${year} not configured for TVDB mapping.`);
        return null;
    }

    const testingCount = TESTING_EPISODES[year];
    const sessionIdx = SESSION_INDEX[sessionId];

    if (!sessionIdx) {
        console.warn(`Unknown session ID: ${sessionId}`);
        return null;
    }

    // Formula: testing_episodes + (round_number - 1) * 5 + session_index
    return testingCount + (round - 1) * 5 + sessionIdx;
}

// Test Cases
const tests = [
    // 2024 (5 testing episodes)
    { year: 2024, round: 1, session: "qualifying", expected: 9, note: "R1 Bahrain Quali" },
    { year: 2024, round: 1, session: "grandprix", expected: 10, note: "R1 Bahrain Race" },
    { year: 2024, round: 5, session: "sprintquali", expected: 27, note: "R5 China Sprint Quali (5 + (4*5) + 2)" },
    { year: 2024, round: 5, session: "grandprix", expected: 30, note: "R5 China Race (5 + (4*5) + 5)" },

    // 2023 (6 testing episodes)
    { year: 2023, round: 1, session: "fp1", expected: 7, note: "R1 Bahrain FP1 (6 + 0 + 1)" },
];

console.log("Running TVDB Logic Verification...");
let passed = 0;
tests.forEach(t => {
    const result = getTvdbEpisode(t.year, t.round, t.session);
    const success = result === t.expected;
    console.log(`[${success ? "PASS" : "FAIL"}] ${t.year} R${t.round} ${t.session}: Expected ${t.expected}, Got ${result} (${t.note})`);
    if (success) passed++;
});

console.log(`\nPassed ${passed} / ${tests.length} tests.`);

if (passed === tests.length) {
    process.exit(0);
} else {
    process.exit(1);
}
