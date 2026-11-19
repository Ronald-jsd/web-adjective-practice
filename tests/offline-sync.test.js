import test from 'node:test'
import assert from 'node:assert/strict'

import { classifySyncError, groupOutboxEntries, retryDelayFor } from '../js/offline/sync.js'

test('el backoff crece exponencialmente y tiene tope', () => {
    assert.equal(retryDelayFor(0), 5000)
    assert.equal(retryDelayFor(1), 10000)
    assert.equal(retryDelayFor(2), 20000)
    assert.equal(retryDelayFor(10), 300000)
})

test('se agrupan los cambios compatibles y se respeta el orden de la cola', () => {
    const entries = [
        { id: 1, table: 'user_custom_items', action: 'upsert', conflict: 'id', userId: 'u', payload: { id: 1, word: 'a' } },
        { id: 2, table: 'user_custom_items', action: 'upsert', conflict: 'id', userId: 'u', payload: { id: 2, word: 'b' } },
        { id: 3, table: 'verbs', action: 'update', userId: 'u', payload: { notes: 'x' }, match: { id: 9 } },
        { id: 4, table: 'verbs', action: 'delete', userId: 'u', match: { id: 9 } },
        { id: 5, table: 'verbs', action: 'delete', userId: 'u', match: { id: 10 } }
    ]
    const groups = groupOutboxEntries(entries)
    assert.deepEqual(groups.map(group => group.entries.length), [2, 1, 2])
    assert.ok(groups[0].signature)
    assert.equal(groups[1].signature, null)
    assert.ok(groups[2].signature.startsWith('delete|'))
})

test('no se agrupan payloads distintos ni cambios de otros usuarios', () => {
    const entries = [
        { id: 1, table: 'user_custom_items', action: 'upsert', conflict: 'id', userId: 'u', payload: { id: 1, word: 'a' } },
        { id: 2, table: 'user_custom_items', action: 'upsert', conflict: 'id', userId: 'u', payload: { id: 2, notes: 'b' } },
        { id: 3, table: 'user_custom_items', action: 'upsert', conflict: 'id', userId: 'otro', payload: { id: 3, word: 'c' } }
    ]
    assert.deepEqual(groupOutboxEntries(entries).map(group => group.entries.length), [1, 1, 1])
})

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
