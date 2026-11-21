/* IA opcional para ampliar el banco de preguntas. Nunca toca Supabase:
 * los ejemplos aceptados se guardan solo en localStorage y se pueden borrar. */

import {
    AI_PROVIDER_STORAGE,
    GEMINI_KEY_STORAGE,
    GROQ_KEY_STORAGE
} from "../config.js";
import {
    AI_MODEL_TIMEOUT_MS,
    AI_TOTAL_BUDGET_MS,
    GEMINI_TEXT_MODELS,
    GROQ_TEXT_MODELS,
    createAIRequestTimeout,
    parseAIJson
} from "../ai-models.js";
import { beginAIRequest } from "../ui-status.js";
import { AI_QUESTIONS_STORAGE_KEY, loadAIQuestions, saveAIQuestions, withAIQuestions } from "./model.js";

function readAIKeys() {
    return {
        groq: localStorage.getItem(GROQ_KEY_STORAGE) || "",
        gemini: localStorage.getItem(GEMINI_KEY_STORAGE) || ""
    };
}

function providerOrder() {
    const preferred = localStorage.getItem(AI_PROVIDER_STORAGE) || "auto";
    return preferred === "gemini" ? ["gemini", "groq"] : ["groq", "gemini"];
}

function invalidKeyError() {
    const error = new Error("API key inválida.");
    error.invalidKey = true;
    return error;
}

const QUESTION_INSTRUCTIONS = `Eres un profesor de inglés para hispanohablantes. Genera preguntas interrogativas gramaticales, NO texto de lectura ni preguntas de comprensión. Devuelve únicamente un objeto JSON válido con esta forma exacta:
{"questions":[{"english":"...","spanish":"...","pattern":"...","tense":"...","questionWord":"...","type":"...","answerGuide":"..."}]}

Reglas:
- "english": una pregunta en inglés natural y correcta, con signo ? al final.
- "spanish": traducción natural al español de esa pregunta.
- "pattern": estructura gramatical en inglés, por ejemplo "Wh + auxiliary + subject + verb?".
- "tense": uno de: presente-simple, pasado-simple, futuro-simple, going-to, presente-continuo, pasado-continuo, futuro-continuo, presente-perfecto, pasado-perfecto, futuro-perfecto, presente-perfecto-continuo, pasado-perfecto-continuo, futuro-perfecto-continuo, be-presente, be-pasado, it-impersonal, there-be, modal, modal-perfecto, modal-continuo, modal-pasivo, used-to, indirecta, otro.
- "questionWord": la palabra o frase interrogativa en minúsculas (what, who, where, when, why, how, how much, how many, how long, how often, yes-no, ...).
- "type": uno de: wh, wh-combinacion, yes-no, indirecta, tag, negativa, eleccion, preposicion, eco, retorica, cortesia, confirmacion.
- "answerGuide": una respuesta modelo breve y natural en inglés, sin inventar datos personales del usuario.
- No repitas preguntas de la lista que te doy. No uses markdown. Máximo 6 preguntas.`;

function parseQuestionBatch(content) {
    const parsed = parseAIJson(content);
    const items = Array.isArray(parsed?.questions) ? parsed.questions : Array.isArray(parsed) ? parsed : [];
    return items.filter(item => item && typeof item.english === "string" && typeof item.spanish === "string")
        .map(item => ({
            english: item.english.trim().replace(/\s+/g, " "),
            spanish: item.spanish.trim().replace(/\s+/g, " "),
            pattern: String(item.pattern || "").trim(),
            tense: String(item.tense || "otro").trim(),
            questionWord: String(item.questionWord || "other").trim().toLowerCase(),
            type: String(item.type || "wh").trim(),
            answerGuide: String(item.answerGuide || "").trim()
        }))
        .filter(item => item.english.endsWith("?") && item.english.length <= 180
            && item.spanish && item.spanish.length <= 220);
}

async function requestGroq({ input, apiKey, deadline }) {
    for (const model of GROQ_TEXT_MODELS) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        const request = createAIRequestTimeout(Math.min(AI_MODEL_TIMEOUT_MS, remaining));
        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                signal: request.signal,
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: "system", content: QUESTION_INSTRUCTIONS },
                        { role: "user", content: input }
                    ],
                    temperature: 0.4,
                    max_tokens: 1600,
                    response_format: { type: "json_object" }
                })
            });
            if (response.status === 401) throw invalidKeyError();
            if (!response.ok) continue;
            const data = await response.json();
            const parsed = parseQuestionBatch(data.choices?.[0]?.message?.content);
            if (parsed.length) return parsed;
        } catch (error) {
            if (!request.timedOut) throw error;
        } finally {
            request.clear();
        }
    }
    throw new Error("Groq no devolvió preguntas válidas.");
}

async function requestGemini({ input, apiKey, deadline }) {
    for (const model of GEMINI_TEXT_MODELS) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        const request = createAIRequestTimeout(Math.min(AI_MODEL_TIMEOUT_MS, remaining));
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
                method: "POST",
                signal: request.signal,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `${QUESTION_INSTRUCTIONS}\n\nFiltros pedidos por el usuario:\n${input}` }] }],
                    generationConfig: { temperature: 0.4, maxOutputTokens: 1800, responseMimeType: "application/json" }
                })
            });
            if (response.status === 400 || response.status === 403) {
                const details = await response.json().catch(() => ({}));
                if (/api key|invalid|unauthorized/i.test(details.error?.message || "")) throw invalidKeyError();
            }
            if (!response.ok) continue;
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("") || "";
            const parsed = parseQuestionBatch(text);
            if (parsed.length) return parsed;
        } catch (error) {
            if (!request.timedOut) throw error;
        } finally {
            request.clear();
        }
    }
    throw new Error("Gemini no devolvió preguntas válidas.");
}

export async function generateAIQuestions(filters = {}) {
    const keys = readAIKeys();
    if (!keys.groq && !keys.gemini) {
        throw new Error("Configura una API key de Groq o Gemini con «🤖 Configurar IA» para usar esta opción.");
    }
    const input = [
        `Tiempo verbal: ${filters.tense && filters.tense !== "all" ? filters.tense : "cualquiera"}`,
        `Palabra interrogativa: ${filters.word && filters.word !== "all" ? filters.word : "cualquiera"}`,
        `Tipo: ${filters.type && filters.type !== "all" ? filters.type : "cualquiera"}`,
        `Bloque: ${filters.section === "incorporadas" ? "preguntas dentro de oraciones" : filters.section === "enciclopedia" ? "preguntas directas" : "cualquiera"}`,
        "Evita estas preguntas ya existentes:",
        ...(filters.examples || []).slice(0, 12).map(example => `- ${example}`)
    ].join("\n");

    const status = beginAIRequest("Solicitando a la IA… preparando más preguntas.");
    const failures = [];
    const deadline = Date.now() + AI_TOTAL_BUDGET_MS;
    try {
        for (const provider of providerOrder()) {
            if (Date.now() >= deadline) break;
            const apiKey = keys[provider];
            if (!apiKey) continue;
            status.update(`Solicitando a la IA… consultando ${provider === "groq" ? "Groq" : "Gemini"}.`);
            try {
                return provider === "groq"
                    ? await requestGroq({ input, apiKey, deadline })
                    : await requestGemini({ input, apiKey, deadline });
            } catch (error) {
                if (error.invalidKey) {
                    localStorage.removeItem(provider === "groq" ? GROQ_KEY_STORAGE : GEMINI_KEY_STORAGE);
                    failures.push(`${provider}: clave inválida (se eliminó)`);
                } else {
                    failures.push(`${provider}: ${error.message}`);
                }
            }
        }
    } finally {
        status.end();
    }
    throw new Error(`No se pudieron generar preguntas. ${failures.join(". ")}`);
}

export function addGeneratedQuestions(generated, { storage = localStorage, existing = [] } = {}) {
    const known = new Set(withAIQuestions(existing, loadAIQuestions(storage)).map(item => item.english.toLowerCase()));
    const accepted = [];
    generated.forEach((item, index) => {
        const english = String(item.english || "").trim();
        if (!english || known.has(english.toLowerCase())) return;
        known.add(english.toLowerCase());
        accepted.push({
            ...item,
            id: `ai-${Date.now()}-${index}-${accepted.length}`,
            answerGuide: item.answerGuide || ""
        });
    });
    if (accepted.length) saveAIQuestions([...loadAIQuestions(storage), ...accepted], storage);
    return accepted;
}

export function clearGeneratedQuestions(storage = localStorage) {
    storage.removeItem(AI_QUESTIONS_STORAGE_KEY);
}
