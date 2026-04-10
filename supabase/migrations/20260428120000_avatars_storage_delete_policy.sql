-- Allow authenticated users to delete their own avatar objects under public/{uid}-...
-- (mirrors avatars_auth_insert). Enables client cleanup after a successful replacement upload.

drop policy if exists avatars_auth_delete on storage.objects;

create policy avatars_auth_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and name like 'public/' || auth.uid()::text || '-%'
  );
