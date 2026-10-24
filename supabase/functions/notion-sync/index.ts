import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
    extractNotionVocabulary,
    toNotionPracticeCategory
} from "../_shared/notion-parser.js";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceRoleKey);
const notionVersion = "2022-06-28";
const notionRequestIntervalMs = 350;
const maxBlocksPerPage = 12000;
let lastNotionRequestAt = 0;
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

async function authenticate(request: Request) {
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const client = createClient(supabaseUrl, anonKey);
    const { data, error } = await client.auth.getUser(token);
    return error ? null : data.user;
}

async function getConnection(userId: string) {
    const { data, error } = await admin
        .from("notion_connections")
        .select("access_token")
        .eq("user_id", userId)
        .maybeSingle();
    if (error) throw error;
    if (!data?.access_token) throw new Error("Conecta tu cuenta de Notion primero.");
    return data.access_token as string;
}

class NotionApiError extends Error {
    status: number;
    retryAfter: string | null;

    constructor(message: string, status: number, retryAfter: string | null) {
        super(message);
        this.status = status;
        this.retryAfter = retryAfter;
    }
}

function getRetryDelayMs(error: NotionApiError, attempt: number) {
    if (error.retryAfter) {
        const seconds = Number(error.retryAfter);
        if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
        const retryAt = Date.parse(error.retryAfter);
        if (Number.isFinite(retryAt)) return Math.max(0, retryAt - Date.now());
    }
    return 1000 * 2 ** attempt;
}

async function notionRequestOnce(token: string, path: string, init: RequestInit = {}) {
    const response = await fetch(`https://api.notion.com/v1/${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            "Notion-Version": notionVersion,
            "Content-Type": "application/json",
            ...init.headers,
        },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = typeof data.message === "string" ? data.message : `Notion respondió ${response.status}.`;
        throw new NotionApiError(message, response.status, response.headers.get("Retry-After"));
    }
    return data;
}

async function notionRequest(token: string, path: string, init: RequestInit = {}) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const waitForRateLimit = Math.max(0, lastNotionRequestAt + notionRequestIntervalMs - Date.now());
        if (waitForRateLimit) await new Promise(resolve => setTimeout(resolve, waitForRateLimit));
        lastNotionRequestAt = Date.now();

        try {
            return await notionRequestOnce(token, path, init);
        } catch (error) {
            if (!(error instanceof NotionApiError) || error.status !== 429 || attempt === 4) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, getRetryDelayMs(error, attempt)));
        }
    }
    throw new Error("Notion sigue limitando las solicitudes. Espera un minuto y vuelve a cargar menos páginas.");
}

function pageTitle(page: any) {
    const properties = Object.values(page.properties || {}) as any[];
    const titleProperty = properties.find(property => property.type === "title");
    const title = titleProperty?.title || page.title || [];
    return title.map((part: any) => part.plain_text || part.text?.content || "").join("").trim()
        || "Página de Notion";
}

async function listPages(token: string) {
    const pages: any[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page += 1) {
        const result = await notionRequest(token, "search", {
            method: "POST",
            body: JSON.stringify({
                page_size: 100,
                ...(cursor ? { start_cursor: cursor } : {}),
                filter: { property: "object", value: "page" },
                sort: { direction: "ascending", timestamp: "last_edited_time" },
            }),
        });
        pages.push(...(result.results || []).map((item: any) => ({
            page_id: item.id,
            title: pageTitle(item),
            parent_page_id: item.parent?.type === "page_id" ? item.parent.page_id : null,
            parent_type: item.parent?.type || null,
        })));
        if (!result.has_more || !result.next_cursor) break;
        cursor = result.next_cursor;
    }
    return pages;
}

async function getPage(token: string, pageId: string) {
    const page = await notionRequest(token, `pages/${encodeURIComponent(pageId)}`);
    return {
        page_id: page.id,
        title: pageTitle(page),
        parent_page_id: page.parent?.type === "page_id" ? page.parent.page_id : null,
        parent_type: page.parent?.type || null,
    };
}

async function getPageBlocks(token: string, pageId: string) {
    let visitedBlocks = 0;

    function compactBlock(block: any) {
        const payload = block?.[block?.type] || {};
        const compactPayload: Record<string, unknown> = {};
        for (const key of ["rich_text", "title", "headers"]) {
            if (Array.isArray(payload[key])) {
                compactPayload[key] = payload[key].map((part: any) => ({
                    plain_text: part?.plain_text || part?.text?.content || ""
                }));
            }
        }
        if (Array.isArray(payload.cells)) {
            compactPayload.cells = payload.cells.map((cell: any[]) =>
                (cell || []).map((part: any) => ({
                    plain_text: part?.plain_text || part?.text?.content || ""
                }))
            );
        }
        return {
            id: block.id,
            type: block.type,
            has_children: Boolean(block.has_children),
            ...(Object.keys(compactPayload).length ? { [block.type]: compactPayload } : {})
        };
    }

    async function children(blockId: string, depth: number): Promise<any[]> {
        if (depth > 8) return [];
        const resultBlocks: any[] = [];
        let cursor: string | undefined;
        do {
            const path = `blocks/${encodeURIComponent(blockId)}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`;
            const result = await notionRequest(token, path);
            for (const block of result.results || []) {
                visitedBlocks += 1;
                if (visitedBlocks > maxBlocksPerPage) {
                    throw new Error(`La página supera el límite de ${maxBlocksPerPage} bloques para una carga temporal. Prueba con una página más pequeña.`);
                }
                const compact = compactBlock(block);
                const isPageReference = block.type === "child_page"
                    || block.type === "child_database";
                if (block.has_children && !isPageReference) {
                    compact.children = await children(block.id, depth + 1);
                }
                resultBlocks.push(compact);
            }
            cursor = result.has_more ? result.next_cursor : undefined;
        } while (cursor);
        return resultBlocks;
    }

    return children(pageId, 0);
}

Deno.serve(async request => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (request.method !== "POST") return jsonResponse({ error: "Método no permitido." }, 405);

    try {
        const user = await authenticate(request);
        if (!user) return jsonResponse({ error: "Inicia sesión para cargar vocabulario de Notion." }, 401);
        const body = await request.json();
        const token = await getConnection(user.id);

        if (body.action === "pages") {
            return jsonResponse({ pages: await listPages(token) });
        }

        if (body.action === "vocabulary") {
            const requested = Array.isArray(body.pageIds)
                ? [...new Set(body.pageIds.filter((id: unknown) => typeof id === "string"))]
                : [];
            if (!requested.length) return jsonResponse({ error: "Selecciona al menos una página." }, 400);
            if (requested.length > 1) return jsonResponse({ error: "Carga una página por operación." }, 400);

            const categories = [];
            let totalItems = 0;
            for (const pageId of requested) {
                const page = await getPage(token, pageId);
                const blocks = await getPageBlocks(token, pageId);
                const items = extractNotionVocabulary(blocks, page.title);
                totalItems += items.length;
                if (totalItems > 2000) {
                    throw new Error("La selección contiene más de 2.000 tarjetas. Elige menos páginas para cargarlas temporalmente.");
                }
                const category = toNotionPracticeCategory(
                    page,
                    items.map((item, index) => ({
                        ...item,
                        id: `${pageId}:${item.source_block_id}:${item.item_type}:${index}`
                    }))
                );
                if (category.subcategories.some(subcategory => subcategory.items.length)) {
                    categories.push(category);
                }
            }
            return jsonResponse({ categories, totalItems });
        }

        return jsonResponse({ error: "Acción de Notion desconocida." }, 400);
    } catch (error) {
        console.error("Notion sync error:", error);
        const status = error instanceof NotionApiError
            ? error.status === 429 ? 429 : 502
            : 500;
        return jsonResponse({ error: error instanceof Error ? error.message : "Error al cargar vocabulario de Notion." }, status);
    }
});
