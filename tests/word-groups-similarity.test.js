import test from "node:test"
import assert from "node:assert/strict"
import {
    matchingTranslationCandidates,
    missingTranslationCandidates,
    spanishTranslationKeys,
    spanishTranslationsMatch
} from "../js/word-groups/similarity.js"

test("spanishTranslationKeys ignores accents, punctuation, fillers and parentheticals", () => {
    assert.deepEqual(spanishTranslationKeys("además de eso"), ["ademas"])
    assert.deepEqual(spanishTranslationKeys("Además; además de esto"), ["ademas"])
    assert.deepEqual(spanishTranslationKeys("a fin de cuentas"), ["fin cuentas"])
    assert.equal(spanishTranslationsMatch("además", "además de eso"), true)
    assert.equal(spanishTranslationsMatch("además", "ademas"), true)
    assert.equal(spanishTranslationsMatch("a fin de cuentas", "en fin"), false)
    assert.equal(spanishTranslationsMatch("por otra parte", "de otro lado"), false)
})

test("spanishTranslationsMatch matches a synonym inside a multi-meaning translation", () => {
    assert.equal(spanishTranslationsMatch("bien, estupendo", "bien"), true)
    assert.equal(spanishTranslationsMatch("bien, estupendo", "estupendo de eso"), true)
    assert.equal(spanishTranslationsMatch("bien, estupendo", "mal"), false)
})

test("matchingTranslationCandidates returns candidates with an equivalent Spanish key", () => {
    const candidates = [
        { source: "catalog", itemId: "1", word: "furthermore", spanish: "además" },
        { source: "catalog", itemId: "2", word: "in addition", spanish: "además de eso" },
        { source: "catalog", itemId: "3", word: "besides", spanish: "ADEMÁS" },
        { source: "catalog", itemId: "4", word: "addition", spanish: "adición" },
        { source: "verb", itemId: "5", word: "additionally", spanish: "además, por añadidura" }
    ]
    assert.deepEqual(
        matchingTranslationCandidates(candidates, { source: "inline", itemId: null, word: "furthermore", spanish: "además de esto" }).map(item => item.word),
        ["in addition", "besides", "additionally"]
    )
})

test("matchingTranslationCandidates keeps same-word catalog rows with different ids", () => {
    const candidates = [
        { source: "catalog", itemId: "5616", word: "throughout", spanish: "a lo largo de" },
        { source: "custom", itemId: "-1144194855", word: "throughout", spanish: "durante todo / a lo largo / a lo largo de" },
        { source: "catalog", itemId: "5646", word: "along", spanish: "a lo largo de" }
    ]
    assert.deepEqual(
        matchingTranslationCandidates(candidates, candidates[0]).map(item => item.itemId),
        ["-1144194855", "5646"]
    )
    const group = { members: [candidates[0], candidates[2]] }
    assert.deepEqual(
        missingTranslationCandidates(candidates, candidates[0], group).map(item => item.itemId),
        ["-1144194855"]
    )
    // Sin identificadores no se puede demostrar que son filas distintas.
    assert.deepEqual(
        matchingTranslationCandidates(candidates, { word: "throughout", spanish: "a lo largo de" }).map(item => item.itemId),
        ["5646"]
    )
})

test("missingTranslationCandidates skips members already present in the group", () => {
    const candidates = [
        { source: "catalog", itemId: "1", word: "furthermore", spanish: "además" },
        { source: "catalog", itemId: "2", word: "in addition", spanish: "además de eso" },
        { source: "catalog", itemId: "3", word: "additionally", spanish: "además" }
    ]
    const group = {
        members: [
            { source: "catalog", itemId: "2", word: "in addition", spanish: "además de eso" }
        ]
    }
    assert.deepEqual(
        missingTranslationCandidates(candidates, candidates[0], group).map(item => item.word),
        ["additionally"]
    )
})
