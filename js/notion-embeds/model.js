const NOTION_DOMAINS = ["notion.so", "notion.com", "notion.site"]
const MAX_URL_LENGTH = 2048
const MAX_TITLE_LENGTH = 120

function normalizeHostname(hostname) {
    return String(hostname || "").trim().toLowerCase().replace(/^www\./, "")
}

export function isNotionHostname(hostname) {
    const host = normalizeHostname(hostname)
    return NOTION_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`))
}

export function normalizeNotionUrl(input) {
    const raw = String(input || "").trim()
    if (!raw) return { url: "", error: "Pega primero un enlace de Notion." }
    if (raw.length > MAX_URL_LENGTH) return { url: "", error: "El enlace es demasiado largo." }

    let url
    try {
        url = new URL(raw)
    } catch (error) {
        return { url: "", error: "El enlace no es válido. Pégalo completo, por ejemplo: https://tu-area.notion.site/pagina" }
    }

    if (url.protocol !== "https:") {
        return { url: "", error: "Solo se pueden incrustar enlaces HTTPS de Notion." }
    }
    if (!isNotionHostname(url.hostname)) {
        return { url: "", error: "Por ahora solo se permiten enlaces de Notion (*.notion.so, *.notion.com o *.notion.site)." }
    }

    url.hash = ""
    return { url: url.href, error: "" }
}

export function titleFromNotionUrl(url) {
    try {
        const parsed = new URL(url)
        const host = normalizeHostname(parsed.hostname)
        const lastSegment = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "")
        const withoutId = lastSegment
            .replace(/[-_][0-9a-f]{32}(?:-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/i, "")
            .replace(/[-_]+/g, " ")
            .replace(/\s+/g, " ")
            .trim()
        return withoutId || host
    } catch (error) {
        return "Página de Notion"
    }
}

export function normalizeTitle(title, fallbackUrl) {
    const clean = String(title || "").trim().replace(/\s+/g, " ").slice(0, MAX_TITLE_LENGTH)
    if (clean) return clean
    return (titleFromNotionUrl(fallbackUrl) || "Página de Notion").slice(0, MAX_TITLE_LENGTH)
}
