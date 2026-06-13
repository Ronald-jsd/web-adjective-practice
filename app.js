const SUPABASE_URL = 'https://vxxykjqufhgqgiwgwnbq.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_z0-YHnAuMXGFA2t2f-hKnQ_NZu2HGqB'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

let categoriesData = []
let currentSearchResults = []
let searchPaginationState = { currentPage: 1, totalPages: 1, itemsPerPage: 15 }
let currentModalData = null
let activeSubcatIndex = 0

// ============================================
// FUNCIÓN PARA REPRODUCIR AUDIO CON WEB SPEECH API (NATIVA)
// ============================================
let currentUtterance = null

function playAudio(text, lang = 'en') {
    if (!text || !window.speechSynthesis) {
        console.warn('Text-to-Speech no soportado en este navegador')
        return
    }
    
    let cleanText = text.replace(/[“”"*]/g, '').trim()
    
    if (currentUtterance) {
        window.speechSynthesis.cancel()
    }
    
    currentUtterance = new SpeechSynthesisUtterance(cleanText)
    
    currentUtterance.lang = lang === 'en' ? 'en-US' : 'es-ES'
    currentUtterance.rate = 0.9  
    currentUtterance.pitch = 1   
    currentUtterance.volume = 1 
    
    window.speechSynthesis.speak(currentUtterance)
    
    currentUtterance.onerror = (event) => {
        console.error('Error reproduciendo audio:', event)
    }
}

// ============================================
// FUNCIÓN PARA CREAR CELDAS CON CLICK DE AUDIO
// ============================================
function makeClickableText(text, lang) {
    if (!text) return ''
    // Escapar caracteres especiales para el onclick
    const escapedText = text.replace(/'/g, "\\'").replace(/"/g, '&quot;')
    return `<span class="audio-clickable cursor-pointer hover:text-amber-600 transition-colors inline-flex items-center gap-1" onclick="window.playAudioFromGlobal('${escapedText}', '${lang}')">
        <svg class="w-3.5 h-3.5 opacity-60 hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536H4v-4h1.586l3.414-3.414v10.828L5.586 15.536z"></path>
        </svg>
        ${text}
    </span>`
}

window.playAudioFromGlobal = function(text, lang) {
    playAudio(text, lang)
}

// ============================================
// CARGAR DATOS DESDE SUPABASE
// ============================================
async function loadCategoriesFromSupabase() {
    console.log('Cargando datos...')
    const { data: categories, error } = await supabase
        .from('categories')
        .select(`*, subcategories:subcategories(*, items:items(*))`)
        .order('display_order')
    
    if (error) {
        console.error('Error:', error)
        return []
    }
    
    return categories.map(cat => ({
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
                items: (sub.items || []).map(item => [
                    item.word, item.pronunciation, item.spanish, item.example_en, item.example_es
                ])
            }))
    }))
}

// ============================================
// RENDERIZAR CATEGORÍAS
// ============================================
function renderCategories(data) {
    const grid = document.getElementById('categories-grid')
    const loading = document.getElementById('loading-indicator')
    const searchDiv = document.getElementById('search-results')
    
    grid.innerHTML = ''
    searchDiv.classList.add('hidden')
    
    if (!data?.length) {
        grid.innerHTML = '<div class="col-span-full text-center py-12 text-gray-500">No hay categorías</div>'
        grid.classList.remove('hidden')
        loading.classList.add('hidden')
        return
    }
    
    data.forEach(cat => {
        const card = document.createElement('div')
        card.className = 'category-card bg-white border border-gray-200 rounded-2xl p-5 cursor-pointer text-center hover:border-gray-300'
        card.onclick = () => openModalWithSidebar(cat)
        const totalItems = cat.subcategories.reduce((acc, sub) => acc + sub.items.length, 0)
        card.innerHTML = `
            <div class="text-4xl mb-2">${cat.icon}</div>
            <h3 class="font-serif-oxford font-bold text-gray-900">${cat.title}</h3>
            <p class="text-xs text-gray-500 mt-1">${cat.subtitle}</p>
            <div class="mt-3 inline-block px-3 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
                ${cat.subcategories.length} subcats • ${totalItems} términos
            </div>
        `
        grid.appendChild(card)
    })
    
    grid.classList.remove('hidden')
    loading.classList.add('hidden')
}

// ============================================
// MODAL CON SIDEBAR (CON AUDIO)
// ============================================
function openModalWithSidebar(data) {
    currentModalData = data
    activeSubcatIndex = 0
    
    document.getElementById('modal-title').textContent = data.title
    document.getElementById('modal-subtitle').textContent = data.subtitle
    const iconDiv = document.getElementById('modal-icon')
    iconDiv.textContent = data.icon
    iconDiv.className = `p-2 rounded-xl text-2xl shadow-sm ${data.color}`
    
    const subcatCountSpan = document.getElementById('subcat-count')
    subcatCountSpan.textContent = `(${data.subcategories.length})`
    
    const sidebarList = document.getElementById('subcategories-list')
    sidebarList.innerHTML = ''
    
    data.subcategories.forEach((sub, idx) => {
        const btn = document.createElement('button')
        btn.className = `w-full text-left px-4 py-2.5 text-sm transition-colors border-l-4 ${idx === activeSubcatIndex ? 'border-amber-500 bg-amber-50 text-amber-700 font-medium' : 'border-transparent hover:bg-gray-100 text-gray-700'}`
        btn.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="text-xs font-bold ${idx === activeSubcatIndex ? 'text-amber-500' : 'text-gray-400'}">${idx + 1}</span>
                <span class="truncate">${sub.title}</span>
            </div>
        `
        btn.onclick = () => selectSubcategory(idx)
        sidebarList.appendChild(btn)
    })
    
    function selectSubcategory(index) {
        activeSubcatIndex = index
        const btns = sidebarList.querySelectorAll('button')
        btns.forEach((btn, i) => {
            if (i === index) {
                btn.className = 'w-full text-left px-4 py-2.5 text-sm transition-colors border-l-4 border-amber-500 bg-amber-50 text-amber-700 font-medium'
                btn.innerHTML = `<div class="flex items-center gap-2"><span class="text-xs font-bold text-amber-500">${i + 1}</span><span class="truncate">${data.subcategories[i].title}</span></div>`
            } else {
                btn.className = 'w-full text-left px-4 py-2.5 text-sm transition-colors border-l-4 border-transparent hover:bg-gray-100 text-gray-700'
                btn.innerHTML = `<div class="flex items-center gap-2"><span class="text-xs font-bold text-gray-400">${i + 1}</span><span class="truncate">${data.subcategories[i].title}</span></div>`
            }
        })
        renderActiveContent()
    }
    
    function renderActiveContent() {
        const sub = data.subcategories[activeSubcatIndex]
        if (!sub) return
        
        let rowsHtml = ''
        sub.items.forEach((item, idx) => {
            const wordEn = makeClickableText(item[0], 'en')
            const wordEs = makeClickableText(item[2], 'es')
            const exampleEn = makeClickableText(item[3], 'en')
            const exampleEs = makeClickableText(item[4], 'es')
            
            rowsHtml += `
                <tr class="${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors">
                    <td class="py-2.5 px-3 border-b">${wordEn}</td>
                    <td class="py-2.5 px-3 border-b"><span class="text-xs text-gray-500 font-mono">[${item[1]}]</span></td>
                    <td class="py-2.5 px-3 border-b">${wordEs}</td>
                    <td class="py-2.5 px-3 border-b">${exampleEn}</td>
                    <td class="py-2.5 px-3 border-b">${exampleEs}</td>
                </tr>
            `
        })
        
        document.getElementById('modal-content-active').innerHTML = `
            <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div class="px-4 py-2 ${sub.color} text-white font-bold text-sm flex items-center justify-between">
                    <span>${sub.title}</span>
                    <span class="text-xs opacity-80">🔊 Haz clic en cualquier palabra para escuchar</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left min-w-[700px]">
                        <thead class="bg-gray-50 border-b">
                            <tr>
                                <th class="py-2 px-3 text-xs font-bold">Adjective <span class="text-amber-500">🔊</span></th>
                                <th class="py-2 px-3 text-xs font-bold">Pronun.</th>
                                <th class="py-2 px-3 text-xs font-bold">Español <span class="text-amber-500">🔊</span></th>
                                <th class="py-2 px-3 text-xs font-bold">Example (EN) <span class="text-amber-500">🔊</span></th>
                                <th class="py-2 px-3 text-xs font-bold">Example (ES) <span class="text-amber-500">🔊</span></th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            </div>
        `
    }
    
    renderActiveContent()
    document.getElementById('modal-overlay').classList.remove('hidden')
    document.body.style.overflow = 'hidden'
}

// ============================================
// BÚSQUEDA CON AUDIO
// ============================================
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
    
    currentSearchResults = results
    searchPaginationState.currentPage = 1
    searchPaginationState.totalPages = Math.ceil(results.length / 15)
    renderSearchResults()
}

function renderSearchResults() {
    const grid = document.getElementById('categories-grid')
    const searchDiv = document.getElementById('search-results')
    const tbody = document.getElementById('search-results-tbody')
    
    grid.classList.add('hidden')
    searchDiv.classList.remove('hidden')
    document.getElementById('search-results-count').textContent = `Se encontraron ${currentSearchResults.length} resultados`
    
    const start = (searchPaginationState.currentPage - 1) * 15
    const pageResults = currentSearchResults.slice(start, start + 15)
    
    tbody.innerHTML = pageResults.map(r => {
        const wordWithAudio = makeClickableText(r.word, 'en')
        const spanishWithAudio = makeClickableText(r.spanish, 'es')
        const exampleWithAudio = makeClickableText(r.example_en, 'en')
        
        return `
            <tr class="hover:bg-gray-50">
                <td class="py-2.5 px-3 text-sm">${r.category}</td>
                <td class="py-2.5 px-3 text-sm">${r.subcategory}</td>
                <td class="py-2.5 px-3 font-bold">${wordWithAudio}</td>
                <td class="py-2.5 px-3 text-xs font-mono text-gray-500">[${r.pronunciation}]</td>
                <td class="py-2.5 px-3">${spanishWithAudio}</td>
                <td class="py-2.5 px-3 text-sm text-gray-600">${exampleWithAudio}</td>
            </tr>
        `
    }).join('')
    
    const pagDiv = document.getElementById('search-pagination')
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

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden')
    document.body.style.overflow = ''
}

// ============================================
// INICIALIZAR EVENTOS
// ============================================
const searchInput = document.getElementById('global-search')
const clearBtn = document.getElementById('clear-search')
const backBtn = document.getElementById('back-to-categories')

searchInput.addEventListener('input', (e) => { clearBtn.classList.toggle('hidden', !e.target.value); performSearch(e.target.value) })
clearBtn.addEventListener('click', () => { searchInput.value = ''; clearBtn.classList.add('hidden'); renderCategories(categoriesData) })
backBtn.addEventListener('click', () => { searchInput.value = ''; clearBtn.classList.add('hidden'); renderCategories(categoriesData) })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal() })
window.closeModal = closeModal

// ============================================
// INICIAR APLICACIÓN
// ============================================
const data = await loadCategoriesFromSupabase()
categoriesData = data
renderCategories(categoriesData)