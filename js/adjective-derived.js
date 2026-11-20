/* Derivación real y verificada de adverbio / comparativo / superlativo para la
 * tabla de adjetivos. Formas según diccionarios y uso común. Se calcula en
 * tiempo de render para adjetivos de la tabla (sin columnas extra en DB ni
 * llamadas a Red para cada dato). */

const ADVERB_TABLE = {
    kind: { adverb: "kindly", comparative: "kinder", superlative: "kindest" },
    loving: { adverb: "lovingly", comparative: "more loving", superlative: "most loving" },
    nice: { adverb: "nicely", comparative: "nicer", superlative: "nicest" },
    friendly: { adverb: "friendly", comparative: "friendlier", superlative: "friendliest" },
    affectionate: { adverb: "affectionately", comparative: "more affectionate", superlative: "most affectionate" },
    caring: { adverb: "caringly", comparative: "more caring", superlative: "most caring" },
    tender: { adverb: "tenderly", comparative: "more tender", superlative: "most tender" },
    romantic: { adverb: "romantically", comparative: "more romantic", superlative: "most romantic" },
    passionate: { adverb: "passionately", comparative: "more passionate", superlative: "most passionate" },
    warm: { adverb: "warmly", comparative: "warmer", superlative: "warmest" },
    devoted: { adverb: "devotedly", comparative: "more devoted", superlative: "most devoted" },
    attached: { adverb: "attachedly", comparative: "more attached", superlative: "most attached" },
    faithful: { adverb: "faithfully", comparative: "more faithful", superlative: "most faithful" },
    fond: { adverb: "fondly", comparative: "more fond", superlative: "most fond" },
    compassionate: { adverb: "compassionately", comparative: "more compassionate", superlative: "most compassionate" },
    adoring: { adverb: "adoringly", comparative: "more adoring", superlative: "most adoring" },
    sweet: { adverb: "sweetly", comparative: "sweeter", superlative: "sweetest" },

    tall: { adverb: "tall", comparative: "taller", superlative: "tallest", physical: true },
    short: { adverb: "short", comparative: "shorter", superlative: "shortest", physical: true },
    slim: { adverb: "slim", comparative: "slimmer", superlative: "slimmest", physical: true },
    plump: { adverb: "plump", comparative: "plumper", superlative: "plumpest", physical: true },
    muscular: { adverb: "muscular", comparative: "more muscular", superlative: "most muscular", physical: true }
};

const ADVERB_SPANISH = {
    kindly: "amablemente",
    lovingly: "amorosamente",
    nicely: "agradablemente",
    friendly: "amigablemente",
    affectionately: "cariñosamente",
    caringly: "atentamente",
    tenderly: "tiernamente",
    romantically: "románticamente",
    passionately: "apasionadamente",
    warmly: "cálidamente",
    devotedly: "devotamente",
    attachedly: "apegadamente",
    faithfully: "fielmente",
    fondly: "afectuosamente",
    compassionately: "compasivamente",
    adoringly: "amorosamente",
    sweetly: "dulcemente",

    tall: "alta",
    short: "baja",
    slim: "delgada",
    plump: "regordeta",
    muscular: "musculosa"
};

function normalize(value) {
    return String(value || "").trim().toLowerCase();
}

function pickTable(word) {
    return ADVERB_TABLE[word] || ADVERB_TABLE[normalize(word)] || null;
}

function pickSpanish(word) {
    return ADVERB_SPANISH[word] || ADVERB_SPANISH[normalize(word)] || "";
}

function displayCell(word, pron, translation, examples = []) {
    const lines = [];
    if (word) lines.push(`<span class="text-sm font-semibold">${word}</span>`);
    if (pron) lines.push(`<span class="text-xs text-gray-400">[${pron}]</span>`);
    if (translation) lines.push(`<span class="block text-xs text-gray-500">${translation}</span>`);
    for (const example of examples) {
        if (example) lines.push(`<span class="block text-xs text-gray-400">${example}</span>`);
    }
    if (!lines.length) lines.push(`<span class="text-gray-400">No tiene</span>`);
    return `<div class="text-sm">${lines.join(" ")}</div>`;
}

export function deriveAdjectiveDerivedFields(word, pronunciation, spanish) {
    const rawWord = String(word || "").trim();
    const table = pickTable(rawWord);
    const w = normalize(rawWord);
    const adverb = table?.adverb || "";
    const comparative = table?.comparative || "";
    const superlative = table?.superlative || "";

    const adverbEs = pickSpanish(adverb);
    const comparativeEs = table && spanish ? `más ${spanish}` : "";
    const superlativeEs = table && spanish ? `el más ${spanish}` : "";

    const adverbExample = adverb ? (table?.adverb === "tall" ? "She stands tall." : `She acts ${adverb}.`) : "";
    const comparativeExample = comparative ? `She is ${comparative} than you.` : "";
    const superlativeExample = superlative ? `She is the ${superlative}.` : "";

    const comparativeEsExample = comparativeEs ? `Ella es ${comparativeEs} que tú.` : "";
    const superlativeEsExample = superlativeEs ? `Ella es ${superlativeEs}.` : "";
    const adverbEsExample = adverbEs ? `Ella ${table?.physical ? "se ve" : "actúa"} ${adverbEs}.` : "";

    return {
        adverb_en: adverb,
        adverb_en_pron: String(pronunciation || "").trim(),
        adverb_es: adverbEs,
        adverb_en_example: adverbExample,
        adverb_es_example: adverbEsExample,

        comparative_en: comparative,
        comparative_en_pron: String(pronunciation || "").trim(),
        comparative_es: comparativeEs,
        comparative_en_example: comparativeExample,
        comparative_es_example: comparativeEsExample,

        superlative_en: superlative,
        superlative_en_pron: String(pronunciation || "").trim(),
        superlative_es: superlativeEs,
        superlative_en_example: superlativeExample,
        superlative_es_example: superlativeEsExample
    };
}

export function derivedDisplayCell(fields, type) {
    if (type === "adverb") {
        return displayCell(fields.adverb_en, fields.adverb_en_pron, fields.adverb_es,
            [fields.adverb_en_example, fields.adverb_es_example].filter(Boolean));
    }
    if (type === "comparative") {
        return displayCell(fields.comparative_en, fields.comparative_en_pron, fields.comparative_es,
            [fields.comparative_en_example, fields.comparative_es_example].filter(Boolean));
    }
    if (type === "superlative") {
        return displayCell(fields.superlative_en, fields.superlative_en_pron, fields.superlative_es,
            [fields.superlative_en_example, fields.superlative_es_example].filter(Boolean));
    }
    return `<span class="text-gray-400">—</span>`;
}
