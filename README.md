# MySentences — Personal English Fluency Trainer

MySentences is a mobile-first English practice module for saving meaningful sentences from everyday life, reviewing them with spaced repetition, and completing fill-in-the-blank exercises generated from the learner's own sentences. Interface and setup notes are in Spanish; the learner recalls and answers in English.

This repository's existing application is JavaScript, HTML, and CSS. MySentences follows that declared stack rather than introducing a separate Flutter app. Supabase PostgreSQL is the single persistence layer; the review scheduler and validation rules are provider-independent JavaScript modules.

## Architecture

```text
my-sentences.html + sentences.css
            |
         app.js (UI, auth, orchestration)
          /   \
 model.js    repository.js ---- Supabase JS client
 scheduler.js                   PostgreSQL + RLS
 exercises.js
```

- `js/sentences/model.js`: sentence validation, topic/reason constants, field mapping, grammar-pattern suggestions.
- `js/sentences/scheduler.js`: configurable Box 1 (1 day), Box 2 (3 days), Box 3 (7 days), and mastered (30 days) intervals.
- `js/sentences/exercises.js`: generated blank and answer check; Spanish feedback.
- `js/sentences/repository.js`: data-access boundary for `my_sentences` and exercise attempts.
- `supabase/schema.sql`: schema, indexes, updated-at trigger, and RLS policies. `supabase/seed.sql` adds an example sentence for an existing Auth user.
- `tests/sentences.test.js`: Node's built-in test suite covering validation, schedule advancement/failure/due dates, generated practice, and edits preserving review state.

## Setup

1. Open the existing Supabase project and run `supabase/schema.sql` in the SQL Editor while signed in. The current project URL and publishable key are read from `js/config.js`; change those constants if using a different Supabase project. The publishable key is intended for browser use; never put a service-role key in frontend code.
2. Also run `supabase/practice_progress.sql` in the same SQL Editor. This creates the per-user practice progress table with Row Level Security. Existing browser progress is merged into the signed-in account on the first successful load; progress for a word with reviews on both sides is kept from the most recently reviewed side.
3. Serve the repository root over HTTP (ES modules do not work from `file://`). For example, run `npx serve .` and open `/index.html`, then select **💬 MySentences**. `/my-sentences.html` redirects to that section of the same page.
4. Create an account or sign in. Supabase Auth email confirmation behavior is controlled in the project's Auth settings. RLS ensures a learner can access only their own sentences and exercise attempts.
5. Run `npm test` to run the service and repository unit tests.

To load the example sentence, replace `REPLACE_WITH_YOUR_LOGIN_EMAIL` in `supabase/seed.sql` with your account email and run that script in the same project's SQL Editor.

## MVP behavior

- Add/edit/delete/search sentences, select multiple topics, choose a save reason, and optionally save a translation and grammar pattern. The AI suggestion can turn an approximate English or Spanish idea into natural English and provide its Spanish translation using the existing Groq/Gemini provider and keys. The learner explicitly applies the suggestion and can edit it before saving. A simple grammar-pattern suggestion is populated when the field is blank; it remains editable.
- The form rejects isolated words (including `water`) and requests a meaningful expression or sentence.
- A new sentence starts in Box 1 and is due the next day. A remembered review advances by box; any failure returns it to Box 1. A successful Box 3 review moves to mastered, which continues to recur every 30 days.
- Review reveals the model sentence before the learner self-reports remembered/forgotten. Practice uses a blank from one saved sentence at a time; it does not mix unrelated sentence fragments. The existing vocabulary practice plays example sentences aloud using the device's English speech synthesis.
- Exercise submissions and answer reveals are stored separately from spaced-review results. Revealing a model answer is never recorded as successful recall. Difficult sentences and recent wrong answers are shown for retry.
- Statistics show due sentences, reviews completed today, and review recall accuracy. Exercise-answer accuracy is intentionally not substituted for unaided recall.
- Vocabulary practice progress is stored locally as an offline fallback and synchronized per signed-in user to `vocabulary_practice_progress`. Sign in with the same account on another device to continue the review schedule there.
- MySentences translation reads the same provider preference and API keys as the Oxford Guide AI settings on the same site origin. If no key is configured, use “Configurar IA” in the Oxford Guide.

## Data and future speaking support

`my_sentences` contains sentence text, Spanish translation, topic tags, saving reason, grammar pattern, review state, timestamps, and review counters. `my_sentence_exercise_attempts` records exercise type, user answer, correctness, reveal state, difficulty rating, and attempt time. Both tables are user-owned using Supabase Row Level Security.

The attempt structure can later hold speech-to-text answers. A future speaking screen should report recognized words separately from pronunciation; this MVP makes no pronunciation-scoring claims.
