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

alter table public.user_ai_queries
    drop constraint if exists user_ai_queries_cards_check;
alter table public.user_ai_queries
    add constraint user_ai_queries_cards_check
    check (
        jsonb_typeof(cards) = 'array'
    );

alter table public.user_custom_items
    add column if not exists ai_query_id uuid
    references public.user_ai_queries(id) on delete cascade;
alter table public.user_custom_items
    add column if not exists ai_query_card_index integer;

create index if not exists user_ai_queries_user_created_idx
    on public.user_ai_queries (user_id, created_at desc);
create index if not exists user_custom_items_ai_query_id_idx
    on public.user_custom_items (ai_query_id)
    where ai_query_id is not null;

with query_cards as (
    select
        query.id as query_id,
        (entry.ordinality - 1)::integer as card_index,
        entry.card->>'word' as word,
        entry.card->>'pronunciation' as pronunciation,
        entry.card->>'spanish' as spanish,
        entry.card->>'example_en' as example_en,
        entry.card->>'example_es' as example_es,
        row_number() over (
            partition by query.id,
                entry.card->>'word',
                entry.card->>'pronunciation',
                entry.card->>'spanish',
                entry.card->>'example_en',
                entry.card->>'example_es'
            order by entry.ordinality
        ) as occurrence
    from public.user_ai_queries query
    cross join lateral jsonb_array_elements(query.cards) with ordinality as entry(card, ordinality)
), custom_cards as (
    select
        item.id,
        item.ai_query_id as query_id,
        item.word,
        item.pronunciation,
        item.spanish,
        item.example_en,
        item.example_es,
        row_number() over (
            partition by item.ai_query_id,
                item.word,
                item.pronunciation,
                item.spanish,
                item.example_en,
                item.example_es
            order by item.created_at, item.id
        ) as occurrence
    from public.user_custom_items item
    where item.ai_query_id is not null
      and item.ai_query_card_index is null
)
update public.user_custom_items item
set ai_query_card_index = query_cards.card_index
from custom_cards
join query_cards
  on query_cards.query_id = custom_cards.query_id
 and query_cards.word = custom_cards.word
 and query_cards.pronunciation = custom_cards.pronunciation
 and query_cards.spanish = custom_cards.spanish
 and query_cards.example_en = custom_cards.example_en
 and query_cards.example_es = custom_cards.example_es
 and query_cards.occurrence = custom_cards.occurrence
where item.id = custom_cards.id;

create unique index if not exists user_custom_items_ai_query_card_idx
    on public.user_custom_items (ai_query_id, ai_query_card_index)
    where ai_query_id is not null and ai_query_card_index is not null;

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
    card_index integer;
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

    for card, card_index in
        select value, (ordinality - 1)::integer
        from jsonb_array_elements(p_cards) with ordinality as entries(value, ordinality)
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
            category, subcategory, created_at, ai_query_id, ai_query_card_index
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
            query_id,
            card_index
        );
    end loop;

    return query_id;
end;
$$;

revoke all on function public.save_user_ai_query(text, text, text, jsonb, text) from public;
grant execute on function public.save_user_ai_query(text, text, text, jsonb, text) to authenticated;

drop function if exists public.update_user_ai_query_card(uuid, integer, jsonb);

create or replace function public.set_user_ai_query_cards(
    p_query_id uuid,
    p_cards jsonb,
    p_category text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    previous_cards jsonb;
    card jsonb;
    card_index integer;
    updated_count integer;
begin
    if auth.uid() is null then
        raise exception 'Authentication is required to modify AI cards';
    end if;

    if p_cards is null or jsonb_typeof(p_cards) is distinct from 'array' then
        raise exception 'AI cards must be a JSON array';
    end if;

    if coalesce(trim(p_category), '') = '' then
        raise exception 'A category is required to add AI cards';
    end if;

    select cards into previous_cards
    from public.user_ai_queries
    where id = p_query_id
      and user_id = auth.uid()
    for update;

    if previous_cards is null then
        raise exception 'AI query not found';
    end if;

    update public.user_ai_queries
    set cards = p_cards
    where id = p_query_id
      and user_id = auth.uid();

    update public.user_custom_items
    set ai_query_card_index = -ai_query_card_index - 1
    where ai_query_id = p_query_id
      and user_id = auth.uid()
      and ai_query_card_index is not null;

    for card, card_index in
        select value, (ordinality - 1)::integer
        from jsonb_array_elements(p_cards) with ordinality as entries(value, ordinality)
    loop
        if jsonb_typeof(card) is distinct from 'object'
            or coalesce(trim(card->>'word'), '') = ''
            or coalesce(trim(card->>'pronunciation'), '') = ''
            or coalesce(trim(card->>'spanish'), '') = ''
            or coalesce(trim(card->>'example_en'), '') = ''
            or coalesce(trim(card->>'example_es'), '') = '' then
            raise exception 'Every AI card must include a word, pronunciation, meaning, and translated example';
        end if;

        update public.user_custom_items
        set ai_query_card_index = card_index,
            word = trim(card->>'word'),
            pronunciation = trim(card->>'pronunciation'),
            spanish = trim(card->>'spanish'),
            example_en = trim(card->>'example_en'),
            example_es = trim(card->>'example_es')
        where ai_query_id = p_query_id
          and ai_query_card_index = -(card_index + 1)
          and user_id = auth.uid();
        get diagnostics updated_count = row_count;

        if updated_count = 0 then
            insert into public.user_custom_items (
                user_id, word, pronunciation, spanish, example_en, example_es,
                category, subcategory, created_at, ai_query_id, ai_query_card_index
            )
            values (
                auth.uid(),
                trim(card->>'word'),
                trim(card->>'pronunciation'),
                trim(card->>'spanish'),
                trim(card->>'example_en'),
                trim(card->>'example_es'),
                p_category,
                'Mis Expresiones',
                now(),
                p_query_id,
                card_index
            );
        end if;
    end loop;

    delete from public.user_custom_items
    where ai_query_id = p_query_id
      and user_id = auth.uid()
      and (
          ai_query_card_index is null
          or ai_query_card_index < 0
      );
end;
$$;

revoke all on function public.set_user_ai_query_cards(uuid, jsonb, text) from public;
grant execute on function public.set_user_ai_query_cards(uuid, jsonb, text) to authenticated;
