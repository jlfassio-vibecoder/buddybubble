-- Public bucket for user profile images; paths: public/{user_id}-{timestamp}.{ext}

insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 5242880)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists avatars_public_read on storage.objects;
drop policy if exists avatars_auth_insert on storage.objects;

-- Anyone may read objects in the public avatars bucket (URLs are public).
create policy avatars_public_read on storage.objects
  for select using (bucket_id = 'avatars');

-- Authenticated users may upload only under public/{their user id}-...
create policy avatars_auth_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and name like 'public/' || auth.uid()::text || '-%'
  );
