const PART_OF_SPEECH_LABELS = new Set(["Adjetivo", "Verbo", "Sustantivo", "Adverbio", "Preposición", "Conector", "Frase", "Otro"])
const MAX_TITLE = 160
const MAX_TEXT = 2000

function newId() {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID()
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const trimText = (value, max = MAX_TEXT) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max)
const trimArea = (value, max = MAX_TEXT) => String(value ?? "").trim().slice(0, max)

export const SYNCED_FIELDS = ["word", "pronunciation", "spanish", "examples"]

const normalizeSyncedExamples = value => (Array.isArray(value) ? value : [])
    .map(example => ({
        en: trimArea(example?.en || example?.example_en || "", 1000),
        es: trimArea(example?.es || example?.example_es || "", 1000)
    }))
    .slice(0, 30)

export function syncedFieldsFrom(item = {}) {
    return {
        word: trimText(item.word, 300),
        pronunciation: trimText(item.pronunciation, 300),
        spanish: trimArea(item.spanish, 1000),
        examples: normalizeSyncedExamples(item.examples)
    }
}

export function normalizeMember(member = {}, { createId = false } = {}) {
    const itemIdValue = member.itemId ?? member.item_id ?? null
    const itemId = itemIdValue === undefined || itemIdValue === null || itemIdValue === "" ? null : String(itemIdValue)
    const source = String(member.source || (itemId ? "catalog" : "inline")).trim().toLowerCase().slice(0, 40) || "inline"
    const examples = Array.isArray(member.examples) ? member.examples : []
    const normalizedExamples = examples
        .map(example => ({
            id: String(example?.id || newId()),
            en: trimArea(example?.en || example?.example_en || "", 1000),
            es: trimArea(example?.es || example?.example_es || "", 1000)
        }))
        .slice(0, 30)

    return {
        id: member.id ? String(member.id) : (createId ? newId() : ""),
        source,
        itemId,
        word: trimText(member.word, 300),
        pronunciation: trimText(member.pronunciation, 300),
        spanish: trimArea(member.spanish, 1000),
        partOfSpeech: PART_OF_SPEECH_LABELS.has(member.partOfSpeech || member.part_of_speech) ? (member.partOfSpeech || member.part_of_speech) : "Otro",
        position: trimArea(member.position, MAX_TEXT) || "En cualquier posición",
        uses: trimArea(member.uses, MAX_TEXT),
        difference: trimArea(member.difference, MAX_TEXT),
        examples: normalizedExamples,
        synced: syncedFieldsFrom(member.synced)
    }
}

export function relationshipKey(leftId, rightId) {
    return [String(leftId), String(rightId)].sort().join("::")
}

export function normalizeRelationships(relationships, members = []) {
    const result = {}
    const validIds = new Set((members || []).map(member => String(member.id)))
    for (const [key, value] of Object.entries(relationships || {})) {
        const ids = key.split("::")
        if (ids.length !== 2) continue
        const left = String(ids[0])
        const right = String(ids[1])
        if (left === right || !validIds.has(left) || !validIds.has(right)) continue
        if (!["interchangeable", "not-interchangeable"].includes(value)) continue
        result[relationshipKey(left, right)] = value
    }
    return result
}

export function normalizeGroup(row = {}, { createId = false } = {}) {
    const members = (Array.isArray(row.members) ? row.members : [])
        .map(member => normalizeMember(member, { createId: true }))
        .filter(member => member.word || member.spanish)
    const id = row.id ? String(row.id) : (createId ? newId() : "")
    const title = trimText(row.title, MAX_TITLE) || "Grupo de palabras similares"
    return {
        id,
        title,
        members,
        relationships: normalizeRelationships(row.relationships, members),
        createdAt: row.created_at || row.createdAt || null,
        updatedAt: row.updated_at || row.updatedAt || null
    }
}

export function memberIdentity(member = {}) {
    const normalized = normalizeMember(member)
    if (normalized.itemId) return `${normalized.source}:${normalized.itemId}`
    return `${normalized.source}:word:${normalized.word.toLowerCase()}`
}

export function sameIdentity(left = {}, right = {}) {
    return memberIdentity(left) === memberIdentity(right)
}

export function findMemberByIdentity(group, member) {
    return group.members.find(candidate => sameIdentity(candidate, member)) || null
}

export function createDraftGroup(payload = {}) {
    const member = normalizeMember({
        source: payload.source,
        itemId: payload.itemId ?? payload.item_id ?? null,
        word: payload.word,
        pronunciation: payload.pronunciation,
        spanish: payload.spanish,
        partOfSpeech: payload.partOfSpeech || payload.part_of_speech || "Conector",
        position: payload.position,
        uses: payload.uses,
        difference: payload.difference,
        examples: payload.examples?.length ? payload.examples : (payload.example_en ? [{ en: payload.example_en, es: payload.example_es || "" }] : []),
        synced: syncedFieldsFrom(payload)
    }, { createId: true })
    const title = trimText(payload.groupTitle || `${member.word || "Palabra"} · similares`, MAX_TITLE)
    return {
        id: newId(),
        title,
        members: [member],
        relationships: {},
        createdAt: null,
        updatedAt: null
    }
}

export function addMember(group, payload = {}) {
    const candidate = normalizeMember({
        source: payload.source,
        itemId: payload.itemId ?? payload.item_id ?? null,
        word: payload.word,
        pronunciation: payload.pronunciation,
        spanish: payload.spanish,
        partOfSpeech: payload.partOfSpeech || payload.part_of_speech || "Conector",
        position: payload.position,
        uses: payload.uses,
        difference: payload.difference,
        examples: payload.examples?.length ? payload.examples : (payload.example_en ? [{ en: payload.example_en, es: payload.example_es || "" }] : []),
        synced: syncedFieldsFrom(payload)
    }, { createId: true })
    const existing = findMemberByIdentity(group, candidate)
    if (existing) return { group, member: existing, added: false }
    return {
        group: {
            ...group,
            members: [...group.members, candidate],
            relationships: normalizeRelationships(group.relationships, [...group.members, candidate])
        },
        member: candidate,
        added: true
    }
}

export function updateMember(group, memberId, patch = {}) {
    const target = String(memberId)
    const members = group.members.map(member => {
        if (String(member.id) !== target) return member
        return normalizeMember({ ...member, ...patch, id: member.id, examples: patch.examples ?? member.examples }, { createId: false })
    })
    return {
        ...group,
        members,
        relationships: normalizeRelationships(group.relationships, members)
    }
}

export function removeMember(group, memberId) {
    const target = String(memberId)
    const members = group.members.filter(member => String(member.id) !== target)
    const relationships = {}
    for (const [key, value] of Object.entries(group.relationships || {})) {
        if (!key.split("::").includes(target)) relationships[key] = value
    }
    return {
        ...group,
        members,
        relationships: normalizeRelationships(relationships, members)
    }
}

export function relationshipWith(group, leftId, rightId) {
    return group.relationships?.[relationshipKey(leftId, rightId)] || "none"
}

export function setRelationship(group, leftId, rightId, status) {
    const key = relationshipKey(leftId, rightId)
    const relationships = { ...(group.relationships || {}) }
    if (status === "interchangeable" || status === "not-interchangeable") relationships[key] = status
    else delete relationships[key]
    return {
        ...group,
        relationships: normalizeRelationships(relationships, group.members)
    }
}

export function upsertExample(group, memberId, example = {}) {
    return updateMember(group, memberId, {
        examples: [...(group.members.find(member => String(member.id) === String(memberId))?.examples || []), example]
    })
}

export function removeExample(group, memberId, exampleId) {
    const target = String(memberId)
    const members = group.members.map(member => String(member.id) === target
        ? { ...member, examples: member.examples.filter(example => String(example.id) !== String(exampleId)) }
        : member)
    return { ...group, members }
}

export function relationshipStatusFor(group, leftId, rightId) {
    return relationshipWith(group, leftId, rightId)
}

export function relatedGroupsFor(groups, member) {
    return (groups || []).filter(group => findMemberByIdentity(group, member))
}
