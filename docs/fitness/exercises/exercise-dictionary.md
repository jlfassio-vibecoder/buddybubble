# Exercise Dictionary

This document captures the current developer-facing state of the `exercise_dictionary`
feature. It covers the database policy model, the AI write path, and the RLS-aware
`#` exercise autocomplete read path used by the chat composers.

## Current Status

- `public.exercise_dictionary` is the canonical exercise catalog for RAG/cache lookup,
  SEO slug routes, and upcoming `#` exercise autocomplete.
- The AI generation pipeline inserts newly generated dictionary rows as `status = 'pending'`.
- New pending rows are stamped with `created_by` from the authenticated user who triggered
  `/api/ai/generate-workout-chain`.
- RichMessageComposer parents load the catalog via `useExerciseDictionaryAutocomplete()` (RLS-aware;
  includes published plus the user’s own pending rows, per policy below).

## Database Shape

The table is created in
`supabase/migrations/20260617130000_create_exercise_dictionary.sql`.

Important columns:

- `id uuid`
- `slug text`
- `name text`
- `status text`
- `complexity_level text`
- `kinetic_chain_type text`
- `biomechanics jsonb`
- `instructions jsonb`
- `media jsonb`
- `created_by uuid references public.users(id) on delete set null`

Indexes:

- `exercise_dictionary_name_idx` on `name`
- `exercise_dictionary_created_by_idx` on `created_by`
- `exercise_dictionary_slug_key` unique constraint supplies the slug index

`created_by` and `exercise_dictionary_created_by_idx` were introduced as Step 1 of the
autocomplete migration. Production was backfilled deterministically for 3 rows; 180
historical rows remained `created_by is null`.

## RLS Model

Current RLS behavior:

- `anon`: broad SELECT remains intentionally unchanged for SEO routes.
- `authenticated`: SELECT is restricted by
  `supabase/migrations/20260729130000_exercise_dictionary_select_rls_pending_private.sql`.
- `service_role`: bypasses RLS and remains the correct path for RAG / curation pipelines.
- INSERT/UPDATE policies for trainer/admin curation live in
  `supabase/migrations/20260621100000_exercise_dictionary_trainer_admin_write_rls.sql`
  and are unchanged by the autocomplete work.

Authenticated SELECT policy:

```sql
using (
  status = 'published'
  or (status = 'pending' and created_by = auth.uid())
  or exists (
    select 1
    from public.users u
    where u.id = auth.uid() and u.role in ('admin', 'trainer')
  )
)
```

That means normal authenticated users see published rows plus their own pending rows.
Trainer/admin users can see pending rows regardless of `created_by` for curation.

## AI Writer Path

The single current writer for pending AI-generated dictionary rows is the workout generation
pipeline:

1. `src/app/api/ai/generate-workout-chain/route.ts`

- Authenticates the request with `supabase.auth.getUser()`.
- Passes `createdByUserId: user.id` into `runGenerateWorkoutChain`.

2. `src/lib/workout-factory/generate-workout-chain-runner.ts`

- Forwards `createdByUserId` to the Kanban extract/enrich runner.

3. `src/lib/workout-factory/generate-workout-kanban-extract-runner.ts`

- Uses the service-role dictionary lookup path.
- Inserts pending rows for exercises that were missing from the dictionary cache.

4. `src/lib/workout-factory/exercise-dictionary-bridge.ts`

- `enrichedExerciseToDictionaryInsert(...)` includes `created_by` only when a
  `createdByUserId` is provided.
- `insertExerciseDictionaryPendingFromEnrichment(...)` passes that value through.

The service-role client is still used for the insert. `created_by` must be supplied
explicitly because `auth.uid()` does not represent the triggering user on service-role writes.

## Read Paths

### RAG / Workout Generation Lookup

`rpcExerciseDictionaryLookupByNames(...)` in
`src/lib/workout-factory/exercise-dictionary-bridge.ts` calls the
`exercise_dictionary_lookup_by_names` RPC.

The RPC is granted to `service_role` and is intentionally unchanged. It can see all dictionary
rows, including pending rows, because the RAG / cache path needs full visibility.

### RLS-Aware UI Autocomplete (canonical)

These files are the read path for `#` exercise autocomplete in the app:

- `src/lib/exercise-dictionary-autocomplete-cache.ts`
- `src/hooks/useExerciseDictionaryAutocomplete.ts`

`loadExerciseDictionaryForAutocomplete(...)`:

- Accepts a typed Supabase client and `{ userId, limit, force }`.
- Uses a module-level cache keyed by `userId`.
- TTL is 5 minutes.
- Coalesces concurrent non-force loads for the same user.
- Queries:

```ts
.from('exercise_dictionary')
.select('id,name,slug,status')
.order('name')
.limit(opts.limit ?? 1000)
```

There is no `status` filter. RLS decides which published and pending rows the user can see.

`useExerciseDictionaryAutocomplete()`:

- Reads `userId` from `useUserProfileStore((s) => s.profile?.id ?? null)`.
- Returns `{ rows, loading, error, refresh }` (`error` is surfaced to composer `hashConfig.errorText`).
- Calls `clearExerciseDictionaryAutocompleteCache()` on Supabase `SIGNED_OUT`.
- Soft-fails on load errors: logs a sanitized message and preserves existing rows.

Composer consumers: `src/components/chat/ChatArea.tsx`,
`src/components/chat/WorkoutCoachRail.tsx` (merges workout-local names with dictionary
`rows`), and `src/components/modals/task-modal/TaskModalCommentsPanel.tsx`.

**Historical note:** The old published-only module hook (`usePublishedExerciseDictionary` /
`published-exercise-dictionary-cache`) was removed after this migration; do not reintroduce
a separate published-only client filter for the same UI.

## Tests

Relevant tests:

- `src/lib/exercise-dictionary-autocomplete-cache.test.ts`
  - TTL cache hit
  - userId-keyed cache separation
  - `force: true` bypass
  - clear-all invalidation
- `src/lib/workout-factory/exercise-dictionary-bridge.test.ts`
  - insert payload includes or omits `created_by`
- `src/lib/workout-factory/generate-workout-chain-runner.test.ts`
  - `createdByUserId` forwards into `runExtractAndEnrichChain`

Useful verification commands:

```bash
npm run lint
npx tsc --noEmit
pnpm vitest run src/lib/exercise-dictionary-autocomplete-cache.test.ts
pnpm vitest run src/lib/workout-factory/exercise-dictionary-bridge.test.ts
pnpm vitest run src/lib/workout-factory/generate-workout-chain-runner.test.ts
```

## Manual QA

1. Sign in as user A.
2. Hit `/api/ai/generate-workout-chain` with a prompt that includes a novel exercise name.
3. Confirm the new `exercise_dictionary` row has `created_by = user A`.
4. In a separate authenticated session as user B, call the new RLS-aware autocomplete loader.
5. Confirm user B does not see user A's pending row.
6. Confirm trainer/admin users can see pending rows for curation.

SQL spot-check:

```sql
select status, count(*) filter (where created_by is null) as null_creator
from public.exercise_dictionary
group by status;
```

The pending count should grow only as new generations happen.

## Follow-Ups

- Revisit search strategy if dictionary size grows beyond the current load-all approach
  (`ilike`, trigram, or a dedicated RPC may become appropriate).
