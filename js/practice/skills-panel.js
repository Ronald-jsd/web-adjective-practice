/* Resumen de habilidades con datos que la app realmente registró: frases
 * guardadas, aciertos en lectura/dictado y-mejor intento de speaking. No se
 * inventan métricas ni se mezclan con puntuaciones de la nube. */

import { MASTERY_THRESHOLD } from "../shadowing/speaking-practice.js";

export const READING_STATS_STORAGE = "practice_reading_stats_v1";
export const DICTATION_STATS_STORAGE = "practice_dictation_stats_v1";

function safeStorage() {
    try {
        return window.localStorage || null;
    } catch {
        return null;
    }
}

export function readPracticeStats(storage, key) {
    const target = storage || safeStorage();
    if (!target) return { answered: 0, correct: 0 };
    try {
        const parsed = JSON.parse(target.getItem(key) || "null");
        return {
            answered: Math.max(0, Number(parsed?.answered) || 0),
            correct: Math.max(0, Number(parsed?.correct) || 0)
        };
    } catch {
        return { answered: 0, correct: 0 };
    }
}

export function recordPracticeResult(storage, key, correct) {
    const target = storage || safeStorage();
    if (!target) return false;
    const current = readPracticeStats(target, key);
    const next = {
        answered: current.answered + 1,
        correct: current.correct + (correct ? 1 : 0)
    };
    try {
        target.setItem(key, JSON.stringify(next));
        return true;
    } catch {
        return false;
    }
}

function level(stats, minimum) {
    if (!stats.answered) return "empty";
    if (stats.answered < minimum) return "starting";
    const accuracy = Math.round(stats.correct / stats.answered * 100);
    if (accuracy >= 80) return "strong";
    return "growing";
}

const LEVEL_LABELS = {
    empty: "Sin práctica todavía",
    starting: "Primeros pasos",
    growing: "En progreso",
    strong: "Buen ritmo"
};

/* `speaking` es el mapa de mejores intentos guardado por Shadowing. */
function progress(answered, target) {
    const goal = Math.max(1, Number(target) || 1);
    return Math.min(100, Math.round((Number(answered) || 0) / goal * 100));
}

function accuracy(answered, correct) {
    return answered ? Math.round(correct / answered * 100) : 0;
}

/* «1 pregunta» y «2 preguntas»: evita textos como «1 preguntas». */
function count(number, singular, plural) {
    const value = Number(number) || 0;
    return `${value} ${value === 1 ? singular : plural}`;
}

export function buildSkillsSummary({ sentenceCount = 0, reading = {}, dictation = {}, speaking = {} } = {}) {
    const entries = Object.values(speaking || {}).filter(Boolean);
    const mastered = entries.filter(item => Number(item.score) >= MASTERY_THRESHOLD).length;
    const speakingAnswered = entries.reduce((sum, item) => sum + (Number(item.attempts) || 0), 0);
    const readingAnswered = Number(reading.answered) || 0;
    const readingCorrect = Number(reading.correct) || 0;
    const dictationAnswered = Number(dictation.answered) || 0;
    const dictationCorrect = Number(dictation.correct) || 0;
    const readingTarget = Math.max(10, sentenceCount * 2);
    const dictationTarget = Math.max(5, sentenceCount);
    const writingTarget = Math.max(5, sentenceCount);
    const speakingTarget = Math.max(5, entries.length);

    const skills = [
        {
            key: "reading",
            icon: "📖",
            label: "Lectura y comprensión",
            level: level({ answered: readingAnswered, correct: readingCorrect }, 5),
            detail: `${count(readingAnswered, "pregunta", "preguntas")} · ${count(readingCorrect, "acierto", "aciertos")} · ${count(sentenceCount, "frase disponible", "frases disponibles")}`,
            answered: readingAnswered,
            correct: readingCorrect,
            target: readingTarget,
            progress: progress(readingAnswered, readingTarget),
            nextStep: readingAnswered < 5 ? "Haz 5 preguntas para empezar" : "Sigue con 5 preguntas más"
        },
        {
            key: "listening",
            icon: "🎧",
            label: "Escucha (dictado)",
            level: level({ answered: dictationAnswered, correct: dictationCorrect }, 3),
            detail: `${count(dictationAnswered, "dictado", "dictados")} · ${count(dictationCorrect, "acierto", "aciertos")} · audio en tu dispositivo`,
            answered: dictationAnswered,
            correct: dictationCorrect,
            target: dictationTarget,
            progress: progress(dictationAnswered, dictationTarget),
            nextStep: dictationAnswered < 3 ? "Haz 3 dictados para empezar" : "Repite las frases que fallaste"
        },
        {
            key: "writing",
            icon: "✍️",
            label: "Escritura",
            level: level({ answered: dictationAnswered, correct: dictationCorrect }, 3),
            detail: `${count(sentenceCount, "frase guardada", "frases guardadas")} · escribes lo que escuchas y lo comparas palabra por palabra`,
            answered: dictationAnswered,
            correct: dictationCorrect,
            target: writingTarget,
            progress: progress(dictationAnswered, writingTarget),
            nextStep: dictationAnswered < 3 ? "Escribe 3 dictados para empezar" : "Escribe un dictado completo"
        },
        {
            key: "speaking",
            icon: "🎤",
            label: "Pronunciación",
            level: mastered ? "strong" : speakingAnswered ? "growing" : "empty",
            detail: `${count(mastered, "frase dominada", "frases dominadas")} · ${count(speakingAnswered, "intento guardado", "intentos guardados")} · práctica con tu micrófono`,
            answered: speakingAnswered,
            correct: mastered,
            target: speakingTarget,
            progress: progress(mastered, speakingTarget),
            nextStep: mastered < 3 ? "Graba y domina 3 frases" : "Repasa las frases que bajaron del 90%"
        }
    ];
    return skills.map(skill => ({ ...skill, levelLabel: LEVEL_LABELS[skill.level], accuracy: accuracy(skill.answered, skill.correct) }));
}
