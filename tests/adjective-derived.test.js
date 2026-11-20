import test from "node:test";
import assert from "node:assert/strict";
import { ADJECTIVES_VERIFIED } from "../data/adjectives-verified.module.js";
import { deriveAdjectiveDerivedFields, derivedDisplayCell } from "../js/adjective-derived.js";

const FORBIDDEN = [
    "tallly", "slimer", "slimest", "muscularer", "muscularest",
    "careingly", "romantally", "passionatly", "lovinger", "lovingest",
    "Atentomente", "Cálidomente"
];

test("el dataset verificado existe y es un objeto", () => {
    assert.ok(ADJECTIVES_VERIFIED && typeof ADJECTIVES_VERIFIED === "object");
    assert.ok(Object.keys(ADJECTIVES_VERIFIED).length > 100);
});

test("no aparece ninguna forma inventada rechazada por el usuario", () => {
    for (const [word, entry] of Object.entries(ADJECTIVES_VERIFIED)) {
        const values = [entry.adverb?.en, entry.comparative?.en, entry.superlative?.en]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        for (const bad of FORBIDDEN) {
            assert.ok(!values.includes(bad.toLowerCase()), `${word}: forma inventada ${bad}`);
        }
    }
});

test("palabra sin dato verificado devuelve campos vacíos y muestra No tiene", () => {
    const fields = deriveAdjectiveDerivedFields("palabra-inexistente-xyz", "/x/", "inexistente");
    assert.equal(fields.adverb_en, "");
    assert.equal(fields.comparative_en, "");
    assert.equal(fields.superlative_en, "");
    assert.match(derivedDisplayCell(fields, "adverb"), /No tiene/);
    assert.match(derivedDisplayCell(fields, "comparative"), /No tiene/);
    assert.match(derivedDisplayCell(fields, "superlative"), /No tiene/);
});

test("toda forma mostrada procede del dataset (sin generación por reglas)", () => {
    for (const [word, entry] of Object.entries(ADJECTIVES_VERIFIED)) {
        const fields = deriveAdjectiveDerivedFields(word, entry.base?.pron || "", entry.base?.es || "");
        assert.equal(fields.adverb_en, entry.adverb?.en || "");
        assert.equal(fields.comparative_en, entry.comparative?.en || "");
        assert.equal(fields.superlative_en, entry.superlative?.en || "");
    }
});

const CITED = [
    "tall", "short", "slim", "plump", "muscular", "loving", "affectionate",
    "caring", "tender", "romantic", "passionate", "warm", "devoted", "attached",
    "faithful", "fond", "compassionate", "adoring", "sweet", "kind"
];

test("los adjetivos citados por el usuario están en el dataset", () => {
    for (const word of CITED) {
        assert.ok(ADJECTIVES_VERIFIED[word], `falta ${word} en el dataset verificado`);
    }
});

test("si no hay forma verificada no se muestra pronunciación ni ejemplos", () => {
    for (const [word, entry] of Object.entries(ADJECTIVES_VERIFIED)) {
        const fields = deriveAdjectiveDerivedFields(word, "/base/", "base");
        for (const type of ["adverb", "comparative", "superlative"]) {
            if (!fields[`${type}_en`]) {
                assert.equal(fields[`${type}_en_pron`], "", `${word}/${type}: pron sin forma`);
                assert.equal(fields[`${type}_es`], "", `${word}/${type}: traducción sin forma`);
                assert.equal(fields[`${type}_en_example`], "", `${word}/${type}: ejemplo sin forma`);
                assert.equal(fields[`${type}_es_example`], "", `${word}/${type}: ejemplo ES sin forma`);
            }
        }
    }
});

test("pronunciación, traducción y ejemplos salen SOLO del dataset (sin generación)", () => {
    for (const [word, entry] of Object.entries(ADJECTIVES_VERIFIED)) {
        const fields = deriveAdjectiveDerivedFields(word, "/inventada/", "inventada");
        for (const type of ["adverb", "comparative", "superlative"]) {
            const src = entry[type] || {};
            assert.equal(fields[`${type}_en_pron`], src.pron || "", `${word}/${type}: pron inventada`);
            assert.equal(fields[`${type}_es`], src.es || "", `${word}/${type}: traducción inventada`);
            assert.equal(fields[`${type}_en_example`], src.example_en || "", `${word}/${type}: ejemplo inventado`);
            assert.equal(fields[`${type}_es_example`], src.example_es || "", `${word}/${type}: ejemplo ES inventado`);
        }
    }
});
