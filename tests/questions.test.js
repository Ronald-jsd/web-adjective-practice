import test from "node:test";
import assert from "node:assert/strict";

import { QUESTIONS_VERIFIED } from "../data/questions-verified.module.js";
import { QUESTIONS_TEACHING } from "../data/questions-teaching.module.js";
import {
    AI_QUESTIONS_STORAGE_KEY,
    QUESTION_PROGRESS_STORAGE_KEY,
    VERIFIED_QUESTIONS,
    buildQuestionExercise,
    checkFormedAnswer,
    checkWrittenAnswer,
    filterQuestions,
    getQuestionFilterOptions,
    getQuestionProgress,
    loadAIQuestions,
    loadQuestionProgress,
    normalizeQuestionAnswer,
    recordQuestionOutcome,
    resolveQuestionMode,
    saveAIQuestions,
    saveQuestionProgress,
    selectNextQuestion,
    summaryQuestionProgress,
    withAIQuestions
} from "../js/questions/model.js";
import { addGeneratedQuestions } from "../js/questions/ai.js";

function fakeStorage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
}

test("el dataset de preguntas viene del documento y no contiene marcadores Markdown", () => {
    const questions = QUESTIONS_VERIFIED.questions;
    assert.ok(questions.length >= 500);
    assert.match(QUESTIONS_VERIFIED.meta.source, /PREGUNTAS - DRIVE/);
    const ids = new Set(questions.map(item => item.id));
    assert.equal(ids.size, questions.length);
    questions.forEach(item => {
        assert.ok(item.english && item.spanish, `traducción incompleta en ${item.id}`);
        assert.ok(!/[*`|]/.test(item.english), `Markdown en ${item.id}: ${item.english}`);
        assert.ok(!/[*`|]/.test(item.spanish), `Markdown en ${item.id}: ${item.spanish}`);
        assert.ok(item.tense && item.questionWord && item.type, `falta etiqueta en ${item.id}`);
    });
    for (const [section, total] of [["incorporadas", 12], ["enciclopedia", 60]]) {
        const categories = new Set(questions.filter(item => item.section === section).map(item => item.category));
        for (let number = 1; number <= total; number += 1) {
            assert.ok(categories.has(number), `falta ${section} categoría ${number}`);
        }
    }
});

test("las preguntas eco recuperadas conservan su contexto verificado", () => {
    const echo = VERIFIED_QUESTIONS.filter(item => item.section === "enciclopedia" && item.category === 8);
    assert.ok(echo.length >= 10);
    assert.ok(echo.every(item => item.english && item.spanish && item.context));
    const didYou = echo.find(item => item.english === "Did you?");
    assert.ok(didYou);
    assert.equal(didYou.context, "I saw Brad Pitt.");
    assert.equal(didYou.spanish, "¿Ah, sí?");
});

test("las respuestas explícitas del documento se usan como guía al responder", () => {
    const guided = VERIFIED_QUESTIONS.filter(item => item.answerGuide);
    assert.ok(guided.length >= 10);
    const rhetorical = guided.find(item => item.english === "Is the Pope Catholic?");
    assert.equal(rhetorical.answerGuide, "Obviamente sí.");
    const polite = guided.find(item => item.english === "Would you mind waiting?");
    assert.ok(polite.answerGuide.includes("No, not at all."));
    const exercise = buildQuestionExercise(polite, { mode: "answer" });
    assert.equal(exercise.answer, polite.answerGuide);
    assert.equal(exercise.answerLabel, "Guía del documento");
    assert.equal(exercise.hasModelAnswer, true);
});

test("el dataset cubre todos los tiempos, how much/many/long y preguntas incrustadas", () => {
    const tenses = new Set(VERIFIED_QUESTIONS.map(item => item.tense));
    for (const tense of ["presente-simple", "pasado-simple", "futuro-simple", "presente-continuo",
        "pasado-continuo", "futuro-continuo", "presente-perfecto", "pasado-perfecto",
        "futuro-perfecto", "presente-perfecto-continuo", "pasado-perfecto-continuo",
        "futuro-perfecto-continuo", "modal", "used-to", "indirecta"]) {
        assert.ok(tenses.has(tense), `falta el tiempo ${tense}`);
    }
    for (const word of ["how much", "how many", "how long", "how often", "how far", "how old"]) {
        assert.ok(VERIFIED_QUESTIONS.some(item => item.questionWord === word), `falta ${word}`);
    }
    assert.ok(VERIFIED_QUESTIONS.some(item => item.section === "incorporadas"));
});

test("los filtros combinan tiempo, palabra, tipo, fuente y búsqueda sin acentos", () => {
    const options = getQuestionFilterOptions();
    assert.ok(options.tenses.some(item => item.id === "presente-perfecto"));
    assert.ok(options.words.some(item => item.id === "how much"));
    const filtered = filterQuestions(VERIFIED_QUESTIONS, {
        tense: "presente-perfecto",
        word: "all",
        type: "all",
        section: "enciclopedia",
        source: "verified"
    });
    assert.ok(filtered.length > 0);
    assert.ok(filtered.every(item => item.tense === "presente-perfecto" && item.section === "enciclopedia"));

    const searched = filterQuestions(VERIFIED_QUESTIONS, { search: "cuanto cuesta" });
    assert.ok(searched.length > 0);
    assert.ok(searched.some(item => item.english === "How much does it cost?"));
    assert.equal(filterQuestions(VERIFIED_QUESTIONS, { source: "ai" }).length, 0);
});

test("los ejercicios de formar y responder usan la pregunta verificada", () => {
    const entry = VERIFIED_QUESTIONS.find(item => item.english === "How much does it cost?");
    const form = buildQuestionExercise(entry, { mode: "form", random: () => 0 });
    assert.equal(form.mode, "form");
    assert.equal(form.answer, "How much does it cost?");
    assert.equal(form.bank.length, 5);
    assert.ok(form.prompt.includes("cuánto"));
    assert.ok(checkFormedAnswer(form, "  how much does it cost. "));
    assert.equal(checkFormedAnswer(form, "How much do it cost?"), false);
    assert.equal(normalizeQuestionAnswer("Where do you live?!"), "where do you live");

    const answer = buildQuestionExercise({ ...entry, answerGuide: "It costs ten dollars." }, { mode: "answer" });
    assert.equal(answer.mode, "answer");
    assert.equal(answer.answer, "It costs ten dollars.");
    assert.equal(answer.hasModelAnswer, true);
    assert.ok(answer.hint.includes("Significado:"));
    assert.equal(answer.bank.length, 0);
});

test("todas las preguntas tienen respuesta: las del documento y las sugeridas localmente", () => {
    const questions = VERIFIED_QUESTIONS;
    assert.ok(questions.every(item => item.answerGuide && item.answerGuide.trim()), "falta respuesta modelo");
    assert.ok(questions.every(item => ["documento", "generada"].includes(item.answerSource)));
    assert.ok(questions.some(item => item.answerSource === "documento"));
    const generated = questions.filter(item => item.answerSource === "generada");
    assert.ok(generated.length > 400);
    assert.ok(generated.every(item => !/undefined|null|\[object/.test(item.answerGuide)));
    const exercise = buildQuestionExercise(generated[0], { mode: "answer" });
    assert.equal(exercise.answerLabel, "Respuesta sugerida (generada)");
    assert.equal(exercise.hasModelAnswer, true);
});

test("la guía de enseñanza del documento incluye reglas, estructuras y notas", () => {
    assert.match(QUESTIONS_TEACHING.meta.source, /PREGUNTAS - DRIVE/);
    assert.ok(QUESTIONS_TEACHING.sections.length >= 100);
    const sections = QUESTIONS_TEACHING.sections;
    assert.ok(sections.some(item => /REGLA DE ORO/i.test(item.title) && item.paragraphs.length >= 4));
    assert.ok(sections.some(item => /CATEGORÍA 1:/i.test(item.title)));
    assert.ok(sections.some(item => /1\.1 WH-words/i.test(item.title) && item.tables.length > 0));
    assert.ok(sections.some(item => item.notes.some(note => /Nota|Uso/i.test(note))));
    sections.forEach(item => {
        item.paragraphs.concat(item.notes).forEach(value => {
            assert.ok(!/[*`|]/.test(value), `Markdown en ${item.id}: ${value}`);
        });
    });
});

test("el progreso prioriza preguntas vencidas y persiste en localStorage", () => {
    const storage = fakeStorage();
    const items = [
        { id: "a", english: "A?" },
        { id: "b", english: "B?" },
        { id: "c", english: "C?" }
    ];
    const now = Date.now();
    let progress = recordQuestionOutcome({}, "a", false, { now });
    progress = recordQuestionOutcome(progress, "b", true, { now });
    assert.equal(getQuestionProgress(progress, "a").lapses, 1);
    assert.equal(getQuestionProgress(progress, "b").intervalDays, 1);
    assert.equal(selectNextQuestion(items, progress, { now, random: () => 0 })?.id, "a");
    assert.equal(selectNextQuestion(items, progress, { now, excludeId: "a", random: () => 0 })?.id, "c");
    saveQuestionProgress(progress, storage);
    assert.deepEqual(loadQuestionProgress(storage), progress);
    assert.ok(storage.getItem(QUESTION_PROGRESS_STORAGE_KEY));
    const summary = summaryQuestionProgress(progress, items, now);
    assert.equal(summary.newCount, 1);
    assert.equal(summary.dueCount, 1);
});

test("los ejemplos de IA se guardan localmente, se deduplican y se pueden borrar", () => {
    const storage = fakeStorage();
    const generated = [
        { english: "How many bicycles does your sister own?", spanish: "¿Cuántas bicicletas tiene tu hermana?", answerGuide: "She owns two." },
        { english: "How many bicycles does your sister own?", spanish: "Duplicada" },
        { english: "Why did the cat knock the glass over?", spanish: "¿Por qué el gato tiró el vaso?", answerGuide: "It wanted attention." },
        // Ya existe en el dataset verificado: debe descartarse sin guardarse.
        { english: "How much water do you need?", spanish: "¿Cuánta agua necesitas?" }
    ];
    const accepted = addGeneratedQuestions(generated, { storage, existing: VERIFIED_QUESTIONS });
    assert.equal(accepted.length, 2);
    assert.ok(accepted.every(item => item.english !== "How much water do you need?"));
    const saved = loadAIQuestions(storage);
    assert.equal(saved.length, 2);
    assert.ok(saved.every(item => item.source === "ai" && item.id.startsWith("ai-")));
    assert.equal(filterQuestions(withAIQuestions(VERIFIED_QUESTIONS, saved), { source: "ai" }).length, 2);
    saveAIQuestions([], storage);
    assert.equal(loadAIQuestions(storage).length, 0);
    storage.setItem(AI_QUESTIONS_STORAGE_KEY, "[]");
    assert.equal(loadAIQuestions(storage).length, 0);
});

test("el modo mixto rota tres formatos y cada respuesta incluye su explicación", () => {
    assert.equal(resolveQuestionMode("mixed", { index: 0 }), "form");
    assert.equal(resolveQuestionMode("mixed", { index: 1 }), "answer");
    assert.equal(resolveQuestionMode("mixed", { index: 2 }), "choice");
    assert.equal(resolveQuestionMode("mixed", { index: 3 }), "form");
    assert.equal(resolveQuestionMode("answer", { index: 1 }), "answer");
    assert.equal(resolveQuestionMode("choice", { index: 1 }), "choice");
    const entry = VERIFIED_QUESTIONS.find(item => item.english === "How much does it cost?");
    const form = buildQuestionExercise(entry, { mode: "mixed", index: 0, random: () => 0 });
    const answer = buildQuestionExercise(entry, { mode: "mixed", index: 1, random: () => 0 });
    const choice = buildQuestionExercise(entry, { mode: "mixed", index: 2, random: () => 0, pool: VERIFIED_QUESTIONS });
    assert.equal(form.mode, "form");
    assert.equal(answer.mode, "answer");
    assert.equal(choice.mode, "choice");
    assert.equal(form.explanationLabel, "Cómo se forma esta pregunta");
    assert.match(form.explanation, /Forma correcta: How much does it cost\?/);
    assert.match(form.explanation, /Significado:/);
    assert.equal(answer.explanationLabel, "Cómo se responde esta pregunta");
    assert.match(answer.explanation, /(Guía del documento|Respuesta sugerida \(generada\)):/);
    assert.match(answer.explanation, /Estructura:|Tiempo:/);
    assert.ok(answer.explanation.includes(answer.answer));
    assert.equal(choice.explanation, answer.explanation);
    assert.ok(VERIFIED_QUESTIONS.every(item => buildQuestionExercise(item, { mode: "mixed", index: 0 }).explanation));
});

test("la corrección escrita tolera variaciones y distingue una sola opción correcta", () => {
    const exercise = { answer: "It costs ten dollars." };
    assert.equal(checkWrittenAnswer(exercise, "it costs ten dollars"), true);
    assert.equal(checkWrittenAnswer(exercise, "  It Costs TEN dollars!  "), true);
    assert.equal(checkWrittenAnswer(exercise, "It costs ten dollars, please."), true);
    assert.equal(checkWrittenAnswer(exercise, "It costs five dollars."), false);
    assert.equal(checkWrittenAnswer(exercise, "Something else."), false);
    assert.equal(checkWrittenAnswer(exercise, ""), false);
    assert.equal(checkWrittenAnswer(exercise, "it costs ten dollars", { strict: true }), true);
    assert.equal(checkWrittenAnswer(exercise, "Costs ten dollars.", { strict: true }), false);

    const entry = VERIFIED_QUESTIONS.find(item => item.english === "How much does it cost?");
    const choice = buildQuestionExercise(entry, { mode: "choice", random: () => 0.42, pool: VERIFIED_QUESTIONS });
    assert.equal(choice.options.length, 4);
    assert.equal(new Set(choice.options.map(value => value.toLocaleLowerCase())).size, 4);
    assert.ok(choice.options.includes(choice.answer));
    assert.ok(["Guía del documento", "Respuesta sugerida (generada)", "Pregunta directa relacionada"].includes(choice.answerLabel));
    assert.equal(choice.options.filter(option => checkWrittenAnswer(choice, option, { strict: true })).length, 1);
});
