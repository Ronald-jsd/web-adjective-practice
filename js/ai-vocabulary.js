import { GEMINI_KEY_STORAGE, GROQ_KEY_STORAGE, AI_PROVIDER_STORAGE } from "./config.js"
import {
    AI_MODEL_TIMEOUT_MS,
    AI_TOTAL_BUDGET_MS,
    GEMINI_TEXT_MODELS,
    GROQ_TEXT_MODELS,
    createAIRequestTimeout,
    parseAIJson
} from "./ai-models.js"

const MAX_TOKENS = 1200

const VOCABULARY_BASE_INSTRUCTIONS = `Eres un profesor bilingüe de inglés y español. El usuario escribirá una palabra o expresión, normalmente en español, y tú debes devolver su equivalente natural en inglés y completar una ficha de vocabulario.

Reglas:
- "word": la palabra o expresión en inglés. Si la entrada ya está en inglés, consérvala tal cual, incluidos los phrasal verbs.
- "pronunciation": pronunciación IPA entre barras, por ejemplo /ˈfɪɡər aʊt/.
- "spanish": traducción y significado breve en español, natural y cotidiano. Si hay varios matices, sepáralos con " · ".
- "example_en": una oración natural y cotidiana en inglés que use exactamente la palabra o expresión.
- "example_es": traducción natural de esa oración al español.`

const VOCABULARY_NOTES_RULES = `- "notes": los usos de la palabra en español, organizados en secciones. Usa este formato exacto, sin markdown:
Usos:
- ...
- ...
Cuándo usarla:
- ...
- ...
Errores comunes:
- ...
Incluye entre 1 y 3 secciones que aporten valor. Cada sección empieza por un título terminado en ":" y cada idea va en una línea aparte empezando por "- ". No uses tablas, negritas ni bloques de código.`

const VOCABULARY_JSON_WITH_NOTES = `Responde SOLO con JSON válido, sin markdown, con esta forma:
{"word":"...","pronunciation":"/.../","spanish":"...","example_en":"...","example_es":"...","notes":"Usos:\\n- ...\\n- ..."}`

const VOCABULARY_JSON_WITHOUT_NOTES = `No incluyas notas, usos ni la propiedad "notes".
Responde SOLO con JSON válido, sin markdown, con esta forma:
{"word":"...","pronunciation":"/.../","spanish":"...","example_en":"...","example_es":"..."}`

function buildVocabularyInstructions(includeNotes) {
    return includeNotes
        ? `${VOCABULARY_BASE_INSTRUCTIONS}\n${VOCABULARY_NOTES_RULES}\n\n${VOCABULARY_JSON_WITH_NOTES}`
        : `${VOCABULARY_BASE_INSTRUCTIONS}\n\n${VOCABULARY_JSON_WITHOUT_NOTES}`
}

function getKey(provider) {
    return localStorage.getItem(provider === "groq" ? GROQ_KEY_STORAGE : GEMINI_KEY_STORAGE) || ""
}

function providerOrder() {
    const preferred = localStorage.getItem(AI_PROVIDER_STORAGE) || "auto"
    const has = provider => !!getKey(provider)
    if (preferred === "groq" && has("groq")) return ["groq", "gemini"].filter(has)
    if (preferred === "gemini" && has("gemini")) return ["gemini", "groq"].filter(has)
    return ["groq", "gemini"].filter(has)
}

function normalizeEntry(result) {
    if (!result || typeof result !== "object" || Array.isArray(result)) return null
    const word = String(result.word || "").trim()
    const spanish = String(result.spanish || "").trim()
    const exampleEn = String(result.example_en || "").trim()
    const exampleEs = String(result.example_es || "").trim()
    if (!word || !spanish || !exampleEn || !exampleEs) return null
    return {
        word,
        pronunciation: String(result.pronunciation || "").trim(),
        spanish,
        example_en: exampleEn,
        example_es: exampleEs,
        notes: String(result.notes || "").trim()
    }
}

async function requestGroq(model, input, apiKey, timeoutMs = AI_MODEL_TIMEOUT_MS, instructions = buildVocabularyInstructions(true)) {
    const request = createAIRequestTimeout(timeoutMs)
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            signal: request.signal,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: "system", content: instructions },
                    { role: "user", content: `Palabra o expresión: "${input}"` }
                ],
                temperature: 0.4,
                max_tokens: MAX_TOKENS,
                response_format: { type: "json_object" }
            })
        })

        if (response.status === 401) {
            localStorage.removeItem(GROQ_KEY_STORAGE)
            throw new Error("La API key de Groq no es válida y fue eliminada. Configura una nueva.")
        }
        if (!response.ok) return null

        const data = await response.json()
        return normalizeEntry(parseAIJson(data.choices?.[0]?.message?.content))
    } catch (error) {
        if (request.timedOut) return null
        throw error
    } finally {
        request.clear()
    }
}

async function requestGemini(model, input, apiKey, timeoutMs = AI_MODEL_TIMEOUT_MS, instructions = buildVocabularyInstructions(true)) {
    const request = createAIRequestTimeout(timeoutMs)
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
            {
                method: "POST",
                signal: request.signal,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `${instructions}\n\nPalabra o expresión del usuario: "${input}"`
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.4,
                        maxOutputTokens: MAX_TOKENS,
                        responseMimeType: "application/json"
                    }
                })
            }
        )

        if (response.status === 400 || response.status === 403) {
            const details = await response.json().catch(() => ({}))
            if (/api key|invalid|unauthorized/i.test(details.error?.message || "")) {
                localStorage.removeItem(GEMINI_KEY_STORAGE)
                throw new Error("La API key de Gemini no es válida y fue eliminada. Configura una nueva.")
            }
        }
        if (!response.ok) return null

        const data = await response.json()
        const text = data.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("")
        return normalizeEntry(parseAIJson(text))
    } catch (error) {
        if (request.timedOut) return null
        throw error
    } finally {
        request.clear()
    }
}

export async function generateVocabularyEntry(term, { includeNotes = true } = {}) {
    const input = String(term || "").trim()
    if (!input) throw new Error("Escribe primero una palabra o expresión.")

    const instructions = buildVocabularyInstructions(includeNotes)

    const providers = providerOrder()
    if (!providers.length) {
        throw new Error("Configura una API key de Groq o Gemini en la Guía Oxford para usar la IA.")
    }

    const failures = []
    const deadline = Date.now() + AI_TOTAL_BUDGET_MS
    for (const provider of providers) {
        const apiKey = getKey(provider)
        const models = provider === "groq" ? GROQ_TEXT_MODELS : GEMINI_TEXT_MODELS
        for (const model of models) {
            const remaining = deadline - Date.now()
            if (remaining <= 0) break
            const entry = provider === "groq"
                ? await requestGroq(model, input, apiKey, Math.min(AI_MODEL_TIMEOUT_MS, remaining), instructions)
                : await requestGemini(model, input, apiKey, Math.min(AI_MODEL_TIMEOUT_MS, remaining), instructions)
            if (entry) {
                return {
                    ...entry,
                    notes: includeNotes ? entry.notes : "",
                    provider,
                    modelUsed: `${provider === "groq" ? "Groq" : "Gemini"}: ${model}`
                }
            }
            failures.push(`${provider}/${model}`)
        }
        if (Date.now() >= deadline) break
    }

    throw new Error(
        "La IA no respondió a tiempo o no devolvió una ficha válida con ningún modelo. " +
        "Inténtalo de nuevo en unos segundos o cambia de proveedor en la Guía Oxford. " +
        `(modelos probados: ${failures.join(", ") || "ninguno"})`
    )
}
