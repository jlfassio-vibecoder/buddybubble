-- Visualization Lab staging area — RLS, grants, and policies (tables + storage objects).
-- Companion: `20260729140000_visualization_lab_tables.sql` (tables, indexes, bucket).

alter table public.generated_exercises enable row level security;
alter table public.exercise_images enable row level security;

grant select, insert, update, delete on table public.generated_exercises to authenticated;
grant select, insert, update, delete on table public.exercise_images to authenticated;
grant all on table public.generated_exercises to service_role;
grant all on table public.exercise_images to service_role;

drop policy if exists generated_exercises_select_owner_or_trainer_admin on public.generated_exercises;
drop policy if exists generated_exercises_insert_owner_or_trainer_admin on public.generated_exercises;
drop policy if exists generated_exercises_update_owner_or_trainer_admin on public.generated_exercises;
drop policy if exists generated_exercises_delete_owner_or_trainer_admin on public.generated_exercises;

create policy generated_exercises_select_owner_or_trainer_admin
  on public.generated_exercises
  for select
  to authenticated
  using (
    generated_by = auth.uid()
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('admin', 'trainer')
    )
  );

create policy generated_exercises_insert_owner_or_trainer_admin
  on public.generated_exercises
  for insert
  to authenticated
  with check (
    generated_by = auth.uid()
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('admin', 'trainer')
    )
  );

create policy generated_exercises_update_owner_or_trainer_admin
  on public.generated_exercises
  for update
  to authenticated
  using (
    generated_by = auth.uid()
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('admin', 'trainer')
    )
  )
  with check (
    generated_by = auth.uid()
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('admin', 'trainer')
    )
  );

create policy generated_exercises_delete_owner_or_trainer_admin
  on public.generated_exercises
  for delete
  to authenticated
  using (
    generated_by = auth.uid()
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('admin', 'trainer')
    )
  );

drop policy if exists exercise_images_select_owner_or_trainer_admin on public.exercise_images;
drop policy if exists exercise_images_insert_owner_or_trainer_admin on public.exercise_images;
drop policy if exists exercise_images_update_owner_or_trainer_admin on public.exercise_images;
drop policy if exists exercise_images_delete_owner_or_trainer_admin on public.exercise_images;

create policy exercise_images_select_owner_or_trainer_admin
  on public.exercise_images
  for select
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('admin', 'trainer')
    )
  );

create policy exercise_images_insert_owner_or_trainer_admin
  on public.exercise_images
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('admin', 'trainer')
    )
  );

create policy exercise_images_update_owner_or_trainer_admin
  on public.exercise_images
  for update
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('admin', 'trainer')
    )
  )
  with check (
    created_by = auth.uid()
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('admin', 'trainer')
    )
  );

create policy exercise_images_delete_owner_or_trainer_admin
  on public.exercise_images
  for delete
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('admin', 'trainer')
    )
  );

drop policy if exists exercise_images_public_select on storage.objects;
drop policy if exists exercise_images_authenticated_insert on storage.objects;
drop policy if exists exercise_images_authenticated_update on storage.objects;
drop policy if exists exercise_images_authenticated_delete on storage.objects;

create policy exercise_images_public_select
  on storage.objects
  for select
  using (bucket_id = 'exercise-images');

create policy exercise_images_authenticated_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'exercise-images'
    and exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('admin', 'trainer')
    )
  );

create policy exercise_images_authenticated_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'exercise-images'
    and exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('admin', 'trainer')
    )
  )
  with check (
    bucket_id = 'exercise-images'
    and exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('admin', 'trainer')
    )
  );

create policy exercise_images_authenticated_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'exercise-images'
    and exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('admin', 'trainer')
    )
  );
