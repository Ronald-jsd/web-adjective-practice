/* Service worker de Visual Guide.
 * Estrategia:
 *  - App shell y módulos propios: stale-while-revalidate.
 *  - Navegación: network-first con fallback al index cacheado.
 *  - CDNs de fuentes, Tailwind y Supabase JS: cache-first.
 *  - Supabase, IA y Notion: siempre red (nunca se cachean datos privados).
 * Sube VERSION cuando cambies archivos para forzar la actualización.
 */
const VERSION = "v1.2.12";
const SHELL_CACHE = `vg-shell-${VERSION}`;
const RUNTIME_CACHE = `vg-runtime-${VERSION}`;

const CORE_ASSETS = [
    "./",
    "./index.html",
    "./my-sentences.html",
    "./styles.css",
    "./sentences.css",
    "./manifest.webmanifest",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/icon-maskable-512.png",
    "./icons/apple-touch-icon.png",
    "./js/app.js",
    "./js/config.js",
    "./js/cache.js",
    "./js/ui-status.js",
    "./js/pwa.js",
    "./js/auth.js",
    "./js/data.js",
    "./js/search.js",
    "./js/category-view.js",
    "./js/favorites.js",
    "./js/editing.js",
    "./js/drag-drop.js",
    "./js/audio.js",
    "./js/ai.js",
    "./js/ai-models.js",
    "./js/ai-practice.js",
    "./js/ai-translation.js",
    "./js/ai-vocabulary.js",
    "./js/ai-images.js",
    "./js/browser-ai.js",
    "./js/notion.js",
    "./js/notion-embeds/app.js",
    "./js/notion-embeds/model.js",
    "./js/notion-embeds/repository.js",
    "./js/practice.js",
    "./js/practice-audio.js",
    "./js/practice-import.js",
    "./js/practice-progress.js",
    "./js/practice-utils.js",
    "./js/offline/db.js",
    "./js/offline/sync.js",
    "./js/offline/cache.js",
    "./js/offline/ids.js",
    "./js/offline/session.js",
    "./js/offline/status.js",
    "./js/sentences/app.js",
    "./js/sentences/exercises.js",
    "./js/sentences/model.js",
    "./js/sentences/notes.js",
    "./js/sentences/repository.js",
    "./js/sentences/scheduler.js",
    "./js/sentences/vocabulary-search.js",
    "./js/verbs/verbs-ai.js",
    "./js/verbs/verbs-data.js",
    "./js/verbs/verbs-edit.js",
    "./js/verbs/verbs-loader.js",
    "./js/verbs/verbs-pagination.js",
    "./js/verbs/verbs-render.js",
    "./js/verbs/verbs-search.js",
    "./js/verbs/verbs-sort.js",
    "./js/verbs/verbs-state.js"
];

/* Se precargan también los CDN para que la app funcione sin conexión
 * desde la primera instalación, sin esperar a una segunda visita. */
const EXTERNAL_ASSETS = [
    "https://cdn.tailwindcss.com",
    "https://cdn.jsdelivr.net/npm/@fontsource/merriweather@5.0.8/index.min.css",
    "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.8/index.min.css",
    "https://esm.sh/@supabase/supabase-js@2"
];

const CACHEABLE_HOSTS = new Set([
    "cdn.tailwindcss.com",
    "cdn.jsdelivr.net",
    "esm.sh",
    "fonts.googleapis.com",
    "fonts.gstatic.com"
]);

const NETWORK_ONLY_HOSTS = [
    "supabase.co",
    "supabase.in",
    "api.groq.com",
    "generativelanguage.googleapis.com",
    "notion.com",
    "notion.so"
];

self.addEventListener("install", (event) => {
    event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys
                    .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
                    .map((key) => caches.delete(key))
            );
            await self.clients.claim();
        })()
    );
});

self.addEventListener("message", (event) => {
    if (event.data?.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});

/* Android/Chrome: permite vaciar la cola de cambios pendientes cuando vuelve la red. */
self.addEventListener("sync", (event) => {
    if (event.tag === "sync-outbox") {
        event.waitUntil(notifyClientsToSync());
    }
});

async function precache() {
    const shell = await caches.open(SHELL_CACHE);
    const runtime = await caches.open(RUNTIME_CACHE);

    await Promise.allSettled([
        ...CORE_ASSETS.map(async (url) => {
            try {
                const response = await fetch(new Request(url, { cache: "reload" }));
                if (response.ok) await shell.put(url, response);
            } catch (error) {
                // Un asset que falla no debe impedir la instalación del resto.
                console.warn("[sw] No se pudo precachear", url, error);
            }
        }),
        ...EXTERNAL_ASSETS.map(async (url) => {
            try {
                const response = await fetch(url);
                if (response.ok || response.type === "opaque") {
                    await runtime.put(url, response);
                }
            } catch (error) {
                console.warn("[sw] No se pudo precachear el CDN", url, error);
            }
        })
    ]);
}

async function notifyClientsToSync() {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
        client.postMessage({ type: "FLUSH_OUTBOX" });
    }
}

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;

    let url;
    try {
        url = new URL(request.url);
    } catch (error) {
        return;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") return;

    if (NETWORK_ONLY_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith(networkFirstNavigation(request));
        return;
    }

    if (url.origin === self.location.origin) {
        event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
        return;
    }

    if (CACHEABLE_HOSTS.has(url.hostname)) {
        event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    }
});

async function networkFirstNavigation(request) {
    const cache = await caches.open(SHELL_CACHE);
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put("./index.html", response.clone());
            return response;
        }
        // Un 5xx (por ejemplo, un proxy sin conexión) no debe dejar la app en blanco.
        const cached = await matchNavigationFallback(cache, request);
        if (cached) return cached;
        return response;
    } catch (error) {
        const cached = await matchNavigationFallback(cache, request);
        if (cached) return cached;
        return new Response(
            "<!doctype html><meta charset='utf-8'><title>Sin conexión</title><body style='font-family:system-ui;padding:2rem;text-align:center'><h1>Sin conexión</h1><p>Abre la app una vez con internet para guardar los archivos necesarios.</p></body>",
            { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
    }
}

async function matchNavigationFallback(cache, request) {
    return (
        (await cache.match("./index.html")) ||
        (await cache.match("./")) ||
        (await cache.match(request, { ignoreSearch: true })) ||
        null
    );
}

async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    const network = fetch(request)
        .then((response) => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
        })
        .catch(() => null);

    if (cached) {
        network.catch(() => {});
        return cached;
    }

    const response = await network;
    if (response) return response;
    return new Response("", { status: 504, statusText: "Sin conexión" });
}

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response && (response.ok || response.type === "opaque")) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        return new Response("", { status: 504, statusText: "Sin conexión" });
    }
}
