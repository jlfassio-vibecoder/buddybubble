-- Visualization Lab staging area.
-- AI-generated rows live here until human approval syncs them to exercise_dictionary.

create table if not exists public.generated_exercises (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  exercise_name text not null,
  image_url text,
  storage_path text,
  kinetic_chain_type text,
  biomechanics jsonb,
  image_prompt text,
  complexity_level text,
  visual_style text,
  sources jsonb default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  generated_by uuid not null references public.users(id) on delete cascade,
  generated_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  rejected_at timestamptz,
  rejected_by uuid references public.users(id),
  rejection_reason text,
  deep_dive_html_content text,
  suitable_blocks text[],
  main_workout_type text,
  video_url text,
  video_storage_path text,
  videos jsonb default '[]'::jsonb
);

create index if not exists idx_generated_exercises_slug_status
  on public.generated_exercises (slug, status)
  where status = 'approved';

create unique index if not exists idx_generated_exercises_approved_slug_unique
  on public.generated_exercises (slug)
  where status = 'approved';

create index if not exists idx_generated_exercises_status_created
  on public.generated_exercises (status, created_at desc);

create table if not exists public.exercise_images (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.generated_exercises(id) on delete cascade,
  role text not null,
  image_url text not null,
  storage_path text not null,
  image_prompt text,
  visual_style text,
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz default now(),
  position integer default 0,
  anatomical_section text,
  hidden boolean default false
);

create index if not exists idx_exercise_images_exercise_id
  on public.exercise_images (exercise_id, position);

insert into storage.buckets (id, name, public)
values ('exercise-images', 'exercise-images', true)
on conflict do nothing;

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
