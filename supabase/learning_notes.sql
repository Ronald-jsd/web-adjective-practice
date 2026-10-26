alter table public.my_sentences
    add column if not exists notes text;

alter table public.user_custom_items
    add column if not exists notes text;

alter table public.verbs
    add column if not exists notes text;
