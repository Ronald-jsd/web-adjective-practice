import test from "node:test";
import assert from "node:assert/strict";
import {
    extractNotionVocabulary,
    toNotionPracticeCategory
} from "../supabase/functions/_shared/notion-parser.js";

function text(value) {
    return [{ plain_text: value }];
}

function row(id, values) {
    return {
        id,
        type: "table_row",
        table_row: { cells: values.map(text) }
    };
}

test("Notion table parser maps different vocabulary columns and aligned translations", () => {
    const blocks = [{
        id: "table-1",
        type: "table",
        children: [
            row("headers", [
                "ESTRUCTURA", "VERBO", "🇪🇸", "🔊", "REG/IRR", "PAST",
                "PARTICIPLE", "🔊 PAST", "🔊 PARTICIPLE", "EJEMPLO", "🇪🇸",
                "SUSTANTIVO(S)", "🇪🇸", "PERSONA(S)", "🇪🇸"
            ]),
            row("verb-row", [
                "apply + for + puesto", "apply", "postular / solicitar", "(aplái)",
                "Regular", "applied", "applied", "", "", "I applied for the job.",
                "Postulé al trabajo.", "application / applicant",
                "solicitud / postulante", "applicant", "postulante"
            ])
        ]
    }];

    const entries = extractNotionVocabulary(blocks, "Entrevista de trabajo");
    assert.deepEqual(entries.map(entry => [entry.term, entry.translation, entry.item_type]), [
        ["apply", "postular / solicitar", "verb"],
        ["application", "solicitud", "noun"],
        ["applicant", "postulante", "noun"],
        ["applicant", "postulante", "person"]
    ]);
    assert.equal(entries[0].pronunciation, "(aplái)");
    assert.equal(entries[0].example, "I applied for the job.");
    assert.equal(entries[0].example_translation, "Postulé al trabajo.");
})

test("Notion paragraph parser imports only clear English-Spanish pairs", () => {
    const blocks = [
        { id: "clear", type: "paragraph", paragraph: { rich_text: text("job offer — oferta de trabajo") } },
        { id: "ambiguous", type: "paragraph", paragraph: { rich_text: text("Criterios aplicados: sin repetir palabras") } },
        { id: "heading", type: "heading_1", heading_1: { rich_text: text("Vocabulario") } }
    ];

    assert.deepEqual(extractNotionVocabulary(blocks).map(item => ({
        term: item.term,
        translation: item.translation
    })), [{ term: "job offer", translation: "oferta de trabajo" }]);
})

test("Notion page categories are usable by the existing practice engine", () => {
    const category = toNotionPracticeCategory(
        { page_id: "page-1", title: "Entrevista de trabajo" },
        [{
            id: "item-1",
            item_type: "verb",
            term: "apply",
            translation: "postular",
            pronunciation: "aplái",
            example: "I applied for the job.",
            example_translation: "Postulé al trabajo."
        }]
    );

    assert.equal(category.id, "notion-page-page-1");
    assert.equal(category.title, "Entrevista de trabajo");
    assert.equal(category.subcategories[0].title, "Verbos");
    assert.deepEqual(category.subcategories[0].items[0], [
        "apply", "aplái", "postular", "I applied for the job.",
        "Postulé al trabajo.", "item-1"
    ]);
})
