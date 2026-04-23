-- Phase 2 (agent-routing refactor): per-agent failsafe timeout for optimistic "typing" UI.
--
-- Context: `useAgentResponseWait` reads `response_timeout_ms` from the agent definition so that
-- different agents (Coach, Buddy, Organizer, and future social-space-specific Coach variants)
-- can each control how long the UI waits before clearing a pending typing indicator if the
-- Edge Function never replies.
--
-- Default (30000 ms) matches the current frontend `BUDDY_TYPING_TIMEOUT_MS` and is longer than
-- the legacy `COACH_WAIT_FAILSAFE_MS` (15000 ms). Individual rows can be tuned via UPDATE.

alter table public.agent_definitions
  add column if not exists response_timeout_ms integer not null default 30000;

alter table public.agent_definitions
  drop constraint if exists agent_definitions_response_timeout_ms_check;

alter table public.agent_definitions
  add constraint agent_definitions_response_timeout_ms_check
    check (response_timeout_ms > 0 and response_timeout_ms <= 300000);

comment on column public.agent_definitions.response_timeout_ms is
  'Per-agent failsafe (ms) used by the optimistic "typing" UI in useAgentResponseWait. '
  'Clears the pending indicator if the agent''s reply never arrives. Default 30000 ms.';
