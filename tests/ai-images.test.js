import test from 'node:test'
import assert from 'node:assert/strict'

import {
    MAX_AI_QUERY_IMAGES,
    buildVisionInstruction,
    getImageExtension,
    normalizeImagePaths,
    validateImageFile
} from '../js/ai-images.js'

test('getImageExtension reconoce los formatos permitidos', () => {
    assert.equal(getImageExtension('image/jpeg'), 'jpg')
    assert.equal(getImageExtension('image/png'), 'png')
    assert.equal(getImageExtension('image/webp'), 'webp')
    assert.equal(getImageExtension('image/gif'), 'gif')
    assert.equal(getImageExtension('image/svg+xml'), null)
})

test('validateImageFile acepta imágenes válidas y rechaza tipo o tamaño', () => {
    assert.deepEqual(validateImageFile({ type: 'image/png', size: 1024 }), { ok: true })
    assert.equal(validateImageFile(null).ok, false)
    assert.equal(validateImageFile({ type: 'text/plain', size: 10 }).ok, false)
    assert.equal(validateImageFile({ type: 'image/png', size: 6 * 1024 * 1024 }).ok, false)
})

test('normalizeImagePaths lee el formato nuevo y el antiguo sin duplicados', () => {
    assert.deepEqual(
        normalizeImagePaths({
            image_paths: ['a/1/query-1.png', 'a/1/query-2.jpg'],
            image_path: 'a/1/query-1.png'
        }),
        ['a/1/query-1.png', 'a/1/query-2.jpg']
    )
    assert.deepEqual(normalizeImagePaths({ image_path: 'a/1/query-3.webp' }), ['a/1/query-3.webp'])
    assert.deepEqual(normalizeImagePaths({ image_paths: '["a/1/query-4.gif"]' }), ['a/1/query-4.gif'])
    assert.deepEqual(normalizeImagePaths({ image_paths: 'no-json', image_path: null }), [])
})

test('normalizeImagePaths limita la lista al máximo permitido', () => {
    const paths = Array.from({ length: MAX_AI_QUERY_IMAGES + 3 }, (_, index) => `a/1/query-${index}.png`)
    assert.equal(normalizeImagePaths({ image_paths: paths }).length, MAX_AI_QUERY_IMAGES)
})

test('buildVisionInstruction describe una o varias imágenes', () => {
    assert.equal(buildVisionInstruction(0), '')
    assert.match(buildVisionInstruction(1), /adjuntó 1 imagen/)
    assert.match(buildVisionInstruction(3), /adjuntó 3 imágenes/)
})
