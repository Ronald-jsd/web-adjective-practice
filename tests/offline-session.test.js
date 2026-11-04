import test from 'node:test'
import assert from 'node:assert/strict'

/* localStorage mínimo con claves enumerables, como el navegador. */
function createStorage() {
    const storage = {}
    Object.defineProperties(storage, {
        getItem: { value: key => Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null },
        setItem: { value: (key, value) => { storage[key] = String(value) } },
        removeItem: { value: key => { delete storage[key] } }
    })
    return storage
}

const storage = createStorage()
globalThis.localStorage = storage

const {
    forgetUser,
    isInvalidSessionError,
    readRememberedUser,
    readStoredSessionUser,
    rememberUser,
    resolveSessionUser
} = await import('../js/offline/session.js')

function clearStorage() {
    forgetUser()
    for (const key of Object.keys(storage)) delete storage[key]
}

test('rememberUser guarda un espejo legible del usuario', () => {
    clearStorage()
    rememberUser({ id: 42, email: 'persona@example.com', user_metadata: { name: 'Ana' } })

    const remembered = readRememberedUser()
    assert.equal(remembered.id, '42')
    assert.equal(remembered.email, 'persona@example.com')
    assert.equal(remembered.user_metadata.name, 'Ana')
})

test('readStoredSessionUser lee el token normal y el dividido en trozos', () => {
    clearStorage()
    storage['sb-demo-auth-token'] = JSON.stringify({
        user: { id: 'user-1', email: 'token@example.com' }
    })
    assert.equal(readStoredSessionUser().email, 'token@example.com')

    clearStorage()
    storage['sb-demo-auth-token.0'] = '{"user":{"id":"user-2",'
    storage['sb-demo-auth-token.1'] = '"email":"chunk@example.com"}}'
    assert.equal(readStoredSessionUser().email, 'chunk@example.com')
})

test('resolveSessionUser usa el token si getSession falla sin conexión', async () => {
    clearStorage()
    storage['sb-demo-auth-token'] = JSON.stringify({
        user: { id: 'user-1', email: 'offline@example.com' }
    })

    const supabase = {
        auth: {
            getSession: async () => { throw new TypeError('Failed to fetch') }
        }
    }

    const user = await resolveSessionUser(supabase)
    assert.equal(user.email, 'offline@example.com')
    assert.equal(readRememberedUser().email, 'offline@example.com')
})

test('resolveSessionUser usa el espejo propio si no hay token', async () => {
    clearStorage()
    rememberUser({ id: 'user-3', email: 'mirror@example.com' })

    const supabase = {
        auth: {
            getSession: async () => ({ data: { session: null }, error: null })
        }
    }

    const user = await resolveSessionUser(supabase)
    assert.equal(user.email, 'mirror@example.com')
})

test('isInvalidSessionError distingue un token inválido de un fallo de red', () => {
    assert.equal(isInvalidSessionError({ name: 'AuthSessionMissingError' }), true)
    assert.equal(isInvalidSessionError({ code: 'bad_jwt', message: 'invalid JWT' }), true)
    assert.equal(isInvalidSessionError({ message: 'refresh token not found' }), true)
    assert.equal(isInvalidSessionError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }), false)
    assert.equal(isInvalidSessionError(new TypeError('Failed to fetch')), false)
})
