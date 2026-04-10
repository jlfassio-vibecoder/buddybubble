-- Tighten fitness_profiles RLS: inserts/updates must target a workspace the user belongs to.
-- (Previous insert policy only checked user_id = auth.uid(), allowing rows for arbitrary workspace_id.)

drop policy if exists "users insert own fitness profile" on public.fitness_profiles;
create policy "users insert own fitness profile"
  on public.fitness_profiles for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = fitness_profiles.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "users update own fitness profile" on public.fitness_profiles;
create policy "users update own fitness profile"
  on public.fitness_profiles for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = fitness_profiles.workspace_id
        and wm.user_id = auth.uid()
    )
  );
