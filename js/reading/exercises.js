/* Ejercicios de lectura y comprensión construidos SOLO con las frases que el
 * usuario guardó. No se inventan textos, traducciones ni preguntas de contenido:
 * las opciones son siempre traducciones reales de sus propias frases. */

import { createFillBlank, checkFillBlank } from "../sentences/exercises.js";

function rotated(list, seed = 0) {
    if (!list.length) return [];
    const offset = Math.abs(Number(seed) || 0) % list.length;
    return [...list.slice(offset), ...list.slice(0, offset)];
}

function usableSentences(sentences) {
    const seen = new Set();
    return (Array.isArray(sentences) ? sentences : []).filter(sentence => {
        const english = String(sentence?.englishText || "").trim();
        const spanish = String(sentence?.spanishTranslation || "").trim();
        const key = `${english.toLowerCase()}|${spanish.toLowerCase()}`;
        if (!english || !spanish || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/* Alterna dos tipos de comprensión:
 *  - "meaning": elegir la traducción correcta entre frases reales guardadas.
 *  - "cloze": completar una palabra de su propia frase. */
export function buildReadingQuestion(sentences, index = 0, seed = 0) {
    const usable = usableSentences(sentences);
    if (usable.length < 3) return null;
    const position = Math.abs(Number(index) || 0) % usable.length;
    const current = usable[position];
    if (Number(index) % 2 === 0) {
        const distractors = usable.filter(item => item !== current).slice(0, 2);
        if (distractors.length < 2) return null;
        const options = rotated([current, ...distractors], seed).map(item => ({
            id: String(item.id ?? item.englishText),
            text: String(item.spanishTranslation)
        }));
        return {
            type: "meaning",
            sentence: String(current.englishText),
            prompt: "¿Qué significa esta frase?",
            options,
            answerId: String(current.id ?? current.englishText),
            sourceIds: [current.id, ...distractors.map(item => item.id)]
        };
    }
    const blank = createFillBlank(current);
    if (!blank.missingWord) return null;
    return {
        type: "cloze",
        sentence: String(current.englishText),
        translation: String(current.spanishTranslation),
        prompt: blank.prompt,
        answer: blank.answer,
        sourceIds: [current.id]
    };
}

export function checkReadingAnswer(question, answer) {
    if (!question) return false;
    if (question.type === "meaning") return String(answer ?? "") === String(question.answerId ?? "");
    if (question.type === "cloze") return Boolean(checkFillBlank(answer, question).correct);
    return false;
}

export function readingAnswerText(question) {
    if (!question) return "";
    if (question.type === "meaning") {
        return question.options.find(option => String(option.id) === String(question.answerId))?.text || "";
    }
    return String(question.answer || "");
}

export function readingSourceCount(sentences) {
    return usableSentences(sentences).length;
}
