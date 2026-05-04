-- Per-session workout metadata overlay for a deck slot (host "Apply to session only").
-- Participants merge this over joined tasks.metadata; cleared when host updates the original card.

alter table public.live_session_deck_items
  add column if not exists session_task_metadata jsonb null;

comment on column public.live_session_deck_items.session_task_metadata is
  'Optional session-scoped tasks.metadata JSON for this deck row; when set, live session UIs prefer it over joined tasks.metadata until cleared.';
