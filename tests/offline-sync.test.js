import test from 'node:test'
import assert from 'node:assert/strict'

import { classifySyncError } from '../js/offline/sync.js'

test('un error de PostgREST sin estado HTTP no se reintenta para siempre', () => {
    const error = { code: '23505', message: 'duplicate key value violates unique constraint' }
    const result = classifySyncError(error)
    assert.equal(result.status, 0)
    assert.equal(result.retry, false)
    assert.equal(result.networkish, false)
})

test('un fallo de red sí se reintenta', () => {
    const result = classifySyncError(new TypeError('Failed to fetch'))
    assert.equal(result.retry, true)
    assert.equal(result.networkish, true)
})

test('un error 500 o 429 se reintenta, pero no bloquea la cola', () => {
    const server = classifySyncError({ status: 500, message: 'Internal Server Error' })
    assert.equal(server.retry, true)
    assert.equal(server.networkish, false)

    const rateLimit = classifySyncError({ status: 429, message: 'Too many requests' })
    assert.equal(rateLimit.retry, true)
    assert.equal(rateLimit.networkish, false)
})

test('un 401 se reintenta y un 403 no', () => {
    assert.equal(classifySyncError({ status: 401, message: 'JWT expired' }).retry, true)
    assert.equal(classifySyncError({ status: 403, message: 'permission denied' }).retry, false)
})

test('una columna inexistente no se reintenta: se limpia o se descarta', () => {
    const result = classifySyncError({
        code: 'PGRST204',
        message: "Could not find the 'sort_order' column of 'items' in the schema cache"
    })
    assert.equal(result.retry, false)
})
