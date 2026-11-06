import { supabase } from './app.js'
import { saveToCache, loadFromCache, showToast } from './cache.js'
import { store } from './config.js'
import { showLoading, hideLoading } from './ui-status.js'
import { cacheSnapshot, readSnapshot, readCachedRows, cacheRowsPreservingPending, TABLES } from './offline/cache.js'

async function readLocalCategories() {
    return loadFromCache() || await readSnapshot('categories') || null
}

function normalizeTitle(value) {
    return String(value ?? '').trim().toLowerCase()
}

function formatCustomItem(item) {
    return [
        item.word || '',
        item.pronunciation || '',
        item.spanish || '',
        item.example_en || '',
        item.example_es || '',
        `custom_${item.id}`,
        item.id,
        item.sort_order || 0
    ]
}

function findCategory(categories, value) {
    if (value === null || value === undefined || value === '') return null
    const key = normalizeTitle(value)
    return categories.find(category =>
        String(category.id) === String(value) || normalizeTitle(category.title) === key
    ) || null
}

function findSubcategory(category, value) {
    if (!category || value === null || value === undefined || value === '') return null
    const key = normalizeTitle(value)
    return (category.subcategories || []).find(subcategory =>
        String(subcategory.id) === String(value) || normalizeTitle(subcategory.title) === key
    ) || null
}

function getOrCreateMisExpresiones(category) {
    let subcategory = (category.subcategories || []).find(sub => sub.id === 3012)
    if (!subcategory) {
        subcategory = {
            id: 3012,
            title: '📝 Mis Expresiones',
            color: 'bg-purple-100',
            items: []
        }
        category.subcategories.push(subcategory)
    }
    return subcategory
}

/* Coloca las tarjetas personales en la categoría/subcategoría elegida al
 * guardarlas. Antes todas se amontonaban en "Mis Expresiones", así que una
 * palabra creada con IA no aparecía en la categoría que el usuario eligió. */
function mergeCustomItemsIntoCategories(categories, customItems, options = {}) {
    if (!Array.isArray(categories)) return categories
    const replace = options.replace !== false
    if (!replace && (!customItems || customItems.length === 0)) return categories

    // Quita las tarjetas personales de la copia anterior para no duplicarlas.
    for (const category of categories) {
        for (const subcategory of category.subcategories || []) {
            subcategory.items = (subcategory.items || []).filter(item =>
                !String(item?.[5] ?? '').startsWith('custom_')
            )
        }
    }

    if (!customItems || customItems.length === 0) return categories

    const grammarCategory = categories.find(category => category.id === 'grammar') || categories[0]

    for (const item of customItems) {
        const category = findCategory(categories, item.category) || grammarCategory
        if (!category) continue

        let subcategory = findSubcategory(category, item.subcategory)
        // El vocabulario de "Mi aprendizaje" se sigue mostrando en
        // "Mis Expresiones" para no romper la vista existente.
        if (!subcategory && normalizeTitle(item.subcategory) === 'mi vocabulario') {
            subcategory = getOrCreateMisExpresiones(grammarCategory || category)
        }
        if (!subcategory) {
            subcategory = getOrCreateMisExpresiones(category)
        }

        subcategory.items = subcategory.items || []
        subcategory.items.push(formatCustomItem(item))
    }

    return categories
}

async function withLocalCustomItems(categories) {
    if (!categories || !store.currentUser) return categories
    const customItems = await readCachedRows(
        TABLES.customItems,
        row => row.user_id === store.currentUser.id
    )
    if (!customItems.length) return categories

    mergeCustomItemsIntoCategories(categories, customItems, { replace: false })
    saveToCache(categories)
    await cacheSnapshot('categories', categories)
    return categories
}

async function loadCategoriesFromSupabase(forceRefresh = false, options = {}) {
    console.log('Cargando datos...')

    if (options.preferSnapshot) {
        const snapshot = await readSnapshot('categories')
        if (snapshot) {
            console.log('Usando copia local actualizada')
            return withLocalCustomItems(snapshot)
        }
    }

    if (!forceRefresh) {
        const cachedData = loadFromCache()
        if (cachedData) {
            console.log('Usando caché')
            return withLocalCustomItems(cachedData)
        }

        // Sin caché reciente se usa la copia persistente para no bloquear la
        // interfaz; la actualización desde la nube se hace en segundo plano.
        const snapshot = await readSnapshot('categories')
        if (snapshot) {
            console.log('Usando copia local')
            return withLocalCustomItems(snapshot)
        }
    }

    if (!options.silent) {
        showLoading('loading-indicator', 'Cargando datos...')
    }

    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 15000)
        let categories
        let error
        try {
            ({ data: categories, error } = await supabase
                .from('categories')
                .select(`*, subcategories:subcategories(*, items:items(*))`)
                .order('display_order')
                .abortSignal(controller.signal))
        } finally {
            clearTimeout(timeoutId)
        }

        if (error) {
            console.error('❌ Error:', error)
            const cachedData = await readLocalCategories()
            if (cachedData) return withLocalCustomItems(cachedData)
            return []
        }

        const transformedData = (categories || []).map(cat => ({
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
                        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                        .map(item => [
                            item.word, 
                            item.pronunciation, 
                            item.spanish, 
                            item.example_en, 
                            item.example_es, 
                            item.id,
                            item.sort_order || 0
                        ])
                }))
        }))

        console.log('✅ Categorías cargadas:', transformedData.length)

        if (store.currentUser) {
            console.log('👤 Cargando items para usuario:', store.currentUser.id)

            try {
                const customController = new AbortController()
                const customTimeoutId = setTimeout(() => customController.abort(), 10000)
                let networkCustomItems = null
                let customError = null
                try {
                    ({ data: networkCustomItems, error: customError } = await supabase
                        .from('user_custom_items')
                        .select('*')
                        .eq('user_id', store.currentUser.id)
                        .order('sort_order', { ascending: true })
                        .abortSignal(customController.signal))
                } finally {
                    clearTimeout(customTimeoutId)
                }

                let customItems = networkCustomItems

                if (customError) {
                    console.error('❌ Error:', customError)
                    customItems = await readCachedRows(
                        TABLES.customItems,
                        row => row.user_id === store.currentUser.id
                    )
                } else {
                    // Refresca el espejo local; conserva los cambios que aún
                    // están pendientes de subir.
                    customItems = await cacheRowsPreservingPending(
                        TABLES.customItems,
                        (networkCustomItems || []).map(row => ({
                            ...row,
                            user_id: store.currentUser.id
                        }))
                    )
                }

                console.log(`📦 Items personalizados encontrados: ${customItems?.length || 0}`)
                mergeCustomItemsIntoCategories(transformedData, customItems, { replace: true })
            } catch (err) {
                console.error('❌ Error:', err)
                const customItems = await readCachedRows(
                    TABLES.customItems,
                    row => row.user_id === store.currentUser.id
                )
                mergeCustomItemsIntoCategories(transformedData, customItems, { replace: false })
            }
        } else {
            console.log('👤 Usuario NO logueado - store.currentUser es null')
        }

        saveToCache(transformedData)
        await cacheSnapshot('categories', transformedData)
        return transformedData

    } catch (err) {
        console.error('❌ Error general:', err)
        const cachedData = await readLocalCategories()
        if (cachedData) {
            if (!options.silent) showToast('Usando datos locales (sin conexión)', 'info')
            return withLocalCustomItems(cachedData)
        }
        return []
    } finally {
        if (!options.silent) hideLoading('loading-indicator')
    }
}

/* Aplica un cambio local a la copia de categorías y la guarda.
 * Se usa después de editar, borrar o reordenar sin esperar a la nube. */
async function updateCachedCategories(mutator) {
    const snapshot = (await readSnapshot('categories')) || loadFromCache() || store.categoriesData
    if (!snapshot) return null
    mutator(snapshot)
    await cacheSnapshot('categories', snapshot)
    saveToCache(snapshot)
    return snapshot
}

/* Reconstruye la vista de categorías usando el espejo local de las tarjetas
 * personales. Es instantáneo y evita descargar todas las categorías cada vez
 * que se guarda, edita o elimina una palabra propia. */
async function refreshCategoriesFromLocalCustomItems() {
    const base = (await readSnapshot('categories')) || loadFromCache() || store.categoriesData
    if (!base) return store.categoriesData

    const customItems = store.currentUser
        ? await readCachedRows(TABLES.customItems, row => row.user_id === store.currentUser.id)
        : []

    mergeCustomItemsIntoCategories(base, customItems, { replace: true })
    saveToCache(base)
    await cacheSnapshot('categories', base)
    store.categoriesData = base

    const searchDiv = document.getElementById('search-results')
    const categoryView = document.getElementById('category-view')

    if (searchDiv && !searchDiv.classList.contains('hidden')) {
        window.refreshSearchResults?.()
    } else if (categoryView && !categoryView.classList.contains('hidden') && store.currentCategoryData) {
        const updatedCategory = base.find(category =>
            String(category.id) === String(store.currentCategoryData.id)
        )
        if (updatedCategory) {
            store.currentCategoryData = updatedCategory
            const { openCategoryView } = await import('./category-view.js')
            openCategoryView(updatedCategory)
        }
    } else {
        renderCategories(base)
    }

    return base
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
        card.className = 'category-card bg-white border border-gray-200 rounded-2xl p-5 cursor-pointer text-center hover:border-gray-300 transition-all'
        card.onclick = () => {
            import('./category-view.js').then(module => {
                module.openCategoryView(cat)
            })
        }
        const totalItems = cat.subcategories.reduce((acc, sub) => acc + sub.items.length, 0)

        const customCount = cat.subcategories.reduce((acc, sub) =>
            acc + (sub.items || []).filter(item =>
                String(item?.[5] ?? '').startsWith('custom_')
            ).length, 0)
        const hasCustomSub = customCount > 0

        card.innerHTML = `
            <div class="text-4xl mb-2">${cat.icon || '📚'}</div>
            <h3 class="font-serif-oxford font-bold text-gray-900">${cat.title || 'Sin título'}</h3>
            <p class="text-xs text-gray-500 mt-1">${cat.subtitle || ''}</p>
            <div class="mt-3 inline-block px-3 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
                ${cat.subcategories.length} subcats • ${totalItems} términos
                ${hasCustomSub ? `<span class="ml-2 text-purple-600">✏️ +${customCount} personal</span>` : ''}
            </div>
        `
        grid.appendChild(card)
    })

    grid.classList.remove('hidden')
    if (loading) loading.classList.add('hidden')
}

export { loadCategoriesFromSupabase, renderCategories, updateCachedCategories, refreshCategoriesFromLocalCustomItems }