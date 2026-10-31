import test from "node:test"
import assert from "node:assert/strict"
import { filterVocabulary, normalizeSearchText } from "../js/sentences/vocabulary-search.js"

const vocabulary = [
    {
        word: "figure out",
        pronunciation: "/ˈfɪɡər aʊt/",
        spanish: "averiguar, resolver",
        example_en: "I can't figure out this problem.",
        example_es: "No puedo resolver este problema.",
        notes: "Usos:\n- problemas\nCuándo usarla:\n- informal"
    },
    {
        word: "red",
        pronunciation: "/red/",
        spanish: "rojo",
        example_en: "The apple is red.",
        example_es: "La manzana es roja.",
        notes: "Usos:\n- colores"
    },
    {
        word: "schedule",
        pronunciation: "/ˈskedʒuːl/",
        spanish: "horario, programar",
        example_en: "Let's schedule a meeting.",
        example_es: "Programemos una reunión.",
        notes: ""
    }
]

test("filterVocabulary returns every item when the query is empty", () => {
    assert.equal(filterVocabulary(vocabulary, "").length, 3)
    assert.equal(filterVocabulary(vocabulary, "   ").length, 3)
    assert.equal(filterVocabulary(null, "red").length, 0)
})

test("filterVocabulary matches the English word, Spanish meaning, and examples", () => {
    assert.deepEqual(filterVocabulary(vocabulary, "red").map(item => item.word), ["red"])
    assert.deepEqual(filterVocabulary(vocabulary, "rojo").map(item => item.word), ["red"])
    assert.deepEqual(filterVocabulary(vocabulary, "manzana").map(item => item.word), ["red"])
    assert.deepEqual(filterVocabulary(vocabulary, "meeting").map(item => item.word), ["schedule"])
})

test("filterVocabulary matches notes and pronunciation", () => {
    assert.deepEqual(filterVocabulary(vocabulary, "colores").map(item => item.word), ["red"])
    assert.deepEqual(filterVocabulary(vocabulary, "problemas").map(item => item.word), ["figure out"])
    assert.deepEqual(filterVocabulary(vocabulary, "skedʒuːl").map(item => item.word), ["schedule"])
})

test("filterVocabulary ignores accents and letter case", () => {
    assert.equal(normalizeSearchText("Programación"), "programacion")
    assert.deepEqual(filterVocabulary(vocabulary, "PROGRAMAR").map(item => item.word), ["schedule"])
    assert.deepEqual(filterVocabulary(vocabulary, "reunion").map(item => item.word), ["schedule"])
})

test("filterVocabulary returns an empty list when nothing matches", () => {
    assert.deepEqual(filterVocabulary(vocabulary, "zzz"), [])
})
