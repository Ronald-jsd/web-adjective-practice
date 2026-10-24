import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const notionClientId = Deno.env.get("NOTION_CLIENT_ID") || "";
const notionClientSecret = Deno.env.get("NOTION_CLIENT_SECRET") || "";
const redirectUri = Deno.env.get("NOTION_REDIRECT_URI") || "";
const appUrl = Deno.env.get("NOTION_APP_URL") || "";
const admin = createClient(supabaseUrl, serviceRoleKey);

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

function htmlResponse(message: string, destination: string, success: boolean) {
    const safeDestination = JSON.stringify(destination).replace(/</g, "\\u003c");
    const icon = success ? "✅" : "⚠️";
    return new Response(`<!doctype html><html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Notion</title>
<body style="font:16px system-ui;max-width:560px;margin:12vh auto;padding:24px;color:#1f2937">
<h1>${icon} ${success ? "Notion conectado" : "No se pudo conectar Notion"}</h1>
<p>${message}</p><p>Volviendo a la aplicación...</p>
<script>setTimeout(()=>location.replace(${safeDestination}),900)</script>
<a href="${destination.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">Volver a la aplicación</a>
</body></html>`, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
    });
}

async function authenticate(request: Request) {
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const client = createClient(supabaseUrl, anonKey);
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user;
}

async function hashState(state: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function appDestination(result: string, detail = "") {
    const destination = new URL(appUrl);
    destination.searchParams.set("notion", result);
    if (detail) destination.searchParams.set("message", detail.slice(0, 300));
    return destination.toString();
}

async function handleCallback(url: URL) {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");
    if (oauthError) {
        return htmlResponse("Notion canceló o rechazó la autorización.", appDestination("error", oauthError), false);
    }
    if (!code || !state) {
        return jsonResponse({ error: "Falta el código o estado OAuth de Notion." }, 400);
    }
    if (!notionClientId || !notionClientSecret || !redirectUri || !appUrl) {
        return jsonResponse({ error: "La conexión con Notion no está configurada en el servidor." }, 500);
    }

    const stateHash = await hashState(state);
    const { data: pending, error: stateError } = await admin
        .from("notion_oauth_states")
        .select("user_id")
        .eq("state_hash", stateHash)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
    if (stateError) throw stateError;
    if (!pending) {
        return htmlResponse("El enlace de autorización venció o ya fue usado. Intenta conectar de nuevo.", appDestination("error", "state"), false);
    }

    const { error: deleteStateError } = await admin
        .from("notion_oauth_states")
        .delete()
        .eq("state_hash", stateHash);
    if (deleteStateError) throw deleteStateError;

    const credentials = btoa(`${notionClientId}:${notionClientSecret}`);
    const tokenResponse = await fetch("https://api.notion.com/v1/oauth/token", {
        method: "POST",
        headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
        }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || typeof tokenData.access_token !== "string") {
        console.error("Notion token exchange failed with status:", tokenResponse.status);
        return htmlResponse("Notion no pudo completar la autorización. Vuelve a intentarlo.", appDestination("error", "token_exchange"), false);
    }

    const { error: saveError } = await admin.from("notion_connections").upsert({
        user_id: pending.user_id,
        access_token: tokenData.access_token,
        workspace_id: tokenData.workspace_id || null,
        workspace_name: tokenData.workspace_name || null,
        connected_at: new Date().toISOString(),
    });
    if (saveError) throw saveError;

    return htmlResponse("La conexión quedó guardada de forma privada en el servidor.", appDestination("connected"), true);
}

Deno.serve(async request => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    const url = new URL(request.url);

    try {
        if (request.method === "GET" && (url.searchParams.has("code") || url.searchParams.has("error"))) {
            return await handleCallback(url);
        }

        if (request.method !== "POST") {
            return jsonResponse({ error: "Método no permitido." }, 405);
        }

        const user = await authenticate(request);
        if (!user) return jsonResponse({ error: "Inicia sesión para conectar Notion." }, 401);
        const body = await request.json().catch(() => ({}));

        if (body.action === "start") {
            if (!notionClientId || !notionClientSecret || !redirectUri) {
                return jsonResponse({ error: "Falta configurar NOTION_CLIENT_ID, NOTION_CLIENT_SECRET o NOTION_REDIRECT_URI en Supabase." }, 500);
            }
            const randomState = crypto.randomUUID() + crypto.randomUUID();
            const stateHash = await hashState(randomState);
            const { error: cleanupError } = await admin
                .from("notion_oauth_states")
                .delete()
                .lt("expires_at", new Date().toISOString());
            if (cleanupError) throw cleanupError;
            const { error } = await admin.from("notion_oauth_states").insert({
                state_hash: stateHash,
                user_id: user.id,
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            });
            if (error) throw error;

            const authorizeUrl = new URL("https://api.notion.com/v1/oauth/authorize");
            authorizeUrl.searchParams.set("client_id", notionClientId);
            authorizeUrl.searchParams.set("response_type", "code");
            authorizeUrl.searchParams.set("owner", "user");
            authorizeUrl.searchParams.set("redirect_uri", redirectUri);
            authorizeUrl.searchParams.set("state", randomState);
            return jsonResponse({ authorizeUrl: authorizeUrl.toString() });
        }

        if (body.action === "status") {
            const { data, error } = await admin
                .from("notion_connections")
                .select("workspace_name, connected_at")
                .eq("user_id", user.id)
                .maybeSingle();
            if (error) throw error;
            return jsonResponse({ connected: Boolean(data), workspaceName: data?.workspace_name || null });
        }

        if (body.action === "disconnect") {
            const { error } = await admin.from("notion_connections").delete().eq("user_id", user.id);
            if (error) throw error;
            return jsonResponse({ disconnected: true });
        }

        return jsonResponse({ error: "Acción de Notion desconocida." }, 400);
    } catch (error) {
        console.error("Notion connection error:", error);
        return jsonResponse({ error: error instanceof Error ? error.message : "Error interno de Notion." }, 500);
    }
});
