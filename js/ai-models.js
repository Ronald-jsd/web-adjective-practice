export const GROQ_TEXT_MODELS = [
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "qwen/qwen3.8-27b"
];

export const GEMINI_TEXT_MODELS = [
  "gemini-3.8-flash", // Opción principal: El más reciente, rápido y optimizado para agentes
    "gemini-3.6-flash", // Tu modelo actual (Sigue siendo excelente pero sufre picos de demanda)
    "gemini-3.5-flash", // Versión 3.5 estable
    "gemini-3.1-pro-preview" // Línea PRO: Flagship de alta inteligencia, ideal si los ligeros fallan
];

export function parseAIJson(content) {
    if (typeof content !== "string" || !content.trim()) return null;
    const cleaned = content
        .replace(/```(?:json)?\s*/gi, "")
        .replace(/```/g, "")
        .trim();
    const candidate = cleaned.startsWith("{")
        ? cleaned
        : cleaned.match(/\{[\s\S]*\}/)?.[0];
    if (!candidate) return null;

    try {
        return JSON.parse(candidate);
    } catch {
        return null;
    }
}
