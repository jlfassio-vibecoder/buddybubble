-- Additive RLS on public.class_enrollments:
-- Allow users with public.users.role in ('trainer', 'admin') to INSERT and DELETE
-- enrollment rows for any user_id in the same workspace, without dropping the
-- existing self-serve policies (Postgres OR-combines RLS policies per action).

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'class_enrollments'
      and policyname = 'trainers and admins can insert class enrollments'
  ) then
    create policy "trainers and admins can insert class enrollments"
      on public.class_enrollments
      for insert
      with check (
        exists (
          select 1
          from public.users u
          join public.workspace_members wm on wm.user_id = u.id
          where u.id = auth.uid()
            and wm.workspace_id = class_enrollments.workspace_id
            and u.role in ('trainer', 'admin')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'class_enrollments'
      and policyname = 'trainers and admins can delete class enrollments'
  ) then
    create policy "trainers and admins can delete class enrollments"
      on public.class_enrollments
      for delete
      using (
        exists (
          select 1
          from public.users u
          join public.workspace_members wm on wm.user_id = u.id
          where u.id = auth.uid()
            and wm.workspace_id = class_enrollments.workspace_id
            and u.role in ('trainer', 'admin')
        )
      );
  end if;
end $$;

comment on policy "trainers and admins can insert class enrollments" on public.class_enrollments is
  'Additive policy: users.role in (trainer, admin) who belong to the enrollment workspace may insert rows for any user_id (host-driven roster management). Self-serve insert policy remains in effect via OR.';

comment on policy "trainers and admins can delete class enrollments" on public.class_enrollments is
  'Additive policy: users.role in (trainer, admin) who belong to the enrollment workspace may delete any enrollment row in that workspace (host roster removal). Self-delete policy remains in effect via OR.';
