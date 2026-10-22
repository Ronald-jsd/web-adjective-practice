create table if not exists public.vocabulary_practice_progress (
    user_id uuid not null references auth.users(id) on delete cascade,
    item_id text not null,
    attempts integer not null default 0 check (attempts >= 0),
    correct integer not null default 0 check (correct >= 0 and correct <= attempts),
    repetitions integer not null default 0 check (repetitions >= 0),
    interval_days double precision not null default 0 check (interval_days >= 0),
    ease double precision not null default 2.5 check (ease >= 1.3 and ease <= 2.8),
    due_at timestamptz not null default now(),
    lapses integer not null default 0 check (lapses >= 0),
    last_reviewed_at timestamptz,
    updated_at timestamptz not null default now(),
    primary key (user_id, item_id)
);

create index if not exists vocabulary_practice_progress_user_due_idx
    on public.vocabulary_practice_progress (user_id, due_at);

alter table public.vocabulary_practice_progress enable row level security;

drop policy if exists "Users manage their own vocabulary practice progress"
    on public.vocabulary_practice_progress;
create policy "Users manage their own vocabulary practice progress"
    on public.vocabulary_practice_progress
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

grant select, insert, update, delete
    on public.vocabulary_practice_progress to authenticated;
