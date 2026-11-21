import test from "node:test";
import assert from "node:assert/strict";
import {
    buildDictation,
    checkDictation,
    dictationSourceCount
} from "../js/practice/dictation.js";

const sentences = [
    { id: 1, englishText: "It is a sunny day.", spanishTranslation: "Es un día soleado." },
    { id: 2, englishText: "We keep moving forward.", spanishTranslation: "Seguimos avanzando." },
    { id: 3, englishText: "It is a sunny day.", spanishTranslation: "Es un día soleado." },
    { id: 4, englishText: "", spanishTranslation: "Sin frase" }
];

test("buildDictation usa solo frases guardadas y salta duplicados", () => {
    assert.equal(dictationSourceCount(sentences), 2);
    assert.equal(buildDictation([]), null);
    const first = buildDictation(sentences, 0);
    assert.equal(first.sentence, "It is a sunny day.");
    assert.equal(first.translation, "Es un día soleado.");
    assert.equal(first.sourceId, 1);
    assert.equal(first.wordCount, 5);
    assert.equal(buildDictation(sentences, 1).sentence, "We keep moving forward.");
    assert.equal(buildDictation(sentences, 2).sentence, first.sentence);
});

test("checkDictation acierta solo con todas las palabras y sin añadidas", () => {
    const expected = "It is a sunny day";
    const perfect = checkDictation(expected, "it is a sunny day");
    assert.equal(perfect.correct, true);
    assert.equal(perfect.score, 100);
    assert.deepEqual(perfect.missed, []);

    const partial = checkDictation(expected, "it is a suny day");
    assert.equal(partial.correct, false);
    assert.ok(partial.score > 0);
    assert.ok(partial.score < 100);
    assert.deepEqual(partial.missed, ["sunny"]);

    const extra = checkDictation(expected, "it is a sunny day today");
    assert.equal(extra.correct, false);

    const missing = checkDictation(expected, "it is sunny");
    assert.equal(missing.correct, false);
    assert.deepEqual(missing.missed, ["a", "day"]);
});
