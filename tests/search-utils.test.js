import test from "node:test"
import assert from "node:assert/strict"
import { matchesSearchTerms, normalizeSearchText, searchTerms } from "../js/search-utils.js"

test("normalizeSearchText ignores accents and letter case", () => {
    assert.equal(normalizeSearchText("Aplicación"), "aplicacion")
    assert.equal(normalizeSearchText("ÁGIL"), "agil")
})

test("searchTerms splits the query into independent words", () => {
    assert.deepEqual(searchTerms("  feliz   aplicacion "), ["feliz", "aplicacion"])
    assert.deepEqual(searchTerms(""), [])
})

test("matchesSearchTerms finds any word and ignores accents", () => {
    assert.equal(matchesSearchTerms("aplicación práctica", "aplicacion"), true)
    assert.equal(matchesSearchTerms("aplicación práctica", "practica"), true)
    assert.equal(matchesSearchTerms("aplicación práctica", "aplicacion utopia"), true)
    assert.equal(matchesSearchTerms("aplicación práctica", "utopia"), false)
})

test("matchesSearchTerms keeps whole-word matching in exact mode", () => {
    assert.equal(matchesSearchTerms("happy happiness", "happy", "exact"), true)
    assert.equal(matchesSearchTerms("happiness", "happy", "exact"), false)
    assert.equal(matchesSearchTerms("feliz application", "aplicacion aplicacion", "exact"), false)
    assert.equal(matchesSearchTerms("feliz aplicación", "aplicacion", "exact"), true)
})

test("matchesSearchTerms exact mode requires the full phrase consecutively", () => {
    assert.equal(matchesSearchTerms("At first, I was scared", "at first", "exact"), true)
    assert.equal(matchesSearchTerms("ÁT FÍRST", "at first", "exact"), true)
    assert.equal(matchesSearchTerms("I saw it first at home", "at first", "exact"), false)
    assert.equal(matchesSearchTerms("format first", "at first", "exact"), false)
    assert.equal(matchesSearchTerms("at least and first place", "at first", "exact"), false)
})

test("matchesSearchTerms exact mode suggests as the word is typed", () => {
    assert.equal(matchesSearchTerms("even", "even", "exact"), true)
    assert.equal(matchesSearchTerms("eventually", "even", "exact"), true)
    assert.equal(matchesSearchTerms("eventually", "event", "exact"), true)
    assert.equal(matchesSearchTerms("eventually he arrived", "eventually", "exact"), true)
    assert.equal(matchesSearchTerms("at first glance", "at first", "exact"), true)
    assert.equal(matchesSearchTerms("uneventful", "event", "exact"), false)
})

test("matchesSearchTerms partial mode finds any written word", () => {
    assert.equal(matchesSearchTerms("at least", "at first"), true)
    assert.equal(matchesSearchTerms("first of all", "at first"), true)
    assert.equal(matchesSearchTerms("neither term here", "at first"), false)
})

test("matchesSearchTerms partial mode finds words starting with any term", () => {
    assert.equal(matchesSearchTerms("eventually", "eve"), true)
    assert.equal(matchesSearchTerms("even so", "eve"), true)
    assert.equal(matchesSearchTerms("Temperate", "at"), false)
    assert.equal(matchesSearchTerms("at least", "at first"), true)
    assert.equal(matchesSearchTerms("first of all", "at first"), true)
    assert.equal(matchesSearchTerms("neither term here", "at first"), false)
})
