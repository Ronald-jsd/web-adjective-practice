/* Listas explícitas de columnas usadas por la app.
 *
 * Evita `select('*')` sobre tablas grandes: PostgREST devuelve menos bytes y
 * el índice puede cubrir la consulta. Si se empieza a usar una columna nueva
 * hay que añadirla aquí. */

export const CATEGORY_COLUMNS = "id,title,subtitle,icon,color,display_order"
export const SUBCATEGORY_COLUMNS = "id,title,color,display_order"
export const ITEM_COLUMNS = "id,word,pronunciation,spanish,example_en,example_es,sort_order"

export const CATEGORY_TREE_COLUMNS =
    `${CATEGORY_COLUMNS},subcategories:subcategories(${SUBCATEGORY_COLUMNS},items:items(${ITEM_COLUMNS}))`

export const CUSTOM_ITEM_COLUMNS =
    "id,user_id,word,pronunciation,spanish,example_en,example_es,notes,category,subcategory,sort_order,created_at,updated_at"

export const VERB_COLUMNS = [
    "id",
    "category",
    "type",
    "verb",
    "pronunciation",
    "translation",
    "example_base",
    "usage",
    "past_simple",
    "pronunciation_ps",
    "translation_ps",
    "example_ps",
    "past_participle",
    "pronunciation_pp",
    "translation_pp",
    "example_pp",
    "adjective",
    "pronunciation_adj",
    "translation_adj",
    "example_adj",
    "example_adj_translation",
    "adverb",
    "pronunciation_adv",
    "translation_adv",
    "example_adv",
    "example_adv_translation",
    "noun",
    "pronunciation_noun",
    "translation_noun",
    "example_noun",
    "example_noun_translation",
    "notes"
].join(",")
