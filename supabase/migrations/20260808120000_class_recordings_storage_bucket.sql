-- Private bucket for class instance video recordings.
-- Path convention: {workspace_id}/{class_instance_id}/{filename}
-- Read: workspace members where the path matches a real class_instances row.
-- Write: workspace admins (owner/admin) for that workspace.

insert into storage.buckets (id, name, public, file_size_limit)
values ('class-recordings', 'class-recordings', false, 2147483648)
on conflict (id) do update set public = excluded.public;

drop policy if exists class_recordings_select on storage.objects;
drop policy if exists class_recordings_insert on storage.objects;
drop policy if exists class_recordings_update on storage.objects;
drop policy if exists class_recordings_delete on storage.objects;

create policy class_recordings_select on storage.objects
  for select using (
    bucket_id = 'class-recordings'
    and auth.role() = 'authenticated'
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
    and exists (
      select 1
      from public.class_instances ci
      where ci.workspace_id = split_part(name, '/', 1)::uuid
        and ci.id = split_part(name, '/', 2)::uuid
        and public.is_workspace_admin(ci.workspace_id)
    )
  );
