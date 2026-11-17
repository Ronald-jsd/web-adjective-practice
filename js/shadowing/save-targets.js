/** Destinos disponibles al guardar desde Shadowing. */
export const SAVE_TARGETS = [
    { value: "vocabulary", label: "Mi vocabulario", kind: "word" },
    { value: "verb", label: "Verbos", kind: "word" },
    { value: "adjective", label: "Adjetivos", kind: "word" },
    { value: "sentence", label: "Frase (Mi aprendizaje)", kind: "sentence" }
]

export function saveTargetKind(value) {
    return SAVE_TARGETS.find(target => target.value === value)?.kind || "word"
}

export function saveTargetLabel(value) {
    return SAVE_TARGETS.find(target => target.value === value)?.label || "Mi vocabulario"
}

/** Fila compatible con la tabla compartida `verbs` del catálogo. */
export function catalogRowFor(target, data) {
    const {
        word,
        lookup = {},
        sentence = "",
        category = "Sin Categoría",
        id,
        now = new Date().toISOString()
    } = data
    const base = { id, category, created_at: now }
    const phonetic = lookup.phonetic || ""
    const translation = lookup.translation || ""

    if (target === "verb") {
        return {
            ...base,
            type: "regular",
            verb: word,
            pronunciation: phonetic,
            translation,
            example_base: sentence
        }
    }
    return {
        ...base,
        adjective: word,
        pronunciation_adj: phonetic,
        translation_adj: translation,
        example_adj: sentence
    }
}
