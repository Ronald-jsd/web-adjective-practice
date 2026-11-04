/* Utilidades compartidas para las imágenes adjuntas a una consulta de IA.
 * Las funciones puras (validación y normalización) también se usan en los
 * tests de Node, así que este módulo no toca el DOM al importarse. */

export const AI_QUERY_IMAGE_BUCKET = 'ai-query-images'
export const MAX_AI_QUERY_IMAGES = 6
export const MAX_AI_QUERY_IMAGE_SIZE = 5 * 1024 * 1024
export const AI_VISION_MAX_DIMENSION = 1600
export const AI_VISION_QUALITY = 0.82

export const AI_QUERY_IMAGE_TYPES = new Map([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/gif', 'gif']
])

export function getImageExtension(type) {
    return AI_QUERY_IMAGE_TYPES.get(type) || null
}

export function validateImageFile(file) {
    if (!file) {
        return { ok: false, message: 'No se seleccionó ninguna imagen.' }
    }
    if (!AI_QUERY_IMAGE_TYPES.has(file.type)) {
        return { ok: false, message: 'Elige imágenes JPG, PNG, WebP o GIF.' }
    }
    if (file.size > MAX_AI_QUERY_IMAGE_SIZE) {
        return { ok: false, message: 'Cada imagen no puede superar los 5 MB.' }
    }
    return { ok: true }
}

/* Acepta tanto el formato nuevo (image_paths) como el antiguo (image_path)
 * y devuelve una lista limpia, sin duplicados y con el límite aplicado. */
export function normalizeImagePaths(row = {}) {
    const paths = []
    const add = value => {
        if (typeof value !== 'string') return
        const path = value.trim()
        if (!path || paths.includes(path)) return
        paths.push(path)
    }

    let stored = row?.image_paths
    if (typeof stored === 'string') {
        try {
            stored = JSON.parse(stored)
        } catch {
            stored = []
        }
    }
    if (Array.isArray(stored)) stored.forEach(add)
    add(row?.image_path)

    return paths.slice(0, MAX_AI_QUERY_IMAGES)
}

export function buildVisionInstruction(count) {
    const safeCount = Math.max(0, Number(count) || 0)
    if (!safeCount) return ''
    return `\nEl usuario adjuntó ${safeCount} ${safeCount === 1 ? 'imagen' : 'imágenes'} a la consulta. Analiza su contenido (texto, ejercicios, capturas o fotos) y úsalo como contexto principal para responder. Si alguna imagen no es legible, indícalo brevemente en el resumen y continúa con lo que puedas interpretar.`
}

export function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen.'))
        reader.readAsDataURL(file)
    })
}

function loadImageElement(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const image = new Image()
        image.onload = () => {
            URL.revokeObjectURL(url)
            resolve(image)
        }
        image.onerror = () => {
            URL.revokeObjectURL(url)
            reject(new Error('No se pudo procesar la imagen.'))
        }
        image.src = url
    })
}

/* Reduce la imagen antes de enviarla al proveedor para no superar los límites
 * de tamaño de la petición multimodal. Devuelve base64 sin el prefijo data:. */
export async function prepareImageForVision(file) {
    try {
        const image = await loadImageElement(file)
        const scale = Math.min(
            1,
            AI_VISION_MAX_DIMENSION / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height)
        )
        const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale))
        const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('El navegador no pudo preparar la imagen.')
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, width, height)
        context.drawImage(image, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', AI_VISION_QUALITY)
        const base64 = dataUrl.split(',')[1]
        if (!base64) throw new Error('El navegador no pudo preparar la imagen.')
        return { mimeType: 'image/jpeg', data: base64, name: file.name }
    } catch (error) {
        // Respaldo para navegadores sin canvas/imagen: se envía el original.
        if (file.size > 4 * 1024 * 1024) throw error
        const dataUrl = await readFileAsDataUrl(file)
        const base64 = dataUrl.split(',')[1]
        if (!base64) throw error
        return { mimeType: file.type, data: base64, name: file.name }
    }
}
