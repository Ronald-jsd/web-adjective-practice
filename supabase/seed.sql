-- Replace the email below with the email of an existing Supabase Auth user.
insert into public.my_sentences (
    user_id, english_text, spanish_translation, topic_tags, reason_for_saving,
    grammar_pattern, review_box, next_review_at
)
select auth_user.id,
       'Could I have a table by the window, please?',
       '¿Podría darme una mesa junto a la ventana, por favor?',
       array['Restaurant'],
       'Useful expression',
       'Polite request with could',
       '1',
       now() + interval '1 day'
from auth.users as auth_user
where auth_user.email = 'REPLACE_WITH_YOUR_LOGIN_EMAIL'
  and not exists (
      select 1
      from public.my_sentences
      where user_id = auth_user.id
        and english_text = 'Could I have a table by the window, please?'
  );
