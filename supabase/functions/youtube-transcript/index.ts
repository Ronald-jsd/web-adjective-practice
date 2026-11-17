import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROVIDERS = ["supadata", "transcriptfetch"] as const;
type Provider = (typeof PROVIDERS)[number];
type Segment = { start: number; duration: number; text: string };
type ProviderResult = { segments: Segment[]; language: string; title: string };

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

/* Caché compartida de transcripciones. Guarda solo subtítulos públicos y
 * evita gastar créditos del proveedor cuando el video se repite. */
function adminClient() {
    if (!serviceKey) return null;
    return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
}

async function readTranscriptCache(videoId: string) {
    const client = adminClient();
    if (!client) return null;
    try {
        const { data, error } = await client
            .from("youtube_transcript_cache")
            .select("title,language,source,segments,updated_at")
            .eq("video_id", videoId)
            .maybeSingle();
        if (error || !data) return null;
        if (!Array.isArray(data.segments) || !data.segments.length) return null;
        return data as { title: string; language: string; source: string; segments: Segment[] };
    } catch (error) {
        console.warn("transcript cache read failed", error);
        return null;
    }
}

async function writeTranscriptCache(videoId: string, payload: { title: string; language: string; source: string; segments: Segment[] }) {
    const client = adminClient();
    if (!client || !payload.segments.length) return;
    try {
        await client.from("youtube_transcript_cache").upsert({
            video_id: videoId,
            title: payload.title || "",
            language: payload.language || "en",
            source: payload.source || "youtube",
            segments: payload.segments,
            updated_at: new Date().toISOString(),
        }, { onConflict: "video_id" });
    } catch (error) {
        console.warn("transcript cache write failed", error);
    }
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const TRACK = /(?:ytInitialPlayerResponse["']?\s*[:=]\s*|window\s*\[\s*["']ytInitialPlayerResponse["']\s*\]\s*=\s*)/;
const BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
};

function extractJsonObject(source: string, marker: RegExp): Record<string, unknown> | null {
    const match = marker.exec(source);
    if (!match) return null;
    let start = source.indexOf("{", match.index + match[0].length - 1);
    if (start < 0) return null;
    let depth = 0;
    let quote = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === "\\") escaped = true;
            else if (char === "\"") quote = false;
            continue;
        }
        if (char === "\"") quote = true;
        else if (char === "{") depth += 1;
        else if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                try {
                    return JSON.parse(source.slice(start, index + 1));
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
}

type CaptionTrack = { baseUrl?: string; languageCode?: string; kind?: string };

function captionsFromHtml(html: string): CaptionTrack[] {
    const response = extractJsonObject(html, TRACK);
    const tracks = (response?.captions as { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } } | undefined)
        ?.playerCaptionsTracklistRenderer?.captionTracks;
    return Array.isArray(tracks) ? tracks : [];
}

function searchJson3(value: unknown): Array<{ tStartMs: number; dDurationMs: number; segs?: Array<{ utf8: string }> }> {
    if (!value || typeof value !== "object") return [];
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.events)) return record.events as Array<{ tStartMs: number; dDurationMs: number; segs?: Array<{ utf8: string }> }>;
    for (const child of Object.values(record)) {
        const found = searchJson3(child);
        if (found.length) return found;
    }
    return [];
}

function parseJson3(text: string) {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        parsed = JSON.parse(text.replace(/^\)\]\}'\s*/, ""));
    }
    return searchJson3(parsed)
        .filter(event => Array.isArray(event.segs))
        .map(event => ({
            start: Number(event.tStartMs || 0) / 1000,
            duration: Math.max(0.3, Number(event.dDurationMs || 1000) / 1000),
            text: (event.segs || []).map(seg => String(seg.utf8 || "")).join("").replace(/\s+/g, " ").trim()
        }))
        .filter(segment => segment.text)
}

function pickTrack(tracks: CaptionTrack[]) {
    const english = tracks.find(track => /^en([-_]|$)/i.test(String(track.languageCode || "")) && track.kind !== "asr");
    return english || tracks.find(track => /^en([-_]|$)/i.test(String(track.languageCode || ""))) || tracks[0];
}

function titleFromHtml(html: string) {
    const match = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    return match?.[1]?.trim() || "";
}

async function titleFor(videoId: string) {
    try {
        const response = await fetch(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
            { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(4000) }
        );
        if (!response.ok) return "";
        const body = await response.json() as { title?: string };
        return String(body?.title || "").trim();
    } catch {
        return "";
    }
}

function normalizeProvider(value: unknown): Provider | null {
    const id = String(value || "").trim().toLowerCase();
    return (PROVIDERS as readonly string[]).includes(id) ? id as Provider : null;
}

class ProviderFailure extends Error {
    code: string;
    constructor(code: string, message: string) {
        super(message);
        this.code = code;
    }
}

function failureFromStatus(status: number, message: string): ProviderFailure {
    if (status === 401 || status === 403) {
        return new ProviderFailure("invalid_key", "La API key de transcripción no es válida.");
    }
    if (status === 402 || status === 429) {
        return new ProviderFailure("quota", "Se agotó el cupo gratuito del proveedor de transcripción.");
    }
    if (status === 404) {
        return new ProviderFailure("no_transcript", "El proveedor no encontró subtítulos para este video.");
    }
    return new ProviderFailure("provider_error", message || "El proveedor de transcripción no respondió.");
}

function safeJson(text: string): Record<string, unknown> | null {
    try {
        return JSON.parse(text) as Record<string, unknown>;
    } catch {
        return null;
    }
}

/* El transporte MCP puede contestar JSON o SSE; aceptamos ambos. */
function parseMcpBody(text: string): Record<string, unknown> | null {
    const direct = safeJson(text);
    if (direct) return direct;
    const dataLine = text
        .split(/\r?\n/)
        .filter(line => line.startsWith("data:"))
        .map(line => line.slice(5).trim())
        .filter(Boolean)
        .pop();
    return dataLine ? safeJson(dataLine) : null;
}

function cleanCues(items: Array<Record<string, unknown>>, scale: number): Segment[] {
    return items.map(item => {
        const start = Number(item.start ?? item.offset ?? 0) * scale;
        const duration = Number(item.duration ?? 0) * scale;
        return {
            start: Number.isFinite(start) ? Math.max(0, start) : 0,
            duration: Number.isFinite(duration) && duration > 0 ? duration : 1,
            text: String(item.text ?? "").replace(/\s+/g, " ").trim(),
        };
    }).filter(segment => segment.text);
}

async function supadataTranscript(videoId: string, apiKey: string): Promise<ProviderResult> {
    const url = `https://api.supadata.ai/v1/youtube/transcript?videoId=${encodeURIComponent(videoId)}&text=false`;
    const response = await fetch(url, {
        headers: { "x-api-key": apiKey, "Accept": "application/json" },
        signal: AbortSignal.timeout(25000),
    });
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
        const message = String((body as { message?: string })?.message || (body as { error?: string })?.error || `HTTP ${response.status}`);
        throw failureFromStatus(response.status, message);
    }
    const content = body?.content;
    const segments = Array.isArray(content) ? cleanCues(content as Array<Record<string, unknown>>, 1 / 1000) : [];
    return {
        segments,
        language: String(body?.lang || "en"),
        title: String(body?.title || ""),
    };
}

async function transcriptFetchTranscript(videoId: string, apiKey: string): Promise<ProviderResult> {
    const response = await fetch("https://transcriptfetch.com/mcp", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "accept": "application/json, text/event-stream",
            "authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "get_transcript", arguments: { video: videoId, timestamps: true } },
        }),
        signal: AbortSignal.timeout(30000),
    });
    const text = await response.text();
    if (!response.ok) throw failureFromStatus(response.status, `HTTP ${response.status}`);
    const payload = parseMcpBody(text);
    if (!payload) throw new ProviderFailure("provider_error", "El proveedor devolvió una respuesta ilegible.");
    if (payload.error) throw new ProviderFailure("provider_error", "El proveedor rechazó la solicitud.");
    const result = payload.result as {
        structuredContent?: { segments?: Array<Record<string, unknown>>; text?: string; language?: string; title?: string };
        isError?: boolean;
    } | undefined;
    if (result?.isError) {
        throw new ProviderFailure("no_transcript", "El proveedor no encontró subtítulos para este video.");
    }
    const structured = result?.structuredContent;
    const segments = Array.isArray(structured?.segments) ? cleanCues(structured.segments, 1) : [];
    return {
        segments,
        language: String(structured?.language || "en"),
        title: String(structured?.title || ""),
    };
}

async function youtubeTranscript(videoId: string) {
    const watch = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
        redirect: "follow",
        headers: BROWSER_HEADERS,
    });
    const watchHtml = await watch.text();
    const tracks = captionsFromHtml(watchHtml);
    const track = tracks.length ? pickTrack(tracks) : null;
    if (!track?.baseUrl) return null;
    const captionUrl = `${track.baseUrl}${track.baseUrl.includes("?") ? "&" : "?"}fmt=json3`;
    const captionResponse = await fetch(captionUrl, { headers: BROWSER_HEADERS });
    const segments = parseJson3(await captionResponse.text());
    if (!segments.length) return null;
    return {
        segments,
        language: track.languageCode || "en",
        generated: track.kind === "asr",
        title: titleFromHtml(watchHtml),
    };
}

Deno.serve(async request => {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (request.method !== "POST") return jsonResponse({ error: "Método no permitido." }, 405);

    // The transcript endpoint proxies public captions and stores nothing.
    // Authentication is optional here; the same call used by the app works
    // when the local remembered session is being revalidated.
    await authenticate(request);

    try {
        const payload = await request.json();
        const videoId = String(payload?.videoId || "").trim();
        if (!VIDEO_ID.test(videoId)) return jsonResponse({ error: "El enlace de YouTube no es válido.", code: "invalid_video" }, 400);

        // Si ya descargamos este video, se devuelve la copia guardada: cero créditos.
        if (payload?.force !== true) {
            const cached = await readTranscriptCache(videoId);
            if (cached) {
                return jsonResponse({
                    title: cached.title || await titleFor(videoId),
                    language: cached.language || "en",
                    generated: false,
                    source: cached.source || "youtube",
                    cached: true,
                    segments: cached.segments,
                });
            }
        }

        // La key puede venir del dispositivo o de los secretos del proyecto.
        const provider = normalizeProvider(payload?.provider || Deno.env.get("TRANSCRIPT_PROVIDER"));
        const apiKey = String(payload?.apiKey || Deno.env.get("TRANSCRIPT_API_KEY") || "").trim();
        let providerFailure: ProviderFailure | null = null;

        if (provider && apiKey) {
            try {
                const result = provider === "supadata"
                    ? await supadataTranscript(videoId, apiKey)
                    : await transcriptFetchTranscript(videoId, apiKey);
                if (result.segments.length) {
                    const title = result.title || await titleFor(videoId);
                    const language = result.language || "en";
                    await writeTranscriptCache(videoId, { title, language, source: provider, segments: result.segments });
                    return jsonResponse({
                        title,
                        language,
                        generated: false,
                        source: provider,
                        segments: result.segments,
                    });
                }
                providerFailure = new ProviderFailure("no_transcript", "El proveedor no devolvió texto para este video.");
            } catch (error) {
                providerFailure = error instanceof ProviderFailure
                    ? error
                    : new ProviderFailure("provider_error", error instanceof Error ? error.message : "Error del proveedor.");
                // Una key inválida o sin cupo no se arregla reintentando: la app
                // necesita saberlo para pedir otra key.
                if (providerFailure.code === "invalid_key") {
                    return jsonResponse({ error: providerFailure.message, code: providerFailure.code, provider }, 401);
                }
            }
        }

        // Respaldo: intentamos leer los subtítulos públicos directamente.
        const fallback = await youtubeTranscript(videoId);
        if (fallback?.segments?.length) {
            await writeTranscriptCache(videoId, {
                title: fallback.title,
                language: fallback.language,
                source: "youtube",
                segments: fallback.segments,
            });
            return jsonResponse({
                title: fallback.title,
                language: fallback.language,
                generated: fallback.generated,
                source: "youtube",
                segments: fallback.segments,
            });
        }

        if (providerFailure) {
            return jsonResponse(
                { error: providerFailure.message, code: providerFailure.code, provider },
                providerFailure.code === "quota" ? 429 : 404
            );
        }
        return jsonResponse({
            error: "No hay subtítulos disponibles para este video. Pega la transcripción para crear la lección.",
            code: "no_transcript",
        }, 404);
    } catch (error) {
        console.error("youtube-transcript failed", error);
        return jsonResponse({ error: error instanceof Error ? error.message : "No se pudo obtener la transcripción automática.", code: "server_error" }, 500);
    }
});
