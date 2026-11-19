/* Una respuesta escrita cuenta aunque cambie el caso, lleve tilde o se le
 * olvide el punto final. Solo se ignoran signos alrededor del texto, nunca
 * dentro (por ejemplo el apóstrofo de "don't"). */
export function normalizeWrittenAnswer(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase()
        .trim()
        .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
        .replace(/\s+/g, " ");
}

function normalizePracticeAnswer(value) {
    return normalizeWrittenAnswer(value);
}

export function selectPracticeDistractors(items, correctAnswer, count = 3, random = Math.random) {
    const seenAnswers = new Set([normalizePracticeAnswer(correctAnswer)]);
    const selected = [];
    let candidateCount = 0;

    for (const item of items) {
        const normalized = normalizePracticeAnswer(item.word);
        if (!normalized || seenAnswers.has(normalized)) continue;
        seenAnswers.add(normalized);
        candidateCount += 1;

        if (selected.length < count) {
            selected.push(item);
            continue;
        }

        const replacementIndex = Math.floor(random() * candidateCount);
        if (replacementIndex < count) selected[replacementIndex] = item;
    }

    return selected;
}

export function rankPracticeReviews(items, getProgress) {
    return [...items].sort((first, second) => {
        const firstProgress = getProgress(first);
        const secondProgress = getProgress(second);
        return (secondProgress.lapses - firstProgress.lapses)
            || ((firstProgress.lastReviewedAt || 0) - (secondProgress.lastReviewedAt || 0))
            || (firstProgress.dueAt - secondProgress.dueAt);
    });
}

export function filterAudioPracticeItems(items, filter, getProgress, now = Date.now()) {
    if (filter === "new") return items.filter(item => getProgress(item).attempts === 0);
    if (filter === "review") {
        return items.filter(item => {
            const progress = getProgress(item);
            return progress.attempts > 0 && (progress.lapses > 0 || progress.dueAt <= now);
        });
    }
    return items;
}

export function getPracticeFillHint(spanish, exampleSpanish = "") {
    const hint = `💡 En español: ${spanish}`;
    return exampleSpanish ? `${hint} · Traducción del ejemplo: ${exampleSpanish}` : hint;
}
