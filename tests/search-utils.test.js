import test from "node:test"
import assert from "node:assert/strict"
import { matchesSearchTerms, normalizeSearchText, searchTerms, splitCatalogExamples } from "../js/search-utils.js"

test("normalizeSearchText ignores accents and letter case", () => {
    assert.equal(normalizeSearchText("Aplicación"), "aplicacion")
    assert.equal(normalizeSearchText("ÁGIL"), "agil")
})

test("searchTerms splits the query into independent words", () => {
    assert.deepEqual(searchTerms("  feliz   aplicacion "), ["feliz", "aplicacion"])
    assert.deepEqual(searchTerms(""), [])
})

test("splitCatalogExamples separates paired examples and keeps single ones", () => {
    assert.deepEqual(splitCatalogExamples(
        "I ate, then I left. / I ate dinner, then left.",
        "Comí, luego me fui./ Cené, entonces me fui."
    ), [
        { en: "I ate, then I left.", es: "Comí, luego me fui." },
        { en: "I ate dinner, then left.", es: "Cené, entonces me fui." }
    ])
    assert.deepEqual(splitCatalogExamples("I saw him then.", "Lo vi entonces."), [
        { en: "I saw him then.", es: "Lo vi entonces." }
    ])
    // Si el número de partes no coincide, se mantiene el texto original.
    assert.deepEqual(splitCatalogExamples("A / B", "Solo una"), [
        { en: "A / B", es: "Solo una" }
    ])
})

test("matchesSearchTerms matches the beginning and ignores accents", () => {
    assert.equal(matchesSearchTerms("aplicación práctica", "aplicacion"), true)
    assert.equal(matchesSearchTerms("ÁGIL", "agil"), true)
    assert.equal(matchesSearchTerms("aplicación práctica", "practica"), false)
    assert.equal(matchesSearchTerms("aplicación práctica", "aplicacion utopia"), false)
    assert.equal(matchesSearchTerms("aplicación práctica", "utopia"), false)
})

test("matchesSearchTerms applies the same prefix rule in both modes", () => {
    assert.equal(matchesSearchTerms("happy happiness", "happy", "exact"), true)
    assert.equal(matchesSearchTerms("happy happiness", "happy", "partial"), true)
    assert.equal(matchesSearchTerms("happiness", "happy", "exact"), false)
    assert.equal(matchesSearchTerms("happiness", "happy", "partial"), false)
    assert.equal(matchesSearchTerms("feliz application", "aplicacion aplicacion", "exact"), false)
    assert.equal(matchesSearchTerms("aplicación feliz", "aplicacion", "exact"), true)
    assert.equal(matchesSearchTerms("feliz aplicación", "aplicacion"), false)
})

test("matchesSearchTerms requires the full phrase at the beginning", () => {
    assert.equal(matchesSearchTerms("At first, I was scared", "at first"), true)
    assert.equal(matchesSearchTerms("ÁT FÍRST", "at first"), true)
    assert.equal(matchesSearchTerms("I saw it first at home", "at first"), false)
    assert.equal(matchesSearchTerms("format first", "at first"), false)
    assert.equal(matchesSearchTerms("at least and first place", "at first"), false)
})

test("matchesSearchTerms suggests longer words as the prefix grows", () => {
    assert.equal(matchesSearchTerms("even", "even"), true)
    assert.equal(matchesSearchTerms("eventually", "even"), true)
    assert.equal(matchesSearchTerms("eventually", "event"), true)
    assert.equal(matchesSearchTerms("eventually he arrived", "eventually"), true)
    assert.equal(matchesSearchTerms("at first glance", "at first"), true)
    assert.equal(matchesSearchTerms("uneventful", "event"), false)
})

test("matchesSearchTerms searches by prefix of the full phrase", () => {
    assert.equal(matchesSearchTerms("go out", "g"), true)
    assert.equal(matchesSearchTerms("go out", "go"), true)
    assert.equal(matchesSearchTerms("go out", "go out"), true)
    assert.equal(matchesSearchTerms("go outside", "go out"), true)
    assert.equal(matchesSearchTerms("go out with friends", "go out"), true)
    assert.equal(matchesSearchTerms("gone", "go"), true)
    // El prefijo debe empezar al principio de un término, no en mitad.
    assert.equal(matchesSearchTerms("go out", "out"), false)
    assert.equal(matchesSearchTerms("Temperate", "at"), false)
    assert.equal(matchesSearchTerms("uneventful", "eve"), false)
    assert.equal(matchesSearchTerms("first of all", "at first"), false)
    assert.equal(matchesSearchTerms("at least", "at first"), false)
})

test("matchesSearchTerms accepts short words and single letters", () => {
    assert.equal(matchesSearchTerms("eventually", "eve"), true)
    assert.equal(matchesSearchTerms("even so", "eve"), true)
    assert.equal(matchesSearchTerms("Sofocante", "so"), true)
    assert.equal(matchesSearchTerms("even so", "even so"), true)
    assert.equal(matchesSearchTerms("even so", "even s"), true)
    // El prefijo debe estar al principio del campo, no en una palabra posterior.
    assert.equal(matchesSearchTerms("It's sunny today.", "even s"), false)
    assert.equal(matchesSearchTerms("It's sunny today.", "s"), false)
    assert.equal(matchesSearchTerms("sunny today", "s"), true)
    assert.equal(matchesSearchTerms("Sofocante", "even so"), false)
})
