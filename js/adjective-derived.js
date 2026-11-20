/* Derivación correcta de adverbio / comparativo / superlativo para la tabla de
 * adjetivos. Se calcula en tiempo de render (sin llamadas extra ni cambio de
 * esquema). Los formas son según rules comunes y excepciones manuales. */

const ADVERB_TABLE = {
    kind: { adverb: "kindly", comparative: "kinder", superlative: "kindest" },
    nice: { adverb: "nicely", comparative: "nicer", superlative: "nicest" },
    friendly: { adverb: "friendly", comparative: "friendlier", superlative: "friendliest" },
    helpful: { adverb: "helpfully", comparative: "more helpful", superlative: "most helpful" },
    generous: { adverb: "generously", comparative: "more generous", superlative: "most generous" },
    gentle: { adverb: "gently", comparative: "gentlest", superlative: "gentlest" },
    polite: { adverb: "politely", comparative: "politer", superlative: "poliest" },
    caring: { adverb: "careingly", comparative: "more caring", superlative: "most caring" },
    compassionate: { adverb: "compassionately", comparative: "more compassionate", superlative: "most compassionate" },
    thoughtful: { adverb: "thoughtfully", comparative: "more thoughtful", superlative: "most thoughtful" },
    considerate: { adverb: "considerately", comparative: "more considerate", superlative: "most considerate" },
    supportive: { adverb: "supportively", comparative: "more supportive", superlative: "most supportive" },
    warm: { adverb: "warmly", comparative: "warmer", superlative: "warmest" },
    courteous: { adverb: "courteously", comparative: "more courteous", superlative: "most courteous" },
    respectful: { adverb: "respectfully", comparative: "more respectful", superlative: "most respectful" },
    early: { adverb: "early", comparative: "earlier", superlative: "earliest" },
    late: { adverb: "late", comparative: "later", superlative: "latest" },
    true: { adverb: "truly", comparative: "truer", superlative: "truest" },
    good: { adverb: "well", comparative: "better", superlative: "best" },
    bad: { adverb: "badly", comparative: "worse", superlative: "worst" }
};

const ADVERB_IRREGULARS = {
    happy: "happily",
    busy: "busily",
    ugly: "uglily",
    Perry: "Perry",
    whole: "wholly",
    sale: "sally",
    sure: "surely",
    short: "shortly",
    hard: "hardly",
    sick: "sickly",
    rich: "richly",
    daily: "daily",
    weekly: "weekly"
};

function normalize(value) {
    return String(value || "").trim().toLowerCase();
}

function stemY(word) {
    const stem = word.replace(/y$/, "");
    return stem.length >= 3 && !/[aeiou][aeiou]$/.test(stem) ? `${stem}ily` : word.replace(/y$/, "ily");
}

function deriveAdverb(word, pronunciation) {
    const raw = String(word || "").trim();
    const w = normalize(raw);
    const table = ADVERB_TABLE[w] || ADVERB_TABLE[raw];
    if (table?.adverb) return { en: table.adverb, pron: pronunciation || "" };
    const irregular = ADVERB_IRREGULARS[w] || ADVERB_IRREGULARS[raw];
    if (irregular) return { en: irregular, pron: pronunciation || "" };
    if (!w) return { en: "", pron: "" };
    if (w.endsWith("ly")) return { en: w, pron: pronunciation || "" };
    if (w.endsWith("y")) return { en: stemY(w), pron: pronunciation || "" };
    if (w.endsWith("e")) {
        if (w.endsWith("le")) return { en: `${w.slice(0, -2)}ly`, pron: pronunciation || "" };
        return { en: `${w.slice(0, -1)}ly`, pron: pronunciation || "" };
    }
    if (w.endsWith("ic")) return { en: `${w.slice(0, -2)}ally`, pron: pronunciation || "" };
    if (w.endsWith("al")) return { en: `${w}ly`, pron: pronunciation || "" };
    if (w.endsWith("ful")) return { en: `${w.slice(0, -3)}fully`, pron: pronunciation || "" };
    if (w.endsWith("ous")) return { en: `${w}ly`, pron: pronunciation || "" };
    return { en: `${w}ly`, pron: pronunciation || "" };
}

function deriveComparative(word) {
    const raw = String(word || "").trim();
    const w = normalize(raw);
    const table = ADVERB_TABLE[w] || ADVERB_TABLE[raw];
    if (table?.comparative) return table.comparative;
    if (!w) return "";
    if (w.endsWith("y")) return `${w.slice(0, -1)}ier`;
    if (w.endsWith("e")) return `${w.slice(0, -1)}er`;
    if (!/s$/.test(w) && !/ll$/.test(w)) return `${w}er`;
    return `more ${w}`;
}

function deriveSuperlative(word) {
    const raw = String(word || "").trim();
    const w = normalize(raw);
    const table = ADVERB_TABLE[w] || ADVERB_TABLE[raw];
    if (table?.superlative) return table.superlative;
    if (!w) return "";
    if (w.endsWith("y")) return `${w.slice(0, -1)}iest`;
    if (w.endsWith("e")) return `${w.slice(0, -1)}est`;
    if (!/s$/.test(w) && !/ll$/.test(w)) return `${w}est`;
    return `most ${w}`;
}

function deriveSpanishAdverb(word, spanish) {
    const raw = String(spanish || "").trim();
    if (!raw) return "";
    if (normalize(raw).endsWith("mente")) return raw;
    if (/^(el|la)\s+/i.test(raw)) return `${raw.replace(/^(el|la)\s+/i, "").replace(/[oá]$/i, "")}mente`;
    const w = normalize(word || "");
    if (/^(happ|kind|nice|pol|warm|cal|rapid|verd|sem|import|intel|facil)/.test(w)) return `${raw}mente`;
    return `${raw}mente`;
}

function deriveSpanishComparative(spanish) {
    const raw = String(spanish || "").trim();
    if (!raw) return "";
    if (/^más\s+/i.test(raw)) return raw;
    return `más ${raw}`;
}

function deriveSpanishSuperlative(spanish) {
    const raw = String(spanish || "").trim();
    if (!raw) return "";
    if (/^el\s+/i.test(raw)) return raw;
    return `el más ${raw}`;
}

function displayCell(word, pronunciation, spanish, examples = []) {
    const lines = [];
    if (word) lines.push(`<span class="text-sm font-semibold">${word}</span>`);
    if (pronunciation) lines.push(`<span class="text-xs text-gray-400">[${pronunciation}]</span>`);
    if (spanish) lines.push(`<span class="block text-xs text-gray-500">${spanish}</span>`);
    for (const example of examples) {
        if (example) lines.push(`<span class="block text-xs text-gray-400">${example}</span>`);
    }
    if (!lines.length) lines.push(`<span class="text-gray-400">—</span>`);
    return `<div class="text-sm">${lines.join(" ")}</div>`;
}

export function deriveAdjectiveDerivedFields(word, pronunciation, spanish) {
    const rawWord = String(word || "").trim();
    const rawPron = String(pronunciation || "").trim();
    const rawSpanish = String(spanish || "").trim();

    const adverb = deriveAdverb(rawWord, rawPron);
    const comparative = deriveComparative(rawWord);
    const superlative = deriveSuperlative(rawWord);

    return {
        adverb_en: adverb.en || "",
        adverb_en_pron: adverb.pron || "",
        adverb_es: deriveSpanishAdverb(rawWord, rawSpanish),
        adverb_en_example: `She is ${adverb.en || "very" + rawWord || "very"}.`,
        adverb_es_example: `Ella es ${deriveSpanishAdverb(rawWord, rawSpanish) || rawSpanish || "muy " + (rawWord || "")}.`,

        comparative_en: comparative || "",
        comparative_en_pron: rawPron || "",
        comparative_es: deriveSpanishComparative(rawSpanish),
        comparative_en_example: `She is ${comparative || rawWord} than you.`,
        comparative_es_example: `Ella es ${deriveSpanishComparative(rawSpanish) || "más " + rawSpanish} que tú.`,

        superlative_en: superlative || "",
        superlative_en_pron: rawPron || "",
        superlative_es: deriveSpanishSuperlative(rawSpanish),
        superlative_en_example: `She is the ${superlative || rawWord}.`,
        superlative_es_example: `Ella es ${deriveSpanishSuperlative(rawSpanish) || "el más " + rawSpanish}.`
    };
}

export function derivedDisplayCell(fields, type) {
    if (type === "adverb") {
        return displayCell(
            fields.adverb_en,
            fields.adverb_en_pron,
            fields.adverb_es,
            [fields.adverb_en_example, fields.adverb_es_example].filter(Boolean)
        );
    }
    if (type === "comparative") {
        return displayCell(
            fields.comparative_en,
            fields.comparative_en_pron,
            fields.comparative_es,
            [fields.comparative_en_example, fields.comparative_es_example].filter(Boolean)
        );
    }
    if (type === "superlative") {
        return displayCell(
            fields.superlative_en,
            fields.superlative_en_pron,
            fields.superlative_es,
            [fields.superlative_en_example, fields.superlative_es_example].filter(Boolean)
        );
    }
    return `<span class="text-gray-400">—</span>`;
}
