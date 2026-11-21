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
export function buildSkillsSummary({ sentenceCount = 0, reading = {}, dictation = {}, speaking = {} } = {}) {
    const entries = Object.values(speaking || {}).filter(Boolean);
    const mastered = entries.filter(item => Number(item.score) >= MASTERY_THRESHOLD).length;
    const speakingAnswered = entries.reduce((sum, item) => sum + (Number(item.attempts) || 0), 0);
    const skills = [
        {
            key: "reading",
            icon: "📖",
            label: "Lectura y comprensión",
            level: level({ answered: reading.answered || 0, correct: reading.correct || 0 }, 5),
            detail: `${reading.answered || 0} preguntas · ${reading.correct || 0} aciertos · ${sentenceCount} frases disponibles`
        },
        {
            key: "listening",
            icon: "🎧",
            label: "Escucha (dictado)",
            level: level({ answered: dictation.answered || 0, correct: dictation.correct || 0 }, 3),
            detail: `${dictation.answered || 0} dictados · ${dictation.correct || 0} aciertos · audio en tu dispositivo`
        },
        {
            key: "writing",
            icon: "✍️",
            label: "Escritura",
            level: level({ answered: dictation.answered || 0, correct: dictation.correct || 0 }, 3),
            detail: `${sentenceCount} frases guardadas · escribes lo que escuchas y lo comparas palabra por palabra`
        },
        {
            key: "speaking",
            icon: "🎤",
            label: "Pronunciación",
            level: mastered ? "strong" : speakingAnswered ? "growing" : "empty",
            detail: `${mastered} frases dominadas · ${speakingAnswered} intentos guardados · práctica con tu micrófono`
        }
    ];
    return skills.map(skill => ({ ...skill, levelLabel: LEVEL_LABELS[skill.level] }));
}
