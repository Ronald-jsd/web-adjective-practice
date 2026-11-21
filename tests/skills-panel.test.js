import test from "node:test";
import assert from "node:assert/strict";
import {
    DICTATION_STATS_STORAGE,
    READING_STATS_STORAGE,
    buildSkillsSummary,
    readPracticeStats,
    recordPracticeResult
} from "../js/practice/skills-panel.js";

function fakeStorage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value))
    };
}

test("readPracticeStats resiste datos vacíos o corruptos", () => {
    const storage = fakeStorage();
    assert.deepEqual(readPracticeStats(storage, READING_STATS_STORAGE), { answered: 0, correct: 0 });
    storage.setItem(READING_STATS_STORAGE, "{mal json");
    assert.deepEqual(readPracticeStats(storage, READING_STATS_STORAGE), { answered: 0, correct: 0 });
});

test("recordPracticeResult acumula intentos y aciertos por habilidad", () => {
    const storage = fakeStorage();
    recordPracticeResult(storage, READING_STATS_STORAGE, true);
    recordPracticeResult(storage, READING_STATS_STORAGE, false);
    recordPracticeResult(storage, DICTATION_STATS_STORAGE, true);
    assert.deepEqual(readPracticeStats(storage, READING_STATS_STORAGE), { answered: 2, correct: 1 });
    assert.deepEqual(readPracticeStats(storage, DICTATION_STATS_STORAGE), { answered: 1, correct: 1 });
});

test("buildSkillsSummary usa solo datos registrados", () => {
    const skills = buildSkillsSummary({
        sentenceCount: 12,
        reading: { answered: 10, correct: 9 },
        dictation: { answered: 6, correct: 5 },
        speaking: { "s:1": { score: 95, attempts: 3 }, "s:2": { score: 60, attempts: 2 } }
    });
    assert.equal(skills.length, 4);
    assert.deepEqual(skills.map(skill => skill.key), ["reading", "listening", "writing", "speaking"]);
    assert.equal(skills[0].level, "strong");
    assert.equal(skills[1].level, "strong");
    assert.equal(skills[3].level, "strong");
    assert.match(skills[3].detail, /1 frases dominadas/);
    assert.match(skills[3].detail, /5 intentos/);
});

test("sin datos, todas las habilidades aparecen como sin práctica", () => {
    const skills = buildSkillsSummary({ sentenceCount: 0 });
    assert.ok(skills.every(skill => skill.level === "empty"));
    assert.ok(skills.every(skill => skill.levelLabel === "Sin práctica todavía"));
});
