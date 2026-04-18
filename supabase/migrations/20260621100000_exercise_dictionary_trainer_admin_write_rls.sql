-- Spoke: allow hub trainers and global admins to curate exercise_dictionary via PostgREST (not only service_role).
-- Relies on public.users.role from trainer-hub migrations.

alter table public.exercise_dictionary enable row level security;

grant insert, update on table public.exercise_dictionary to authenticated;

drop policy if exists exercise_dictionary_insert_trainer_admin on public.exercise_dictionary;
drop policy if exists exercise_dictionary_update_trainer_admin on public.exercise_dictionary;

create policy exercise_dictionary_insert_trainer_admin on public.exercise_dictionary
  for insert
  to authenticated
  with check (
    (select u.role from public.users u where u.id = auth.uid()) in ('admin', 'trainer')
  );

create policy exercise_dictionary_update_trainer_admin on public.exercise_dictionary
  for update
  to authenticated
  using (
    (select u.role from public.users u where u.id = auth.uid()) in ('admin', 'trainer')
  )
  with check (
    (select u.role from public.users u where u.id = auth.uid()) in ('admin', 'trainer')
  );
