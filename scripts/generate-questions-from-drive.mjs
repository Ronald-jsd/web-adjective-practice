/* Genera el dataset de preguntas practice-ready desde el documento real que
 * compartió el usuario ("PREGUNTAS - DRIVE"). Solo extrae filas de tabla con
 * inglés y traducción verificadas en ese documento: no inventa ejemplos.
 *
 * Uso:
 *   node scripts/generate-questions-from-drive.mjs "ruta/al/PREGUNTAS - DRIVE....md"
 */

import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { fillMissingAnswers } from "./question-answers.mjs";

const sourcePath = process.argv[2];
if (!sourcePath) {
    console.error("Falta la ruta al Markdown de PREGUNTAS - DRIVE.");
    process.exit(1);
}

const HEADER_HINTS = [
    "estructura", "ejemplo", "traducción", "wh", "palabra", "significado",
    "tiempo", "oración", "tag", "modal", "uso", "situación", "respuesta",
    "frase", "tipo", "categoría", "preposición", "con WH", "cláusula"
];

const HOW_PHRASES = [
    "how much", "how many", "how long", "how often", "how far", "how old",
    "how fast", "how tall", "how high", "how deep", "how wide", "how big",
    "how well", "how quickly", "how soon", "how come"
];
const WHAT_PHRASES = [
    "what time", "what day", "what date", "what color", "what size",
    "what kind of", "what kind", "what type of", "what type", "what about",
    "what else", "what if", "what... for", "what for"
];
const OTHER_PHRASES = [
    "how about", "why don't", "would you mind", "do you mind if",
    "would you like", "let's", "supposing", "suppose", "used to",
    "been to", "gone to", "there is", "there are", "it is"
];

function clean(value) {
    return String(value || "")
        .replace(/\*\*/g, "")
        .replace(/`/g, "")
        .replace(/\*/g, "")
        .replace(/⚠️|✅|❌/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/* El documento da respuestas explícitas en muy pocos sitios: la sección
 * "**Respuesta:**" de cortesía y la columna "Significado real" de retóricas.
 * Solo se copia ese texto; nunca se inventa una respuesta modelo. */
function collectAnswerBanks(lines) {
    const banks = new Map();
    let section = "otro";
    let category = 0;
    let collecting = false;
    lines.forEach(line => {
        if (line.startsWith("# ")) {
            section = line.includes("INCROSTADAS") ? "incorporadas" : line.includes("ENCICLOPEDIA") ? "enciclopedia" : "otro";
            category = 0;
            collecting = false;
            return;
        }
        const match = line.match(/^## CATEGORÍA\s+(\d+):/i);
        if (match) {
            category = Number(match[1]);
            collecting = false;
            return;
        }
        if (/^\*\*Respuesta:?\*\*/i.test(line.trim())) {
            collecting = true;
            return;
        }
        if (!collecting) return;
        const answer = line.match(/^-\s+\*+([^*]+?)\*+/);
        if (answer && category) {
            const key = `${section}:${category}`;
            banks.set(key, [...(banks.get(key) || []), clean(answer[1])]);
        } else if (line.trim() && !line.startsWith("-")) {
            collecting = false;
        }
    });
    return banks;
}

function answerGuideFromCells(cells, carried) {
    const realIndex = carried.findIndex(cell => /significado real/i.test(cell));
    if (realIndex < 0) return "";
    const value = clean(cells[realIndex]);
    return value && value !== "—" ? value : "";
}

function contextFromCells(cells, englishIndex) {
    const situation = cells.find((cell, index) =>
        index !== englishIndex && /^[AB]:\s*\*/.test(cell)
    ) || "";
    return clean(situation).replace(/^[AB]:\s*/, "");
}

function isHeaderRow(cells) {
    const joined = cells.join(" ").toLowerCase();
    if (joined.includes("*") || joined.includes("?")) return false;
    return HEADER_HINTS.some(hint => joined.includes(hint.toLowerCase())) && cells.every(cell => cell.length < 32);
}

function looksSpanish(value) {
    if (!value) return false;
    if (/[¿¡áéíóúñü]/i.test(value)) return true;
    return /\b(no|sí|qué|como|donde|cuando|por|para|con|sin|muy|más|menos|hay|tengo|tienes|está|estan|eres|soy|fue|era|hace|quiero|necesito|sabe|sabes|algo|alguien|nunca|siempre|ahora|mañana|ayer|casa|trabajo|tiempo|personas|cosa|cosas|libro|agua|café|té|autobús|tren|estación|problemas?|respuesta|pregunta)\b/i.test(value);
}

function splitCells(line) {
    return line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map(cell => cell.trim());
}

function englishFromCells(cells) {
    const candidates = [];
    for (let index = 0; index < cells.length; index += 1) {
        const cell = cells[index];
        // Ejemplos reales: cursiva simple (*I wonder if...*) o negrita+cursiva
        // para los ecos (***Did you?***). El bold simple son etiquetas de columna.
        const raw = cell.replace(/^[AB]:\s*/, "");
        if (!/^\*[^*]/.test(raw) && !/^\*\*\*[^*]/.test(raw)) continue;
        const value = clean(raw);
        const words = value.split(" ").filter(Boolean);
        if (words.length < 2) continue;
        if (!cell.includes("?") && words.length < 3) continue;
        if (/^❌|^no\s/i.test(value)) continue;
        if (value.includes("do you know where does") || value.includes("what does she want")) continue;
        candidates.push({ index, value });
    }
    if (!candidates.length) return null;
    // En filas con pregunta directa + versión indirecta, la traducción suele
    // corresponder a la última (la incrustada), que es la que practicamos.
    return candidates.at(-1);
}

function spanishFromCells(cells, englishIndex) {
    const inlineArrow = cells[englishIndex]?.includes("→") ? cells[englishIndex].split("→")[1] : "";
    if (inlineArrow && looksSpanish(clean(inlineArrow))) return clean(inlineArrow);

    for (let index = cells.length - 1; index >= 0; index -= 1) {
        if (index === englishIndex) continue;
        const value = clean(cells[index]);
        if (!value || value === "—" || !looksSpanish(value)) continue;
        return value;
    }
    return "";
}

function detectQuestionWord(english) {
    const text = english.toLowerCase().replace(/[’']/g, "'");
    const phrases = [...HOW_PHRASES, ...WHAT_PHRASES, ...OTHER_PHRASES]
        .sort((a, b) => b.length - a.length);
    for (const phrase of phrases) {
        if (text.startsWith(phrase)) return phrase;
    }
    for (const word of ["whose", "which", "who", "what", "where", "when", "why", "how"]) {
        if (text.startsWith(word)) return word;
        const inside = text.match(new RegExp(`\\b${word}\\b`));
        if (inside) return word;
    }
    if (/^(am|is|are|was|were|do|does|did|have|has|had|will|can|could|may|might|must|should|would|shall|ought|won't|isn't|aren't|wasn't|weren't|don't|doesn't|didn't|haven't|hasn't|can't|couldn't|shouldn't|wouldn't)\b/.test(text)) {
        return "yes-no";
    }
    if (/\b(if|whether)\b/.test(text)) return "yes-no";
    if (text.includes(", right?") || text.includes(", correct?") || text.includes(", ok?") || text.includes(", yes?") || text.includes(", no?")) return "confirmation";
    if (/[, ](huh|eh)\?$/.test(text)) return "confirmation";
    return "other";
}

function detectTense(english, isEmbedded) {
    const text = english.toLowerCase().replace(/[’']/g, "'");
    const rules = [
        // Los tiempos perfectos continuos pueden ir invertidos: "Had you been
        // working...?", "Has it been raining?". El sujeto va entre el auxiliar
        // y "been", así que se acepta una palabra opcional en medio.
        ["futuro-perfecto-continuo", /\bwill\s+\w+\s+have\s+been\s+\w+ing\b/],
        ["pasado-perfecto-continuo", /\bhad\s+(?:\w+\s+)?been\s+\w+ing\b/],
        ["presente-perfecto-continuo", /\b(?:have|has)\s+(?:\w+\s+)?been\s+\w+ing\b/],
        ["futuro-continuo", /\bwill\s+\w+\s+be\s+\w+ing\b|\bwill\s+you\s+be\s+\w+ing\b/],
        ["futuro-perfecto", /\bwill\s+\w+\s+have\s+(finished|left|arrived|completed|been|read|traveled|done)\b|\bwill\s+there\s+have\s+been\b/],
        ["pasado-perfecto", /\bhad\s+\w+\s+(finished|left|seen|arrived|been|known|warned|done)\b|\bhad\s+there\s+been\b/],
        ["presente-perfecto", /\b(have|has)\s+\w+\s+(been|finished|arrived|eaten|seen|done|changed|invited|read|worked|lived|waited|studied|loved|known)\b|\b(have|has)\s+there\s+been\b|\b(have|has)\s+\w+\s+ever\b/],
        ["pasado-continuo", /\b(was|were)\s+(\w+\s+)?\w+ing\b/],
        ["presente-continuo", /\b(am|is|are)\s+(\w+\s+)?\w+ing\b/],
        ["going-to", /\b(am|is|are)\s+\w+\s+going\s+to\b/],
        ["modal-perfecto", /\b(can't|could|may|might|must|should|would|ought)\s+\w+\s+have\s+\w+/],
        ["modal-continuo", /\b(can|could|may|might|must|should|would)\s+\w+\s+be\s+\w+ing\b/],
        ["modal-pasivo", /\b(can|could|may|might|must|should|would)\s+\w+\s+be\s+(fixed|done|sent|told|known)\b/],
        ["modal", /\b(can|could|may|might|must|should|would|shall|ought to)\b|^ought\b/],
        ["used-to", /\bused\s+to\b|\buse\s+to\b|^used\b/],
        ["there-be", /\bthere\s+(is|are|was|were|will|has|have|had|can|could|should)\b|^(is|are|was|were|will|have|has|had|can|could|should)\s+there\b/],
        // "Is it true?" e "It is true?" van juntos, pero después de los
        // continuos/perfectos para no robarles "Has it been raining?".
        ["it-impersonal", /^(?:is|was|will|has)\s+it\b|\bit\s+(?:is|was|will|has)\b/i],
        ["pasado-simple", /\bdid\b|\bwas\b|\bwere\b|\bcame\b|\bwent\b|\bsaid\b|\bcalled\b|\bleft\b|\bbought\b|\bsaw\b|\btook\b|\bgave\b|\bfound\b|\bknew\b|\bbroke\b|\bwon\b|\blost\b|\bmade\b|\bhad\b/],
        ["futuro-simple", /\bwill\b/],
        ["be-presente", /^(am|is|are)\b|\b(is|are)\s+(it|this|that|he|she|you|they|your|the)\b/],
        ["be-pasado", /^(was|were)\b/],
        ["tag-presente", /\b(do|does|don't|doesn't|work|works|like|likes)\b.+\b(do|does|don't|doesn't)\s+(i|you|he|she|we|they)\?$/],
        ["tag-perfecto", /\b(have|has|haven't|hasn't)\b.+\b(have|has|haven't|hasn't)\s+(i|you|he|she|we|they)\?$/],
        ["negativa-pasado", /^(didn't|wasn't|weren't)\b/],
        ["negativa-presente", /^(don't|doesn't|isn't|aren't|can't|won't|shouldn't|wouldn't)\b/],
        ["presente-simple", /\b(do|does|want|live|work|like|need|know|love|speak|want|prefer|come|go|live|mean|cost|weigh|wear|start|arrive|open|help|dance|stay)\b/]
    ];
    for (const [tense, pattern] of rules) {
        if (pattern.test(text)) return tense;
    }
    return isEmbedded ? "indirecta" : "otro";
}

function detectType(categoryTitle, english, isEmbedded) {
    const title = categoryTitle.toLowerCase();
    const text = english.toLowerCase();
    if (isEmbedded) return "indirecta";
    if (title.includes("tag") || title.includes("confirmación")) return "tag";
    if (title.includes("negativ")) return "negativa";
    if (title.includes("elección")) return "eleccion";
    if (title.includes("eco")) return "eco";
    if (title.includes("retóric")) return "retorica";
    if (title.includes("indirect")) return "indirecta";
    if (title.includes("preposici")) return "preposicion";
    if (title.includes("sugerencia") || title.includes("cortesía") || title.includes("permiso") || title.includes("ofrecimiento") || title.includes("hipótesis")) return "cortesia";
    if (title.includes("confirmación") || title.includes("coincidencia")) return "confirmacion";
    if (title.includes("how") || title.includes("cuánt")) return "wh-combinacion";
    if (title.includes("wh-questions") || title.includes("información") || title.includes("who") || title.includes("what") || title.includes("where") || title.includes("when") || title.includes("why") || title.includes("whose") || title.includes("which")) return "wh";
    if (/\?$/.test(text) && !detectQuestionWord(english).startsWith("how") && detectQuestionWord(english) !== "yes-no") return "wh";
    return "yes-no";
}

/* La parte de enseñanza del documento (reglas, estructuras, notas y tablas
 * explicativas) se guarda aparte, tal cual aparece en el Markdown. */
function buildTeaching(lines, sourceFile) {
    const blocks = [];
    let current = null;
    let table = null;

    const flushTable = () => {
        if (table && current) current.tables.push(table);
        table = null;
    };
    const startBlock = (level, title) => {
        flushTable();
        current = {
            id: `teaching-${blocks.length + 1}`,
            level,
            title: clean(title),
            paragraphs: [],
            notes: [],
            tables: []
        };
        blocks.push(current);
    };

    lines.forEach(line => {
        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
            startBlock(heading[1].length, heading[2]);
            return;
        }
        if (/^#{4,}\s/.test(line)) return;
        if (line.trim().startsWith("|")) {
            const cells = splitCells(line);
            if (cells.every(cell => /^:?-{2,}:?$/.test(cell))) return;
            if (!current) startBlock(1, "PREGUNTAS - DRIVE");
            if (!table) table = { headers: cells.map(clean), rows: [] };
            else table.rows.push(cells.map(clean));
            return;
        }
        flushTable();
        const trimmed = line.trim();
        if (!trimmed || trimmed === "---") return;
        if (!current) startBlock(1, "PREGUNTAS - DRIVE");
        if (/^\*\*[^*]+\*\*[:：]?/.test(trimmed)) {
            const note = clean(trimmed);
            if (!current.notes.includes(note)) current.notes.push(note);
            return;
        }
        if (/^[-*>]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
            current.paragraphs.push(clean(trimmed.replace(/^(?:[-*>]|\d+\.)\s*/, "")));
            return;
        }
        current.paragraphs.push(clean(trimmed));
    });
    flushTable();

    const sections = blocks.filter(block =>
        block.paragraphs.length || block.notes.length || block.tables.length
    );
    return {
        meta: {
            source: "PREGUNTAS - DRIVE (documento compartido por el usuario)",
            sourceFile,
            generatedAt: new Date().toISOString().slice(0, 10),
            note: "Reglas, estructuras, notas y tablas copiadas del documento; sin contenido inventado.",
            total: sections.length
        },
        sections
    };
}

async function main(markdown) {
    const lines = markdown.split(/\r?\n/);
    const answerBanks = collectAnswerBanks(lines);
    let section = "";
    let categoryNumber = 0;
    let categoryTitle = "";
    let subsection = "";
    let carried = [];
    const seen = new Set();
    const questions = [];

    lines.forEach((line, lineIndex) => {
        if (line.startsWith("# ")) {
            section = line.includes("INCROSTADAS") ? "incorporadas" : line.includes("ENCICLOPEDIA") ? "enciclopedia" : "otro";
            categoryNumber = 0;
            categoryTitle = "";
            subsection = "";
            carried = [];
            return;
        }
        if (line.startsWith("## ")) {
            const match = line.match(/CATEGORÍA\s+(\d+):\s*(.+)/i);
            if (match) {
                categoryNumber = Number(match[1]);
                categoryTitle = clean(match[2]);
            }
            subsection = "";
            carried = [];
            return;
        }
        if (line.startsWith("### ")) {
            subsection = clean(line.replace(/^###\s+/, ""));
            carried = [];
            return;
        }
        if (!line.trim().startsWith("|")) {
            if (line.trim() === "") carried = [];
            return;
        }

        const cells = splitCells(line);
        if (cells.every(cell => /^:?-{2,}:?$/.test(cell))) return;
        if (isHeaderRow(cells)) {
            carried = cells;
            return;
        }

        const merged = cells.map((cell, index) => cell || carried[index] || "");
        const englishCell = englishFromCells(merged);
        if (!englishCell) return;
        const spanish = spanishFromCells(merged, englishCell.index);
        const sourceEnglish = clean(merged[englishCell.index].split("→")[0]).replace(/^[AB]:\s*/, "");
        const english = sourceEnglish.replace(/\s+/g, " ").trim();
        if (!spanish || !english || english.length < 8) return;
        if (!/[?.]/.test(english) && section !== "incorporadas") return;
        if (section === "otro") return;

        const key = `${english.toLowerCase()}|${spanish.toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);

        const relatedCell = merged.find((cell, index) =>
            index !== englishCell.index
            && cell.startsWith("*") && !cell.startsWith("**")
            && clean(cell).includes("?") && clean(cell) !== english
        );
        const isEmbedded = section === "incorporadas";
        const bankAnswer = answerBanks.get(`${section}:${categoryNumber}`) || [];
        questions.push({
            id: `q-${String(questions.length + 1).padStart(3, "0")}`,
            section,
            category: categoryNumber,
            categoryTitle,
            subsection,
            english,
            spanish,
            pattern: clean(carried[0] || "") || clean(carried[1] || "") || "",
            questionWord: detectQuestionWord(english),
            tense: detectTense(english, isEmbedded),
            type: detectType(categoryTitle, english, isEmbedded),
            related: relatedCell ? clean(relatedCell) : "",
            answerGuide: answerGuideFromCells(merged, carried) || bankAnswer.join(" / "),
            context: contextFromCells(merged, englishCell.index),
            sourceLine: lineIndex + 1
        });
    });

    const withAnswers = fillMissingAnswers(questions);
    const payload = {
        meta: {
            source: "PREGUNTAS - DRIVE (documento compartido por el usuario)",
            sourceFile: basename(sourcePath),
            generatedAt: new Date().toISOString().slice(0, 10),
            note: "Preguntas y traducciones extraídas del documento. Las respuestas marcadas como 'generada' son sugerencias locales, no texto del documento.",
            total: withAnswers.length
        },
        questions: withAnswers
    };

    const teaching = buildTeaching(lines, basename(sourcePath));

    const jsonPath = new URL("../data/questions-verified.json", import.meta.url);
    const modulePath = new URL("../data/questions-verified.module.js", import.meta.url);
    await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    await writeFile(
        modulePath,
        `/* Generado por scripts/generate-questions-from-drive.mjs. No editar a mano. */\nexport const QUESTIONS_VERIFIED = ${JSON.stringify(payload, null, 2)};\n`,
        "utf8"
    );

    const teachingJsonPath = new URL("../data/questions-teaching.json", import.meta.url);
    const teachingModulePath = new URL("../data/questions-teaching.module.js", import.meta.url);
    await writeFile(teachingJsonPath, `${JSON.stringify(teaching, null, 2)}\n`, "utf8");
    await writeFile(
        teachingModulePath,
        `/* Generado por scripts/generate-questions-from-drive.mjs. No editar a mano. */\nexport const QUESTIONS_TEACHING = ${JSON.stringify(teaching, null, 2)};\n`,
        "utf8"
    );

    const bySection = questions.reduce((counts, item) => {
        counts[item.section] = (counts[item.section] || 0) + 1;
        return counts;
    }, {});
    console.log(`Preguntas extraídas: ${questions.length}`, bySection);
}

readFile(sourcePath, "utf8")
    .then(main)
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
