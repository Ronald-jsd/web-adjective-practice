const SPANISH_EXPLANATIONS = {
    "don't": "Usa «don't» con I, you, we y they para negar en presente.",
    "doesn't": "Usa «doesn't» con he, she e it; el verbo principal va en forma base.",
    "didn't": "Después de «didn't», el verbo principal va en forma base.",
    "am": "Usa «am» con el sujeto «I».",
    "is": "Usa «is» con he, she o it, o con un sujeto singular.",
    "are": "Usa «are» con you, we o they, o con un sujeto plural.",
    "a": "«A» acompaña a un sustantivo singular que empieza con sonido consonántico.",
    "an": "«An» acompaña a un sustantivo singular que empieza con sonido vocálico.",
    "the": "«The» se usa cuando hablamos de algo específico o conocido."
}

export function createFillBlank(sentence) {
    const words = sentence.englishText.match(/\b[\w'-]+\b/g) || []
    const candidates = words.filter(word => word.length > 3 && !/^(that|this|with|from|have|your|will|when|what|there)$/i.test(word))
    if (!candidates.length) {
        return { prompt: sentence.spanishTranslation || "Recall your sentence.", answer: sentence.englishText, missingWord: "" }
    }

    const target = candidates[Math.floor(Math.random() * candidates.length)]
    const escaped = escapeRegExp(target)
    return {
        prompt: sentence.englishText.replace(new RegExp(`\\b${escaped}\\b`, "i"), "_______"),
        answer: target,
        missingWord: target
    }
}

export function checkFillBlank(userAnswer, exercise) {
    const answer = normalizeAnswer(userAnswer)
    const expected = normalizeAnswer(exercise.answer)
    const correct = answer === expected
    const key = expected.toLowerCase()
    return {
        correct,
        explanation: correct ? "" : SPANISH_EXPLANATIONS[key] || "Revisa el orden de las palabras y la forma verbal en la oración."
    }
}

export function isDifficult(sentence) {
    return sentence.totalFailures >= 2 || sentence.totalAttempts >= 3 && sentence.totalFailures / sentence.totalAttempts >= 0.5
}

export function normalizeAnswer(value) {
    return String(value || "").trim().toLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g, " ")
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
