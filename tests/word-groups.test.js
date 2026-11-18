import test from "node:test"
import assert from "node:assert/strict"
import {
    addMember,
    createDraftGroup,
    normalizeGroup,
    relationshipWith,
    removeMember,
    relationshipKey,
    setRelationship,
    updateMember
} from "../js/word-groups/model.js"
import { availableMemberIdentities, candidateIdentity, pruneUnavailableMembers, syncGroupWithCatalog } from "../js/word-groups/candidates.js"

test("word group draft normalizes source ids and standalone words without duplicates", () => {
    let draft = createDraftGroup({
        source: "verb",
        itemId: 42,
        word: "look into",
        pronunciation: "/lʊk ˈɪntuː/",
        spanish: "investigar",
        partOfSpeech: "Verbo",
        examples: [{ en: "Look into the issue.", es: "Investiga el problema." }]
    })
    assert.equal(draft.title, "look into · similares")
    assert.equal(draft.members[0].source, "verb")
    assert.equal(draft.members[0].itemId, "42")
    assert.equal(draft.members[0].partOfSpeech, "Verbo")
    assert.equal(draft.members[0].examples.length, 1)

    const duplicate = addMember(draft, { source: "verb", itemId: "42", word: "inspect" })
    assert.equal(duplicate.added, false)
    assert.equal(duplicate.group.members.length, 1)
})

test("word group relationship marks interchangeability and survives member removal", () => {
    const draft = createDraftGroup({ source: "catalog", itemId: 1, word: "in addition", spanish: "además", partOfSpeech: "Conector" })
    const result = addMember(draft, { source: "catalog", itemId: 2, word: "besides", spanish: "además", partOfSpeech: "Conector" })
    assert.equal(result.added, true)
    const group = setRelationship(result.group, draft.members[0].id, result.member.id, "interchangeable")
    assert.equal(relationshipWith(group, draft.members[0].id, result.member.id), "interchangeable")
    const key = relationshipKey(draft.members[0].id, result.member.id)
    assert.equal(group.relationships[key], "interchangeable")

    const next = setRelationship(group, draft.members[0].id, result.member.id, "not-interchangeable")
    assert.equal(relationshipWith(next, draft.members[0].id, result.member.id), "not-interchangeable")
    const removed = removeMember(next, result.member.id)
    assert.equal(removed.members.length, 1)
    assert.deepEqual(removed.relationships, {})
})

test("word group position accepts several free-text positions", () => {
    const draft = createDraftGroup({ source: "catalog", itemId: 1, word: "provided", spanish: "provisto" })
    const memberId = draft.members[0].id
    const updated = updateMember(draft, memberId, { position: "Inicio\nMedio\nDespués del verbo" })
    assert.equal(updated.members[0].position, "Inicio\nMedio\nDespués del verbo")
    assert.equal(normalizeGroup(updated).members[0].position, "Inicio\nMedio\nDespués del verbo")
    assert.equal(updateMember(updated, memberId, { position: "   " }).members[0].position, "En cualquier posición")
})

test("word group pruning removes deleted catalog words but keeps manual ones", () => {
    const identities = availableMemberIdentities([{ source: "catalog", itemId: "1", word: "then" }])
    const group = {
        title: "then · similares",
        members: [
            { id: "a", source: "catalog", itemId: "1", word: "then" },
            { id: "b", source: "catalog", itemId: "2", word: "borrada" },
            { id: "c", source: "verb", itemId: "9", word: "next" },
            { id: "d", source: "inline", itemId: null, word: "manual" }
        ]
    }
    assert.deepEqual(pruneUnavailableMembers(group, identities).members.map(member => member.id), ["a", "d"])
    assert.deepEqual(pruneUnavailableMembers(group, identities, { preserveVerbs: true }).members.map(member => member.id), ["a", "c", "d"])
    assert.equal(candidateIdentity({ source: "catalog", itemId: "1", word: "then" }), "catalog:1")
})

test("word group syncs catalog edits but keeps fields changed inside the group", () => {
    const candidate = {
        source: "catalog",
        itemId: "1",
        word: "then",
        pronunciation: "/ðen/",
        spanish: "luego / entonces",
        examples: [{ en: "I ate, then I left.", es: "Comí, luego me fui." }]
    }
    const baseline = {
        word: "then",
        pronunciation: "/ðen/",
        spanish: "luego",
        examples: [{ en: "I ate, then I left.", es: "Comí, luego me fui." }]
    }
    const member = { id: "a", source: "catalog", itemId: "1", ...baseline, examples: [{ id: "old", ...baseline.examples[0] }], synced: baseline }
    const synced = syncGroupWithCatalog({ members: [member] }, [candidate])
    assert.equal(synced.changed, 1)
    assert.equal(synced.group.members[0].spanish, "luego / entonces")

    const custom = { ...member, spanish: "entonces (edición del grupo)" }
    const preserved = syncGroupWithCatalog({ members: [custom] }, [candidate])
    assert.equal(preserved.group.members[0].spanish, "entonces (edición del grupo)")
})

test("word group normalize removes relationships that reference missing members", () => {
    const draft = createDraftGroup({ source: "catalog", itemId: 1, word: "provided", spanish: "provisto" })
    const normalized = normalizeGroup({
        id: "group-1",
        title: "  grupo  ",
        members: draft.members,
        relationships: { "missing::missing": "interchangeable", [relationshipKey(draft.members[0].id, draft.members[0].id)]: "interchangeable" }
    })
    assert.equal(normalized.title, "grupo")
    assert.equal(normalized.members.length, 1)
    assert.deepEqual(normalized.relationships, {})
})
