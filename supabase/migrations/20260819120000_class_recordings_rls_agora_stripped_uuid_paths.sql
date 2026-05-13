-- Allow Agora cloud-recording object keys where the first two path segments are
-- hyphen-stripped lowercase UUIDs (matches `agora-recording-start` `fileNamePrefix`).
-- Manual uploads continue to use hyphenated UUID segments; both layouts are allowed.

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
      where public.is_workspace_member(ci.workspace_id)
        and (
          (
            split_part(name, '/', 1)
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and split_part(name, '/', 2)
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and ci.workspace_id = split_part(name, '/', 1)::uuid
            and ci.id = split_part(name, '/', 2)::uuid
          )
          or (
            split_part(name, '/', 1) ~ '^[0-9a-f]{32}$'
            and split_part(name, '/', 2) ~ '^[0-9a-f]{32}$'
            and lower(replace(ci.workspace_id::text, '-', '')) = lower(split_part(name, '/', 1))
            and lower(replace(ci.id::text, '-', '')) = lower(split_part(name, '/', 2))
          )
        )
    )
  );

create policy class_recordings_insert on storage.objects
  for insert with check (
    bucket_id = 'class-recordings'
    and auth.role() = 'authenticated'
    and exists (
      select 1
      from public.class_instances ci
      where public.is_workspace_admin(ci.workspace_id)
        and (
          (
            split_part(name, '/', 1)
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and split_part(name, '/', 2)
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and ci.workspace_id = split_part(name, '/', 1)::uuid
            and ci.id = split_part(name, '/', 2)::uuid
          )
          or (
            split_part(name, '/', 1) ~ '^[0-9a-f]{32}$'
            and split_part(name, '/', 2) ~ '^[0-9a-f]{32}$'
            and lower(replace(ci.workspace_id::text, '-', '')) = lower(split_part(name, '/', 1))
            and lower(replace(ci.id::text, '-', '')) = lower(split_part(name, '/', 2))
          )
        )
    )
  );

create policy class_recordings_update on storage.objects
  for update using (
    bucket_id = 'class-recordings'
    and auth.role() = 'authenticated'
    and exists (
      select 1
      from public.class_instances ci
      where public.is_workspace_admin(ci.workspace_id)
        and (
          (
            split_part(name, '/', 1)
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and split_part(name, '/', 2)
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and ci.workspace_id = split_part(name, '/', 1)::uuid
            and ci.id = split_part(name, '/', 2)::uuid
          )
          or (
            split_part(name, '/', 1) ~ '^[0-9a-f]{32}$'
            and split_part(name, '/', 2) ~ '^[0-9a-f]{32}$'
            and lower(replace(ci.workspace_id::text, '-', '')) = lower(split_part(name, '/', 1))
            and lower(replace(ci.id::text, '-', '')) = lower(split_part(name, '/', 2))
          )
        )
    )
  )
  with check (
    bucket_id = 'class-recordings'
    and auth.role() = 'authenticated'
    and exists (
      select 1
      from public.class_instances ci
      where public.is_workspace_admin(ci.workspace_id)
        and (
          (
            split_part(name, '/', 1)
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and split_part(name, '/', 2)
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and ci.workspace_id = split_part(name, '/', 1)::uuid
            and ci.id = split_part(name, '/', 2)::uuid
          )
          or (
            split_part(name, '/', 1) ~ '^[0-9a-f]{32}$'
            and split_part(name, '/', 2) ~ '^[0-9a-f]{32}$'
            and lower(replace(ci.workspace_id::text, '-', '')) = lower(split_part(name, '/', 1))
            and lower(replace(ci.id::text, '-', '')) = lower(split_part(name, '/', 2))
          )
        )
    )
  );

create policy class_recordings_delete on storage.objects
  for delete using (
    bucket_id = 'class-recordings'
    and auth.role() = 'authenticated'
    and exists (
      select 1
      from public.class_instances ci
      where public.is_workspace_admin(ci.workspace_id)
        and (
          (
            split_part(name, '/', 1)
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and split_part(name, '/', 2)
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and ci.workspace_id = split_part(name, '/', 1)::uuid
            and ci.id = split_part(name, '/', 2)::uuid
          )
          or (
            split_part(name, '/', 1) ~ '^[0-9a-f]{32}$'
            and split_part(name, '/', 2) ~ '^[0-9a-f]{32}$'
            and lower(replace(ci.workspace_id::text, '-', '')) = lower(split_part(name, '/', 1))
            and lower(replace(ci.id::text, '-', '')) = lower(split_part(name, '/', 2))
          )
        )
    )
  );
