/* Modelo puro del modo Preguntas: solo usa el dataset verificado y los
 * ejercicios guardados por el usuario (IA opcional). Sin red, sin Supabase. */

import { QUESTIONS_VERIFIED } from "../../data/questions-verified.module.js";
import { normalizeWrittenAnswer, selectPracticeDistractors } from "../practice-utils.js";

export const QUESTION_PROGRESS_STORAGE_KEY = "english_questions_progress_v1";
export const AI_QUESTIONS_STORAGE_KEY = "english_questions_ai_v1";
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const TENSE_LABELS = {
    "presente-simple": "Presente simple",
    "pasado-simple": "Pasado simple",
    "futuro-simple": "Futuro con will",
    "going-to": "Futuro con going to",
    "presente-continuo": "Presente continuo",
    "pasado-continuo": "Pasado continuo",
    "futuro-continuo": "Futuro continuo",
    "presente-perfecto": "Presente perfecto",
    "pasado-perfecto": "Pasado perfecto",
    "futuro-perfecto": "Futuro perfecto",
    "presente-perfecto-continuo": "Presente perfecto continuo",
    "pasado-perfecto-continuo": "Pasado perfecto continuo",
    "futuro-perfecto-continuo": "Futuro perfecto continuo",
    "be-presente": "Verbo be en presente",
    "be-pasado": "Verbo be en pasado",
    "it-impersonal": "Sujeto impersonal it",
    "there-be": "There is / there are",
    "modal": "Verbos modales",
    "modal-perfecto": "Modales en perfecto",
    "modal-continuo": "Modales continuos",
    "modal-pasivo": "Modales pasivos",
    "used-to": "Used to",
    "negativa-presente": "Preguntas negativas (presente)",
    "negativa-pasado": "Preguntas negativas (pasado)",
    "tag-presente": "Tag questions (presente)",
    "tag-perfecto": "Tag questions (perfecto)",
    "indirecta": "Preguntas indirectas",
    "otro": "Otras estructuras"
};

const TYPE_LABELS = {
    wh: "Preguntas WH",
    "wh-combinacion": "How / what + palabra",
    "yes-no": "Sí / no",
    indirecta: "Indirectas",
    tag: "Tag questions",
    negativa: "Negativas",
    eleccion: "De elección",
    preposicion: "Con preposición",
    eco: "Eco",
    retorica: "Retóricas",
    cortesia: "Cortesía y sugerencias",
    confirmacion: "Confirmación"
};

function buildSearchText(...values) {
    return normalizeWrittenAnswer(values.filter(Boolean).join(" "));
}

export const VERIFIED_QUESTIONS = QUESTIONS_VERIFIED.questions.map(question => ({
    ...question,
    source: "verified",
    searchText: buildSearchText(question.english, question.spanish, question.categoryTitle, question.context, question.answerGuide)
}));

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function uniqueSorted(entries, labels) {
    const found = new Map();
    entries.forEach(entry => {
        const id = String(entry || "").trim();
        if (id && !found.has(id)) found.set(id, id);
    });
    return [...found.keys()].sort((a, b) => (labels[a] || a).localeCompare(labels[b] || b, "es"));
}

export function getQuestionFilterOptions(questions = VERIFIED_QUESTIONS) {
    return {
        tenses: uniqueSorted(questions.map(item => item.tense), TENSE_LABELS).map(id => ({ id, label: TENSE_LABELS[id] || id })),
        words: uniqueSorted(questions.map(item => item.questionWord), {}).map(id => ({ id, label: id === "yes-no" ? "Sí / no (sin WH)" : id })),
        types: uniqueSorted(questions.map(item => item.type), TYPE_LABELS).map(id => ({ id, label: TYPE_LABELS[id] || id })),
        sections: [
            { id: "all", label: "Todas" },
            { id: "enciclopedia", label: "Preguntas directas" },
            { id: "incorporadas", label: "Dentro de oraciones" }
        ]
    };
}

export function loadAIQuestions(storage = globalThis.localStorage) {
    if (!storage) return [];
    try {
        const saved = JSON.parse(storage.getItem(AI_QUESTIONS_STORAGE_KEY) || "[]");
        return asArray(saved).filter(item => item?.english && item?.spanish).map(item => ({
            id: String(item.id),
            section: "ia",
            category: 0,
            categoryTitle: item.categoryTitle || "Ejemplos con IA",
            subsection: item.subsection || "",
            english: String(item.english).trim(),
            spanish: String(item.spanish).trim(),
            pattern: String(item.pattern || "").trim(),
            questionWord: String(item.questionWord || "other").trim(),
            tense: String(item.tense || "otro").trim(),
            type: String(item.type || "wh").trim(),
            related: "",
            answerGuide: String(item.answerGuide || "").trim(),
            context: String(item.context || "").trim(),
            source: "ai",
            sourceLine: 0,
            searchText: buildSearchText(item.english, item.spanish, item.categoryTitle, item.context, item.answerGuide)
        }));
    } catch {
        return [];
    }
}

export function saveAIQuestions(items, storage = globalThis.localStorage) {
    if (!storage) return [];
    const clean = asArray(items).map(item => ({
        id: String(item.id),
        english: String(item.english || "").trim(),
        spanish: String(item.spanish || "").trim(),
        pattern: String(item.pattern || "").trim(),
        questionWord: String(item.questionWord || "other"),
        tense: String(item.tense || "otro"),
        type: String(item.type || "wh"),
        answerGuide: String(item.answerGuide || "").trim(),
        context: String(item.context || "").trim(),
        categoryTitle: String(item.categoryTitle || "Ejemplos con IA")
    }));
    storage.setItem(AI_QUESTIONS_STORAGE_KEY, JSON.stringify(clean));
    return clean;
}

export function withAIQuestions(questions = VERIFIED_QUESTIONS, aiQuestions = []) {
    return [...questions, ...asArray(aiQuestions)];
}

export function filterQuestions(questions, filters = {}) {
    const tense = String(filters.tense || "all");
    const word = String(filters.word || "all");
    const type = String(filters.type || "all");
    const section = String(filters.section || "all");
    const source = String(filters.source || "all");
    const search = normalizeWrittenAnswer(filters.search || "");

    return asArray(questions).filter(question => {
        if (tense !== "all" && question.tense !== tense) return false;
        if (word !== "all" && question.questionWord !== word) return false;
        if (type !== "all" && question.type !== type) return false;
        if (section !== "all" && question.section !== section) return false;
        if (source === "verified" && question.source !== "verified") return false;
        if (source === "ai" && question.source !== "ai") return false;
        if (search && !(question.searchText || `${question.english} ${question.spanish}`.toLowerCase()).includes(search)) return false;
        return Boolean(question.english && question.spanish);
    });
}

export function loadQuestionProgress(storage = globalThis.localStorage) {
    if (!storage) return {};
    try {
        const saved = JSON.parse(storage.getItem(QUESTION_PROGRESS_STORAGE_KEY) || "{}");
        return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    } catch {
        return {};
    }
}

export function saveQuestionProgress(progress, storage = globalThis.localStorage) {
    if (!storage) return;
    storage.setItem(QUESTION_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

export function getQuestionProgress(progress, id) {
    return progress[id] || {
        attempts: 0,
        correct: 0,
        lapses: 0,
        repetitions: 0,
        intervalDays: 0,
        dueAt: 0,
        lastReviewedAt: 0
    };
}

export function recordQuestionOutcome(progress, id, isCorrect, { mode = "form", now = Date.now() } = {}) {
    const current = getQuestionProgress(progress, id);
    const next = { ...current, attempts: current.attempts + 1, lastReviewedAt: now, lastMode: mode };
    if (isCorrect) {
        next.correct += 1;
        next.repetitions += 1;
        next.lapses = 0;
        next.intervalDays = next.repetitions === 1 ? 1 : next.repetitions === 2 ? 6 : Math.round(current.intervalDays * 2.4) || 12;
    } else {
        next.lapses += 1;
        next.repetitions = 0;
        next.intervalDays = 0;
    }
    next.dueAt = isCorrect ? now + next.intervalDays * DAY_IN_MS : now;
    return { ...progress, [id]: next };
}

export function summaryQuestionProgress(progress, questions, now = Date.now()) {
    let newCount = 0;
    let dueCount = 0;
    let solidCount = 0;
    questions.forEach(question => {
        const item = getQuestionProgress(progress, question.id);
        if (item.attempts === 0) newCount += 1;
        else if (item.dueAt <= now || item.lapses > 0) dueCount += 1;
        else if (item.intervalDays >= 6) solidCount += 1;
    });
    return { newCount, dueCount, solidCount, total: questions.length };
}

export function selectNextQuestion(questions, progress = {}, { random = Math.random, now = Date.now(), excludeId = "" } = {}) {
    const usable = asArray(questions).filter(question => question.id !== excludeId);
    if (!usable.length) return null;
    const due = [];
    const fresh = [];
    const future = [];
    usable.forEach(question => {
        const item = getQuestionProgress(progress, question.id);
        if (item.attempts === 0) fresh.push(question);
        else if (item.dueAt <= now || item.lapses > 0) due.push(question);
        else future.push(question);
    });
    due.sort((a, b) => {
        const first = getQuestionProgress(progress, a.id);
        const second = getQuestionProgress(progress, b.id);
        return (second.lapses - first.lapses) || (first.dueAt - second.dueAt);
    });
    if (due.length) return due[0];
    const pool = fresh.length ? fresh : future;
    return pool[Math.floor(random() * pool.length)] || pool[0];
}

/* Normaliza también el signo de interrogación final: la puntuación no debe
 * decidir si una pregunta formada es correcta. */
export function normalizeQuestionAnswer(value) {
    return normalizeWrittenAnswer(value).replace(/[?!.]+$/g, "").trim();
}

export function checkFormedAnswer(entry, answer) {
    // Puede recibir la entrada verificada (english) o el ejercicio ya
    // construido (answer/question), que es lo que usa la interfaz.
    const expected = entry?.english || entry?.answer || entry?.question || "";
    if (!expected) return false;
    return normalizeQuestionAnswer(answer) === normalizeQuestionAnswer(expected);
}

function shuffleTokens(tokens, random) {
    const result = [...tokens];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const target = Math.floor(random() * (index + 1));
        [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
}

const EXERCISE_MODES = ["form", "answer", "choice"];

/* El modo mixto rota los tres formatos por posición de ejercicio, de modo que
 * la misma pregunta siempre conserve su tipo al navegar hacia atrás. */
export function resolveQuestionMode(mode, { index = 0 } = {}) {
    if (mode === "mixed") return EXERCISE_MODES[((index % EXERCISE_MODES.length) + EXERCISE_MODES.length) % EXERCISE_MODES.length];
    return EXERCISE_MODES.includes(mode) ? mode : "form";
}

/* Compara la respuesta escrita con la guía: ignora mayúsculas, tildes,
 * apóstrofos y puntuación. Acepta variaciones que conserven las palabras
 * clave; en modo estricto (opciones) solo vale la coincidencia exacta. */
export function checkWrittenAnswer(entry, answer, { strict = false } = {}) {
    const clean = value => normalizeWrittenAnswer(value)
        .replace(/[.,;:!?¿¡"'“”‘’()]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const expected = clean(entry?.answer || "");
    const given = clean(answer);
    if (!expected || !given) return false;
    if (expected === given) return true;
    if (strict) return false;
    const expectedWords = expected.split(" ").filter(Boolean);
    const givenWords = new Set(given.split(" "));
    const hits = expectedWords.filter(word => givenWords.has(word)).length;
    if (!expectedWords.length) return false;
    return expectedWords.length <= 3
        ? hits === expectedWords.length
        : hits / expectedWords.length >= 0.8;
}

/* Opciones para «Elegir respuesta»: la guía correcta más tres respuestas
 * distintas del propio grupo de preguntas (incluidas las generadas con IA). */
function buildChoiceOptions(entry, pool = [], random = Math.random) {
    const correct = String(entry?.answerGuide || entry?.related || "").trim();
    if (!correct) return [];
    const source = pool.length ? pool : VERIFIED_QUESTIONS;
    const candidates = source
        .filter(item => item && item.id !== entry?.id)
        .map(item => String(item.answerGuide || "").trim())
        .filter(Boolean)
        .map(word => ({ word }));
    const distractors = selectPracticeDistractors(candidates, correct, 3, random).map(item => item.word);
    return shuffleTokens([correct, ...distractors], random);
}

function answerLabelFor(entry) {
    return entry.answerSource === "generada"
        ? "Respuesta sugerida (generada)"
        : entry.answerGuide ? "Guía del documento" : "Pregunta directa relacionada";
}

function asSentence(value) {
    const text = String(value || "").trim();
    return text && !/[.?!]$/.test(text) ? `${text}.` : text;
}

/* Explicación derivada solo de los campos verificados del documento: forma
 * correcta o guía, estructura, tiempo, tipo, significado y contexto. */
function buildExplanation(entry, { mode, answer }) {
    const parts = [];
    parts.push(mode === "form"
        ? `Forma correcta: ${asSentence(entry.english)}`
        : `${answerLabelFor(entry)}: ${asSentence(answer || "sin respuesta modelo")}`);
    const pattern = String(entry.pattern || "").trim();
    if (pattern) parts.push(`Estructura: ${asSentence(pattern)}`);
    if (entry.tense) parts.push(`Tiempo: ${asSentence(TENSE_LABELS[entry.tense] || entry.tense)}`);
    if (entry.type) parts.push(`Tipo: ${asSentence(TYPE_LABELS[entry.type] || entry.type)}`);
    parts.push(`Significado: ${asSentence(entry.spanish)}`);
    const context = String(entry.context || "").trim();
    if (context) parts.push(`Contexto del documento: ${asSentence(context)}`);
    return parts.join(" ");
}

export function buildQuestionExercise(entry, { mode = "form", random = Math.random, index = 0, pool = [] } = {}) {
    if (!entry) return null;
    const resolvedMode = resolveQuestionMode(mode, { index });
    const isForm = resolvedMode === "form";
    const isChoice = resolvedMode === "choice";
    const guide = String(entry.answerGuide || entry.related || "");
    const context = String(entry.context || "");
    const questionWord = entry.questionWord === "yes-no" ? "Sí / no: elige el auxiliar correcto" : entry.questionWord;
    const tokens = shuffleTokens(
        String(entry.english).replace(/[?!]+$/, "").split(/\s+/).filter(Boolean),
        random
    );
    const answer = isForm ? String(entry.english) : guide;

    return {
        id: entry.id,
        source: entry.source || "verified",
        mode: resolvedMode,
        question: String(entry.english),
        translation: String(entry.spanish),
        pattern: String(entry.pattern || ""),
        categoryTitle: String(entry.categoryTitle || ""),
        tense: String(entry.tense || ""),
        questionWord: String(entry.questionWord || ""),
        sourceLabel: entry.source === "ai" ? "IA opcional" : `Pregunta verificada · ${entry.section === "incorporadas" ? "dentro de oraciones" : "enciclopedia"}`,
        prompt: isForm
            ? `Forma la pregunta en inglés: ${entry.spanish}`
            : isChoice
                ? "Lee la pregunta y elige la mejor respuesta."
                : `Lee la pregunta, responde en inglés y compara con la explicación.`,
        hint: isForm
            ? `💡 Empieza con: ${questionWord}${entry.pattern ? ` · Estructura: ${entry.pattern}` : ""}`
            : `💡 Significado: ${entry.spanish}${context ? ` · Contexto del documento: ${context}` : ""}`,
        answer,
        answerLabel: isForm ? "" : answerLabelFor(entry),
        explanation: buildExplanation(entry, { mode: resolvedMode, answer }),
        explanationLabel: isForm ? "Cómo se forma esta pregunta" : "Cómo se responde esta pregunta",
        hasModelAnswer: Boolean(guide),
        bank: isForm ? tokens : [],
        options: isChoice ? buildChoiceOptions(entry, pool, random) : []
    };
}
