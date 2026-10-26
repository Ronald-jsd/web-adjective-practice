import test from "node:test"
import assert from "node:assert/strict"
import { parsePracticeTable } from "../js/practice-import.js"

test("imports pasted tab-separated tables with varying column counts", () => {
    const input = [
        "#\tAdjetivo\tSignificado\tEjemplo en inglés\tTraducción",
        "1\tChallenging\tDesafiante\tMy job is challenging.\tMi trabajo es desafiante.",
        "2\tRewarding\tGratificante\tMy work is rewarding.\tMi trabajo es gratificante."
    ].join("\n")

    assert.deepEqual(parsePracticeTable(input), [
        {
            word: "Challenging",
            spanish: "Desafiante",
            exampleEn: "My job is challenging.",
            exampleEs: "Mi trabajo es desafiante.",
            pronunciation: "",
            notes: ""
        },
        {
            word: "Rewarding",
            spanish: "Gratificante",
            exampleEn: "My work is rewarding.",
            exampleEs: "Mi trabajo es gratificante.",
            pronunciation: "",
            notes: ""
        }
    ])
})

test("imports markdown tables and skips repeated section headings", () => {
    const input = [
        "1. Adjetivos para describir el trabajo",
        "| Adjetivo | Significado | Ejemplo en inglés | Traducción |",
        "| --- | --- | --- | --- |",
        "| Dynamic | Dinámico | I enjoy a dynamic environment. | Disfruto de un ambiente dinámico. |",
        "2. Another section",
        "| Adjetivo | Significado |",
        "| --- | --- |",
        "| Collaborative | Colaborativo |"
    ].join("\n")

    const result = parsePracticeTable(input)
    assert.equal(result.length, 2)
    assert.equal(result[0].word, "Dynamic")
    assert.equal(result[1].word, "Collaborative")
    assert.equal(result[1].spanish, "Colaborativo")
})
