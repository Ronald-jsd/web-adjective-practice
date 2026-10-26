create table if not exists public.my_sentences (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    english_text text not null check (char_length(trim(english_text)) >= 3),
    spanish_translation text,
    topic_tags text[] not null check (cardinality(topic_tags) > 0),
    reason_for_saving text not null check (reason_for_saving in ('I couldn''t say it', 'I made a mistake', 'Useful expression')),
    grammar_pattern text,
    notes text,
    review_box text not null default '1' check (review_box in ('1', '2', '3', 'mastered')),
    next_review_at timestamptz not null default (now() + interval '1 day'),
    total_attempts integer not null default 0 check (total_attempts >= 0),
    total_failures integer not null default 0 check (total_failures >= 0),
    consecutive_successes integer not null default 0 check (consecutive_successes >= 0),
    last_reviewed_at timestamptz,
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
