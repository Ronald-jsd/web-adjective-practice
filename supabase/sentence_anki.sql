alter table public.my_sentences
    add column if not exists memory_state text not null default 'new',
    add column if not exists interval_days numeric not null default 0,
    add column if not exists ease_factor numeric not null default 2.5,
    add column if not exists repetitions integer not null default 0,
    add column if not exists lapses integer not null default 0,
    add column if not exists learning_step integer not null default 0,
    add column if not exists last_grade text;

alter table public.my_sentences
    drop constraint if exists my_sentences_memory_state_check;

alter table public.my_sentences
    add constraint my_sentences_memory_state_check
        check (memory_state in ('new', 'learning', 'review', 'relearning'));

alter table public.my_sentences
    drop constraint if exists my_sentences_ease_factor_check;

alter table public.my_sentences
    add constraint my_sentences_ease_factor_check
        check (ease_factor >= 1.3 and ease_factor <= 3.0);

alter table public.my_sentences
    drop constraint if exists my_sentences_repetitions_check;

alter table public.my_sentences
    add constraint my_sentences_repetitions_check
        check (repetitions >= 0);

alter table public.my_sentences
    drop constraint if exists my_sentences_lapses_check;

alter table public.my_sentences
    add constraint my_sentences_lapses_check
        check (lapses >= 0);

alter table public.my_sentences
    drop constraint if exists my_sentences_learning_step_check;

alter table public.my_sentences
    add constraint my_sentences_learning_step_check
        check (learning_step >= 0);

alter table public.my_sentences
    drop constraint if exists my_sentences_last_grade_check;

alter table public.my_sentences
    add constraint my_sentences_last_grade_check
        check (last_grade is null or last_grade in ('again', 'hard', 'good', 'easy'));

update public.my_sentences
set memory_state = case
        when review_box in ('2', '3', 'mastered') then 'review'
        else 'learning'
    end,
    interval_days = case
        when review_box = 'mastered' then 30
        when review_box = '3' then 7
        when review_box = '2' then 3
        else 0
    end,
    repetitions = greatest(1, total_attempts - total_failures),
    learning_step = 1
where memory_state = 'new';

create table if not exists public.my_sentence_review_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    my_sentence_id uuid references public.my_sentences(id) on delete cascade,
    grade text not null check (grade in ('again', 'hard', 'good', 'easy')),
    reviewed_at timestamptz not null default now(),
    previous_state text not null default 'new',
    next_state text not null default 'learning',
    previous_interval_days numeric not null default 0,
    next_interval_days numeric not null default 0,
    total_attempts integer not null default 1,
    total_failures integer not null default 0
);

create index if not exists my_sentence_review_logs_user_time_idx
    on public.my_sentence_review_logs (user_id, reviewed_at desc);
create index if not exists my_sentence_review_logs_sentence_time_idx
    on public.my_sentence_review_logs (my_sentence_id, reviewed_at desc);

alter table public.my_sentence_review_logs enable row level security;

drop policy if exists "Users manage their own sentence review logs" on public.my_sentence_review_logs;
create policy "Users manage their own sentence review logs"
    on public.my_sentence_review_logs
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

grant select, insert, update, delete
    on public.my_sentence_review_logs to authenticated;
