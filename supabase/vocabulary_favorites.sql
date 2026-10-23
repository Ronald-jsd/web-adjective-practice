create table if not exists public.user_vocabulary_favorites (
    user_id uuid not null references auth.users(id) on delete cascade,
    item_type text not null check (item_type in ('adjective', 'verb')),
    item_id text not null,
    created_at timestamptz not null default now(),
    primary key (user_id, item_type, item_id)
);

alter table public.user_vocabulary_favorites enable row level security;

drop policy if exists "Users manage their own vocabulary favorites"
    on public.user_vocabulary_favorites;
create policy "Users manage their own vocabulary favorites"
    on public.user_vocabulary_favorites
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

grant select, insert, update, delete
    on public.user_vocabulary_favorites to authenticated;
