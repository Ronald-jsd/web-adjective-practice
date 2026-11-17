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
