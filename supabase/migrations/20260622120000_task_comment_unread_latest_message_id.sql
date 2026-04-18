-- Extend task_comment_unread_counts with latest_unread_message_id for Kanban deep-link to thread.

drop function if exists public.task_comment_unread_counts(uuid[]);

create or replace function public.task_comment_unread_counts(p_task_ids uuid[])
returns table (task_id uuid, unread_count bigint, latest_unread_message_id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.id as task_id,
    (
      select count(*)::bigint
      from public.messages m
      where m.target_task_id = t.id
        and m.user_id <> auth.uid()
        and m.created_at > coalesce(
          (
            select v.last_viewed_at
            from public.user_task_views v
            where v.user_id = auth.uid()
              and v.task_id = t.id
          ),
          '-infinity'::timestamptz
        )
    ) as unread_count,
    (
      select m.id
      from public.messages m
      where m.target_task_id = t.id
        and m.user_id <> auth.uid()
        and m.created_at > coalesce(
          (
            select v.last_viewed_at
            from public.user_task_views v
            where v.user_id = auth.uid()
              and v.task_id = t.id
          ),
          '-infinity'::timestamptz
        )
      order by m.created_at desc
      limit 1
    ) as latest_unread_message_id
  from public.tasks t
  where t.id = any (p_task_ids);
$$;

comment on function public.task_comment_unread_counts(uuid[]) is
  'Unread task-scoped message count per task for `auth.uid()` (excludes own messages; uses `user_task_views.last_viewed_at`). Also returns the most recent unread message id for deep-linking.';

grant execute on function public.task_comment_unread_counts(uuid[]) to authenticated;
