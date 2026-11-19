import test from "node:test"
import assert from "node:assert/strict"
import { normalizeWrittenAnswer } from "../js/practice-utils.js"
import { checkFillBlank } from "../js/sentences/exercises.js"

test("written answers ignore case, accents and punctuation at the edges", () => {
    assert.equal(normalizeWrittenAnswer("They are excited."), normalizeWrittenAnswer("they are excited"))
    assert.equal(normalizeWrittenAnswer("¿Cómo estás?"), normalizeWrittenAnswer("como estas"))
    assert.equal(normalizeWrittenAnswer("  They   are  excited!  "), normalizeWrittenAnswer("they are excited"))
    assert.equal(normalizeWrittenAnswer("Don't"), normalizeWrittenAnswer("don't"))
    assert.notEqual(normalizeWrittenAnswer("it's"), normalizeWrittenAnswer("its"))
})

test("fill-in-the-blank accepted an answer with or without the final dot", () => {
    const wordExercise = { answer: "excited", missingWord: "excited", prompt: "They are _______." }
    assert.equal(checkFillBlank("excited", wordExercise).correct, true)
    assert.equal(checkFillBlank("Excited.", wordExercise).correct, true)
    assert.equal(checkFillBlank("wrong", wordExercise).correct, false)

    const sentenceExercise = { answer: "They are excited.", missingWord: "", prompt: "Write the sentence" }
    assert.equal(checkFillBlank("they are excited", sentenceExercise).correct, true)
    assert.equal(checkFillBlank("They are excited.", sentenceExercise).correct, true)
})
