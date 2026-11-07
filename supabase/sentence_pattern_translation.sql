alter table public.my_sentences
    add column if not exists grammar_pattern_translation text;
