-- Caché compartida de transcripciones para el modo Shadowing.
-- Guarda solo subtítulos públicos ya descargados y evita volver a gastar
-- créditos del proveedor cuando el mismo video se abre otra vez.

create table if not exists public.youtube_transcript_cache (
    video_id text primary key,
    title text,
    language text default 'en',
    source text default 'youtube',
    segments jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.youtube_transcript_cache enable row level security;

-- Sin políticas para los clientes: solo la Edge Function (service role)
-- lee y escribe esta tabla.
revoke all on public.youtube_transcript_cache from anon, authenticated;

create index if not exists youtube_transcript_cache_updated_at_idx
    on public.youtube_transcript_cache (updated_at desc);
