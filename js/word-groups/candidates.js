import { store } from "../config.js"
import { splitCatalogExamples } from "../search-utils.js"
import { verbsData } from "../verbs/verbs-state.js"
import { SYNCED_FIELDS, syncedFieldsFrom } from "./model.js"

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

/* La tabla general guarda varios ejemplos en una sola celda separados por "/". */
function catalogExamples(en, es, idPrefix) {
    return splitCatalogExamples(en, es).map((example, index) => ({
        id: `${idPrefix}-${index}`,
        ...example
    }))
}

const sameExamples = (left, right) => JSON.stringify((left || []).map(example => [example?.en || "", example?.es || ""]))
    === JSON.stringify((right || []).map(example => [example?.en || "", example?.es || ""]))

const sameSyncedValue = (field, left, right) => field === "examples"
    ? sameExamples(left, right)
    : String(left ?? "") === String(right ?? "")

/* Actualiza los datos que vienen del catálogo. Si el usuario cambió ese campo
 * dentro del grupo, su valor se conserva aunque la tabla general cambie. */
export function syncGroupWithCatalog(group, candidates) {
    if (!group) return { group, changed: 0 }
    const byIdentity = new Map()
    for (const candidate of candidates || []) byIdentity.set(candidateIdentity(candidate), candidate)
    const preserveVerbs = !isVerbCatalogLoaded()
    let changed = 0
    const members = (group.members || []).map(member => {
        if (!member?.itemId) return member
        if (preserveVerbs && member.source === "verb") return member
        const candidate = byIdentity.get(candidateIdentity(member))
        if (!candidate) return member
        const live = syncedFieldsFrom(candidate)
        const baseline = member.synced || {}
        const legacy = !baseline.word && !baseline.pronunciation && !baseline.spanish && !(baseline.examples || []).length
        const next = { ...member, synced: live }
        let updated = false
        for (const field of SYNCED_FIELDS) {
            if (!legacy && !sameSyncedValue(field, member[field], baseline[field])) continue
            if (sameSyncedValue(field, member[field], live[field])) continue
            next[field] = field === "examples"
                ? live.examples.map((example, index) => ({ id: `catalog-${candidateIdentity(candidate)}-${index}`, en: example.en, es: example.es }))
                : live[field]
            updated = true
        }
        if (updated) changed += 1
        return next
    })
    return { group: changed ? { ...group, members } : group, changed }
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
                    examples: item[3] || item[4]
                        ? catalogExamples(item[3], item[4], `example-${source}-${rawId}`)
                        : [],
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
