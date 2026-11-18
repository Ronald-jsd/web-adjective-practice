import { store } from "../config.js"
import { verbsData } from "../verbs/verbs-state.js"

const sourceForAdjective = itemId => {
    const value = String(itemId ?? "")
    if (value.startsWith("custom_")) return "custom"
    if (value.startsWith("temp_")) return "inline"
    return "catalog"
}

const adjectiveItemId = itemId => {
    const value = String(itemId ?? "")
    return sourceForAdjective(value) === "custom" ? value.slice("custom_".length) : value
}

export function candidateIdentity(item) {
    return `${item?.source || "inline"}:${item?.itemId ?? `word:${String(item?.word || "").toLowerCase()}`}`
}

export function isVerbCatalogLoaded() {
    return (verbsData || []).length > 0
}

export function availableMemberIdentities(candidates = collectWordCandidates()) {
    return new Set((candidates || []).map(candidateIdentity))
}

/* Quita del grupo las palabras que ya no están en el catálogo. Las palabras
 * sin ID son propias del usuario y se conservan siempre. */
export function pruneUnavailableMembers(group, identities, { preserveVerbs = false } = {}) {
    if (!group) return group
    const members = group.members || []
    const kept = members.filter(member => {
        if (!member?.itemId) return true
        if (preserveVerbs && member.source === "verb") return true
        return identities.has(candidateIdentity(member))
    })
    if (kept.length === members.length) return group
    return { ...group, members: kept }
}

export function collectWordCandidates() {
    const candidates = []
    const seen = new Set()
    const add = item => {
        if (!item?.word) return
        const key = candidateIdentity(item)
        if (seen.has(key)) return
        seen.add(key)
        candidates.push(item)
    }

    for (const category of store.categoriesData || []) {
        for (const subcategory of category.subcategories || []) {
            for (const item of subcategory.items || []) {
                const rawId = item[5]
                const source = sourceForAdjective(rawId)
                add({
                    source,
                    itemId: source === "inline" ? null : adjectiveItemId(rawId),
                    word: item[0] || "",
                    pronunciation: item[1] || "",
                    spanish: item[2] || "",
                    partOfSpeech: "Adjetivo",
                    position: "En cualquier posición",
                    uses: "",
                    difference: "",
                    examples: item[3] ? [{ id: `example-${source}-${rawId}-0`, en: item[3] || "", es: item[4] || "" }] : [],
                    context: [category.title || "", subcategory.title || ""].filter(Boolean).join(" · ")
                })
            }
        }
    }

    for (const verb of verbsData || []) {
        add({
            source: "verb",
            itemId: verb.id ? String(verb.id) : null,
            word: verb.verb || verb.word || "",
            pronunciation: verb.pronunciation || "",
            spanish: verb.translation || verb.spanish || "",
            partOfSpeech: "Verbo",
            position: "En cualquier posición",
            uses: verb.usage || "",
            difference: "",
            examples: verb.example_base ? [{ id: `example-verb-${verb.id}-0`, en: verb.example_base || "", es: "" }] : [],
            context: verb.category || verb.type || ""
        })
    }

    for (const item of store.userCustomItems || []) {
        add({
            source: "custom",
            itemId: item.id ? String(item.id) : null,
            word: item.word || "",
            pronunciation: item.pronunciation || "",
            spanish: item.spanish || "",
            partOfSpeech: "Otro",
            position: "En cualquier posición",
            uses: "",
            difference: item.notes || "",
            examples: item.example_en ? [{ id: `example-custom-${item.id}-0`, en: item.example_en || "", es: item.example_es || "" }] : [],
            context: [item.category || "", item.subcategory || ""].filter(Boolean).join(" · ")
        })
    }

    return candidates
}

export function filterCandidates(candidates, query, limit = 30) {
    const q = String(query || "").trim().toLowerCase()
    if (!q) return []
    const matches = []
    for (const candidate of candidates || []) {
        const haystack = `${candidate.word || ""} ${candidate.spanish || ""} ${candidate.pronunciation || ""} ${candidate.context || ""}`.toLowerCase()
        if (!haystack.includes(q)) continue
        matches.push(candidate)
        if (matches.length >= limit) break
    }
    return matches
}
