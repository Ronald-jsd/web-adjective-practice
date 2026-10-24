const VOCABULARY_HEADERS = [
    { type: "verb", pattern: /^(?:phrasal\s+)?verbs?$|^(?:phrasal\s+)?verbos?$/ },
    { type: "noun", pattern: /^(?:nouns?|sustantivos?)(?:\s*\(s\))?$/ },
    { type: "adjective", pattern: /^(?:adjectives?|adjetivos?)$/ },
    { type: "adverb", pattern: /^(?:adverbs?|adverbios?)$/ },
    { type: "person", pattern: /^(?:people|persons?|personas?|occupations?)$/ },
    { type: "expression", pattern: /^(?:expressions?|phrases?|expresiones?|frases?)$/ },
    { type: "word", pattern: /^(?:word|words|palabra|palabras|english)$/ }
];

function normalizeHeader(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[🇪🇸🔊]/gu, "")
        .replace(/[()[\]{}]/g, "")
        .replace(/[^\p{L}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function richTextValue(value) {
    if (typeof value === "string") return value.trim();
    if (!Array.isArray(value)) return "";
    return value.map(part => part?.plain_text || part?.text?.content || "").join("").trim();
}

function blockText(block) {
    const payload = block?.[block?.type];
    return richTextValue(payload?.rich_text || payload?.title);
}

function isSpanishHeader(header) {
    const raw = String(header || "");
    const normalized = normalizeHeader(raw);
    return normalized === "es" || normalized === "espanol"
        || normalized.includes("spanish") || normalized.includes("traduccion")
        || /🇪🇸/u.test(raw);
}

function isExampleHeader(header) {
    return /example|ejemplo/i.test(normalizeHeader(header));
}

function isPronunciationHeader(header) {
    return /pronunciation|pronunciacion|ipa|phonetic|fonetica/i.test(normalizeHeader(header))
        || /🔊/u.test(String(header || ""));
}

function isStructureHeader(header) {
    return /structure|estructura/i.test(normalizeHeader(header));
}

function vocabularyType(header) {
    const normalized = normalizeHeader(header);
    return VOCABULARY_HEADERS.find(candidate => candidate.pattern.test(normalized))?.type || null;
}

function splitValues(value) {
    return String(value || "")
        .split(/\s*[\/;]\s*/)
        .map(part => part.trim())
        .filter(part => part && !["—", "-", "--", "n/a"].includes(part.toLowerCase()));
}

function findRelatedColumn(headers, index, predicate) {
    for (let next = index + 1; next < headers.length; next += 1) {
        if (vocabularyType(headers[next])) break;
        if (predicate(headers[next])) return next;
    }
    return -1;
}

function pushEntry(entries, seen, entry) {
    const term = String(entry.term || "").trim();
    const translation = String(entry.translation || "").trim();
    if (!term || !translation) return;

    const key = `${entry.blockId}:${entry.type}:${term.toLocaleLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({
        source_block_id: entry.blockId,
        term,
        translation,
        example: entry.example || "",
        example_translation: entry.exampleTranslation || "",
        pronunciation: entry.pronunciation || "",
        item_type: entry.type
    });
}

function extractTable(table, entries, seen, pageTitle) {
    const rows = table.children || [];
    const rowValues = rows.map(row => (row.table_row?.cells || []).map(richTextValue));
    if (!rowValues.length) return;

    const configuredHeaders = (table.table?.headers || []).map(richTextValue);
    let headerIndex = configuredHeaders.length ? -1 : rowValues.findIndex(row =>
        row.some(value => vocabularyType(value) || isSpanishHeader(value) || isExampleHeader(value))
    );
    const headers = configuredHeaders.length
        ? configuredHeaders
        : headerIndex >= 0 ? rowValues[headerIndex] : [];
    if (!headers.length) return;
    if (headerIndex < 0) headerIndex = -1;

    const termColumns = headers
        .map((header, index) => ({ index, type: vocabularyType(header) }))
        .filter(column => column.type);
    if (!termColumns.length) return;

    for (let rowIndex = headerIndex + 1; rowIndex < rowValues.length; rowIndex += 1) {
        const values = rowValues[rowIndex];
        const blockId = rows[rowIndex]?.id || `${table.id || pageTitle}:row:${rowIndex}`;
        for (const column of termColumns) {
            const terms = splitValues(values[column.index]);
            if (!terms.length) continue;

            const translationIndex = findRelatedColumn(headers, column.index, isSpanishHeader);
            const exampleIndex = findRelatedColumn(headers, column.index, isExampleHeader);
            const pronunciationIndex = findRelatedColumn(headers, column.index, isPronunciationHeader);
            const structureIndex = findRelatedColumn(headers, column.index, isStructureHeader);
            const translations = translationIndex >= 0 ? splitValues(values[translationIndex]) : [];
            const example = exampleIndex >= 0 ? values[exampleIndex] || "" : "";
            const exampleTranslationIndex = exampleIndex >= 0
                ? findRelatedColumn(headers, exampleIndex, isSpanishHeader)
                : -1;
            const exampleTranslation = exampleTranslationIndex >= 0
                ? values[exampleTranslationIndex] || ""
                : "";

            terms.forEach((term, termIndex) => {
                pushEntry(entries, seen, {
                    blockId,
                    type: column.type,
                    term,
                    translation: terms.length === 1
                        ? translations.join(" / ")
                        : translations[termIndex] || translations[0] || "",
                    example: column.type === "verb" || column.type === "expression" ? example : "",
                    exampleTranslation: column.type === "verb" || column.type === "expression"
                        ? exampleTranslation
                        : "",
                    pronunciation: pronunciationIndex >= 0 ? values[pronunciationIndex] || "" : "",
                    structure: structureIndex >= 0 ? values[structureIndex] || "" : ""
                });
            });
        }
    }
}

function extractParagraph(block, entries, seen) {
    const content = blockText(block);
    const match = content.match(/^\s*([A-Za-z][A-Za-z0-9'’ -]{0,79}?)\s+[—–-]\s+([^—–-].{0,199})\s*$/u);
    if (!match) return;
    pushEntry(entries, seen, {
        blockId: block.id,
        type: "paragraph",
        term: match[1],
        translation: match[2]
    });
}

export function extractNotionVocabulary(blocks, pageTitle = "") {
    const entries = [];
    const seen = new Set();

    function visit(blockList) {
        for (const block of blockList || []) {
            if (block?.type === "table") {
                extractTable(block, entries, seen, pageTitle);
            } else if (block?.type === "paragraph") {
                extractParagraph(block, entries, seen);
            }
            if (Array.isArray(block?.children)) visit(block.children);
        }
    }

    visit(blocks);
    return entries;
}

export function toNotionPracticeCategory(page, items) {
    const groups = new Map();
    for (const item of items) {
        const group = item.item_type === "verb" ? "Verbos"
            : item.item_type === "noun" ? "Sustantivos"
                : item.item_type === "adjective" ? "Adjetivos"
                    : item.item_type === "adverb" ? "Adverbios"
                        : item.item_type === "person" ? "Personas"
                            : item.item_type === "expression" ? "Expresiones"
                                : "Vocabulario";
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push([
            item.term,
            item.pronunciation || "",
            item.translation,
            item.example || "",
            item.example_translation || "",
            item.id
        ]);
    }

    return {
        id: `notion-page-${page.page_id}`,
        title: page.title,
        subtitle: "Vocabulario temporal desde Notion",
        icon: "📓",
        color: "bg-indigo-100",
        subcategories: [...groups.entries()].map(([title, groupItems]) => ({
            id: `notion-${title.toLowerCase()}-${page.page_id}`,
            title,
            color: "bg-indigo-100",
            items: groupItems
        }))
    };
}
