import test from "node:test"
import assert from "node:assert/strict"
import {
    isNotionEmbedHostname,
    normalizeNotionUrl,
    normalizeTitle,
    notionEmbedUrlFromUrl,
    notionPageIdFromUrl,
    titleFromNotionUrl
} from "../js/notion-embeds/model.js"

test("Notion embed accepts public notion.site pages and derives the ebd embed URL", () => {
    assert.equal(isNotionEmbedHostname("patch-caper-d36.notion.site"), true)
    assert.equal(isNotionEmbedHostname("www.patch-caper-d36.notion.site"), true)
    assert.equal(isNotionEmbedHostname("app.notion.com"), false)
    assert.equal(isNotionEmbedHostname("notion.so"), false)
    const input = "https://patch-caper-d36.notion.site/nouns-other-important-3b9639ee2ad8800385d8e91bb0b97501?source=copy_link"
    assert.equal(notionPageIdFromUrl(input), "3b9639ee2ad8800385d8e91bb0b97501")
    assert.equal(notionEmbedUrlFromUrl(input), "https://patch-caper-d36.notion.site/ebd//3b9639ee2ad8800385d8e91bb0b97501")
    assert.deepEqual(normalizeNotionUrl(input), {
        url: "https://patch-caper-d36.notion.site/nouns-other-important-3b9639ee2ad8800385d8e91bb0b97501?source=copy_link",
        error: ""
    })
})

test("Notion embed accepts an existing ebd URL without rewriting it twice", () => {
    assert.equal(
        notionEmbedUrlFromUrl("https://patch-caper-d36.notion.site/ebd//3b9639ee2ad8800385d8e91bb0b97501"),
        "https://patch-caper-d36.notion.site/ebd//3b9639ee2ad8800385d8e91bb0b97501"
    )
})

test("Notion embed rejects app.notion.com, notion.so, non-HTTPS and non-Notion links", () => {
    assert.match(normalizeNotionUrl("https://app.notion.com/p/nouns-3b9639ee2ad8800385d8e91bb0b97501").error, /\.notion\.site/i)
    assert.match(normalizeNotionUrl("https://www.notion.so/nouns-3b9639ee2ad8800385d8e91bb0b97501").error, /\.notion\.site/i)
    assert.match(normalizeNotionUrl("http://patch-caper-d36.notion.site/nouns-3b9639ee2ad8800385d8e91bb0b97501").error, /HTTPS/i)
    assert.match(normalizeNotionUrl("https://example.com").error, /\.notion\.site/i)
    assert.match(normalizeNotionUrl("javascript:alert(1)").error, /válido|HTTPS|Notion/i)
    assert.match(normalizeNotionUrl("not a URL").error, /válido/i)
    assert.equal(notionEmbedUrlFromUrl("https://app.notion.com/p/3b9639ee2ad8800385d8e91bb0b97501"), "")
})

test("Notion embed derives a readable title from the page path or the workspace host", () => {
    assert.equal(
        titleFromNotionUrl("https://mi-area.notion.site/Unit-5-Phrasal-verbs-3b9639ee2ad8800385d8e91bb0b97501"),
        "Unit 5 Phrasal verbs"
    )
    assert.equal(titleFromNotionUrl("https://mi-area.notion.site/"), "mi-area.notion.site")
    assert.equal(normalizeTitle("", "https://mi-area.notion.site/Unit-5-3b9639ee2ad8800385d8e91bb0b97501"), "Unit 5")
    assert.equal(normalizeTitle("  Mi   página  ", "https://mi-area.notion.site/page-3b9639ee2ad8800385d8e91bb0b97501"), "Mi página")
})
