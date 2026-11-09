const NOTION_SITE_DOMAIN = "notion.site"
const MAX_URL_LENGTH = 2048
const MAX_TITLE_LENGTH = 120

function normalizeHostname(hostname) {
    return String(hostname || "").trim().toLowerCase().replace(/^www\./, "")
}

export function isNotionEmbedHostname(hostname) {
    const host = normalizeHostname(hostname)
    // El subdominio de la web pública es el que expone la ruta
    // /ebd//<id>, que Notion sí permite incrustar en iframes.
    return new RegExp(`^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\\.${NOTION_SITE_DOMAIN}$`).test(host)
}

function allIds(value) {
    const matches = String(value || "").match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32}/gi) || []
    return matches.map(id => id.replace(/-/g, "").toLowerCase())
}

/* A Notion page id is usually the final 32 hex characters of the slug.
 * There may be a UUID in the query string, so prefer the last valid id. */
export function notionPageIdFromUrl(input) {
    try {
        const url = new URL(String(input || "").trim())
        const ids = allIds(`${url.pathname}/${url.search}`)
        return ids.at(-1) || ""
    } catch (error) {
        return ""
    }
}

/* Los enlaces copy_link comunes (notion.so, app.notion.com) bloquean el
 * iframe. El endpoint /ebd//<id> del dominio .notion.site es el canal
 * oficial para incrustar contenido de Notion. */
export function notionEmbedUrlFromUrl(input) {
    try {
        const raw = String(input || "").trim()
        const url = new URL(raw)
        const id = notionPageIdFromUrl(raw)
        if (!isNotionEmbedHostname(url.hostname) || !id) return ""
        return `${url.origin}/ebd//${id}`
    } catch (error) {
        return ""
    }
}

export function normalizeNotionUrl(input) {
    const raw = String(input || "").trim()
    if (!raw) return { url: "", error: "Pega primero un enlace público de Notion." }
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

    if (!isNotionEmbedHostname(url.hostname)) {
        return {
            url: "",
            error: "Para incrustarla, usa el enlace público que termina en .notion.site (Compartir → «Publish to web» → Copiar enlace). Los enlaces de app.notion.com y notion.so/notion.com no permiten iframes."
        }
    }

    if (!notionPageIdFromUrl(raw)) {
        return { url: "", error: "No se encontró el identificador de la página de Notion en el enlace." }
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
