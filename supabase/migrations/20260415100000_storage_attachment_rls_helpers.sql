-- Storage RLS for attachment buckets: path validation runs in SECURITY DEFINER helpers so
-- EXISTS subqueries are not affected by row visibility on tasks/messages, and session checks
-- use auth.uid() instead of auth.role() (reliable for storage API).

create or replace function public.storage_task_attachment_path_readable(_bucket_id text, _name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    _bucket_id = 'task-attachments'
    and auth.uid() is not null
    and exists (
      select 1
      from public.tasks t
      join public.bubbles b on b.id = t.bubble_id
      where split_part(_name, '/', 1) = b.workspace_id::text
        and split_part(_name, '/', 2) = t.id::text
        and public.is_workspace_member(b.workspace_id)
    );
$$;

create or replace function public.storage_task_attachment_path_writable(_bucket_id text, _name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    _bucket_id = 'task-attachments'
    and auth.uid() is not null
    and exists (
      select 1
      from public.tasks t
      join public.bubbles b on b.id = t.bubble_id
      where split_part(_name, '/', 1) = b.workspace_id::text
        and split_part(_name, '/', 2) = t.id::text
        and public.can_write_workspace(b.workspace_id)
    );
$$;

create or replace function public.storage_message_attachment_path_readable(_bucket_id text, _name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    _bucket_id = 'message-attachments'
    and auth.uid() is not null
    and exists (
      select 1
      from public.messages m
      join public.bubbles b on b.id = m.bubble_id
      where split_part(_name, '/', 1) = b.workspace_id::text
        and split_part(_name, '/', 2) = m.id::text
        and public.is_workspace_member(b.workspace_id)
    );
$$;

create or replace function public.storage_message_attachment_path_writable(_bucket_id text, _name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    _bucket_id = 'message-attachments'
    and auth.uid() is not null
    and exists (
      select 1
      from public.messages m
      join public.bubbles b on b.id = m.bubble_id
      where split_part(_name, '/', 1) = b.workspace_id::text
        and split_part(_name, '/', 2) = m.id::text
        and public.can_write_workspace(b.workspace_id)
    );
$$;

create or replace function public.storage_message_attachment_path_deletable(_bucket_id text, _name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    _bucket_id = 'message-attachments'
    and auth.uid() is not null
    and exists (
      select 1
      from public.messages m
      join public.bubbles b on b.id = m.bubble_id
      where split_part(_name, '/', 1) = b.workspace_id::text
        and split_part(_name, '/', 2) = m.id::text
        and public.can_write_workspace(b.workspace_id)
        and (
          m.user_id = auth.uid()
          or public.is_workspace_admin(b.workspace_id)
        )
    );
$$;

revoke all on function public.storage_task_attachment_path_readable(text, text) from public;
revoke all on function public.storage_task_attachment_path_writable(text, text) from public;
revoke all on function public.storage_message_attachment_path_readable(text, text) from public;
revoke all on function public.storage_message_attachment_path_writable(text, text) from public;
revoke all on function public.storage_message_attachment_path_deletable(text, text) from public;

grant execute on function public.storage_task_attachment_path_readable(text, text) to authenticated;
grant execute on function public.storage_task_attachment_path_writable(text, text) to authenticated;
grant execute on function public.storage_message_attachment_path_readable(text, text) to authenticated;
grant execute on function public.storage_message_attachment_path_writable(text, text) to authenticated;
grant execute on function public.storage_message_attachment_path_deletable(text, text) to authenticated;

-- task-attachments
drop policy if exists task_attachments_select on storage.objects;
drop policy if exists task_attachments_insert on storage.objects;
drop policy if exists task_attachments_update on storage.objects;
drop policy if exists task_attachments_delete on storage.objects;

create policy task_attachments_select on storage.objects
  for select using (public.storage_task_attachment_path_readable(bucket_id, name));

create policy task_attachments_insert on storage.objects
  for insert with check (public.storage_task_attachment_path_writable(bucket_id, name));

create policy task_attachments_update on storage.objects
  for update
  using (public.storage_task_attachment_path_writable(bucket_id, name))
  with check (public.storage_task_attachment_path_writable(bucket_id, name));

create policy task_attachments_delete on storage.objects
  for delete using (public.storage_task_attachment_path_writable(bucket_id, name));

-- message-attachments
drop policy if exists message_attachments_select on storage.objects;
drop policy if exists message_attachments_insert on storage.objects;
drop policy if exists message_attachments_update on storage.objects;
drop policy if exists message_attachments_delete on storage.objects;

create policy message_attachments_select on storage.objects
  for select using (public.storage_message_attachment_path_readable(bucket_id, name));

create policy message_attachments_insert on storage.objects
  for insert with check (public.storage_message_attachment_path_writable(bucket_id, name));

create policy message_attachments_update on storage.objects
  for update
  using (public.storage_message_attachment_path_writable(bucket_id, name))
  with check (public.storage_message_attachment_path_writable(bucket_id, name));

create policy message_attachments_delete on storage.objects
  for delete using (public.storage_message_attachment_path_deletable(bucket_id, name));
