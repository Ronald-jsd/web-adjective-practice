import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
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

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const TRACK = /(?:ytInitialPlayerResponse[\"']?\s*[:=]\s*|window\s*\[\s*[\"']ytInitialPlayerResponse[\"']\s*\]\s*=\s*)/;

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

Deno.serve(async request => {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (request.method !== "POST") return jsonResponse({ error: "Método no permitido." }, 405);

    const user = await authenticate(request);
    if (!user) return jsonResponse({ error: "No autenticado." }, 401);

    try {
        const payload = await request.json();
        const videoId = String(payload?.videoId || "").trim();
        if (!VIDEO_ID.test(videoId)) return jsonResponse({ error: "El enlace de YouTube no es válido." }, 400);

        const watch = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
            redirect: "follow",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9,es;q=0.8"
            }
        });
        const watchHtml = await watch.text();
        const tracks = captionsFromHtml(watchHtml);
        const track = tracks.length ? pickTrack(tracks) : null;
        if (!track?.baseUrl) {
            return jsonResponse({ error: "No hay subtítulos disponibles para este video. Pega la transcripción para crear la lección." }, 404);
        }
        const captionUrl = `${track.baseUrl}${track.baseUrl.includes("?") ? "&" : "?"}fmt=json3`;
        const captionResponse = await fetch(captionUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" }
        });
        const captionText = await captionResponse.text();
        const segments = parseJson3(captionText);
        if (!segments.length) {
            return jsonResponse({ error: "YouTube no respondió con una transcripción utilizable. Pega la transcripción manualmente." }, 404);
        }
        return jsonResponse({
            title: titleFromHtml(watchHtml),
            language: track.languageCode || "en",
            generated: track.kind === "asr",
            segments
        });
    } catch (error) {
        console.error("youtube-transcript failed", error);
        return jsonResponse({ error: error instanceof Error ? error.message : "No se pudo obtener la transcripción automática." }, 500);
    }
});
