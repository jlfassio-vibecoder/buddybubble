-- exercise_dictionary: pending rows visible to creator (authenticated) + trainer/admin; published for all.
-- Reconciles local history with remote: column/index may already exist (idempotent).
-- Copilot suggestion ignored: column+FK backfill was done in production (Step 1); idempotent add is enough for new envs; orphan columns without FK are an ops fix, not this migration.
-- exercise_dictionary_select_anon stays broad (published + pending) for public SEO; authenticated SELECT is what scopes pending in this change.

alter table public.exercise_dictionary
  add column if not exists created_by uuid references public.users (id) on delete set null;

create index if not exists exercise_dictionary_created_by_idx
  on public.exercise_dictionary (created_by);

comment on column public.exercise_dictionary.created_by is
  'AI generator stamps the auth.uid() of the user who triggered the generation. Pending rows are visible only to created_by; published rows are visible to everyone. Trainer/admin SELECT policy bypasses this for curation. service_role bypasses RLS entirely (RAG / curation pipeline keeps full visibility).';

drop policy if exists exercise_dictionary_select_authenticated on public.exercise_dictionary;

create policy exercise_dictionary_select_authenticated
  on public.exercise_dictionary
  for select
  to authenticated
  using (
    status = 'published'
    or (status = 'pending' and created_by = auth.uid())
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid() and u.role in ('admin', 'trainer')
    )
  );
