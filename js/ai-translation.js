import {
    AI_PROVIDER_STORAGE,
    GEMINI_KEY_STORAGE,
    GROQ_KEY_STORAGE
} from "./config.js"

const GROQ_MODELS = ["openai/gpt-oss-20b", "llama-3.3-70b-versatile"]
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"]

export async function recommendEnglishSentence(input) {
    const text = String(input || "").trim()
    if (!text) throw new Error("Escribe la idea o frase que quieres mejorar.")

    const keys = {
        groq: localStorage.getItem(GROQ_KEY_STORAGE) || "",
        gemini: localStorage.getItem(GEMINI_KEY_STORAGE) || ""
    }
    if (!keys.groq && !keys.gemini) {
        throw new Error("No hay una API key de IA configurada. Configúrala en la Guía Oxford y vuelve a intentarlo.")
    }

    const preferred = localStorage.getItem(AI_PROVIDER_STORAGE) || "auto"
    const providers = preferred === "groq"
        ? ["groq", "gemini"]
        : preferred === "gemini"
            ? ["gemini", "groq"]
            : ["groq", "gemini"]
    const failures = []

    for (const provider of providers) {
        const apiKey = keys[provider]
        if (!apiKey) continue
        try {
            const recommendation = provider === "groq"
                ? await recommendWithGroq(text, apiKey)
                : await recommendWithGemini(text, apiKey)
            if (recommendation) return recommendation
            failures.push(`${provider}: la respuesta estaba vacía o no tenía el formato esperado`)
        } catch (error) {
            if (error.invalidKey) {
                const keyName = provider === "groq" ? GROQ_KEY_STORAGE : GEMINI_KEY_STORAGE
                localStorage.removeItem(keyName)
                failures.push(`${provider}: API key inválida; se eliminó del almacenamiento`)
            } else {
                failures.push(`${provider}: ${error.message}`)
            }
        }
    }

    throw new Error(`No se pudo generar la recomendación. ${failures.join(". ")}`)
}

const RECOMMENDATION_INSTRUCTIONS = `El usuario puede escribir una idea o frase tentativa en español o inglés, incluso con errores gramaticales o de escritura. Interpreta la intención y devuelve una frase en inglés natural, correcta y cotidiana (nivel A2-B1), conservando lo que quiso decir. Después traduce TU frase inglesa recomendada a un español natural. No añadas detalles que el usuario no haya indicado. Devuelve únicamente un objeto JSON con estas dos propiedades de texto:
{"english":"frase recomendada en inglés","spanish":"traducción natural al español"}`

async function recommendWithGroq(input, apiKey) {
    for (const model of GROQ_MODELS) {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: "system", content: RECOMMENDATION_INSTRUCTIONS },
                    { role: "user", content: input }
                ],
                temperature: 0.2,
                max_tokens: 400,
                response_format: { type: "json_object" }
            })
        })
        if (response.status === 401) throw invalidKeyError()
        if (!response.ok) continue
        const data = await response.json()
        const recommendation = parseRecommendation(data.choices?.[0]?.message?.content)
        if (recommendation) return recommendation
    }
    throw new Error("Groq no respondió correctamente.")
}

async function recommendWithGemini(input, apiKey) {
    for (const model of GEMINI_MODELS) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `${RECOMMENDATION_INSTRUCTIONS}\n\nIdea o frase del usuario:\n${input}`
                    }]
                }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 400, responseMimeType: "application/json" }
            })
        })
        if (response.status === 400 || response.status === 403) {
            const details = await response.json().catch(() => ({}))
            if (/api key|invalid|unauthorized/i.test(details.error?.message || "")) throw invalidKeyError()
        }
        if (!response.ok) continue
        const data = await response.json()
        const recommendation = parseRecommendation(data.candidates?.[0]?.content?.parts?.map(part => part.text || "").join(""))
        if (recommendation) return recommendation
    }
    throw new Error("Gemini no respondió correctamente.")
}

function parseRecommendation(content) {
    if (!content) return null
    try {
        const cleaned = content.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim()
        const match = cleaned.match(/\{[\s\S]*\}/)
        if (!match) return null
        const result = JSON.parse(match[0])
        const english = typeof result.english === "string" ? result.english.trim() : ""
        const spanish = typeof result.spanish === "string" ? result.spanish.trim() : ""
        return english && spanish ? { english, spanish } : null
    } catch {
        return null
    }
}

function invalidKeyError() {
    const error = new Error("API key inválida.")
    error.invalidKey = true
    return error
}
