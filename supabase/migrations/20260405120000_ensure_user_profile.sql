-- Backfill profiles for auth users created before the trigger or if the trigger failed.
-- workspaces.created_by FK requires a public.users row.

insert into public.users (id, email, full_name, avatar_url)
select
  au.id,
  au.email,
  coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', ''),
  au.raw_user_meta_data->>'avatar_url'
from auth.users au
where not exists (select 1 from public.users p where p.id = au.id);

-- Idempotent repair for the current session user (RLS-safe via security definer).
create or replace function public.ensure_profile_for_uid(_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  select
    au.id,
    au.email,
    coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', ''),
    au.raw_user_meta_data->>'avatar_url'
  from auth.users au
  where au.id = _uid
    and not exists (select 1 from public.users p where p.id = au.id);
end;
$$;

grant execute on function public.ensure_profile_for_uid(uuid) to authenticated;
