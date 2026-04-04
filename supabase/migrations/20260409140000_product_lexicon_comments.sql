-- Documentation-only: product terms vs internal table names.
-- UI: a BuddyBubble is stored in `workspaces`; a Bubble (channel) is stored in `bubbles`.
comment on table public.workspaces is 'BuddyBubble (tenant silo). Internal table name kept for stability.';
comment on table public.bubbles is 'Bubble (channel inside a BuddyBubble).';
comment on table public.workspace_members is 'User membership in a BuddyBubble (workspace).';
