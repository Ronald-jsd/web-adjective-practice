import test from 'node:test'
import assert from 'node:assert/strict'
import {
    clearSignedImageUrlCache,
    getSignedImageUrls
} from '../js/ai-image-urls.js'

function fakeSupabase() {
    const calls = []
    return {
        calls,
        storage: {
            from(bucket) {
                assert.equal(bucket, 'ai-query-images')
                return {
                    async createSignedUrls(paths, ttl) {
                        calls.push({ paths: [...paths], ttl })
                        return {
                            data: paths.map(path => ({ path, signedUrl: `https://firma.test/${path}` })),
                            error: null
                        }
                    }
                }
            }
        }
    }
}

test('firma una sola vez las rutas repetidas entre consultas', async () => {
    clearSignedImageUrlCache()
    const supabase = fakeSupabase()
    const urls = await getSignedImageUrls(
        supabase,
        ['u/1/a.jpg', 'u/1/b.jpg', 'u/1/a.jpg'],
        { scope: 'user-1' }
    )
    assert.deepEqual(supabase.calls, [
        { paths: ['u/1/a.jpg', 'u/1/b.jpg'], ttl: 3600 }
    ])
    assert.equal(urls.get('u/1/a.jpg'), 'https://firma.test/u/1/a.jpg')
    assert.equal(urls.size, 2)
})

test('reutiliza la URL firmada mientras no esté a punto de expirar', async () => {
    clearSignedImageUrlCache()
    const supabase = fakeSupabase()
    await getSignedImageUrls(supabase, ['u/1/a.jpg'], { scope: 'user-1' })
    const urls = await getSignedImageUrls(supabase, ['u/1/a.jpg', 'u/1/c.jpg'], { scope: 'user-1' })
    assert.deepEqual(supabase.calls.map(call => call.paths), [
        ['u/1/a.jpg'],
        ['u/1/c.jpg']
    ])
    assert.equal(urls.get('u/1/a.jpg'), 'https://firma.test/u/1/a.jpg')
})

test('no comparte URLs entre usuarios', async () => {
    clearSignedImageUrlCache()
    const supabase = fakeSupabase()
    await getSignedImageUrls(supabase, ['u/1/a.jpg'], { scope: 'user-1' })
    await getSignedImageUrls(supabase, ['u/1/a.jpg'], { scope: 'user-2' })
    assert.equal(supabase.calls.length, 2)
})

test('omite rutas vacías', async () => {
    clearSignedImageUrlCache()
    const supabase = fakeSupabase()
    const urls = await getSignedImageUrls(supabase, ['', '   '], { scope: 'user-1' })
    assert.equal(urls.size, 0)
    assert.equal(supabase.calls.length, 0)
})
