-- Storefront SSR + anonymous visitors must read bubbles in published workspaces.
-- Without this, tasks_select_public_* EXISTS subqueries fail, tasks embeds return null,
-- and the storefront bubbleIds query returns [].

create policy bubbles_select_public_anon on public.bubbles
  for select
  to anon
  using (
    exists (
      select 1
      from public.workspaces w
      where w.id = bubbles.workspace_id
        and w.is_public = true
    )
  );

create policy bubbles_select_public_authenticated on public.bubbles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspaces w
      where w.id = bubbles.workspace_id
        and w.is_public = true
    )
  );
