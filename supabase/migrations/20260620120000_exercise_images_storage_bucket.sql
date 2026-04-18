-- Spoke / Fitcopilot: public CDN-style bucket for exercise imagery (`exercise-images`).
-- RLS: world-readable; authenticated clients may manage objects (tighten to trainer/admin later if needed).

insert into storage.buckets (id, name, public)
values ('exercise-images', 'exercise-images', true)
on conflict (id) do nothing;

drop policy if exists exercise_images_public_select on storage.objects;
drop policy if exists exercise_images_authenticated_insert on storage.objects;
drop policy if exists exercise_images_authenticated_update on storage.objects;
drop policy if exists exercise_images_authenticated_delete on storage.objects;

create policy exercise_images_public_select on storage.objects
  for select
  using (bucket_id = 'exercise-images');

create policy exercise_images_authenticated_insert on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'exercise-images');

create policy exercise_images_authenticated_update on storage.objects
  for update
  to authenticated
  using (bucket_id = 'exercise-images')
  with check (bucket_id = 'exercise-images');

create policy exercise_images_authenticated_delete on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'exercise-images');
