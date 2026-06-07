-- signInAnonymously() uses JWT role `authenticated`, not `anon`.
-- Nested RLS (tasks/bubbles policies joining workspaces) failed because only
-- workspaces_select_public_anon existed — authenticated storefront visitors saw no rows.

create policy workspaces_select_public_authenticated on public.workspaces
  for select
  to authenticated
  using (is_public = true);

-- Bubble Ups on public storefront cards: avoid invoker tasks SELECT in policy checks.
create policy task_bubble_ups_select_public_storefront on public.task_bubble_ups
  for select
  to authenticated
  using (public.is_public_storefront_task(task_id));

create policy task_bubble_ups_insert_public_storefront on public.task_bubble_ups
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_public_storefront_task(task_id)
  );

create policy task_bubble_ups_delete_public_storefront on public.task_bubble_ups
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    and public.is_public_storefront_task(task_id)
  );
