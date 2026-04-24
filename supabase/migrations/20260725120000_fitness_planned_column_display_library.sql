-- Rename fitness Kanban first column display from "Planned" to "Library" (slug stays `planned`).
update public.board_columns bc
set name = 'Library'
from public.workspaces w
where bc.workspace_id = w.id
  and w.category_type = 'fitness'
  and bc.slug = 'planned';
