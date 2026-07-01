// data.js - VERSIÓN CORREGIDA
import { supabase } from './app.js'
import { saveToCache, loadFromCache, showToast } from './cache.js'
import { store } from './config.js'

async function loadCategoriesFromSupabase(forceRefresh = false) {
    console.log('🔄 Cargando datos...')
    console.log('🔍 store.currentUser:', store.currentUser)

    if (!forceRefresh) {
        const cachedData = loadFromCache()
        if (cachedData) {
            console.log('📦 Usando caché')
            return cachedData
        }
    }

    try {
        const { data: categories, error } = await supabase
            .from('categories')
            .select(`*, subcategories:subcategories(*, items:items(*))`)
            .order('display_order')

        if (error) {
            console.error('❌ Error:', error)
            const cachedData = loadFromCache()
            if (cachedData) return cachedData
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
                        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                        .map(item => [item.word, item.pronunciation, item.spanish, item.example_en, item.example_es, item.id])
                }))
        }))

        console.log('✅ Categorías cargadas:', transformedData.length)

        if (store.currentUser) {
            console.log('👤 Cargando items para usuario:', store.currentUser.id)

            try {
                const { data: customItems, error: customError } = await supabase
                    .from('user_custom_items')
                    .select('*')
                    .eq('user_id', store.currentUser.id)
                    .order('created_at', { ascending: false })

                if (customError) {
                    console.error('❌ Error:', customError)
                }

                console.log(`📦 Items personalizados encontrados: ${customItems?.length || 0}`)

                const grammarCat = transformedData.find(c => c.id === 'grammar')

                if (grammarCat) {
                    let misExp = grammarCat.subcategories.find(s => s.id === 3012)

                    if (!misExp) {
                        misExp = {
                            id: 3012,
                            title: '📝 Mis Expresiones',
                            color: 'bg-purple-100',
                            items: []
                        }
                        grammarCat.subcategories.push(misExp)
                        console.log('✅ Subcategoría creada')
                    }

                    if (customItems && customItems.length > 0) {
                        const formattedItems = customItems.map(item => [
                            item.word || '',
                            item.pronunciation || '',
                            item.spanish || '',
                            item.example_en || '',
                            item.example_es || '',
                            `custom_${item.id}`,
                            item.id
                        ])

                        misExp.items = formattedItems
                        console.log(`✅ ${formattedItems.length} items asignados a "Mis Expresiones"`)
                    } else {
                        misExp.items = []
                        console.log('📭 No hay items personalizados')
                    }

                    console.log(`📊 FINAL - Items en Mis Expresiones: ${misExp.items.length}`)
                }
            } catch (err) {
                console.error('❌ Error:', err)
            }
        } else {
            console.log('👤 Usuario NO logueado - store.currentUser es null')
        }

        saveToCache(transformedData)
        return transformedData

    } catch (err) {
        console.error('❌ Error general:', err)
        const cachedData = loadFromCache()
        if (cachedData) {
            showToast('Usando datos locales (sin conexión)', 'info')
            return cachedData
        }
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
        card.className = 'category-card bg-white border border-gray-200 rounded-2xl p-5 cursor-pointer text-center hover:border-gray-300 transition-all'
        card.onclick = () => {
            import('./category-view.js').then(module => {
                module.openCategoryView(cat)
            })
        }
        const totalItems = cat.subcategories.reduce((acc, sub) => acc + sub.items.length, 0)

        const hasCustomSub = cat.subcategories.some(sub =>
            sub.id === 3012 && sub.items.length > 0
        )

        let customCount = 0
        if (hasCustomSub) {
            const misExp = cat.subcategories.find(sub => sub.id === 3012)
            customCount = misExp ? misExp.items.length : 0
        }

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

export { loadCategoriesFromSupabase, renderCategories }