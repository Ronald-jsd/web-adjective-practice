create table if not exists public.user_shadowing_lessons (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    video_url text not null check (char_length(video_url) <= 2048 and (video_url like 'http://%' or video_url like 'https://%')),
    video_id text not null check (char_length(video_id) between 6 and 64),
    title text not null default '',
    source text not null default 'manual' check (source in ('auto', 'manual')),
    transcript jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists user_shadowing_lessons_user_created_idx
    on public.user_shadowing_lessons (user_id, created_at desc);

alter table public.user_shadowing_lessons enable row level security;

drop policy if exists "Users manage their own shadowing lessons" on public.user_shadowing_lessons;
create policy "Users manage their own shadowing lessons"
    on public.user_shadowing_lessons
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

grant select, insert, update, delete
    on public.user_shadowing_lessons to authenticated;
