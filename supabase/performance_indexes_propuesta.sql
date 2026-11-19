-- PROPUESTA - NO EJECUTADA
-- Índices para reducir las slow queries y los errores de base de datos.
-- Se aplica a mano en el SQL Editor de Supabase si autorizas este cambio.
-- `if not exists` permite volver a ejecutarlo sin duplicar índices.

-- Catálogo personal: se filtra por usuario y se ordena por sort_order o
-- created_at en varias pantallas.
create index if not exists user_custom_items_user_id_sort_order_idx
    on public.user_custom_items (user_id, sort_order);
create index if not exists user_custom_items_user_id_subcategory_idx
    on public.user_custom_items (user_id, subcategory);
create index if not exists user_custom_items_user_id_created_at_idx
    on public.user_custom_items (user_id, created_at desc);

-- Favoritos y estados de palabras: siempre se consultan por usuario.
create index if not exists user_vocabulary_favorites_user_id_idx
    on public.user_vocabulary_favorites (user_id);
create index if not exists user_word_status_user_id_idx
    on public.user_word_status (user_id);

-- Grupos e historial de IA: listados por usuario y fecha.
create index if not exists user_word_groups_user_id_updated_at_idx
    on public.user_word_groups (user_id, updated_at desc);
create index if not exists user_ai_queries_user_id_created_at_idx
    on public.user_ai_queries (user_id, created_at desc);

-- Frases y tarjetas de repaso: reparto por usuario y fecha de revisión.
create index if not exists my_sentences_user_id_created_at_idx
    on public.my_sentences (user_id, created_at desc);
create index if not exists my_sentence_review_cards_user_id_next_review_idx
    on public.my_sentence_review_cards (user_id, next_review_at);

-- Catálogo base: orders por verb, sort_order y display_order.
create index if not exists verbs_verb_idx
    on public.verbs (verb);
create index if not exists items_sort_order_idx
    on public.items (sort_order);
create index if not exists subcategories_display_order_idx
    on public.subcategories (display_order);

analyze public.user_custom_items;
analyze public.user_vocabulary_favorites;
analyze public.user_word_status;
analyze public.user_word_groups;
analyze public.user_ai_queries;
analyze public.my_sentences;
analyze public.my_sentence_review_cards;
analyze public.verbs;
analyze public.items;
analyze public.subcategories;
