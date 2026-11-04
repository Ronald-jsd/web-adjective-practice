import { supabase } from './app.js'
import { store } from './config.js'
import { loadUserFavorites } from './favorites.js'
import { cacheRowsPreservingPending, readCachedRows, TABLES } from './offline/cache.js'
import { flushOutbox, clearOfflineData, isOnline } from './offline/sync.js'
import {
    forgetUser,
    isInvalidSessionError,
    readRememberedUser,
    readStoredSessionUser,
    rememberUser,
    resolveSessionUser
} from './offline/session.js'

function updateAuthUI() {
    const authContainer = document.getElementById('auth-container')
    if (!authContainer) return

    if (store.currentUser) {
        authContainer.innerHTML = `
            <div class="flex items-center gap-2 md:gap-3">
                <button id="ai-provider-btn" onclick="window.manageAIKeys()" class="flex items-center gap-2 px-3 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg text-xs md:text-sm font-medium transition-colors border border-green-200" title="Gestionar proveedores de IA">
                    ${window.hasApiKey ? (window.hasApiKey('groq') || window.hasApiKey('gemini') ? '⚡ IA' : '🤖 Configurar IA') : '🤖 Configurar IA'}
                </button>
                <span class="text-xs md:text-sm text-gray-600 hidden sm:block">${store.currentUser.email}</span>
                <button onclick="window.logout()" class="px-2 md:px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs md:text-sm hover:bg-red-600">
                    Salir
                </button>
            </div>
        `
        import('./ai.js').then(module => {
            if (module.updateAIButton) module.updateAIButton()
        })
    } else {
        authContainer.innerHTML = `
            <button onclick="window.abrirModalLogin()" class="px-3 md:px-4 py-1.5 md:py-2 bg-amber-500 text-white rounded-lg text-xs md:text-sm font-medium hover:bg-amber-600 transition-colors">
                🔐 Iniciar sesión
            </button>
        `
    }
}

async function checkUser() {
    // Primero la sesión guardada; si Supabase no puede refrescar el token sin
    // red, resolveSessionUser recurre al token y al espejo local.
    let user = await resolveSessionUser(supabase)

    // Con conexión revalidamos el token; sin conexión seguimos con la sesión local.
    if (isOnline()) {
        try {
            const { data, error } = await supabase.auth.getUser()
            if (!error && data?.user) {
                user = data.user
                rememberUser(user)
            } else if (error && isInvalidSessionError(error)) {
                console.warn('La sesión guardada ya no es válida:', error.message)
                user = null
                forgetUser()
            }
        } catch (error) {
            console.warn('No se pudo revalidar la sesión; se usa la copia local.', error)
        }
    }

    store.currentUser = user
    if (user) rememberUser(user)

    updateAuthUI()
    if (user) {
        await loadUserWordStatus()
        await loadUserCustomItems()
        await loadUserFavorites(supabase, user.id)
    } else {
        store.favoriteSet.clear()
    }
    return user
}

/* Aplica el cierre de sesión sin tocar los datos locales salvo que el usuario
 * lo pida desde el botón Salir. */
function applySignedOut() {
    forgetUser()
    store.currentUser = null
    store.wordStatusMap.clear()
    store.userCustomItems.length = 0
    store.favoriteSet.clear()
    updateAuthUI()
}

let revalidating = false

/* Al recuperar la conexión se comprueba el token real y se refrescan los datos
 * del usuario. Si falla por red se conserva la sesión local. */
async function revalidateSession() {
    if (!isOnline() || revalidating) return store.currentUser
    revalidating = true
    try {
        const { data, error } = await supabase.auth.getUser()
        if (error) {
            if (isInvalidSessionError(error)) applySignedOut()
            return store.currentUser
        }
        if (!data?.user) return store.currentUser

        store.currentUser = rememberUser(data.user)
        updateAuthUI()
        await loadUserWordStatus()
        await loadUserCustomItems()
        await loadUserFavorites(supabase, store.currentUser.id)
        window.dispatchEvent(new CustomEvent('session-revalidated', { detail: { user: store.currentUser } }))
        return store.currentUser
    } catch (error) {
        console.warn('Sin conexión: se mantiene la sesión guardada.', error)
        return store.currentUser
    } finally {
        revalidating = false
    }
}

let authSessionInitialized = false

export function initAuthSession() {
    if (authSessionInitialized) return
    authSessionInitialized = true

    try {
        supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                store.currentUser = rememberUser(session.user)
                updateAuthUI()
            } else if (event === 'SIGNED_OUT') {
                // Sin red, Supabase puede emitir SIGNED_OUT al no poder
                // refrescar el token. No debe borrar la sesión local.
                if (!isOnline() && (readStoredSessionUser() || readRememberedUser())) {
                    console.warn('Supabase emitió SIGNED_OUT sin conexión; se conserva la sesión local.')
                    return
                }
                applySignedOut()
            }
        })
    } catch (error) {
        console.warn('No se pudo escuchar los cambios de sesión:', error)
    }

    window.addEventListener('online', () => {
        revalidateSession().catch(() => {})
    })
    // Sin conexión no se borra nada: la sesión local y los datos siguen válidos.
    window.addEventListener('offline', () => {
        if (store.currentUser) rememberUser(store.currentUser)
    })
}

async function loadUserWordStatus() {
    if (!store.currentUser) return

    const userId = store.currentUser.id
    let rows = null
    let fromNetwork = false

    try {
        const { data, error } = await supabase
            .from('user_word_status')
            .select('id,item_id, status')
            .eq('user_id', userId)
        if (error) throw error
        rows = data || []
        fromNetwork = true
        rows = await cacheRowsPreservingPending(
            TABLES.wordStatus,
            rows.map(row => ({ ...row, user_id: userId, cache_id: `${userId}|${row.item_id}` })),
            'cache_id'
        )
    } catch (error) {
        console.warn('Sin conexión: usando estados guardados en el dispositivo.', error)
        rows = await readCachedRows(TABLES.wordStatus, row => row.user_id === userId)
    }

    store.wordStatusMap.clear()
    store.favoriteSet.clear()

    const validItems = (rows || []).filter(item =>
        item && item.item_id !== null &&
        item.item_id !== undefined &&
        item.item_id !== ''
    )

    if (fromNetwork) {
        const nullItems = (rows || []).filter(item =>
            !item || item.item_id === null ||
            item.item_id === undefined || item.item_id === ''
        )
        if (nullItems.length > 0) {
            console.warn(`⚠️ Encontrados ${nullItems.length} registros con item_id nulo:`, nullItems)
            try {
                const idsToDelete = nullItems.map(item => item.id).filter(id => id)
                if (idsToDelete.length > 0) {
                    await supabase.from('user_word_status').delete().in('id', idsToDelete)
                }
            } catch (err) {
                console.error('Error al eliminar registros nulos:', err)
            }
        }
    }

    validItems.forEach(item => {
        if (item && item.item_id) {
            store.wordStatusMap.set(item.item_id.toString(), item.status)
        }
    })
}

async function loadUserCustomItems(options = {}) {
    if (!store.currentUser) return

    const userId = store.currentUser.id
    let data = null

    if (!options.preferCache) {
        try {
            const result = await supabase
                .from('user_custom_items')
                .select('*')
                .eq('user_id', userId)
            if (result.error) throw result.error
            data = result.data || []
            data = await cacheRowsPreservingPending(
                TABLES.customItems,
                data.map(row => ({ ...row, user_id: userId }))
            )
        } catch (error) {
            console.warn('Sin conexión: usando tu vocabulario guardado en el dispositivo.', error)
        }
    }

    if (!data) {
        data = await readCachedRows(TABLES.customItems, row => row.user_id === userId)
    }

    store.userCustomItems.length = 0
    store.userCustomItems.push(...data)
}

function clearCategoriesCache() {
    localStorage.removeItem('vocabulary_cache')
    localStorage.removeItem('vocabulary_cache_timestamp')
}

async function logout() {
    const result = await flushOutbox({ silent: true }).catch(() => ({ pending: 0 }))
    if (result?.pending > 0) {
        const proceed = window.confirm(
            `Tienes ${result.pending} ${result.pending === 1 ? 'cambio sin sincronizar' : 'cambios sin sincronizar'}. ` +
            'Si cierras sesión ahora podrías perderlos. ¿Quieres continuar?'
        )
        if (!proceed) return
    }

    try {
        await supabase.auth.signOut()
    } catch (error) {
        console.warn('No se pudo cerrar la sesión en la nube; se limpia la copia local.', error)
    }

    store.currentUser = null
    store.wordStatusMap.clear()
    store.userCustomItems.length = 0
    forgetUser()
    clearCategoriesCache()
    await clearOfflineData()
    updateAuthUI()
    location.reload()
}


window.abrirModalLogin = function () {
    const modalBody = document.getElementById('login-modal-body')
    if (modalBody) {
        modalBody.innerHTML = `
            <div id="login-form" class="p-4 space-y-4">
                <input type="email" id="login-email" placeholder="Email" autocomplete="off" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <input type="password" id="login-password" placeholder="Contraseña" autocomplete="off" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <button onclick="window.loginWithEmail()" class="w-full py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600">Iniciar sesión</button>
                <p class="text-center text-sm">¿No tienes cuenta? <a href="#" onclick="window.mostrarSignup()" class="text-amber-600">Regístrate</a></p>
            </div>
            <div id="signup-form" class="p-4 space-y-4 hidden">
                <input type="email" id="signup-email" placeholder="Email" autocomplete="off" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <input type="password" id="signup-password" placeholder="Contraseña" autocomplete="off" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <button onclick="window.signUpWithEmail()" class="w-full py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">Registrarse</button>
                <p class="text-center text-sm">¿Ya tienes cuenta? <a href="#" onclick="window.mostrarLogin()" class="text-amber-600">Inicia sesión</a></p>
            </div>
        `
    }
    document.getElementById('login-modal').classList.remove('hidden')
}

window.cerrarModalLogin = function () {
    document.getElementById('login-modal').classList.add('hidden')
    const modalBody = document.getElementById('login-modal-body')
    if (modalBody) modalBody.innerHTML = ''
}

window.mostrarSignup = function () {
    document.getElementById('login-form').classList.add('hidden')
    document.getElementById('signup-form').classList.remove('hidden')
}

window.mostrarLogin = function () {
    document.getElementById('signup-form').classList.add('hidden')
    document.getElementById('login-form').classList.remove('hidden')
}

async function loginWithEmail() {
    const email = document.getElementById('login-email')?.value
    const password = document.getElementById('login-password')?.value
    if (!email || !password) { alert('❌ Ingresa email y contraseña'); return }

    if (!isOnline()) {
        const saved = readStoredSessionUser() || readRememberedUser()
        if (saved) {
            alert(`Sin conexión a internet. Se mantiene la sesión guardada de ${saved.email}.`)
            window.cerrarModalLogin()
        } else {
            alert('Sin conexión a internet. Para iniciar sesión por primera vez necesitas conectarte. Después podrás usar la app sin conexión.')
        }
        return
    }

    try {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        clearCategoriesCache()
        window.cerrarModalLogin()
        location.reload()
    } catch (error) {
        alert('❌ Error: ' + authErrorMessage(error))
    }
}

async function signUpWithEmail() {
    const email = document.getElementById('signup-email')?.value
    const password = document.getElementById('signup-password')?.value
    if (!email || !password) { alert('❌ Ingresa email y contraseña'); return }
    if (password.length < 6) { alert('❌ La contraseña debe tener al menos 6 caracteres'); return }
    if (!isOnline()) {
        alert('Sin conexión a internet. Para crear una cuenta necesitas conectarte.')
        return
    }

    try {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        clearCategoriesCache()
        alert('✅ Registro exitoso! Ahora inicia sesión.')
        document.getElementById('signup-email').value = ''
        document.getElementById('signup-password').value = ''
        window.mostrarLogin()
    } catch (error) {
        alert('❌ Error: ' + authErrorMessage(error))
    }
}

function authErrorMessage(error) {
    const message = String(error?.message || error || 'Error desconocido')
    if (/failed to fetch|network|load failed|timeout/i.test(message)) {
        return 'No se pudo conectar con el servidor. Comprueba tu conexión a internet e inténtalo de nuevo.'
    }
    return message
}


export {
    checkUser, updateAuthUI, loadUserWordStatus,
    loadUserCustomItems, logout, loginWithEmail, signUpWithEmail
}

window.loginWithEmail = loginWithEmail
window.signUpWithEmail = signUpWithEmail
window.logout = logout