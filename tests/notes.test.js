import test from "node:test"
import assert from "node:assert/strict"
import { parseNotes } from "../js/sentences/notes.js"

test("parseNotes splits sections, bullets, numbered items, and paragraphs", () => {
    const sections = parseNotes(
        "Usos:\r\n- uno\r\n- dos\r\nCuándo usarla:\r\n1. formal\r\n2. informal\r\n\r\nTexto libre."
    )

    assert.deepEqual(sections, [
        {
            title: "Usos",
            items: [
                { type: "bullet", text: "uno" },
                { type: "bullet", text: "dos" }
            ]
        },
        {
            title: "Cuándo usarla",
            items: [
                { type: "numbered", marker: "1", text: "formal" },
                { type: "numbered", marker: "2", text: "informal" },
                { type: "paragraph", text: "Texto libre." }
            ]
        }
    ])
})

test("parseNotes accepts bold and hash headings", () => {
    assert.deepEqual(parseNotes("**Usos:**\n- uno"), [
        { title: "Usos", items: [{ type: "bullet", text: "uno" }] }
    ])
    assert.deepEqual(parseNotes("# Usos\n- uno"), [
        { title: "Usos", items: [{ type: "bullet", text: "uno" }] }
    ])
})

test("parseNotes keeps plain text as paragraphs", () => {
    assert.deepEqual(parseNotes("Una nota\nOtra línea"), [
        {
            title: "",
            items: [
                { type: "paragraph", text: "Una nota" },
                { type: "paragraph", text: "Otra línea" }
            ]
        }
    ])
})

test("parseNotes returns no sections for empty input", () => {
    assert.deepEqual(parseNotes(""), [])
    assert.deepEqual(parseNotes("   \n  "), [])
})
