const SUPABASE_URL = 'https://vxxykjqufhgqgiwgwnbq.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_z0-YHnAuMXGFA2t2f-hKnQ_NZu2HGqB'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

let categoriesData = []
let currentSearchResults = []
let searchPaginationState = { currentPage: 1, totalPages: 1, itemsPerPage: 15 }
let currentModalData = null
let activeSubcatIndex = 0
let currentUtterance = null
let currentUser = null
let wordStatusMap = new Map()
let isEditing = false

const CACHE_KEY = 'vocabulary_cache'
const CACHE_TIMESTAMP_KEY = 'vocabulary_cache_timestamp'
const CACHE_DURATION = 24 * 60 * 60 * 1000

function saveToCache(data) {
    try {
        const cacheData = {
            data: data,
            timestamp: Date.now()
        }
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData))
        localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString())
        console.log('Datos guardados en caché local')
    } catch (error) {
        console.error('Error guardando en caché:', error)
    }
}

function loadFromCache() {
    try {
        const cached = localStorage.getItem(CACHE_KEY)
        if (!cached) return null
        
        const cacheData = JSON.parse(cached)
        const timestamp = parseInt(localStorage.getItem(CACHE_TIMESTAMP_KEY) || '0')
        const now = Date.now()
        
        if (now - timestamp < CACHE_DURATION) {
            console.log('Cargando datos desde caché local')
            return cacheData.data
        } else {
            console.log('Caché expirada, se cargarán datos frescos')
            localStorage.removeItem(CACHE_KEY)
            localStorage.removeItem(CACHE_TIMESTAMP_KEY)
            return null
        }
    } catch (error) {
        console.error('Error cargando caché:', error)
        return null
    }
}

function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.saving-toast')
    if (existingToast) existingToast.remove()
    
    const toast = document.createElement('div')
    toast.className = `saving-toast ${type}`
    toast.textContent = message
    document.body.appendChild(toast)
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease'
        setTimeout(() => toast.remove(), 300)
    }, 2000)
}

async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()
    currentUser = user
    updateAuthUI()
    if (user) {
        await loadUserWordStatus()
        await loadUserCustomItems()
    }
    return user
}

function updateAuthUI() {
    const authContainer = document.getElementById('auth-container')
    if (!authContainer) return

    if (currentUser) {
        authContainer.innerHTML = `
            <div class="flex items-center gap-2 md:gap-3">
                <span class="text-xs md:text-sm text-gray-600 hidden sm:block">${currentUser.email}</span>
                <button onclick="logout()" class="px-2 md:px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs md:text-sm hover:bg-red-600">
                    Salir
                </button>
            </div>
        `
    } else {
        authContainer.innerHTML = `
            <button onclick="abrirModalLogin()" class="px-3 md:px-4 py-1.5 md:py-2 bg-amber-500 text-white rounded-lg text-xs md:text-sm font-medium hover:bg-amber-600 transition-colors">
                🔐 Iniciar sesión
            </button>
        `
    }
}

window.abrirModalLogin = function () {
    const modalBody = document.getElementById('login-modal-body')
    if (modalBody) {
        modalBody.innerHTML = `
            <div id="login-form" class="p-4 space-y-4">
                <input type="email" id="login-email" placeholder="Email" autocomplete="off" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <input type="password" id="login-password" placeholder="Contraseña" autocomplete="off" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <button onclick="loginWithEmail()" class="w-full py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600">Iniciar sesión</button>
                <p class="text-center text-sm">¿No tienes cuenta? <a href="#" onclick="mostrarSignup()" class="text-amber-600">Regístrate</a></p>
            </div>
            <div id="signup-form" class="p-4 space-y-4 hidden">
                <input type="email" id="signup-email" placeholder="Email" autocomplete="off" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <input type="password" id="signup-password" placeholder="Contraseña" autocomplete="off" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <button onclick="signUpWithEmail()" class="w-full py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">Registrarse</button>
                <p class="text-center text-sm">¿Ya tienes cuenta? <a href="#" onclick="mostrarLogin()" class="text-amber-600">Inicia sesión</a></p>
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

    if (!email || !password) {
        alert('❌ Ingresa email y contraseña')
        return
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
        alert('❌ Error: ' + error.message)
    } else {
        cerrarModalLogin()
        location.reload()
    }
}

async function signUpWithEmail() {
    const email = document.getElementById('signup-email')?.value
    const password = document.getElementById('signup-password')?.value

    if (!email || !password) {
        alert('❌ Ingresa email y contraseña')
        return
    }

    if (password.length < 6) {
        alert('❌ La contraseña debe tener al menos 6 caracteres')
        return
    }

    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
        alert('❌ Error: ' + error.message)
    } else {
        alert('✅ Registro exitoso! Ahora inicia sesión.')
        document.getElementById('signup-email').value = ''
        document.getElementById('signup-password').value = ''
        mostrarLogin()
    }
}

async function logout() {
    await supabase.auth.signOut()
    currentUser = null
    wordStatusMap.clear()
    updateAuthUI()
    location.reload()
}

window.loginWithEmail = loginWithEmail
window.signUpWithEmail = signUpWithEmail
window.logout = logout

async function loadUserWordStatus() {
    if (!currentUser) return

    const { data, error } = await supabase
        .from('user_word_status')
        .select('item_id, status')
        .eq('user_id', currentUser.id)

    if (!error && data) {
        wordStatusMap.clear()
        data.forEach(item => {
            wordStatusMap.set(item.item_id.toString(), item.status)
        })
    }
}

async function updateWordStatus(itemId, status) {
    if (!currentUser) {
        alert('🔐 Inicia sesión para guardar tu progreso')
        return false
    }

    const currentStatus = wordStatusMap.get(itemId.toString()) || 0
    let newStatus
    
    if (currentStatus === status) {
        newStatus = 0
    } else {
        newStatus = status
    }

    const { error } = await supabase
        .from('user_word_status')
        .upsert({
            user_id: currentUser.id,
            item_id: parseInt(itemId),
            status: newStatus,
            updated_at: new Date()
        }, { onConflict: 'user_id, item_id' })

    if (error) {
        alert('❌ Error: ' + error.message)
        return false
    }

    if (newStatus === 0) {
        wordStatusMap.delete(itemId.toString())
    } else {
        wordStatusMap.set(itemId.toString(), newStatus)
    }

    const targetRow = document.querySelector(`tr[data-item-id="${itemId}"]`)

    if (targetRow) {
        const badgeContainer = targetRow.querySelector('.flex.items-center.gap-2.flex-wrap')
        if (badgeContainer) {
            const oldBadge = badgeContainer.querySelector('.inline-flex.items-center.px-2.py-0\\.5')
            if (oldBadge) oldBadge.remove()

            if (newStatus !== 0) {
                const statusBadge = getStatusBadge(newStatus)
                const wordSpan = badgeContainer.querySelector('.audio-clickable')
                if (wordSpan) {
                    wordSpan.insertAdjacentHTML('afterend', statusBadge)
                }
            }
        }

        const btnContainer = targetRow.querySelector('.flex.gap-1')
        if (btnContainer) {
            const btns = btnContainer.querySelectorAll('button')
            btns.forEach((btn, idx) => {
                const btnStatus = idx === 0 ? 1 : idx === 1 ? 2 : 3
                if (newStatus === btnStatus) {
                    if (btnStatus === 1) btn.className = 'px-2 py-1 text-xs rounded bg-yellow-500 text-white'
                    else if (btnStatus === 2) btn.className = 'px-2 py-1 text-xs rounded bg-green-500 text-white'
                    else btn.className = 'px-2 py-1 text-xs rounded bg-blue-500 text-white'
                } else {
                    btn.className = 'px-2 py-1 text-xs rounded bg-gray-200 hover:bg-yellow-200'
                }
            })
        }
    }

    if (newStatus === 0) {
        showToast(`Estado eliminado`, 'info')
    } else {
        const statusText = newStatus === 1 ? '📚 Por aprender' : newStatus === 2 ? '✅ Aprendido' : '⚠️ Poco importante'
        showToast(`Estado cambiado a: ${statusText}`, 'success')
    }

    return true
}

function getStatusBadge(status) {
    switch (status) {
        case 1: return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-200 text-yellow-800">📚 Por aprender</span>'
        case 2: return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-200 text-green-800">✅ Aprendido</span>'
        case 3: return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-200 text-blue-800">⚠️ Poco importante</span>'
        default: return ''
    }
}

let userCustomItems = []

async function loadUserCustomItems() {
    if (!currentUser) return

    const { data, error } = await supabase
        .from('user_custom_items')
        .select('*')
        .eq('user_id', currentUser.id)

    if (!error && data) {
        userCustomItems = data
    }
}

async function editCell(field, currentValue, item) {
    if (isEditing) return
    isEditing = true

    const fieldNames = {
        word: 'palabra',
        pronunciation: 'pronunciación',
        spanish: 'traducción',
        example_en: 'ejemplo en inglés',
        example_es: 'ejemplo en español'
    }

    const fieldName = fieldNames[field] || field

    const newValue = prompt(`Editar ${fieldName}:`, currentValue)

    if (newValue === null || newValue === currentValue) {
        isEditing = false
        return
    }

    if (!currentUser) {
        alert('🔐 Inicia sesión para editar')
        isEditing = false
        return
    }

    if (item && item.isCustom) {
        const updateData = {}
        updateData[field] = newValue

        const { error } = await supabase
            .from('user_custom_items')
            .update(updateData)
            .eq('id', item.id)
            .eq('user_id', currentUser.id)

        if (error) {
            alert('❌ Error: ' + error.message)
        } else {
            showToast('Editado correctamente', 'success')
            await loadUserCustomItems()
            if (currentModalData) {
                const newData = await loadCategoriesFromSupabase(true)
                categoriesData = newData
                const updatedCategory = categoriesData.find(c => c.id === currentModalData.id)
                if (updatedCategory) {
                    currentModalData = updatedCategory
                    openModalWithSidebar(currentModalData)
                }
            }
        }
    } else {
        const updateData = {}
        updateData[field] = newValue

        const { error } = await supabase
            .from('items')
            .update(updateData)
            .eq('id', item.id)

        if (error) {
            alert('❌ Error al editar: ' + error.message)
        } else {
            showToast('Palabra editada correctamente', 'success')
            const newData = await loadCategoriesFromSupabase(true)
            categoriesData = newData
            if (currentModalData) {
                const updatedCategory = categoriesData.find(c => c.id === currentModalData.id)
                if (updatedCategory) {
                    currentModalData = updatedCategory
                    openModalWithSidebar(currentModalData)
                }
            }
        }
    }

    isEditing = false
}

let cachedVoices = { en: null, es: null }
let voicesLoaded = false

function getBestVoice(lang) {
    const voices = window.speechSynthesis.getVoices()
    
    if (!voices.length) return null
    
    const enPriority = [
        'Google US English', 'Microsoft Jenny', 
        'Samantha', 'Google UK English Male', 'Microsoft David',
        'Alex', 'Microsoft Zira', 'Victoria', 'Karen', 
        
    ]
    
    const esPriority = [
        'Google español', 'Microsoft Helena', 'Mónica', 'Google español (España)',
        'Microsoft Sabina', 'Microsoft Pablo', 'Juan', 'Diego'
    ]
    
    const priorityList = lang === 'en' ? enPriority : esPriority
    const langPrefix = lang === 'en' ? 'en' : 'es'
    
    for (const name of priorityList) {
        const found = voices.find(v => v.name.includes(name))
        if (found) return found
    }
    
    const found = voices.find(v => v.lang.startsWith(langPrefix))
    if (found) return found
    
    return lang === 'en' 
        ? voices.find(v => v.lang.includes('en'))
        : voices.find(v => v.lang.includes('es'))
}

function playAudioEnhanced(text, lang = 'en') {
    if (!text || !window.speechSynthesis) {
        console.warn('No se puede reproducir: texto vacío o speechSynthesis no disponible')
        return
    }

    const cleanText = text.replace(/["""*]/g, '').trim()

    if (currentUtterance) {
        window.speechSynthesis.cancel()
    }

    currentUtterance = new SpeechSynthesisUtterance(cleanText)
    currentUtterance.lang = lang === 'en' ? 'en-US' : 'es-ES'
    currentUtterance.rate = 0.9  
    currentUtterance.pitch = 1.0  
    currentUtterance.volume = 1.0 

    const bestVoice = getBestVoice(lang)
    if (bestVoice) {
        currentUtterance.voice = bestVoice
        console.log(`Usando voz: ${bestVoice.name} (${bestVoice.lang})`)
    }

    window.speechSynthesis.speak(currentUtterance)
}

function debugVoices() {
    const voices = window.speechSynthesis.getVoices()
    console.log('=== VOCES DISPONIBLES ===')
    voices.forEach(voice => {
        console.log(`${voice.name} - ${voice.lang} - ${voice.localService ? 'Local' : 'Remota'}`)
    })
    console.log('========================')
}

function initVoices() {
    if (window.speechSynthesis.getVoices().length > 0) {
        debugVoices()
    } else {
        window.speechSynthesis.onvoiceschanged = () => {
            debugVoices()
        }
    }
}

window.playAudioFromGlobal = function (text, lang) {
    playAudioEnhanced(text, lang)
}

initVoices()

function makeClickableText(text, lang) {
    if (!text) return ''
    const escapedText = text.replace(/'/g, "\\'").replace(/"/g, '&quot;')
    return `<span class="audio-clickable cursor-pointer hover:text-amber-600 transition-colors inline-flex items-center gap-1" onclick="window.playAudioFromGlobal('${escapedText}', '${lang}')">
        <svg class="w-3.5 h-3.5 opacity-60 hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536H4v-4h1.586l3.414-3.414v10.828L5.586 15.536z"></path>
        </svg>
        ${text}
    </span>`
}

async function loadCategoriesFromSupabase(forceRefresh = false) {
    console.log('Cargando datos...', forceRefresh ? '(actualización forzada)' : '(usando caché si está disponible)')
    
    if (!forceRefresh) {
        const cachedData = loadFromCache()
        if (cachedData) {
            console.log('Usando datos cacheados')
            return cachedData
        }
    }
    
    try {
        const { data: categories, error } = await supabase
            .from('categories')
            .select(`*, subcategories:subcategories(*, items:items(*))`)
            .order('display_order')

        if (error) {
            console.error('Error:', error)
            const cachedData = loadFromCache()
            if (cachedData) {
                console.log('Error en red, usando caché como respaldo')
                showToast('Usando datos locales (sin conexión)', 'info')
                return cachedData
            }
            return []
        }

        if (!categories || categories.length === 0) {
            console.log('No hay categorías')
            return []
        }

        const transformedData = categories.map(cat => ({
            id: cat.id,
            title: cat.title,
            subtitle: cat.subtitle,
            icon: cat.icon,
            color: cat.color,
            subcategories: (cat.subcategories || [])
                .sort((a, b) => a.display_order - b.display_order)
                .map(sub => ({
                    id: sub.id,
                    title: sub.title,
                    color: sub.color,
                    items: (sub.items || [])
                        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                        .map(item => [
                            item.word, item.pronunciation, item.spanish, item.example_en, item.example_es,
                            item.id
                        ])
                }))
        }))
        
        saveToCache(transformedData)
        console.log('Datos frescos guardados en caché')
        return transformedData
    } catch (err) {
        console.error('Error:', err)
        const cachedData = loadFromCache()
        if (cachedData) {
            console.log('Error de conexión, usando caché')
            showToast('Usando datos guardados (sin conexión)', 'info')
            return cachedData
        }
        return []
    }
}

function renderCategories(data) {
    const grid = document.getElementById('categories-grid')
    const loading = document.getElementById('loading-indicator')
    const searchDiv = document.getElementById('search-results')

    if (!grid) return

    grid.innerHTML = ''
    if (searchDiv) searchDiv.classList.add('hidden')

    if (!data || data.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center py-12 text-gray-500">No hay categorías disponibles</div>'
        grid.classList.remove('hidden')
        if (loading) loading.classList.add('hidden')
        return
    }

    data.forEach(cat => {
        const card = document.createElement('div')
        card.className = 'category-card bg-white border border-gray-200 rounded-2xl p-5 cursor-pointer text-center hover:border-gray-300'
        card.onclick = () => openModalWithSidebar(cat)
        const totalItems = cat.subcategories.reduce((acc, sub) => acc + sub.items.length, 0)
        card.innerHTML = `
            <div class="text-4xl mb-2">${cat.icon || '📚'}</div>
            <h3 class="font-serif-oxford font-bold text-gray-900">${cat.title || 'Sin título'}</h3>
            <p class="text-xs text-gray-500 mt-1">${cat.subtitle || ''}</p>
            <div class="mt-3 inline-block px-3 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
                ${cat.subcategories.length} subcats • ${totalItems} términos
            </div>
        `
        grid.appendChild(card)
    })

    grid.classList.remove('hidden')
    if (loading) loading.classList.add('hidden')
}

async function saveItemOrder(items, subcategoryId) {
    if (!currentUser) return

    for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx]
        const itemId = item[5]
        const isCustom = itemId && itemId.toString().startsWith('custom_')

        if (isCustom) {
            const customId = item[6]
            await supabase
                .from('user_custom_items')
                .update({ sort_order: idx })
                .eq('id', customId)
                .eq('user_id', currentUser.id)
        } else {
            await supabase
                .from('items')
                .update({ sort_order: idx })
                .eq('id', parseInt(itemId))
        }
    }
}

function initDragAndDrop(tbody, allItems, subcategoryId, refreshCallback) {
    let dragState = {
        active: false,
        sourceIndex: null,
        targetIndex: null
    }

    function getRows() {
        return Array.from(tbody.querySelectorAll('tr'))
    }

    function clearHighlights() {
        getRows().forEach(row => {
            row.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging-source')
            row.style.opacity = ''
        })
    }

    function findTargetIndex(clientY) {
        const rows = getRows()
        for (let i = 0; i < rows.length; i++) {
            const rect = rows[i].getBoundingClientRect()
            if (clientY >= rect.top && clientY <= rect.bottom) {
                const midpoint = rect.top + rect.height / 2
                return { index: i, above: clientY < midpoint }
            }
        }
        if (rows.length > 0) {
            const lastRect = rows[rows.length - 1].getBoundingClientRect()
            if (clientY > lastRect.bottom) {
                return { index: rows.length - 1, above: false }
            }
        }
        return null
    }

    function onMove(clientY) {
        if (!dragState.active) return

        const found = findTargetIndex(clientY)
        if (!found) return

        clearHighlights()
        const rows = getRows()

        if (rows[dragState.sourceIndex]) {
            rows[dragState.sourceIndex].classList.add('dragging-source')
            rows[dragState.sourceIndex].style.opacity = '0.4'
        }

        let insertAtIndex = found.index
        if (!found.above) insertAtIndex = found.index + 1
        if (dragState.sourceIndex < insertAtIndex) insertAtIndex--

        dragState.targetIndex = insertAtIndex

        if (found.index !== dragState.sourceIndex) {
            rows[found.index].classList.add(found.above ? 'drag-over-top' : 'drag-over-bottom')
        }
    }

    async function endDrag() {
        if (!dragState.active) return
        dragState.active = false

        clearHighlights()
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', endDrag)
        document.removeEventListener('touchmove', onTouchMove)
        document.removeEventListener('touchend', endDrag)
        document.body.classList.remove('dragging')

        const src = dragState.sourceIndex
        const tgt = dragState.targetIndex

        if (src !== null && tgt !== null && src !== tgt && tgt >= 0 && tgt <= allItems.length) {
            showToast('Guardando orden...', 'info')
            const [movedItem] = allItems.splice(src, 1)
            allItems.splice(tgt, 0, movedItem)
            await saveItemOrder(allItems, subcategoryId)
            showToast('Orden guardado', 'success')
            refreshCallback([...allItems])
        }

        dragState.sourceIndex = null
        dragState.targetIndex = null
    }

    function onMouseMove(e) {
        e.preventDefault()
        onMove(e.clientY)
    }

    function onTouchMove(e) {
        e.preventDefault()
        onMove(e.touches[0].clientY)
    }

    function startDrag(index, clientY) {
        if (!currentUser) {
            showToast('Inicia sesión para reordenar', 'error')
            return
        }

        dragState.active = true
        dragState.sourceIndex = index
        dragState.targetIndex = index

        document.body.classList.add('dragging')
        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', endDrag)
        document.addEventListener('touchmove', onTouchMove, { passive: false })
        document.addEventListener('touchend', endDrag)
    }

    function setupHandles() {
        const rows = getRows()
        rows.forEach((row, idx) => {
            const handle = row.querySelector('.drag-handle')
            if (!handle) return

            const newHandle = handle.cloneNode(true)
            handle.parentNode.replaceChild(newHandle, handle)

            newHandle.addEventListener('mousedown', (e) => {
                e.preventDefault()
                startDrag(idx, e.clientY)
            })

            newHandle.addEventListener('touchstart', (e) => {
                e.preventDefault()
                startDrag(idx, e.touches[0].clientY)
            }, { passive: false })
        })
    }

    setupHandles()

    const observer = new MutationObserver(setupHandles)
    observer.observe(tbody, { childList: true })

    return () => observer.disconnect()
}

let currentSubcategoryId = null
let dragCleanup = null

function openModalWithSidebar(data) {
    if (!data) return

    currentModalData = data

    if (currentSubcategoryId === null) {
        activeSubcatIndex = 0
    } else {
        const foundIndex = data.subcategories.findIndex(sub => sub.id === currentSubcategoryId)
        activeSubcatIndex = foundIndex !== -1 ? foundIndex : 0
    }

    const titleEl = document.getElementById('modal-title')
    const subtitleEl = document.getElementById('modal-subtitle')
    const iconDiv = document.getElementById('modal-icon')

    if (titleEl) titleEl.textContent = data.title || ''
    if (subtitleEl) subtitleEl.textContent = data.subtitle || ''
    if (iconDiv) {
        iconDiv.textContent = data.icon || '📚'
        iconDiv.className = `p-2 rounded-xl text-2xl shadow-sm ${data.color || 'bg-gray-100'}`
    }

    const subcatCountSpan = document.getElementById('subcat-count')
    if (subcatCountSpan) subcatCountSpan.textContent = `(${data.subcategories.length})`

    const sidebarList = document.getElementById('subcategories-list')
    if (!sidebarList) return

    sidebarList.innerHTML = ''

    data.subcategories.forEach((sub, idx) => {
        const btn = document.createElement('button')
        btn.className = `w-full text-left px-4 py-2.5 text-sm transition-colors border-l-4 ${idx === activeSubcatIndex ? 'border-amber-500 bg-amber-50 text-amber-700 font-medium' : 'border-transparent hover:bg-gray-100 text-gray-700'}`
        btn.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="text-xs font-bold ${idx === activeSubcatIndex ? 'text-amber-500' : 'text-gray-400'}">${idx + 1}</span>
                <span class="truncate">${sub.title || 'Sin título'}</span>
            </div>
        `
        btn.onclick = () => {
            currentSubcategoryId = sub.id
            selectSubcategory(idx)
        }
        sidebarList.appendChild(btn)
    })

    function selectSubcategory(index) {
        activeSubcatIndex = index
        currentSubcategoryId = data.subcategories[index].id
        const btns = sidebarList.querySelectorAll('button')
        btns.forEach((btn, i) => {
            if (i === index) {
                btn.className = 'w-full text-left px-4 py-2.5 text-sm transition-colors border-l-4 border-amber-500 bg-amber-50 text-amber-700 font-medium'
                btn.innerHTML = `<div class="flex items-center gap-2"><span class="text-xs font-bold text-amber-500">${i + 1}</span><span class="truncate">${data.subcategories[i].title || 'Sin título'}</span></div>`
            } else {
                btn.className = 'w-full text-left px-4 py-2.5 text-sm transition-colors border-l-4 border-transparent hover:bg-gray-100 text-gray-700'
                btn.innerHTML = `<div class="flex items-center gap-2"><span class="text-xs font-bold text-gray-400">${i + 1}</span><span class="truncate">${data.subcategories[i].title || 'Sin título'}</span></div>`
            }
        })
        renderActiveContent()
    }

    function renderActiveContent(itemsOverride) {
        const sub = data.subcategories[activeSubcatIndex]
        if (!sub) return

        const allItems = itemsOverride ? [...itemsOverride] : [...sub.items]

        if (!itemsOverride && currentUser && userCustomItems.length > 0) {
            userCustomItems.forEach(customItem => {
                if (customItem.subcategory === sub.title || customItem.category === data.title) {
                    allItems.push([
                        customItem.word,
                        customItem.pronunciation || '',
                        customItem.spanish,
                        customItem.example_en || '',
                        customItem.example_es || '',
                        `custom_${customItem.id}`,
                        customItem.id
                    ])
                }
            })
        }

        function buildRows(items) {
            return items.map((item, idx) => {
                const itemId = item[5] || `${sub.id}-${idx}`
                const isCustom = itemId.toString().startsWith('custom_')
                const customId = isCustom ? item[6] : null
                const status = wordStatusMap.get(itemId.toString()) || 0
                const statusBadge = getStatusBadge(status)

                const itemObj = {
                    id: isCustom ? customId : item[5],
                    word: item[0],
                    pronunciation: item[1],
                    spanish: item[2],
                    example_en: item[3],
                    example_es: item[4],
                    isCustom,
                    subcategoryId: sub.id,
                    categoryId: data.id
                }

                const wordEn = makeClickableText(item[0], 'en')
                const wordEs = makeClickableText(item[2], 'es')
                const exampleEn = makeClickableText(item[3], 'en')
                const exampleEs = makeClickableText(item[4], 'es')

                const itemObjStr = JSON.stringify(itemObj).replace(/"/g, '&quot;')
                const escapedWord = item[0].replace(/'/g, "\\'")
                const escapedSpanish = item[2].replace(/'/g, "\\'")
                const escapedPronunciation = (item[1] || '').replace(/'/g, "\\'")
                const escapedExampleEn = (item[3] || '').replace(/'/g, "\\'")
                const escapedExampleEs = (item[4] || '').replace(/'/g, "\\'")

                const dragHandleHtml = currentUser
                    ? `<td class="py-2.5 px-1 border-b w-10 text-center">
                            <span class="drag-handle inline-flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-400 hover:text-amber-500 transition-all p-1 rounded hover:bg-gray-100">
                                <svg width="14" height="20" viewBox="0 0 10 18" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="2.5" cy="3" r="1.5"/>
                                    <circle cx="7.5" cy="3" r="1.5"/>
                                    <circle cx="2.5" cy="9" r="1.5"/>
                                    <circle cx="7.5" cy="9" r="1.5"/>
                                    <circle cx="2.5" cy="15" r="1.5"/>
                                    <circle cx="7.5" cy="15" r="1.5"/>
                                </svg>
                            </span>
                           </td>`
                    : ''

                return `
                    <tr data-item-id="${itemId}" class="${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors ${isCustom ? 'custom-row' : ''}">
                        ${dragHandleHtml}
                        <td class="py-2.5 px-3 border-b" ondblclick="editCell('word', '${escapedWord}', ${itemObjStr})">
                            <div class="flex items-center gap-2 flex-wrap">
                                ${wordEn}
                                ${statusBadge}
                                ${!isCustom ? '<span class="text-xs px-1 py-0.5 bg-blue-100 text-blue-700 rounded whitespace-nowrap">📚 DB</span>' : '<span class="text-xs px-1 py-0.5 bg-purple-100 text-purple-700 rounded whitespace-nowrap">✏️</span>'}
                            </div>
                        </td>
                        <td class="py-2.5 px-3 border-b" ondblclick="editCell('pronunciation', '${escapedPronunciation}', ${itemObjStr})">
                            <span class="text-xs text-gray-500 font-mono break-all">[${item[1] || ''}]</span>
                        </td>
                        <td class="py-2.5 px-3 border-b" ondblclick="editCell('spanish', '${escapedSpanish}', ${itemObjStr})">
                            ${wordEs}
                        </td>
                        <td class="py-2.5 px-3 border-b" ondblclick="editCell('example_en', '${escapedExampleEn}', ${itemObjStr})">
                            ${exampleEn}
                        </td>
                        <td class="py-2.5 px-3 border-b" ondblclick="editCell('example_es', '${escapedExampleEs}', ${itemObjStr})">
                            ${exampleEs}
                        </td>
                        ${currentUser ? `
                        <td class="py-2.5 px-3 border-b">
                            <div class="flex gap-1 flex-wrap">
                                <button onclick="event.stopPropagation(); updateWordStatus('${itemId}', 1)" class="px-2 py-1 text-xs rounded ${status === 1 ? 'bg-yellow-500 text-white' : 'bg-gray-200 hover:bg-yellow-200'}">📚</button>
                                <button onclick="event.stopPropagation(); updateWordStatus('${itemId}', 2)" class="px-2 py-1 text-xs rounded ${status === 2 ? 'bg-green-500 text-white' : 'bg-gray-200 hover:bg-green-200'}">✅</button>
                                <button onclick="event.stopPropagation(); updateWordStatus('${itemId}', 3)" class="px-2 py-1 text-xs rounded ${status === 3 ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-blue-200'}">⚠️</button>
                            </div>
                        </td>
                        ` : ''}
                    </tr>
                `
            }).join('')
        }

        const dragHandleHeader = currentUser ? '<th class="py-2 px-1 text-xs font-bold w-10"></th>' : ''
        const contentEl = document.getElementById('modal-content-active')
        if (contentEl) {
            contentEl.innerHTML = `
                <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div class="px-4 py-2 ${sub.color || 'bg-gray-700'} text-white font-bold text-sm flex items-center justify-between flex-wrap gap-2">
                        <span>${sub.title || 'Sin título'}</span>
                        <span class="text-xs opacity-80">🔊 Click | ✏️ Doble click${currentUser ? ' | ⋮⋮ Arrastrar' : ''}</span>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left">
                            <thead class="bg-gray-50 border-b">
                                <tr>
                                    ${dragHandleHeader}
                                    <th class="py-2 px-3 text-xs font-bold">Adjective 🔊</th>
                                    <th class="py-2 px-3 text-xs font-bold">Pronun.</th>
                                    <th class="py-2 px-3 text-xs font-bold">Español 🔊</th>
                                    <th class="py-2 px-3 text-xs font-bold">Example EN 🔊</th>
                                    <th class="py-2 px-3 text-xs font-bold">Example ES 🔊</th>
                                    ${currentUser ? '<th class="py-2 px-3 text-xs font-bold">Progreso</th>' : ''}
                                </tr>
                            </thead>
                            <tbody id="sortable-tbody">${buildRows(allItems)}</tbody>
                        </table>
                    </div>
                </div>
            `

            if (currentUser) {
                const tbodyEl = contentEl.querySelector('#sortable-tbody')
                if (tbodyEl) {
                    if (dragCleanup) dragCleanup()
                    dragCleanup = initDragAndDrop(tbodyEl, allItems, sub.id, (newItems) => {
                        renderActiveContent(newItems)
                    })
                }
            }
        }
    }

    selectSubcategory(activeSubcatIndex)
    const modalOverlay = document.getElementById('modal-overlay')
    if (modalOverlay) {
        modalOverlay.classList.remove('hidden')
        document.body.style.overflow = 'hidden'
    }
}

function performSearch(query) {
    if (!query?.trim()) {
        renderCategories(categoriesData)
        return
    }

    query = query.toLowerCase().trim()
    const results = []
    categoriesData.forEach(cat => {
        cat.subcategories.forEach(sub => {
            sub.items.forEach(item => {
                if (item[0].toLowerCase().includes(query) || item[2].toLowerCase().includes(query)) {
                    results.push({
                        category: cat.title,
                        subcategory: sub.title,
                        word: item[0],
                        pronunciation: item[1],
                        spanish: item[2],
                        example_en: item[3]
                    })
                }
            })
        })
    })

    if (currentUser && userCustomItems.length > 0) {
        userCustomItems.forEach(customItem => {
            if (customItem.word.toLowerCase().includes(query) || customItem.spanish.toLowerCase().includes(query)) {
                results.push({
                    category: '📝 Mis Expresiones',
                    subcategory: 'Personalizadas',
                    word: customItem.word,
                    pronunciation: customItem.pronunciation || '',
                    spanish: customItem.spanish,
                    example_en: customItem.example_en || ''
                })
            }
        })
    }

    currentSearchResults = results
    searchPaginationState.currentPage = 1
    searchPaginationState.totalPages = Math.ceil(results.length / 15)
    renderSearchResults()
}

function renderSearchResults() {
    const grid = document.getElementById('categories-grid')
    const searchDiv = document.getElementById('search-results')
    const tbody = document.getElementById('search-results-tbody')

    if (!grid || !searchDiv) return

    grid.classList.add('hidden')
    searchDiv.classList.remove('hidden')

    const countEl = document.getElementById('search-results-count')
    if (countEl) countEl.textContent = `Se encontraron ${currentSearchResults.length} resultados`

    const start = (searchPaginationState.currentPage - 1) * 15
    const pageResults = currentSearchResults.slice(start, start + 15)

    if (tbody) {
        tbody.innerHTML = pageResults.map(r => {
            const wordWithAudio = makeClickableText(r.word, 'en')
            const spanishWithAudio = makeClickableText(r.spanish, 'es')
            const exampleWithAudio = makeClickableText(r.example_en, 'en')

            return `
                <tr class="hover:bg-gray-50">
                    <td class="py-2.5 px-3 text-sm">${r.category || ''}</td>
                    <td class="py-2.5 px-3 text-sm">${r.subcategory || ''}</td>
                    <td class="py-2.5 px-3 font-bold">${wordWithAudio}</td>
                    <td class="py-2.5 px-3 text-xs font-mono text-gray-500">[${r.pronunciation || ''}]</td>
                    <td class="py-2.5 px-3">${spanishWithAudio}</td>
                    <td class="py-2.5 px-3 text-sm text-gray-600">${exampleWithAudio}</td>
                </tr>
            `
        }).join('')
    }

    const pagDiv = document.getElementById('search-pagination')
    if (pagDiv) {
        if (searchPaginationState.totalPages > 1) {
            pagDiv.innerHTML = `
                <button id="prev-page" ${searchPaginationState.currentPage === 1 ? 'disabled' : ''} class="px-3 py-1.5 border rounded-md disabled:opacity-50">← Anterior</button>
                <span>Página ${searchPaginationState.currentPage} de ${searchPaginationState.totalPages}</span>
                <button id="next-page" ${searchPaginationState.currentPage === searchPaginationState.totalPages ? 'disabled' : ''} class="px-3 py-1.5 border rounded-md disabled:opacity-50">Siguiente →</button>
            `
            document.getElementById('prev-page')?.addEventListener('click', () => { if (searchPaginationState.currentPage > 1) { searchPaginationState.currentPage--; renderSearchResults() } })
            document.getElementById('next-page')?.addEventListener('click', () => { if (searchPaginationState.currentPage < searchPaginationState.totalPages) { searchPaginationState.currentPage++; renderSearchResults() } })
        } else {
            pagDiv.innerHTML = ''
        }
    }
}

function closeModal() {
    const modalOverlay = document.getElementById('modal-overlay')
    if (modalOverlay) {
        modalOverlay.classList.add('hidden')
        document.body.style.overflow = ''
    }
    if (dragCleanup) {
        dragCleanup()
        dragCleanup = null
    }
}

const searchInput = document.getElementById('global-search')
const clearBtn = document.getElementById('clear-search')
const backBtn = document.getElementById('back-to-categories')

if (searchInput) {
    searchInput.value = ''
    searchInput.addEventListener('input', (e) => {
        if (clearBtn) clearBtn.classList.toggle('hidden', !e.target.value)
        performSearch(e.target.value)
    })
}
if (clearBtn) {
    clearBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = ''
        clearBtn.classList.add('hidden')
        renderCategories(categoriesData)
    })
}
if (backBtn) {
    backBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = ''
        if (clearBtn) clearBtn.classList.add('hidden')
        renderCategories(categoriesData)
    })
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal() })

window.closeModal = closeModal
window.editCell = editCell
window.updateWordStatus = updateWordStatus

async function init() {
    await checkUser()
    const data = await loadCategoriesFromSupabase()
    categoriesData = data
    renderCategories(categoriesData)
}

init()