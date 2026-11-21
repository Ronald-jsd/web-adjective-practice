/* Dictado construido SOLO con las frases que el usuario guardó. El audio se
 * reproduce con la voz del sistema (offline-first); la corrección compara
 * palabra por palabra con lo que el usuario escribió. No se inventa texto. */

import { compareWords } from "../shadowing/speaking-practice.js";

function usableSentences(sentences) {
    const seen = new Set();
    return (Array.isArray(sentences) ? sentences : []).filter(sentence => {
        const english = String(sentence?.englishText || "").trim();
        if (!english || seen.has(english.toLowerCase())) return false;
        seen.add(english.toLowerCase());
        return true;
    });
}

export function buildDictation(sentences, index = 0) {
    const usable = usableSentences(sentences);
    if (!usable.length) return null;
    const position = Math.abs(Number(index) || 0) % usable.length;
    const current = usable[position];
    return {
        sentence: String(current.englishText),
        translation: String(current.spanishTranslation || ""),
        sourceId: current.id ?? null,
        wordCount: String(current.englishText).trim().split(/\s+/).length
    };
}

export function dictationSourceCount(sentences) {
    return usableSentences(sentences).length;
}

/* Una frase se considera acertada solo si se escribieron todas sus palabras y
 * no sobró ninguna. `score` sirve para ver el avance, no para fingir precisión. */
export function checkDictation(expected, written) {
    const comparison = compareWords(expected, written);
    const spoken = comparison.spoken;
    const correct = comparison.total > 0 && comparison.matched === comparison.total && comparison.close === 0 && spoken === comparison.total;
    const effective = comparison.matched - comparison.close * 0.5;
    const base = comparison.total ? effective / comparison.total : 0;
    const penalty = spoken > comparison.total ? (spoken - comparison.total) / spoken : 0;
    const score = Math.max(0, Math.min(100, Math.round(base * 100 - penalty * 25)));
    const missed = comparison.result
        .filter(item => item.status !== "match")
        .map(item => item.text);
    return { correct, score, comparison, missed };
}
