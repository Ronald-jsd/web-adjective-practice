-- Transcripciones de Shadowing guardadas por usuario.
-- Cada cuenta conserva sus transcripciones para abrirlas desde cualquier
-- dispositivo sin volver a gastar créditos. No se borran automáticamente:
-- el usuario decide cuándo eliminarlas.

create table if not exists public.user_transcript_cache (
    user_id uuid not null references auth.users(id) on delete cascade,
    video_id text not null,
    title text default '',
    language text default 'en',
    source text default 'auto',
    segments jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, video_id)
);

alter table public.user_transcript_cache enable row level security;

revoke all on public.user_transcript_cache from anon;
grant select, insert, update, delete on public.user_transcript_cache to authenticated;

drop policy if exists "user_transcript_cache_select" on public.user_transcript_cache;
create policy "user_transcript_cache_select"
    on public.user_transcript_cache
    for select to authenticated
    using (auth.uid() = user_id);

drop policy if exists "user_transcript_cache_insert" on public.user_transcript_cache;
create policy "user_transcript_cache_insert"
    on public.user_transcript_cache
    for insert to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "user_transcript_cache_update" on public.user_transcript_cache;
create policy "user_transcript_cache_update"
    on public.user_transcript_cache
    for update to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "user_transcript_cache_delete" on public.user_transcript_cache;
create policy "user_transcript_cache_delete"
    on public.user_transcript_cache
    for delete to authenticated
    using (auth.uid() = user_id);

create index if not exists user_transcript_cache_user_updated_idx
    on public.user_transcript_cache (user_id, updated_at desc);
