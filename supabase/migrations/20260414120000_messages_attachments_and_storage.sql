-- Message attachment metadata + private storage bucket; paths: {workspace_id}/{message_id}/{object_name}

alter table public.messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit)
values ('message-attachments', 'message-attachments', false, 52428800)
on conflict (id) do update set public = excluded.public;

drop policy if exists message_attachments_select on storage.objects;
drop policy if exists message_attachments_insert on storage.objects;
drop policy if exists message_attachments_update on storage.objects;
drop policy if exists message_attachments_delete on storage.objects;

-- Path convention: {workspace_id}/{message_id}/{object_name}

create policy message_attachments_select on storage.objects
  for select using (
    bucket_id = 'message-attachments'
    and auth.role() = 'authenticated'
    and exists (
      select 1
      from public.messages m
      join public.bubbles b on b.id = m.bubble_id
      where split_part(name, '/', 1) = b.workspace_id::text
        and split_part(name, '/', 2) = m.id::text
        and public.is_workspace_member(b.workspace_id)
    )
  );

create policy message_attachments_insert on storage.objects
  for insert with check (
    bucket_id = 'message-attachments'
    and auth.role() = 'authenticated'
    and exists (
      select 1
      from public.messages m
      join public.bubbles b on b.id = m.bubble_id
      where split_part(name, '/', 1) = b.workspace_id::text
        and split_part(name, '/', 2) = m.id::text
        and public.can_write_workspace(b.workspace_id)
    )
  );

create policy message_attachments_update on storage.objects
  for update using (
    bucket_id = 'message-attachments'
    and auth.role() = 'authenticated'
    and exists (
      select 1
      from public.messages m
      join public.bubbles b on b.id = m.bubble_id
      where split_part(name, '/', 1) = b.workspace_id::text
        and split_part(name, '/', 2) = m.id::text
        and public.can_write_workspace(b.workspace_id)
    )
  )
  with check (
    bucket_id = 'message-attachments'
    and auth.role() = 'authenticated'
    and exists (
      select 1
      from public.messages m
      join public.bubbles b on b.id = m.bubble_id
      where split_part(name, '/', 1) = b.workspace_id::text
        and split_part(name, '/', 2) = m.id::text
        and public.can_write_workspace(b.workspace_id)
    )
  );

-- Align with public.messages_delete: author or workspace admin
create policy message_attachments_delete on storage.objects
  for delete using (
    bucket_id = 'message-attachments'
    and auth.role() = 'authenticated'
    and exists (
      select 1
      from public.messages m
      join public.bubbles b on b.id = m.bubble_id
      where split_part(name, '/', 1) = b.workspace_id::text
        and split_part(name, '/', 2) = m.id::text
        and public.can_write_workspace(b.workspace_id)
        and (
          m.user_id = auth.uid()
          or public.is_workspace_admin(b.workspace_id)
        )
    )
  );
