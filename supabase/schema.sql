create table if not exists public.my_sentences (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    english_text text not null check (char_length(trim(english_text)) >= 3),
    spanish_translation text,
    topic_tags text[] not null check (cardinality(topic_tags) > 0),
    reason_for_saving text not null check (reason_for_saving in ('I couldn''t say it', 'I made a mistake', 'Useful expression')),
    grammar_pattern text,
    grammar_pattern_translation text,
    notes text,
    review_box text not null default '1' check (review_box in ('1', '2', '3', 'mastered')),
    next_review_at timestamptz not null default (now() + interval '1 day'),
    total_attempts integer not null default 0 check (total_attempts >= 0),
    total_failures integer not null default 0 check (total_failures >= 0),
    consecutive_successes integer not null default 0 check (consecutive_successes >= 0),
    last_reviewed_at timestamptz,
    memory_state text not null default 'new' check (memory_state in ('new', 'learning', 'review', 'relearning')),
    interval_days numeric not null default 0,
    ease_factor numeric not null default 2.5 check (ease_factor >= 1.3 and ease_factor <= 3.0),
    repetitions integer not null default 0 check (repetitions >= 0),
    lapses integer not null default 0 check (lapses >= 0),
    learning_step integer not null default 0 check (learning_step >= 0),
    last_grade text check (last_grade is null or last_grade in ('again', 'hard', 'good', 'easy')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (total_failures <= total_attempts)
);

create table if not exists public.my_sentence_exercise_attempts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    sentence_id uuid not null references public.my_sentences(id) on delete cascade,
    exercise_type text not null,
    user_answer text not null default '',
    is_correct boolean not null default false,
    was_answer_revealed boolean not null default false,
    difficulty_rating smallint check (difficulty_rating between 1 and 5),
    attempted_at timestamptz not null default now()
);

create index if not exists my_sentences_user_due_idx
    on public.my_sentences (user_id, next_review_at);
create index if not exists my_sentence_attempts_user_time_idx
    on public.my_sentence_exercise_attempts (user_id, attempted_at desc);
create index if not exists my_sentence_attempts_sentence_idx
    on public.my_sentence_exercise_attempts (sentence_id);

create or replace function public.set_my_sentence_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists my_sentences_updated_at on public.my_sentences;
create trigger my_sentences_updated_at
    before update on public.my_sentences
    for each row execute function public.set_my_sentence_updated_at();

alter table public.my_sentences enable row level security;
alter table public.my_sentence_exercise_attempts enable row level security;

drop policy if exists "Users manage their own sentences" on public.my_sentences;
create policy "Users manage their own sentences"
    on public.my_sentences
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "Users manage their own sentence attempts" on public.my_sentence_exercise_attempts;
create policy "Users manage their own sentence attempts"
    on public.my_sentence_exercise_attempts
    for all
    using (auth.uid() = user_id)
    with check (
        auth.uid() = user_id
        and exists (
            select 1
            from public.my_sentences
            where my_sentences.id = sentence_id
              and my_sentences.user_id = auth.uid()
        )
    );

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

create table if not exists public.user_word_groups (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    title text not null check (char_length(trim(title)) between 1 and 160),
    members jsonb not null default '[]'::jsonb check (jsonb_typeof(members) = 'array'),
    relationships jsonb not null default '{}'::jsonb check (jsonb_typeof(relationships) = 'object'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists user_word_groups_user_updated_idx
    on public.user_word_groups (user_id, updated_at desc);

create or replace function public.set_user_word_groups_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists user_word_groups_updated_at on public.user_word_groups;
create trigger user_word_groups_updated_at
    before update on public.user_word_groups
    for each row execute function public.set_user_word_groups_updated_at();

alter table public.user_word_groups enable row level security;

drop policy if exists "Users manage their own word groups" on public.user_word_groups;
create policy "Users manage their own word groups"
    on public.user_word_groups
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

grant select, insert, update, delete
    on public.user_word_groups to authenticated;

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

create table if not exists public.my_sentence_review_cards (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    my_sentence_id uuid not null references public.my_sentences(id) on delete cascade,
    direction text not null check (direction in ('forward', 'reverse')),
    memory_state text not null default 'new' check (memory_state in ('new', 'learning', 'review', 'relearning')),
    interval_days numeric not null default 0,
    ease_factor numeric not null default 2.5 check (ease_factor >= 1.3 and ease_factor <= 3.0),
    repetitions integer not null default 0 check (repetitions >= 0),
    lapses integer not null default 0 check (lapses >= 0),
    learning_step integer not null default 0 check (learning_step >= 0),
    last_grade text check (last_grade is null or last_grade in ('again', 'hard', 'good', 'easy')),
    total_attempts integer not null default 0 check (total_attempts >= 0),
    total_failures integer not null default 0 check (total_failures >= 0),
    next_review_at timestamptz not null default (now() + interval '1 day'),
    consecutive_successes integer not null default 0,
    last_reviewed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, my_sentence_id, direction)
);

create index if not exists my_sentence_review_cards_user_due_idx
    on public.my_sentence_review_cards (user_id, next_review_at);

create index if not exists my_sentence_review_cards_user_reviewed_idx
    on public.my_sentence_review_cards (user_id, last_reviewed_at desc);

insert into public.my_sentence_review_cards (
    user_id, my_sentence_id, direction, memory_state, interval_days, ease_factor, repetitions, lapses, learning_step, last_grade, total_attempts, total_failures, next_review_at, consecutive_successes, last_reviewed_at, created_at, updated_at
)
select
    s.user_id,
    s.id,
    'forward',
    s.memory_state,
    s.interval_days,
    s.ease_factor,
    s.repetitions,
    s.lapses,
    s.learning_step,
    s.last_grade,
    s.total_attempts,
    s.total_failures,
    s.next_review_at,
    s.consecutive_successes,
    s.last_reviewed_at,
    s.created_at,
    s.updated_at
from public.my_sentences s
on conflict (user_id, my_sentence_id, direction) do nothing;

insert into public.my_sentence_review_cards (
    user_id, my_sentence_id, direction, next_review_at, created_at, updated_at
)
select
    s.user_id,
    s.id,
    'reverse',
    s.next_review_at,
    s.created_at,
    s.updated_at
from public.my_sentences s
on conflict (user_id, my_sentence_id, direction) do nothing;

alter table public.my_sentence_review_logs
    add column if not exists card_id uuid,
    add column if not exists direction text not null default 'forward';

alter table public.my_sentence_review_logs
    drop constraint if exists my_sentence_review_logs_direction_check;

alter table public.my_sentence_review_logs
    add constraint my_sentence_review_logs_direction_check
    check (direction in ('forward', 'reverse'));

alter table public.my_sentence_review_cards enable row level security;

drop policy if exists "Users manage their own sentence review cards" on public.my_sentence_review_cards;
create policy "Users manage their own sentence review cards"
    on public.my_sentence_review_cards
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

grant select, insert, update, delete
    on public.my_sentence_review_cards to authenticated;

drop trigger if exists my_sentence_review_cards_updated_at on public.my_sentence_review_cards;
create or replace function public.set_my_sentence_review_cards_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger my_sentence_review_cards_updated_at
    before update on public.my_sentence_review_cards
    for each row execute function public.set_my_sentence_review_cards_updated_at();
