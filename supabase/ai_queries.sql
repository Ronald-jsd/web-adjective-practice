create table if not exists public.user_ai_queries (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    question text not null check (char_length(trim(question)) > 0),
    summary text not null check (char_length(trim(summary)) > 0),
    provider text not null check (provider in ('gemini', 'groq')),
    cards jsonb not null check (
        case
            when jsonb_typeof(cards) = 'array'
                then jsonb_array_length(cards) between 1 and 6
            else false
        end
    ),
    created_at timestamptz not null default now()
);

alter table public.user_custom_items
    add column if not exists ai_query_id uuid
    references public.user_ai_queries(id) on delete cascade;

create index if not exists user_ai_queries_user_created_idx
    on public.user_ai_queries (user_id, created_at desc);
create index if not exists user_custom_items_ai_query_id_idx
    on public.user_custom_items (ai_query_id)
    where ai_query_id is not null;

alter table public.user_ai_queries enable row level security;
grant select, insert, delete on public.user_ai_queries to authenticated;

drop policy if exists "Users read their own AI queries" on public.user_ai_queries;
create policy "Users read their own AI queries"
    on public.user_ai_queries
    for select
    using (auth.uid() = user_id);

drop policy if exists "Users insert their own AI queries" on public.user_ai_queries;
create policy "Users insert their own AI queries"
    on public.user_ai_queries
    for insert
    with check (auth.uid() = user_id);

drop policy if exists "Users delete their own AI queries" on public.user_ai_queries;
create policy "Users delete their own AI queries"
    on public.user_ai_queries
    for delete
    using (auth.uid() = user_id);

create or replace function public.save_user_ai_query(
    p_question text,
    p_summary text,
    p_provider text,
    p_cards jsonb,
    p_category text
)
returns uuid
language plpgsql
as $$
declare
    query_id uuid;
    card jsonb;
begin
    if auth.uid() is null then
        raise exception 'Authentication is required to save AI queries';
    end if;

    if p_provider not in ('gemini', 'groq') then
        raise exception 'Unsupported AI provider';
    end if;

    if jsonb_typeof(p_cards) is distinct from 'array' then
        raise exception 'AI queries must contain between 1 and 6 cards';
    end if;

    if jsonb_array_length(p_cards) not between 1 and 6 then
        raise exception 'AI queries must contain between 1 and 6 cards';
    end if;

    insert into public.user_ai_queries (user_id, question, summary, provider, cards)
    values (auth.uid(), trim(p_question), trim(p_summary), p_provider, p_cards)
    returning id into query_id;

    for card in select value from jsonb_array_elements(p_cards) as entries(value)
    loop
        if card->>'word' is null
            or card->>'pronunciation' is null
            or card->>'spanish' is null
            or card->>'example_en' is null
            or card->>'example_es' is null then
            raise exception 'Every AI card must include a word, pronunciation, meaning, and translated example';
        end if;

        insert into public.user_custom_items (
            user_id, word, pronunciation, spanish, example_en, example_es,
            category, subcategory, created_at, ai_query_id
        )
        values (
            auth.uid(),
            card->>'word',
            card->>'pronunciation',
            card->>'spanish',
            card->>'example_en',
            card->>'example_es',
            p_category,
            'Mis Expresiones',
            now(),
            query_id
        );
    end loop;

    return query_id;
end;
$$;

revoke all on function public.save_user_ai_query(text, text, text, jsonb, text) from public;
grant execute on function public.save_user_ai_query(text, text, text, jsonb, text) to authenticated;
