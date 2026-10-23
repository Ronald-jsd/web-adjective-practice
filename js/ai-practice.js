const AI_PRACTICE_CATEGORY_ID = "ai-queries";
const VERB_PRACTICE_CATEGORY_ID = "saved-verbs";
export const FAVORITES_PRACTICE_CATEGORY_ID = "vocabulary-favorites";
export const FAVORITE_ADJECTIVES_PRACTICE_CATEGORY_ID = "favorite-adjectives";
export const FAVORITE_VERBS_PRACTICE_CATEGORY_ID = "favorite-verbs";

export function createAIPracticeCategory(queries) {
    const items = queries.flatMap(query => {
        if (!Array.isArray(query.cards)) {
            throw new Error(`La consulta guardada ${query.id} no contiene una lista de tarjetas válida.`);
        }

        return query.cards.map((card, index) => {
            const fields = ["word", "pronunciation", "spanish", "example_en", "example_es"];
            if (!card || fields.some(field => typeof card[field] !== "string" || !card[field].trim())) {
                throw new Error(`Una tarjeta de la consulta guardada ${query.id} está incompleta.`);
            }

            return [
                card.word.trim(),
                card.pronunciation.trim(),
                card.spanish.trim(),
                card.example_en.trim(),
                card.example_es.trim(),
                `ai-query-${query.id}-${index}`,
                index
            ];
        });
    });

    if (!items.length) return null;

    return {
        id: AI_PRACTICE_CATEGORY_ID,
        title: "Consultas de IA",
        subtitle: "Tarjetas y ejemplos de tus consultas guardadas",
        icon: "🤖",
        color: "bg-purple-100",
        subcategories: [{
            id: "ai-query-cards",
            title: "Tarjetas de IA",
            color: "bg-purple-100",
            items
        }]
    };
}

export function createAIExamplePrompt(word, example, exampleSpanish = "") {
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wordPattern = new RegExp(`\\b${escapedWord}\\b`, "i");
    if (example && wordPattern.test(example)) {
        return example.replace(wordPattern, "_____").replace(/\s+([.,!?;:])/g, "$1");
    }
    if (example) return `¿Qué expresión completa este ejemplo? ${example}`;
    return `Completa con la palabra en inglés: ${exampleSpanish}`;
}

export function createVerbPracticeCategory(verbs) {
    const items = verbs
        .filter(verb => typeof verb.verb === "string" && verb.verb.trim())
        .flatMap(verb => {
            const baseTranslation = getUsableValue(verb.translation) || verb.verb.trim();
            const forms = [
                {
                    form: verb.verb,
                    pronunciation: verb.pronunciation,
                    translation: baseTranslation,
                    example: verb.example_base,
                    id: "base"
                },
                {
                    form: verb.past_simple,
                    pronunciation: verb.pronunciation_ps,
                    translation: getUsableValue(verb.translation_ps) || baseTranslation,
                    example: verb.example_ps,
                    id: "past-simple"
                },
                {
                    form: verb.past_participle,
                    pronunciation: verb.pronunciation_pp,
                    translation: getUsableValue(verb.translation_pp) || baseTranslation,
                    example: verb.example_pp,
                    id: "past-participle"
                }
            ];

            return forms
                .filter(form => getUsableValue(form.form))
                .map(form => {
                    const [example, exampleSpanish] = splitTranslatedExample(form.example);
                    return [
                        form.form.trim(),
                        getUsableValue(form.pronunciation),
                        getUsableValue(form.translation) || baseTranslation,
                        example,
                        exampleSpanish,
                        `saved-verb-${verb.id}-${form.id}`
                    ];
                });
        })
        .filter(item => item[2]);

    if (!items.length) return null;

    return {
        id: VERB_PRACTICE_CATEGORY_ID,
        title: "Verbos guardados",
        subtitle: "Verbos disponibles en tu guía",
        icon: "📝",
        color: "bg-blue-100",
        subcategories: [{
            id: "saved-verb-cards",
            title: "Todos los verbos",
            color: "bg-blue-100",
            items
        }]
    };
}

export function createFavoritesPracticeCategory(categories, verbs, favoriteSet) {
    const adjectiveItems = [...new Map(categories.flatMap(category =>
        (category.subcategories || []).flatMap(subcategory =>
            (subcategory.items || []).filter(item =>
                item[5] && favoriteSet.has(`adjective:${String(item[5])}`)
            )
        )
    ).map(item => [String(item[5]), item])).values()];
    const favoriteVerbs = verbs.filter(verb =>
        favoriteSet.has(`verb:${String(verb.id)}`)
    );
    const verbItems = createVerbPracticeCategory(favoriteVerbs)?.subcategories[0].items || [];
    return [
        {
            id: FAVORITE_ADJECTIVES_PRACTICE_CATEGORY_ID,
            title: "Favoritos · Adjetivos",
            subtitle: "Adjetivos marcados como importantes",
            icon: "★",
            color: "bg-amber-100",
            subcategories: [{
                id: "favorite-adjective-cards",
                title: "Adjetivos importantes",
                color: "bg-amber-100",
                items: adjectiveItems
            }]
        },
        {
            id: FAVORITE_VERBS_PRACTICE_CATEGORY_ID,
            title: "Favoritos · Verbos",
            subtitle: "Verbos marcados como importantes",
            icon: "★",
            color: "bg-blue-100",
            subcategories: [{
                id: "favorite-verb-cards",
                title: "Verbos importantes",
                color: "bg-blue-100",
                items: verbItems
            }]
        }
    ];
}

function getUsableValue(value) {
    const normalized = String(value || "").trim();
    if (!normalized || ["--", "n/a", "na"].includes(normalized.toLowerCase())) return "";
    return normalized;
}

function splitTranslatedExample(value) {
    const example = getUsableValue(value);
    if (!example) return ["", ""];
    const match = example.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
    if (!match) return [example, ""];
    return [match[1].trim(), match[2].trim()];
}

export { AI_PRACTICE_CATEGORY_ID, VERB_PRACTICE_CATEGORY_ID, splitTranslatedExample };
