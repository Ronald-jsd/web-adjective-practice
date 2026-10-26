function normalizeHeader(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
}

function splitRow(line) {
    const value = line.trim()
    if (value.startsWith("|") && value.endsWith("|")) {
        return value.slice(1, -1).split("|").map(cell => cell.trim())
    }
    return value.split("\t").map(cell => cell.trim())
}

const HEADER_ALIASES = {
    word: ["adjetivo", "adverbio", "verbo", "palabra", "expresion", "english", "word", "term"],
    spanish: ["significado", "traduccion espanol", "meaning", "spanish", "espanol"],
    exampleEn: ["ejemplo en ingles", "ejemplo ingles", "example in english", "example english", "example en"],
    exampleEs: ["traduccion del ejemplo", "traduccion ejemplo", "ejemplo traducido", "example translation", "example es"]
}

function findHeaderIndex(headers, key) {
    return headers.findIndex(header => HEADER_ALIASES[key].includes(normalizeHeader(header)))
}

function isSeparatorRow(cells) {
    return cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")))
}

export function parsePracticeTable(input) {
    const lines = String(input || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    let columns = null
    let indexes = null
    const entries = []

    for (const line of lines) {
        const cells = splitRow(line)
        if (isSeparatorRow(cells)) continue
        const wordIndex = findHeaderIndex(cells, "word")
        const exampleEnIndex = findHeaderIndex(cells, "exampleEn")
        const specificExampleEsIndex = findHeaderIndex(cells, "exampleEs")
        const genericTranslationIndex = cells.findIndex(cell => normalizeHeader(cell) === "traduccion")
        const spanishIndex = findHeaderIndex(cells, "spanish")
            >= 0 ? findHeaderIndex(cells, "spanish")
            : exampleEnIndex < 0 ? genericTranslationIndex : -1
        if (wordIndex >= 0 && (spanishIndex >= 0
            || exampleEnIndex >= 0
            || specificExampleEsIndex >= 0
            || (genericTranslationIndex >= 0 && exampleEnIndex >= 0))) {
            columns = cells
            indexes = {
                word: wordIndex,
                spanish: spanishIndex,
                exampleEn: exampleEnIndex,
                exampleEs: specificExampleEsIndex >= 0
                    ? specificExampleEsIndex
                    : exampleEnIndex >= 0 ? genericTranslationIndex : -1
            }
            continue
        }
        if (!indexes) continue
        const lastColumnIndex = Math.max(indexes.word, indexes.spanish, indexes.exampleEn, indexes.exampleEs)
        if (cells.length <= lastColumnIndex) continue

        const word = cells[indexes.word].replace(/^\d+[.)]?\s*/, "").trim()
        if (!word || normalizeHeader(word) === normalizeHeader(columns[indexes.word])) continue
        const at = index => index >= 0 ? String(cells[index] || "").trim() : ""
        const exampleEn = at(indexes.exampleEn)
        const exampleEs = at(indexes.exampleEs)
        const spanish = at(indexes.spanish) || exampleEs || word
        if (!spanish && !exampleEn) continue
        entries.push({
            word,
            spanish,
            exampleEn,
            exampleEs,
            pronunciation: "",
            notes: ""
        })
    }

    const unique = new Map()
    for (const item of entries) {
        const key = item.word.toLocaleLowerCase()
        if (!unique.has(key)) unique.set(key, item)
    }
    return [...unique.values()]
}
