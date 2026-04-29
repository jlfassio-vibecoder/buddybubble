# Exercise dictionary preflight (BuddyBubble)

Use this as an operator checklist before changing `#` exercise autocomplete or relying on `exercise_dictionary` for the chat composer.

## Schema (see migrations)

- Table: `public.exercise_dictionary` with at least `id`, `slug`, `name`, `status`, plus JSON fields.
- RLS: `anon` and `authenticated` have **select** policies; writes are restricted (see migrations after the create table).
- The app client (publishable/anon or authenticated) should be able to read published rows without `service_role`.

## Row counts and filtering

Run against the target project (Supabase SQL editor or `supabase db`):

```sql
select status, count(*) as n
from public.exercise_dictionary
group by status
order by n desc;
```

For chat autocomplete we filter to **`status = 'published'`** in the client. If `published` count is very large (thousands+), consider server-side search (e.g. `ilike` on `name` or a dedicated RPC) instead of loading all rows.

## Health check query

```sql
select id, name, slug, status
from public.exercise_dictionary
where status = 'published'
order by name
limit 5;
```

## Index note

A btree index on `name` exists (`exercise_dictionary_name_idx`). For fuzzy/substring search at scale, a follow-up migration may add `pg_trgm` or a dedicated search column.
