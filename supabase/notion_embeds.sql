create table if not exists public.user_notion_pages (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    title text not null default '',
    url text not null check (char_length(url) <= 2048),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (
        url ~* '^https://([a-z0-9-]+\.)*notion\.so(/|$|\?)'
        or url ~* '^https://([a-z0-9-]+\.)*notion\.com(/|$|\?)'
        or url ~* '^https://([a-z0-9-]+\.)*notion\.site(/|$|\?)'
    )
);

create index if not exists user_notion_pages_user_created_idx
    on public.user_notion_pages (user_id, created_at);

create or replace function public.set_user_notion_pages_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists user_notion_pages_updated_at on public.user_notion_pages;
create trigger user_notion_pages_updated_at
    before update on public.user_notion_pages
    for each row execute function public.set_user_notion_pages_updated_at();

alter table public.user_notion_pages enable row level security;

drop policy if exists "Users manage their own Notion pages" on public.user_notion_pages;
create policy "Users manage their own Notion pages"
    on public.user_notion_pages
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

grant select, insert, update, delete
    on public.user_notion_pages to authenticated;
