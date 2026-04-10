-- Allow "fitness" workspace template (workouts, classes, wellness).
alter table public.workspaces drop constraint if exists workspaces_category_type_check;
alter table public.workspaces add constraint workspaces_category_type_check
  check (category_type in ('business', 'kids', 'class', 'community', 'fitness'));
