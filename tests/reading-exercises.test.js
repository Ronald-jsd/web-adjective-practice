import test from "node:test";
import assert from "node:assert/strict";
import {
    buildReadingQuestion,
    checkReadingAnswer,
    readingAnswerText,
    readingSourceCount
} from "../js/reading/exercises.js";

const sentences = [
    { id: 1, englishText: "The sky is clear today.", spanishTranslation: "El cielo está despejado hoy." },
    { id: 2, englishText: "It is a sunny day.", spanishTranslation: "Es un día soleado." },
    { id: 3, englishText: "The weather is warm.", spanishTranslation: "El tiempo está cálido." }
];

test("buildReadingQuestion necesita al menos 3 frases guardadas", () => {
    assert.equal(buildReadingQuestion([]), null);
    assert.equal(buildReadingQuestion(sentences.slice(0, 2)), null);
    assert.ok(buildReadingQuestion(sentences, 0));
});

test("la pregunta de significado usa solo traducciones reales guardadas", () => {
    const question = buildReadingQuestion(sentences, 0, 0);
    assert.equal(question.type, "meaning");
    assert.equal(question.sentence, "The sky is clear today.");
    assert.equal(question.answerId, "1");
    assert.deepEqual(question.options.map(option => option.text), [
        "El cielo está despejado hoy.",
        "Es un día soleado.",
        "El tiempo está cálido."
    ]);
    assert.deepEqual(question.sourceIds, [1, 2, 3]);
});

test("la pregunta de cloze usa una palabra de la propia frase", () => {
    const question = buildReadingQuestion(sentences, 1);
    assert.equal(question.type, "cloze");
    assert.equal(question.sentence, "It is a sunny day.");
    assert.equal(question.answer, "sunny");
    assert.ok(question.prompt.includes("_______"));
    assert.ok(!question.prompt.includes("sunny"));
});

test("checkReadingAnswer valida ambos tipos de pregunta", () => {
    const meaning = buildReadingQuestion(sentences, 0, 0);
    assert.equal(checkReadingAnswer(meaning, "1"), true);
    assert.equal(checkReadingAnswer(meaning, "2"), false);
    assert.equal(checkReadingAnswer(null, "1"), false);

    const cloze = buildReadingQuestion(sentences, 1);
    assert.equal(checkReadingAnswer(cloze, "sunny"), true);
    assert.equal(checkReadingAnswer(cloze, "cloudy"), false);
});

test("readingAnswerText devuelve la respuesta correcta en ambos tipos", () => {
    assert.equal(readingAnswerText(buildReadingQuestion(sentences, 0, 0)), "El cielo está despejado hoy.");
    assert.equal(readingAnswerText(buildReadingQuestion(sentences, 1)), "sunny");
    assert.equal(readingAnswerText(null), "");
});

test("readingSourceCount ignora duplicados y frases incompletas", () => {
    const mixed = [
        ...sentences,
        { id: 4, englishText: "The sky is clear today.", spanishTranslation: "El cielo está despejado hoy." },
        { id: 5, englishText: "Sin traducir", spanishTranslation: "" },
        { id: 6, englishText: "", spanishTranslation: "Sin frase" }
    ];
    assert.equal(readingSourceCount(mixed), 3);
});
