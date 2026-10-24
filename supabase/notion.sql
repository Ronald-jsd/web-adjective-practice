create table if not exists public.notion_connections (
    user_id uuid primary key references auth.users(id) on delete cascade,
    access_token text not null,
    workspace_id text,
    workspace_name text,
    connected_at timestamptz not null default now()
);

create table if not exists public.notion_oauth_states (
    state_hash text primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    expires_at timestamptz not null
);

drop function if exists public.replace_notion_page_vocabulary(uuid, text, text, text, jsonb);
drop table if exists public.notion_vocabulary;
drop table if exists public.notion_synced_pages;

do $$
begin
    if to_regclass('public.vocabulary_practice_progress') is not null then
        delete from public.vocabulary_practice_progress
        where item_id like 'notion-page-%';
    end if;
end;
$$;

alter table public.notion_connections enable row level security;
alter table public.notion_oauth_states enable row level security;

revoke all on public.notion_connections from anon, authenticated;
revoke all on public.notion_oauth_states from anon, authenticated;
