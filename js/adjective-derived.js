/* Derivación mecánica de adverbio / comparativo / superlativo de los adjetivos
 * de adjetivo a partir de `word`, `pronunciation` y `spanish`. Se calcula en
 * tiempo de render para adjetivos de la tabla (sin columnas extra en DB ni
 * llamadas a Red para cada dato). No es un sustituto de un diccionario: para
 * casos irregulares conviene refinar una tabla de excepciones o rellenar
 * columnas si se quiere persistir la derivación. */

const ADVERB_IRREGULARS = {
    happy: "happily",
    busy: "busily",
    ugly: "uglily",
    Perry: "Perry",
    late: "lately",
    hard: "hardly",
    rich: "richly",
    sick: "sickly",
    whole: "wholly",
    sale: "sally",
    sure: "surely",
    short: "shortly",
    wide: "widely"
};

const COMPARATIVE_IRREGULARS = {
    better: "better",
    worse: "worse",
    farther: "farther",
    further: "further",
    nearer: "nearer",
    closer: "closer",
    older: "older",
    larger: "larger",
    smaller: "smaller",
    faster: "faster",
    slower: "slower",
    lighter: "lighter",
    earlier: "earlier",
    later: "later",
    newer: "newer",
    more: "more",
    less: "less"
};

const SUPERLATIVE_IRREGULARS = {
    best: "best",
    worst: "worst",
    farthest: "farthest",
    furthest: "furthest",
    nearest: "nearest",
    closer: "closest",
    older: "oldest",
    larger: "largest",
    smaller: "smallest",
    faster: "fastest",
    slower: "slowest",
    lighter: "lightest",
    earlier: "earliest",
    later: "latest",
    newer: "newest",
    most: "most",
    least: "least"
};

const SPANISH_ADVERB_IRREGULARS = {
    feliz: "felizmente",
    rápido: "rápidamente",
    caliente: "calurosamente",
    triste: "tristemente",
    grande: "grandemente",
    pequeño: "pequeñamente",
    bien: "bien",
    mal: "mal",
    muy: "mucho",
    claro: "claramente",
    seguro: "seguramente",
    profundo: "profundamente",
    sorprendente: "sorprendentemente",
    importante: "importantemente",
    interesante: "interesantemente",
    pequeño: "pequeñamente"
};

function normalize(value) {
    return String(value || "").trim().toLowerCase();
}

function stripSpaces(value) {
    return String(value || "").replace(/\s+/g, "").trim();
}

function looksLikeAdverb(word) {
    return /(?:y|ly|ly|emente|ously|ively|fully|ly)$/i.test(normalize(word));
}

function deriveAdverb(word, pronunciation) {
    const raw = String(word || "").trim();
    const w = normalize(raw);
    const irregular = ADVERB_IRREGULARS[w] || ADVERB_IRREGULARS[raw];
    if (irregular) return { en: irregular, pron: pronunciation || "" };
    if (!w) return { en: "", pron: "" };
    if (w.endsWith("ly")) return { en: w, pron: pronunciation || "" };
    if (w.endsWith("le")) {
        const irregular = SPANISH_ADVERB_IRREGULARS[w];
        if (irregular) return { en: irregular, pron: pronunciation || "" };
        if (w.endsWith("simple")) return { en: "simply", pron: pronunciation || "" };
        if (w.endsWith("able")) return { en: `${w.slice(0, -1)}ly`, pron: pronunciation || "" };
        return { en: `${w}ly`, pron: pronunciation || "" };
    }
    if (w.endsWith("e")) {
        if (ADVERB_IRREGULARS[w]) return { en: ADVERB_IRREGULARS[w], pron: pronunciation || "" };
        return { en: `${w}ly`, pron: pronunciation || "" };
    }
    if (w.endsWith("ic")) return { en: `${w.slice(0, -2)}ally`, pron: pronunciation || "" };
    if (w.endsWith("al")) return { en: `${w}ly`, pron: pronunciation || "" };
    if (w.endsWith("ful")) return { en: `${w.slice(0, -3)}fully`, pron: pronunciation || "" };
    if (w.endsWith("ous")) return { en: `${w}ly`, pron: pronunciation || "" };
    if (w.endsWith("ive")) return { en: `${w}ly`, pron: pronunciation || "" };
    if (w.endsWith("y")) {
        const stem = w.slice(0, -1);
        if (stem.length >= 2 && !/[aeiou][aeiou]$/.test(stem)) return { en: `${stem}ily`, pron: pronunciation || "" };
        return { en: `${w}ly`, pron: pronunciation || "" };
    }
    return { en: `${w}ly`, pron: pronunciation || "" };
}

function deriveComparative(word) {
    const raw = String(word || "").trim();
    const w = normalize(raw);
    if (COMPARATIVE_IRREGULARS[w] || COMPARATIVE_IRREGULARS[raw]) return COMPARATIVE_IRREGULARS[w] || COMPARATIVE_IRREGULARS[raw];
    if (!w) return "";
    if (w.endsWith("y")) {
        const stem = w.slice(0, -1);
        if (/[qxvz]$/.test(stem) || stem.length >= 5) return `${stem}ier`;
        return `${w.slice(0, -1)}ier`;
    }
    if (w.endsWith("e")) return `${w}r`;
    if (/[^aeiou][aeiou][^aeiou]$/.test(w) && w.length <= 4) return `${w}er`;
    if (!/s$/.test(w)) return `${w}er`;
    return `more ${w}`;
}

function deriveSuperlative(word) {
    const raw = String(word || "").trim();
    const w = normalize(raw);
    if (SUPERLATIVE_IRREGULARS[w] || SUPERLATIVE_IRREGULARS[raw]) return SUPERLATIVE_IRREGULARS[w] || SUPERLATIVE_IRREGULARS[raw];
    if (!w) return "";
    if (w.endsWith("y")) {
        const stem = w.slice(0, -1);
        if (/[qxvz]$/.test(stem)) return `${stem}liest`;
        return `${w.slice(0, -1)}iest`;
    }
    if (w.endsWith("e")) return `${w.slice(0, -1)}st`;
    if (!/s$/.test(w)) return `${w}est`;
    return `most ${w}`;
}

function derivePronunciation(word, pronunciation) {
    const base = String(pronunciation || "").trim();
    if (!base) return "";
    const suffix = String(word || "").toLowerCase().endsWith("ly") ? "li" : "";
    return suffix ? `${base}${suffix}` : base;
}

function deriveSpanishAdverb(spanish) {
    const raw = String(spanish || "").trim();
    if (!raw) return "";
    const irregular = SPANISH_ADVERB_IRREGULARS[normalize(raw)];
    if (irregular) return irregular;
    if (/mente$/i.test(raw)) return raw;
    if (/[oá]$/.test(raw)) return `${raw}mente`;
    return `${raw}mente`;
}

function deriveSpanishComparative(spanish) {
    const raw = String(spanish || "").trim();
    if (!raw) return "";
    if (/^más\s+/i.test(raw)) return raw;
    if (/^mejor|peor|menor|mayor$/i.test(raw)) return raw;
    return `más ${raw}`;
}

function deriveSpanishSuperlative(spanish) {
    const raw = String(spanish || "").trim();
    if (!raw) return "";
    if (/^el\s+/i.test(raw)) return raw;
    return `el ${raw}`;
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
        adverb_en_pron: derivePronunciation(adverb.en, rawPron),
        adverb_es: deriveSpanishAdverb(rawSpanish),
        comparative_en: comparative || "",
        comparative_en_pron: derivePronunciation(comparative, rawPron),
        comparative_es: deriveSpanishComparative(rawSpanish),
        superlative_en: superlative || "",
        superlative_en_pron: derivePronunciation(superlative, rawPron),
        superlative_es: deriveSpanishSuperlative(rawSpanish)
    };
}

export function derivedDisplayCell(word, pronunciation, spanish, example_en, example_es) {
    const value = String(word || "").trim();
    const pron = String(pronunciation || "").trim();
    const translation = String(spanish || "").trim();
    const exampleEn = String(example_en || "").trim();
    const exampleEs = String(example_es || "").trim();
    if (!value && !translation && !exampleEn && !exampleEs) return `<span class="text-gray-400">—</span>`;
    const lines = [value || translation ? value || "" : ""];
    if (pron) lines.push(`<span class="text-xs text-gray-400">[${pron}]</span>`);
    if (translation) lines.push(`<span class="block text-xs text-gray-500">${translation}</span>`);
    if (exampleEn) lines.push(`<span class="block text-xs text-gray-400">En: ${exampleEn}</span>`);
    if (exampleEs) lines.push(`<span class="block text-xs text-gray-400">Es: ${exampleEs}</span>`);
    if (!value) lines.push(`<span class="block text-xs text-gray-400">—</span>`);
    return `<div class="text-sm">${lines.join(" ")}</div>`;
}

export { looksLikeAdverb };
