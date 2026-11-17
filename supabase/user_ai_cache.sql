-- Caché de definiciones de palabras y traducciones de frases por usuario.
-- Evita volver a consultar a la IA cuando la misma palabra o frase se abre
-- desde otro dispositivo con la misma cuenta. El usuario puede borrarla.

create table if not exists public.user_ai_cache (
    user_id uuid not null references auth.users(id) on delete cascade,
    kind text not null check (kind in ('word', 'sentence')),
    cache_key text not null,
    value jsonb not null default 'null'::jsonb,
    source text not null default 'ai',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, kind, cache_key)
);

alter table public.user_ai_cache enable row level security;

revoke all on public.user_ai_cache from anon;
grant select, insert, update, delete on public.user_ai_cache to authenticated;

drop policy if exists "user_ai_cache_select" on public.user_ai_cache;
create policy "user_ai_cache_select"
    on public.user_ai_cache for select to authenticated
    using (auth.uid() = user_id);

drop policy if exists "user_ai_cache_insert" on public.user_ai_cache;
create policy "user_ai_cache_insert"
    on public.user_ai_cache for insert to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "user_ai_cache_update" on public.user_ai_cache;
create policy "user_ai_cache_update"
    on public.user_ai_cache for update to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "user_ai_cache_delete" on public.user_ai_cache;
create policy "user_ai_cache_delete"
    on public.user_ai_cache for delete to authenticated
    using (auth.uid() = user_id);

create index if not exists user_ai_cache_user_updated_idx
    on public.user_ai_cache (user_id, updated_at desc);
