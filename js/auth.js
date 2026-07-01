import { supabase } from './app.js'
import { store } from './config.js'

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
    const { data: { user } } = await supabase.auth.getUser()

    store.currentUser = user

    updateAuthUI()
    if (user) {
        await loadUserWordStatus()
        await loadUserCustomItems()
    }
    return user
}

async function loadUserWordStatus() {
    if (!store.currentUser) return
    const { data, error } = await supabase
        .from('user_word_status')
        .select('item_id, status')
        .eq('user_id', store.currentUser.id)

    if (!error && data) {
        store.wordStatusMap.clear()
        data.forEach(item => store.wordStatusMap.set(item.item_id.toString(), item.status))
    }
}

async function loadUserCustomItems() {
    if (!store.currentUser) return
    const { data, error } = await supabase
        .from('user_custom_items')
        .select('*')
        .eq('user_id', store.currentUser.id)
    if (!error && data) {
        store.userCustomItems.length = 0
        store.userCustomItems.push(...data)
    }
}

function clearCategoriesCache() {
    localStorage.removeItem('vocabulary_cache')
    localStorage.removeItem('vocabulary_cache_timestamp')
}

async function logout() {
    await supabase.auth.signOut()
    store.currentUser = null
    store.wordStatusMap.clear()
    store.userCustomItems.length = 0
    clearCategoriesCache()
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
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
        alert('❌ Error: ' + error.message)
    } else {
        clearCategoriesCache()
        window.cerrarModalLogin()
        location.reload()
    }
}

async function signUpWithEmail() {
    const email = document.getElementById('signup-email')?.value
    const password = document.getElementById('signup-password')?.value
    if (!email || !password) { alert('❌ Ingresa email y contraseña'); return }
    if (password.length < 6) { alert('❌ La contraseña debe tener al menos 6 caracteres'); return }
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
        alert('❌ Error: ' + error.message)
    } else {
        clearCategoriesCache()
        alert('✅ Registro exitoso! Ahora inicia sesión.')
        document.getElementById('signup-email').value = ''
        document.getElementById('signup-password').value = ''
        window.mostrarLogin()
    }
}


export {
    checkUser, updateAuthUI, loadUserWordStatus,
    loadUserCustomItems, logout, loginWithEmail, signUpWithEmail
}

window.loginWithEmail = loginWithEmail
window.signUpWithEmail = signUpWithEmail
window.logout = logout