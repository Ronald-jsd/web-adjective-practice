import test from "node:test"
import assert from "node:assert/strict"
import { voiceScore } from "../js/audio.js"

test("voiceScore prefiere voces naturales en el idioma correcto", () => {
    const natural = voiceScore({ name: "Microsoft Aria Online (Natural) - English (United States)", lang: "en-US", localService: false }, "en")
    const classic = voiceScore({ name: "Microsoft David Desktop - English (United States)", lang: "en-US", localService: true }, "en")
    const wrongLang = voiceScore({ name: "Microsoft Helena Natural - Spanish", lang: "es-ES", localService: true }, "en")
    assert.ok(natural > classic)
    assert.ok(natural > wrongLang)
})

test("voiceScore respeta el español", () => {
    const spanish = voiceScore({ name: "Microsoft Elvira Online (Natural) - Spanish (Spain)", lang: "es-ES" }, "es")
    const english = voiceScore({ name: "Google US English", lang: "en-US" }, "es")
    assert.ok(spanish > english)
})

test("voiceScore tolera datos incompletos", () => {
    assert.equal(voiceScore(null, "en"), -Infinity)
    assert.ok(Number.isFinite(voiceScore({ name: "" }, "en")))
})
