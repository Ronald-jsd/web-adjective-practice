export { verbsData, verbCategories } from "./verbs-state.js";
export {
    loadVerbsFromSupabase,
    loadUserVerbProgress,
    saveVerbProgress,
} from "./verbs-loader.js";
export {
    renderVerbTable,
    renderVerbCategories,
    openVerbCategory,
} from "./verbs-render.js";

import "./verbs-pagination.js";
import "./verbs-sort.js";
import "./verbs-edit.js";
import "./verbs-search.js";
