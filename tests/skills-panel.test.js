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
    assert.match(skills[3].detail, /1 frase dominada/);
    assert.match(skills[3].detail, /5 intentos guardados/);
});

test("buildSkillsSummary calcula objetivo, progreso y precisión reales", () => {
    const skills = buildSkillsSummary({
        sentenceCount: 12,
        reading: { answered: 10, correct: 9 },
        dictation: { answered: 6, correct: 5 },
        speaking: { "s:1": { score: 95, attempts: 3 }, "s:2": { score: 60, attempts: 2 } }
    });
    const [reading, listening, writing, speaking] = skills;

    assert.equal(reading.target, 24);
    assert.equal(reading.progress, 42);
    assert.equal(reading.accuracy, 90);
    assert.match(reading.nextStep, /5 preguntas/);

    assert.equal(listening.target, 12);
    assert.equal(listening.progress, 50);
    assert.equal(listening.accuracy, 83);

    assert.equal(writing.progress, 50);
    assert.match(writing.nextStep, /dictado completo/);

    assert.equal(speaking.target, 5);
    assert.equal(speaking.progress, 20);
    assert.equal(speaking.accuracy, 20);
    assert.match(speaking.nextStep, /3 frases/);
});

test("el progreso nunca supera el 100% ni baja de 0", () => {
    const skills = buildSkillsSummary({
        sentenceCount: 2,
        reading: { answered: 999, correct: 999 },
        dictation: { answered: 0, correct: 0 }
    });
    assert.equal(skills[0].progress, 100);
    assert.equal(skills[1].progress, 0);
});

test("sin datos, todas las habilidades aparecen como sin práctica", () => {
    const skills = buildSkillsSummary({ sentenceCount: 0 });
    assert.ok(skills.every(skill => skill.level === "empty"));
    assert.ok(skills.every(skill => skill.levelLabel === "Sin práctica todavía"));
    assert.ok(skills.every(skill => skill.progress === 0));
    assert.ok(skills.every(skill => skill.accuracy === 0));
    assert.ok(skills.every(skill => typeof skill.nextStep === "string" && skill.nextStep.length > 0));
});
