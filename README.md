# MySentences — Personal English Fluency Trainer

Mi aprendizaje is a mobile-first module for saving meaningful sentences, personal vocabulary, and reviewing sentences with spaced repetition. Vocabulary pronunciation and English examples can be played with the device's speech synthesis.

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
- `js/sentences/repository.js`: data-access boundary for `my_sentences` and personal vocabulary.
- `supabase/schema.sql`: schema, indexes, updated-at trigger, and RLS policies. `supabase/seed.sql` adds an example sentence for an existing Auth user.
- `tests/sentences.test.js`: Node's built-in test suite covering validation, schedule advancement/failure/due dates, and edits preserving review state.

## Setup

1. Open the existing Supabase project and run `supabase/schema.sql` in the SQL Editor while signed in. The current project URL and publishable key are read from `js/config.js`; change those constants if using a different Supabase project. The publishable key is intended for browser use; never put a service-role key in frontend code.
2. Also run `supabase/practice_progress.sql` and `supabase/ai_queries.sql` in the same SQL Editor. The AI script creates the saved-query functions and a private Storage bucket for one image per saved query. If MySentences reports that `my_sentences` does not exist, run `supabase/schema.sql` in the SQL Editor for the same Supabase project configured in `js/config.js`.
3. Serve the repository root over HTTP (ES modules do not work from `file://`). For example, run `npx serve .` and open `/index.html`, then select **💬 Mi aprendizaje**. `/my-sentences.html` redirects to that section of the same page.
4. Create an account or sign in. Supabase Auth email confirmation behavior is controlled in the project's Auth settings. RLS ensures a learner can access only their own sentences and exercise attempts.
5. Run `npm test` to run the service and repository unit tests.

To load the example sentence, replace `REPLACE_WITH_YOUR_LOGIN_EMAIL` in `supabase/seed.sql` with your account email and run that script in the same project's SQL Editor.

## Práctica temporal desde Notion

La integración usa OAuth y una función Edge de Supabase como intermediaria. El token de Notion se guarda solo en `notion_connections`, tabla sin acceso para `anon` ni `authenticated`; nunca se devuelve al navegador. Las páginas elegidas se recuerdan en el almacenamiento local del navegador y el vocabulario se obtiene de Notion al cargarlo para practicar. Las tarjetas no se insertan en Supabase y solo permanecen en memoria mientras la app está abierta. El progreso específico de estas tarjetas se conserva únicamente en el almacenamiento local del navegador, no en la tabla de progreso de Supabase.

1. En Supabase SQL Editor, ejecuta `supabase/notion.sql`.
   Este script elimina las tablas antiguas `notion_synced_pages` y `notion_vocabulary`, si existen, junto con las tarjetas que guardaban; ya no se usan en este modo temporal.
2. Crea una integración pública OAuth en [Notion My Integrations](https://www.notion.so/profile/integrations). Habilita lectura de contenido e indica como URL de redirección exactamente `https://<PROJECT_REF>.supabase.co/functions/v1/notion-connect`.
3. Instala la Supabase CLI, inicia sesión y enlaza este proyecto con `supabase link --project-ref <PROJECT_REF>`.
4. Configura los secretos del servidor (reemplaza los valores localmente; no los pongas en el código):

   ```powershell
   supabase secrets set "NOTION_CLIENT_ID=REEMPLAZA_CLIENT_ID" "NOTION_CLIENT_SECRET=REEMPLAZA_CLIENT_SECRET" "NOTION_REDIRECT_URI=https://PROJECT_REF.supabase.co/functions/v1/notion-connect" "NOTION_APP_URL=https://TU_DOMINIO/index.html"
   ```

   Sustituye `PROJECT_REF` y `TU_DOMINIO` por los valores reales antes de ejecutar el comando. Mantén cada valor entre comillas para que PowerShell no interprete caracteres especiales.

5. Desde la raíz del proyecto, despliega las dos funciones:

   ```powershell
   supabase functions deploy notion-connect --no-verify-jwt
   supabase functions deploy notion-sync
   ```

6. En Notion, comparte con la integración las páginas que quieras practicar. En la app, inicia sesión, abre **Practicar → Practicar páginas de Notion**, conecta la cuenta, marca las páginas y pulsa **Guardar selección** o **Cargar vocabulario temporal**. La selección se guarda en ese navegador; al abrir la app de nuevo, el vocabulario se solicita otra vez a Notion. La función acepta hasta 20 páginas y 2.000 tarjetas reconocidas en una carga. Desconectar Notion elimina la autorización guardada en Supabase.

La lectura reconoce tablas con encabezados de vocabulario como `VERBO`, `SUSTANTIVO`, `ADJETIVO`, `PERSONA`, `EXPRESSION` o `WORD`, y columnas españolas como `🇪🇸`, `ES`, `Español` o `Traducción`. En tablas con varios encabezados de vocabulario, se empareja cada palabra con su traducción contigua. De los párrafos solo importa líneas claras con formato `English phrase — traducción`; instrucciones y texto que no coincida se omiten. La integración recupera hasta 1.000 páginas en la lista y limita una página a 12.000 bloques por carga.

## MVP behavior

- Add/edit/delete/search sentences and save separate personal vocabulary entries with a meaning, pronunciation, and optional translated example. Each saved AI query can keep one private image in Supabase Storage; select, drag, or paste an image in the query details, then click its preview to open a larger view. The searchable AI-query history is displayed as a responsive grid of up to four cards per row, with sorting and a selectable page size. Sentence exercise history loads only the five most recent attempts.
- The form rejects isolated words (including `water`) and requests a meaningful expression or sentence.
- A new sentence starts in Box 1 and is due the next day. A remembered review advances by box; any failure returns it to Box 1. A successful Box 3 review moves to mastered, which continues to recur every 30 days.
- Sentence review reveals the model sentence before the learner self-reports remembered/forgotten. Saved personal vocabulary is available in the main **Practicar** section under **Mis Expresiones**.
- Exercise submissions and answer reveals are stored separately from spaced-review results. Revealing a model answer is never recorded as successful recall. Difficult sentences and recent wrong answers are shown for retry.
- Statistics show due sentences, reviews completed today, and review recall accuracy. Exercise-answer accuracy is intentionally not substituted for unaided recall.
- Vocabulary practice progress is stored locally as an offline fallback and synchronized per signed-in user to `vocabulary_practice_progress`. Sign in with the same account on another device to continue the review schedule there.
- MySentences translation reads the same provider preference and API keys as the Oxford Guide AI settings on the same site origin. If no key is configured, use “Configurar IA” in the Oxford Guide.

## Data and future speaking support

`my_sentences` contains sentence text, Spanish translation, topic tags, saving reason, grammar pattern, review state, timestamps, and review counters. `my_sentence_exercise_attempts` records exercise type, user answer, correctness, reveal state, difficulty rating, and attempt time. Both tables are user-owned using Supabase Row Level Security.

The attempt structure can later hold speech-to-text answers. A future speaking screen should report recognized words separately from pronunciation; this MVP makes no pronunciation-scoring claims.
