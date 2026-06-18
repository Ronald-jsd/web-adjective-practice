import {
    verbSortState, setSortState,
    verbPaginationState, setPaginationState,
    currentViewVerbs, verbsData
} from './verbs-state.js'

export function sortVerbs(data, column, direction) {
    if (!data || data.length === 0) return data

    return [...data].sort((a, b) => {
        const valA = String(a[column] || '').toLowerCase().trim()
        const valB = String(b[column] || '').toLowerCase().trim()

        if (valA < valB) return direction === 'asc' ? -1 : 1
        if (valA > valB) return direction === 'asc' ? 1 : -1
        return 0
    })
}

window.sortVerbsBy = async function (column) {
    if (verbSortState.column === column) {
        setSortState({ direction: verbSortState.direction === 'asc' ? 'desc' : 'asc' })
    } else {
        setSortState({ column, direction: 'asc' })
    }

    const { renderVerbTable } = await import('./verbs-render.js')

    const searchContainer = document.getElementById('verbs-search-results')
    const isSearch = searchContainer && !searchContainer.classList.contains('hidden')

    let dataToSort = []
    if (isSearch) {
        const query = document.getElementById('verbs-search-input')?.value?.toLowerCase().trim() || ''
        dataToSort = verbsData.filter(v =>
            (v.verb || '').toLowerCase().includes(query) ||
            (v.translation || '').toLowerCase().includes(query) ||
            (v.past_simple || '').toLowerCase().includes(query) ||
            (v.category || '').toLowerCase().includes(query)
        )
    } else {
        dataToSort = currentViewVerbs
    }

    const sorted = sortVerbs(dataToSort, verbSortState.column, verbSortState.direction)

    setPaginationState({
        currentData: sorted,
        totalItems: sorted.length,
        totalPages: Math.ceil(sorted.length / verbPaginationState.itemsPerPage),
        currentPage: 1
    })

    renderVerbTable(sorted)
}