-- JSONB columns for task detail UI (subtasks, comments, activity, attachment metadata).
-- Supabase Storage bucket for binary files; paths: {workspace_id}/{task_id}/{filename}

alter table public.tasks
  add column if not exists subtasks jsonb not null default '[]'::jsonb;

alter table public.tasks
  add column if not exists comments jsonb not null default '[]'::jsonb;

alter table public.tasks
  add column if not exists activity_log jsonb not null default '[]'::jsonb;

alter table public.tasks
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Private bucket for task file uploads (metadata still lives in tasks.attachments JSONB)
insert into storage.buckets (id, name, public, file_size_limit)
values ('task-attachments', 'task-attachments', false, 52428800)
on conflict (id) do update set public = excluded.public;

-- Path convention: {workspace_id}/{task_id}/{object_name}
-- workspace_id and task_id must match a real task row the user can access.

drop policy if exists task_attachments_select on storage.objects;
drop policy if exists task_attachments_insert on storage.objects;
drop policy if exists task_attachments_update on storage.objects;
drop policy if exists task_attachments_delete on storage.objects;

create policy task_attachments_select on storage.objects
  for select using (
    bucket_id = 'task-attachments'
    and auth.role() = 'authenticated'
    and exists (
      select 1
      from public.tasks t
      join public.bubbles b on b.id = t.bubble_id
      where split_part(name, '/', 1) = b.workspace_id::text
        and split_part(name, '/', 2) = t.id::text
        and public.is_workspace_member(b.workspace_id)
    )
  );

create policy task_attachments_insert on storage.objects
  for insert with check (
    bucket_id = 'task-attachments'
    and auth.role() = 'authenticated'
    and exists (
      select 1
      from public.tasks t
      join public.bubbles b on b.id = t.bubble_id
      where split_part(name, '/', 1) = b.workspace_id::text
        and split_part(name, '/', 2) = t.id::text
        and public.can_write_workspace(b.workspace_id)
    )
  );

create policy task_attachments_update on storage.objects
  for update using (
    bucket_id = 'task-attachments'
    and auth.role() = 'authenticated'
    and exists (
      select 1
      from public.tasks t
      join public.bubbles b on b.id = t.bubble_id
      where split_part(name, '/', 1) = b.workspace_id::text
        and split_part(name, '/', 2) = t.id::text
        and public.can_write_workspace(b.workspace_id)
    )
  )
  with check (
    bucket_id = 'task-attachments'
    and auth.role() = 'authenticated'
    and exists (
      select 1
      from public.tasks t
      join public.bubbles b on b.id = t.bubble_id
      where split_part(name, '/', 1) = b.workspace_id::text
        and split_part(name, '/', 2) = t.id::text
        and public.can_write_workspace(b.workspace_id)
    )
  );

create policy task_attachments_delete on storage.objects
  for delete using (
    bucket_id = 'task-attachments'
    and auth.role() = 'authenticated'
    and exists (
      select 1
      from public.tasks t
      join public.bubbles b on b.id = t.bubble_id
      where split_part(name, '/', 1) = b.workspace_id::text
        and split_part(name, '/', 2) = t.id::text
        and public.can_write_workspace(b.workspace_id)
    )
  );
