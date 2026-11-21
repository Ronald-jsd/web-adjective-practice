/* Lógica pura de práctica de speaking.
 *
 * No toca el DOM ni la red: solo calcula una puntuación aproximada a partir de
 * lo que entendió el reconocimiento de voz, guarda el mejor intento por frase y
 * calcula cuándo conviene repetirla. Así se puede probar con node --test.
 *
 * Los datos que se muestran al usuario siguen siendo suyos (sus frases) o el
 * resultado de su propia grabación; aquí no se inventa contenido idiomático. */

export const MASTERY_THRESHOLD = 90;
export const REVIEW_INTERVALS_DAYS = [1, 2, 4, 7, 15, 30];
export const BEST_ATTEMPTS_STORAGE = "shadowing_speaking_best_v1";

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value, min, max) {
    const number = Math.round(Number(value) || 0);
    return Math.max(min, Math.min(max, number));
}

export function normalizedWords(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9']+/g, " ")
        .split(/\s+/)
        .filter(Boolean);
}

export function editDistance(left, right) {
    const rows = left.length + 1;
    const columns = right.length + 1;
    const matrix = Array.from({ length: rows }, () => Array(columns).fill(0));
    for (let leftIndex = 0; leftIndex < rows; leftIndex += 1) matrix[leftIndex][0] = leftIndex;
    for (let rightIndex = 0; rightIndex < columns; rightIndex += 1) matrix[0][rightIndex] = rightIndex;
    for (let leftIndex = 1; leftIndex < rows; leftIndex += 1) {
        for (let rightIndex = 1; rightIndex < columns; rightIndex += 1) {
            const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
            matrix[leftIndex][rightIndex] = Math.min(
                matrix[leftIndex - 1][rightIndex] + 1,
                matrix[leftIndex][rightIndex - 1] + 1,
                matrix[leftIndex - 1][rightIndex - 1] + cost
            );
        }
    }
    return matrix[rows - 1][columns - 1];
}

/* Comparación palabra por palabra: `match` (clara), `near` (parecida) y
 * `miss` (no detectada). Es una aproximación, no una evaluación fonética. */
export function compareWords(target, spoken) {
    const targetWords = normalizedWords(target);
    const spokenWords = [...normalizedWords(spoken)];
    let spokenCursor = 0;
    let matched = 0;
    let close = 0;
    const result = [];
    for (const referenceWord of targetWords) {
        const lookAhead = spokenWords.slice(spokenCursor, spokenCursor + 4);
        const exact = lookAhead.findIndex(word => word === referenceWord);
        if (exact >= 0) {
            const spokenWord = lookAhead[exact];
            spokenCursor += exact + 1;
            matched += 1;
            result.push({ text: referenceWord, status: "match", spoken: spokenWord });
            continue;
        }
        const near = lookAhead.findIndex(word => editDistance(word, referenceWord) <= Math.max(1, Math.floor(referenceWord.length / 3)));
        if (near >= 0) {
            const spokenWord = lookAhead[near];
            spokenCursor += near + 1;
            matched += 1;
            close += 1;
            result.push({ text: referenceWord, status: "near", spoken: spokenWord });
            continue;
        }
        result.push({ text: referenceWord, status: "miss", spoken: null });
    }
    return { result, matched, close, total: targetWords.length, spoken: spokenWords.length };
}

export function missedWords(comparison) {
    const seen = new Set();
    const missed = [];
    for (const item of comparison?.result || []) {
        if (item.status !== "miss" && item.status !== "near") continue;
        const word = String(item.text || "").trim();
        const key = word.toLowerCase();
        if (!word || seen.has(key)) continue;
        seen.add(key);
        missed.push(word);
    }
    return missed;
}

export function scoreAssessment(target, hypothesis, source = "speech") {
    const comparison = compareWords(target, hypothesis);
    const completeness = comparison.total ? clamp(((comparison.matched - comparison.close * 0.5) / comparison.total) * 100, 0, 100) : 0;
    const accuracy = comparison.spoken ? clamp(((comparison.matched - comparison.close * 0.5) / comparison.spoken) * 100, 0, 100) : 0;
    const fluency = clamp((completeness * 0.75) + (accuracy * 0.25), 0, 100);
    return {
        comparison,
        completeness,
        accuracy,
        fluency,
        score: fluency,
        missed: missedWords(comparison),
        source: source === "manual" ? "manual" : "speech"
    };
}

/* Clave estable: usa el id de la frase guardada cuando existe; si no, un hash
 * del texto. Así un intento nunca se mezcla con otra frase distinta. */
export function phraseKey(sentence) {
    const id = String(sentence?.id ?? "").trim();
    if (id) return `s:${id}`;
    const text = normalizedWords(sentence?.englishText || sentence?.english || sentence?.text || "").join(" ");
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
        hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
    }
    return `t:${Math.abs(hash)}:${text.length}`;
}

export function readBestAttempts(storage) {
    if (!storage) return {};
    try {
        const raw = storage.getItem(BEST_ATTEMPTS_STORAGE);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

export function writeBestAttempts(storage, attempts) {
    if (!storage) return false;
    try {
        storage.setItem(BEST_ATTEMPTS_STORAGE, JSON.stringify(attempts || {}));
        return true;
    } catch {
        return false;
    }
}

/* Conserva el mejor resultado de cada frase y programa la siguiente práctica.
 * Por debajo de 90% la frase vuelve a estar disponible de inmediato. */
export function saveBestAttempt(attempts, key, result, now = Date.now()) {
    if (!key) return { attempts, best: null, improved: false };
    const current = attempts[key] || null;
    const score = clamp(result?.score, 0, 100);
    const improved = !current || score > Number(current.score || 0);
    const mastered = score >= MASTERY_THRESHOLD;
    const previousBox = Number.isFinite(Number(current?.box)) ? Number(current.box) : -1;
    const box = mastered ? Math.min(previousBox + 1, REVIEW_INTERVALS_DAYS.length - 1) : -1;
    const dueAt = mastered ? now + REVIEW_INTERVALS_DAYS[box] * DAY_MS : now;
    const best = improved
        ? {
            score,
            accuracy: clamp(result?.accuracy, 0, 100),
            fluency: clamp(result?.fluency, 0, 100),
            completeness: clamp(result?.completeness, 0, 100),
            missed: Array.isArray(result?.missed) ? result.missed.slice(0, 12) : [],
            source: result?.source === "manual" ? "manual" : "speech",
            attempts: (Number(current?.attempts) || 0) + 1,
            box,
            dueAt,
            updatedAt: now,
            mastered
        }
        : { ...current, attempts: (Number(current?.attempts) || 0) + 1 };
    return { attempts: { ...attempts, [key]: best }, best, improved };
}

export function isDue(best, now = Date.now()) {
    return !best || Number(best.dueAt) <= now;
}

/* Calificación manual: la elige el usuario escuchando SU grabación. Se marca
 * como "manual" para no fingir que la máquina la puntuó. */
export function manualScore(grade) {
    const grades = { good: 95, ok: 72, again: 40 };
    const value = grades[String(grade || "").toLowerCase()];
    return value === undefined ? null : value;
}
