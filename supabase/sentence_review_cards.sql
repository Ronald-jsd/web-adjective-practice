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
