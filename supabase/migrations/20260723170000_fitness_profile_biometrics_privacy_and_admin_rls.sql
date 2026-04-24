-- Fitness profile collaboration and biometrics privacy.
--
-- - Adds a DB-backed privacy flag for biometrics (weight/height/age) so clients can hide them.
-- - Extends RLS so workspace owners/admins can insert/update fitness_profiles for members.
-- - Adds an immutability trigger for workspace_id and user_id to prevent cross-user reassignment.
-- - Mirrors the email-privacy pattern with a security-definer RPC for self-toggling privacy.

alter table public.fitness_profiles
  add column if not exists biometrics_is_public boolean not null default true;

comment on column public.fitness_profiles.biometrics_is_public is
  'When false, weight/height/age are hidden from non-owner viewers (e.g. trainers) in the Fitness Profile sheet.';

-- -----------------------------------------------------------------------------
-- RLS: allow owners/admins to insert/update rows for workspace members
-- -----------------------------------------------------------------------------

-- Insert: admin may create a row for a workspace member (not arbitrary UUID).
drop policy if exists fitness_profiles_admin_insert on public.fitness_profiles;
create policy fitness_profiles_admin_insert
  on public.fitness_profiles for insert
  with check (
    public.is_workspace_admin(workspace_id)
    and exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = fitness_profiles.workspace_id
        and wm.user_id = fitness_profiles.user_id
    )
  );

-- Update: admin may update any row in workspace.
drop policy if exists fitness_profiles_admin_update on public.fitness_profiles;
create policy fitness_profiles_admin_update
  on public.fitness_profiles for update
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

-- -----------------------------------------------------------------------------
-- Immutability: prevent changing the row owner/workspace via update
-- -----------------------------------------------------------------------------

create or replace function public.fitness_profiles_prevent_reassign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'fitness_profiles.workspace_id is immutable';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'fitness_profiles.user_id is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists fitness_profiles_prevent_reassign_trigger on public.fitness_profiles;
create trigger fitness_profiles_prevent_reassign_trigger
before update on public.fitness_profiles
for each row execute function public.fitness_profiles_prevent_reassign();

-- -----------------------------------------------------------------------------
-- Privacy toggle RPC (self-service, mirrors set_workspace_member_show_email pattern)
-- -----------------------------------------------------------------------------

create or replace function public.set_fitness_profile_biometrics_public(
  p_workspace_id uuid,
  p_show boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.fitness_profiles fp
  set biometrics_is_public = p_show,
      updated_at = now()
  where fp.workspace_id = p_workspace_id
    and fp.user_id = auth.uid();
end;
$$;

comment on function public.set_fitness_profile_biometrics_public(uuid, boolean) is
  'Sets biometrics_is_public for the current user in one workspace.';

revoke all on function public.set_fitness_profile_biometrics_public(uuid, boolean) from public;
grant execute on function public.set_fitness_profile_biometrics_public(uuid, boolean) to authenticated;

