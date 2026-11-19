import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function createStorage() {
    const values = new Map()
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
        clear: () => values.clear()
    }
}

globalThis.localStorage = createStorage()

const { CACHE_DURATION } = await import("../js/config.js")
const { isCatalogFresh, markCatalogFresh } = await import("../js/catalog-freshness.js")
const {
    CATEGORY_TREE_COLUMNS,
    CUSTOM_ITEM_COLUMNS,
    ITEM_COLUMNS,
    VERB_COLUMNS,
    PRACTICE_VERB_COLUMNS
} = await import("../js/supabase-columns.js")

test("catalog freshness expires after the cache duration", () => {
    localStorage.clear()
    const now = 1_000_000
    assert.equal(isCatalogFresh("verbs", now), false)

    markCatalogFresh("verbs", now)
    assert.equal(isCatalogFresh("verbs", now + CACHE_DURATION - 1), true)
    assert.equal(isCatalogFresh("verbs", now + CACHE_DURATION), false)
    assert.equal(isCatalogFresh("items", now), false)
})

test("VERB_COLUMNS contains every editable verb field", () => {
    const source = readFileSync(join(root, "js/verbs/verbs-render.js"), "utf8")
    const block = source.match(/export const VERB_FIELDS = \[([\s\S]*?)\]/)?.[1] || ""
    const keys = [...block.matchAll(/key:\s*['"]([a-z_]+)['"]/g)].map(match => match[1])
    assert.ok(keys.length > 20, "No se pudieron leer los campos editables de verbos")

    const columns = new Set(VERB_COLUMNS.split(","))
    for (const key of keys) {
        assert.ok(columns.has(key), `Falta la columna ${key} en VERB_COLUMNS`)
    }
})

test("PRACTICE_VERB_COLUMNS fetches every derived form used by practice", () => {
    const columns = PRACTICE_VERB_COLUMNS.split(",")
    for (const column of [
        "id", "verb", "pronunciation", "translation", "example_base",
        "past_simple", "pronunciation_ps", "translation_ps", "example_ps",
        "past_participle", "pronunciation_pp", "translation_pp", "example_pp",
        "adjective", "pronunciation_adj", "translation_adj", "example_adj", "example_adj_translation",
        "adverb", "pronunciation_adv", "translation_adv", "example_adv", "example_adv_translation",
        "noun", "pronunciation_noun", "translation_noun", "example_noun", "example_noun_translation"
    ]) {
        assert.ok(columns.includes(column), `Falta ${column} en PRACTICE_VERB_COLUMNS`)
    }
    for (const column of ["category", "type", "usage", "notes"]) {
        assert.ok(!columns.includes(column), `${column} no debe pedirse en la práctica`)
    }
    const practiceSource = readFileSync(join(root, "js/practice.js"), "utf8")
    assert.match(practiceSource, /\.select\(PRACTICE_VERB_COLUMNS\)/)
})

test("CUSTOM_ITEM_COLUMNS covers the fields the app reads and writes", () => {
    const columns = CUSTOM_ITEM_COLUMNS.split(",")
    for (const column of [
        "id", "user_id", "word", "pronunciation", "spanish", "example_en",
        "example_es", "notes", "category", "subcategory", "sort_order", "created_at"
    ]) {
        assert.ok(columns.includes(column), `Falta ${column} en CUSTOM_ITEM_COLUMNS`)
    }
})

test("CATEGORY_TREE_COLUMNS keeps the nested categories shape", () => {
    assert.match(CATEGORY_TREE_COLUMNS, /subcategories:subcategories\(/)
    assert.match(CATEGORY_TREE_COLUMNS, /items:items\(/)
    for (const column of ITEM_COLUMNS.split(",")) {
        assert.ok(CATEGORY_TREE_COLUMNS.includes(column), `Falta ${column} en el árbol de categorías`)
    }
    assert.ok(!CATEGORY_TREE_COLUMNS.includes("*"))
})

test("catalog loaders do not request whole rows", () => {
    for (const file of ["js/data.js", "js/auth.js", "js/practice.js", "js/verbs/verbs-loader.js"]) {
        const source = readFileSync(join(root, file), "utf8")
        assert.ok(!/select\(['"]\*['"]\)/.test(source), `${file} todavía usa select('*')`)
    }
})
