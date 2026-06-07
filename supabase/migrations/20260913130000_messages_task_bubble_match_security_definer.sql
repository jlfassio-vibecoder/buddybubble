-- Task-comment bubble validation must read tasks regardless of inserter RLS
-- (storefront anonymous users may insert via public policies but not pass tasks_select).

create or replace function public.messages_target_task_bubble_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.target_task_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.tasks t
    where t.id = new.target_task_id
      and t.bubble_id = new.bubble_id
  ) then
    raise exception 'messages.target_task_id requires messages.bubble_id to match tasks.bubble_id for that task';
  end if;
  return new;
end;
$$;

-- Storefront comment insert: resolve bubble_id without inserter tasks RLS.
drop policy if exists messages_insert_public_storefront_task_comments on public.messages;

create policy messages_insert_public_storefront_task_comments on public.messages
  for insert with check (
    user_id = (select auth.uid())
    and target_task_id is not null
    and public.is_public_storefront_task(target_task_id)
    and bubble_id = public.get_task_bubble_id(target_task_id)
  );
