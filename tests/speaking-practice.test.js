import test from "node:test";
import assert from "node:assert/strict";
import {
    BEST_ATTEMPTS_STORAGE,
    MASTERY_THRESHOLD,
    compareWords,
    isDue,
    manualScore,
    missedWords,
    phraseKey,
    readBestAttempts,
    saveBestAttempt,
    scoreAssessment,
    writeBestAttempts
} from "../js/shadowing/speaking-practice.js";

function fakeStorage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        values
    };
}

test("scoreAssessment puntúa la frase dicha y marca las palabras falladas", () => {
    const perfect = scoreAssessment("The sky is clear today", "the sky is clear today");
    assert.equal(perfect.score, 100);
    assert.equal(perfect.completeness, 100);
    assert.deepEqual(perfect.missed, []);

    const partial = scoreAssessment("The sky is clear today", "the sky is clair");
    assert.ok(partial.score < 100);
    assert.ok(partial.score > 0);
    assert.ok(partial.missed.includes("today"));
    assert.equal(partial.source, "speech");
});

test("compareWords distingue claras, parecidas y falladas", () => {
    const result = compareWords("warm sunny day", "warm sunny day");
    assert.equal(result.matched, 3);
    assert.equal(result.close, 0);
    assert.deepEqual(result.result.map(item => item.status), ["match", "match", "match"]);

    const near = compareWords("warm", "warme");
    assert.equal(near.result[0].status, "near");
    assert.deepEqual(missedWords(near), ["warm"]);
});

test("phraseKey es estable y no mezcla frases distintas", () => {
    const sentence = { id: 42, englishText: "It is a sunny day" };
    assert.equal(phraseKey(sentence), "s:42");
    assert.equal(phraseKey({ englishText: "It is a sunny day" }), phraseKey({ englishText: "it is a sunny day" }));
    assert.notEqual(phraseKey({ englishText: "It is a sunny day" }), phraseKey({ englishText: "It is a rainy day" }));
    assert.equal(phraseKey({}), "t:0:0");
});

test("saveBestAttempt conserva el mejor intento y programa repaso", () => {
    const now = 1_700_000_000_000;
    const low = saveBestAttempt({}, "s:1", { score: 40, missed: ["sky"] }, now);
    assert.equal(low.best.score, 40);
    assert.deepEqual(low.best.missed, ["sky"]);
    assert.equal(low.best.dueAt, now);
    assert.equal(isDue(low.best, now), true);

    const high = saveBestAttempt(low.attempts, "s:1", { score: 96, missed: [] }, now);
    assert.equal(high.improved, true);
    assert.equal(high.best.score, 96);
    assert.equal(high.best.mastered, true);
    assert.equal(high.best.attempts, 2);
    assert.equal(isDue(high.best, now), false);
    assert.equal(isDue(high.best, now + 24 * 60 * 60 * 1000 + 1), true);

    const worse = saveBestAttempt(high.attempts, "s:1", { score: 55, missed: ["sky"] }, now);
    assert.equal(worse.best.score, MASTERY_THRESHOLD + 6);
    assert.equal(worse.best.attempts, 3);
});

test("la calificación manual queda marcada como manual, nunca como automática", () => {
    const score = manualScore("good");
    assert.equal(score, 95);
    const saved = saveBestAttempt({}, "s:2", { score, source: "manual" }, 0);
    assert.equal(saved.best.source, "manual");
    assert.equal(manualScore("inexistente"), null);
});

test("readBestAttempts resiste almacenamiento vacío o corrupto", () => {
    const storage = fakeStorage();
    assert.deepEqual(readBestAttempts(storage), {});
    storage.setItem(BEST_ATTEMPTS_STORAGE, "{no es json");
    assert.deepEqual(readBestAttempts(storage), {});
    const attempts = { "s:1": { score: 91 } };
    assert.equal(writeBestAttempts(storage, attempts), true);
    assert.deepEqual(readBestAttempts(storage), attempts);
    assert.deepEqual(readBestAttempts(null), {});
});
