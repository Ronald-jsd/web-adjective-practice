export const SUPABASE_URL = 'https://vxxykjqufhgqgiwgwnbq.supabase.co'
export const SUPABASE_ANON_KEY = 'sb_publishable_z0-YHnAuMXGFA2t2f-hKnQ_NZu2HGqB'

export const GEMINI_KEY_STORAGE = 'user_gemini_api_key'
export const GROQ_KEY_STORAGE = 'user_groq_api_key'
export const AI_PROVIDER_STORAGE = 'preferred_ai_provider'

export const CACHE_KEY = 'vocabulary_cache'
export const CACHE_TIMESTAMP_KEY = 'vocabulary_cache_timestamp'
export const CACHE_DURATION = 24 * 60 * 60 * 1000

export const store = {
    categoriesData: [],
    currentSearchResults: [],
    searchPaginationState: { currentPage: 1, totalPages: 1, itemsPerPage: 15 },
    currentCategoryData: null,
    activeSubcatIndex: 0,
    currentUtterance: null,
    currentUser: null,
    wordStatusMap: new Map(),
    isEditing: false,
    lastSearchQuery: '',
    currentAIData: null,
    userCustomItems: [],
    currentSubcategoryId: null,
    dragCleanup: null
}

export function resetStore() {
    store.categoriesData = []
    store.currentSearchResults = []
    store.searchPaginationState = { currentPage: 1, totalPages: 1, itemsPerPage: 15 }
    store.currentCategoryData = null
    store.activeSubcatIndex = 0
    store.currentUtterance = null
    store.currentUser = null
    store.wordStatusMap = new Map()
    store.isEditing = false
    store.lastSearchQuery = ''
    store.currentAIData = null
    store.userCustomItems = []
    store.currentSubcategoryId = null
    store.dragCleanup = null
}