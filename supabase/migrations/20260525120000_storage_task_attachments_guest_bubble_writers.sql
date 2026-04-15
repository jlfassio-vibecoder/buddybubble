-- Allow workspace guests (e.g. storefront trial) to upload task-attachment files when they can
-- edit the task's bubble. Previously only can_write_workspace(owner/admin/member) applied, so
-- trial guests failed AI card-cover upload with storage RLS while tasks UPDATE already allowed them.

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
        and (
          public.can_write_workspace(b.workspace_id)
          or public.can_write_bubble(b.id)
        )
    );
$$;
