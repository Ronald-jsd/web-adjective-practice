import test from "node:test"
import assert from "node:assert/strict"
import {
    isNotionHostname,
    normalizeNotionUrl,
    normalizeTitle,
    titleFromNotionUrl
} from "../js/notion-embeds/model.js"

test("Notion embed accepts Notion hosts and keeps the full public URL", () => {
    assert.equal(isNotionHostname("notion.so"), true)
    assert.equal(isNotionHostname("www.notion.so"), true)
    assert.equal(isNotionHostname("workspace.notion.site"), true)
    assert.equal(isNotionHostname("workspace.notion.com"), true)
    assert.deepEqual(normalizeNotionUrl("https://mi-area.notion.site/Unit-5-Phrasal-verbs-0123456789abcdef0123456789abcdef?pvs=4#frag"), {
        url: "https://mi-area.notion.site/Unit-5-Phrasal-verbs-0123456789abcdef0123456789abcdef?pvs=4",
        error: ""
    })
})

test("Notion embed rejects non-Notion links and non-HTTPS URLs", () => {
    assert.match(normalizeNotionUrl("http://workspace.notion.site/page").error, /HTTPS/i)
    assert.match(normalizeNotionUrl("https://example.com/page").error, /Notion/i)
    assert.match(normalizeNotionUrl("javascript:alert(1)").error, /válido|HTTPS|Notion/i)
    assert.match(normalizeNotionUrl("not a URL").error, /válido/i)
})

test("Notion embed derives a readable title from the page path", () => {
    assert.equal(
        titleFromNotionUrl("https://mi-area.notion.site/Unit-5-Phrasal-verbs-0123456789abcdef0123456789abcdef"),
        "Unit 5 Phrasal verbs"
    )
    assert.equal(titleFromNotionUrl("https://notion.so/simple"), "simple")
    assert.equal(titleFromNotionUrl("https://notion.so/"), "notion.so")
    assert.equal(normalizeTitle("", "https://mi-area.notion.site/Unit-5-0123456789abcdef0123456789abcdef"), "Unit 5")
    assert.equal(normalizeTitle("  Mi   página  ", "https://notion.so/page"), "Mi página")
})
