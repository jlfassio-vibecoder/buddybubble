-- Storefront trial: guests were bubble_members.viewer on private trial bubbles, so
-- public.can_write_bubble() was false and the CRM disabled all task editing (canWriteTasks).
-- RLS still allowed some assigned-to-self updates; align DB role with intended trial UX.
update public.bubble_members bm
set role = 'editor'
from public.bubbles b
where bm.bubble_id = b.id
  and b.bubble_type = 'trial'
  and bm.role = 'viewer';
