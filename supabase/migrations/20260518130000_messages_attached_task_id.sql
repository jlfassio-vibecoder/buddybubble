-- Chat feed cards (phase 1): optional link from a chat message to a Kanban row (`public.tasks`).
-- ON DELETE SET NULL keeps the message when the card is removed from the board.

alter table public.messages
  add column if not exists attached_task_id uuid references public.tasks (id) on delete set null;

comment on column public.messages.attached_task_id is
  'When set, this message embeds the given Kanban card (`tasks` row) in the Messages rail.';
