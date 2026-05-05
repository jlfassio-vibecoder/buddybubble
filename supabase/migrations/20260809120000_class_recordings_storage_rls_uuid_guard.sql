-- Harden class-recordings RLS: avoid ::uuid cast exceptions on malformed object keys
-- (invalid paths should deny access, not error during policy evaluation).

drop policy if exists class_recordings_select on storage.objects;
drop policy if exists class_recordings_insert on storage.objects;
drop policy if exists class_recordings_update on storage.objects;
drop policy if exists class_recordings_delete on storage.objects;

-- UUID v1–v5 string form (case-insensitive); matches app validators for workspace/instance ids.
create policy class_recordings_select on storage.objects
  for select using (
    bucket_id = 'class-recordings'
    and auth.role() = 'authenticated'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.class_instances ci
      where ci.workspace_id = split_part(name, '/', 1)::uuid
        and ci.id = split_part(name, '/', 2)::uuid
        and public.is_workspace_member(ci.workspace_id)
    )
  );

create policy class_recordings_insert on storage.objects
  for insert with check (
    bucket_id = 'class-recordings'
    and auth.role() = 'authenticated'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.class_instances ci
      where ci.workspace_id = split_part(name, '/', 1)::uuid
        and ci.id = split_part(name, '/', 2)::uuid
        and public.is_workspace_admin(ci.workspace_id)
    )
  );

create policy class_recordings_update on storage.objects
  for update using (
    bucket_id = 'class-recordings'
    and auth.role() = 'authenticated'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.class_instances ci
      where ci.workspace_id = split_part(name, '/', 1)::uuid
        and ci.id = split_part(name, '/', 2)::uuid
        and public.is_workspace_admin(ci.workspace_id)
    )
  )
  with check (
    bucket_id = 'class-recordings'
    and auth.role() = 'authenticated'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.class_instances ci
      where ci.workspace_id = split_part(name, '/', 1)::uuid
        and ci.id = split_part(name, '/', 2)::uuid
        and public.is_workspace_admin(ci.workspace_id)
    )
  );

create policy class_recordings_delete on storage.objects
  for delete using (
    bucket_id = 'class-recordings'
    and auth.role() = 'authenticated'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.class_instances ci
      where ci.workspace_id = split_part(name, '/', 1)::uuid
        and ci.id = split_part(name, '/', 2)::uuid
        and public.is_workspace_admin(ci.workspace_id)
    )
  );
