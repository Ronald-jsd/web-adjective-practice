export let verbsData = []
export let verbCategories = []
export let currentViewVerbs = []
export let currentVerbCategory = null
export let isVerbEditing = false

export let verbPaginationState = {
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 15,
    totalItems: 0,
    currentData: []
}

export let verbSortState = {
    column: 'verb',
    direction: 'asc'
}

export function setVerbsData(data) { verbsData = data }
export function setVerbCategories(data) { verbCategories = data }
export function setCurrentViewVerbs(data) { currentViewVerbs = data }
export function setCurrentVerbCategory(val) { currentVerbCategory = val }
export function setIsVerbEditing(val) { isVerbEditing = val }
export function setPaginationState(updates) { Object.assign(verbPaginationState, updates) }
export function setSortState(updates) { Object.assign(verbSortState, updates) }