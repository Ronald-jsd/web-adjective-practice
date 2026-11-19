/* URLs firmadas de las imágenes de consultas de IA.
 *
 * Antes cada consulta firmaba sus imágenes por separado, aunque varias
 * consultas apuntaran al mismo archivo. Aquí se firman todas las rutas
 * distintas en una sola llamada y se reutilizan mientras falte más de un
 * minuto para que expiren. */

import { AI_QUERY_IMAGE_BUCKET } from './ai-images.js'

export const SIGNED_URL_TTL_SECONDS = 60 * 60
const REUSE_MARGIN_MS = 60 * 1000

const signedUrls = new Map()

const cacheKey = (scope, path) => `${scope || ''}\u0000${path}`

export function clearSignedImageUrlCache() {
    signedUrls.clear()
}

export async function getSignedImageUrls(supabase, paths, options = {}) {
    const scope = options.scope || ''
    const ttlSeconds = options.ttlSeconds || SIGNED_URL_TTL_SECONDS
    const unique = [...new Set((paths || []).filter(path => typeof path === 'string' && path.trim()))]
    if (!unique.length) return new Map()

    const now = Date.now()
    const result = new Map()
    const missing = []

    for (const path of unique) {
        const cached = signedUrls.get(cacheKey(scope, path))
        if (cached && cached.expiresAt - REUSE_MARGIN_MS > now) {
            result.set(path, cached.url)
        } else {
            if (cached) signedUrls.delete(cacheKey(scope, path))
            missing.push(path)
        }
    }

    if (missing.length) {
        const { data, error } = await supabase.storage
            .from(AI_QUERY_IMAGE_BUCKET)
            .createSignedUrls(missing, ttlSeconds)
        if (error) throw error

        const expiresAt = now + ttlSeconds * 1000
        for (const item of data || []) {
            if (!item?.path || item.error || !item.signedUrl) continue
            signedUrls.set(cacheKey(scope, item.path), { url: item.signedUrl, expiresAt })
            result.set(item.path, item.signedUrl)
        }
    }

    return result
}
