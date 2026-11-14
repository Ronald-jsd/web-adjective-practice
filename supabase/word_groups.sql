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
