import { supabase } from './app.js'
import { saveToCache, loadFromCache, showToast } from './cache.js'
import { store } from './config.js'

async function loadCategoriesFromSupabase(forceRefresh = false) {
    console.log('Cargando datos...', forceRefresh ? '(actualización forzada)' : '(usando caché si está disponible)')
    if (!forceRefresh) {
        const cachedData = loadFromCache()
        if (cachedData) return cachedData
    }

    try {
        const { data: categories, error } = await supabase
            .from('categories')
            .select(`*, subcategories:subcategories(*, items:items(*))`)
            .order('display_order')

        if (error) {
            console.error('Error:', error)
            const cachedData = loadFromCache()
            if (cachedData) { showToast('Usando datos locales (sin conexión)', 'info'); return cachedData }
            return []
        }
        if (!categories || categories.length === 0) return []

        const transformedData = categories.map(cat => ({
            id: cat.id, title: cat.title, subtitle: cat.subtitle, icon: cat.icon, color: cat.color,
            subcategories: (cat.subcategories || [])
                .sort((a, b) => a.display_order - b.display_order)
                .map(sub => ({
                    id: sub.id, title: sub.title, color: sub.color,
                    items: (sub.items || [])
                        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                        .map(item => [item.word, item.pronunciation, item.spanish, item.example_en, item.example_es, item.id])
                }))
        }))

        saveToCache(transformedData)
        return transformedData
    } catch (err) {
        console.error('Error:', err)
        const cachedData = loadFromCache()
        if (cachedData) { showToast('Usando datos guardados (sin conexión)', 'info'); return cachedData }
        return []
    }
}

function renderCategories(data) {
    const grid = document.getElementById('categories-grid')
    const loading = document.getElementById('loading-indicator')
    const searchDiv = document.getElementById('search-results')
    const categoryView = document.getElementById('category-view')

    if (!grid) return

    grid.innerHTML = ''
    if (searchDiv) searchDiv.classList.add('hidden')
    if (categoryView) categoryView.classList.add('hidden')

    if (!data || data.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center py-12 text-gray-500">No hay categorías disponibles</div>'
        grid.classList.remove('hidden')
        if (loading) loading.classList.add('hidden')
        return
    }

    data.forEach(cat => {
        const card = document.createElement('div')
        card.className = 'category-card bg-white border border-gray-200 rounded-2xl p-5 cursor-pointer text-center hover:border-gray-300'
        card.onclick = () => {
            import('./category-view.js').then(module => {
                module.openCategoryView(cat)
            })
        }
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

export { loadCategoriesFromSupabase, renderCategories }