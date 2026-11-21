/* Formas derivadas EXCLUSIVAMENTE del dataset verificado local.
 * Si Wiktionary no respalda una forma, el campo queda vacío y la celda muestra
 * «No tiene». No se generan formas por reglas. */

import { ADJECTIVES_VERIFIED } from "../data/adjectives-verified.module.js";
import { makeClickableText } from "./audio.js";

function normalize(value) {
    return String(value || "").trim().toLowerCase();
}

function verifiedEntry(word) {
    const key = normalize(word);
    return ADJECTIVES_VERIFIED[key] || (key.includes(" ")
        ? ADJECTIVES_VERIFIED[key.split(/\s+/).pop()] || null
        : null);
}

function clean(value) {
    return String(value ?? "").trim();
}

function examplePair(source) {
    return {
        en: clean(source?.example_en),
        es: clean(source?.example_es)
    };
}

function emptyFields() {
    return {
        adverb_en: "", adverb_en_pron: "", adverb_es: "", adverb_en_example: "", adverb_es_example: "",
        comparative_en: "", comparative_en_pron: "", comparative_es: "", comparative_en_example: "", comparative_es_example: "",
        superlative_en: "", superlative_en_pron: "", superlative_es: "", superlative_en_example: "", superlative_es_example: ""
    };
}

export function deriveAdjectiveDerivedFields(word, pronunciation, spanish) {
    const entry = verifiedEntry(word);
    if (!entry) return emptyFields();

    // Solo se muestra lo que viene del dataset verificado. No se generan
    // traducciones ni ejemplos: si la fuente no lo dio, el campo queda vacío.
    const adverb = clean(entry.adverb?.en);
    const comparative = clean(entry.comparative?.en);
    const superlative = clean(entry.superlative?.en);

    const adverbEs = clean(entry.adverb?.es);
    const comparativeEs = clean(entry.comparative?.es);
    const superlativeEs = clean(entry.superlative?.es);

    const adverbExample = examplePair(entry.adverb);
    const comparativeExample = examplePair(entry.comparative);
    const superlativeExample = examplePair(entry.superlative);

    return {
        adverb_en: adverb,
        adverb_en_pron: clean(entry.adverb?.pron),
        adverb_es: adverbEs,
        adverb_en_example: adverbExample.en,
        adverb_es_example: adverbExample.es,

        comparative_en: comparative,
        comparative_en_pron: clean(entry.comparative?.pron),
        comparative_es: comparativeEs,
        comparative_en_example: comparativeExample.en,
        comparative_es_example: comparativeExample.es,

        superlative_en: superlative,
        superlative_en_pron: clean(entry.superlative?.pron),
        superlative_es: superlativeEs,
        superlative_en_example: superlativeExample.en,
        superlative_es_example: superlativeExample.es
    };
}

function displayCell(word, pron, translation, examples = []) {
    const lines = [];
    if (word) lines.push(`<span class="text-sm font-semibold">${makeClickableText(word, "en")}</span>`);
    if (pron) lines.push(`<span class="text-xs text-gray-400">[${pron}]</span>`);
    if (translation) lines.push(`<span class="block text-xs text-gray-500">${translation}</span>`);
    for (const example of examples) {
        if (example?.text) {
            lines.push(`<span class="block text-xs text-gray-400">${makeClickableText(example.text, example.lang || "en")}</span>`);
        }
    }
    if (!lines.length) lines.push(`<span class="text-gray-400">No tiene</span>`);
    return `<div class="text-sm">${lines.join(" ")}</div>`;
}

export function derivedDisplayCell(fields, type) {
    if (type === "adverb") {
        return displayCell(fields.adverb_en, fields.adverb_en_pron, fields.adverb_es, [
            { text: fields.adverb_en_example, lang: "en" },
            { text: fields.adverb_es_example, lang: "es" }
        ]);
    }
    if (type === "comparative") {
        return displayCell(fields.comparative_en, fields.comparative_en_pron, fields.comparative_es, [
            { text: fields.comparative_en_example, lang: "en" },
            { text: fields.comparative_es_example, lang: "es" }
        ]);
    }
    if (type === "superlative") {
        return displayCell(fields.superlative_en, fields.superlative_en_pron, fields.superlative_es, [
            { text: fields.superlative_en_example, lang: "en" },
            { text: fields.superlative_es_example, lang: "es" }
        ]);
    }
    return `<span class="text-gray-400">—</span>`;
}
