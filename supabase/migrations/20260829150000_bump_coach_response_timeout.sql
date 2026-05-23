-- Coach draft-outline turns (Phase 2) need longer than the 30s default failsafe.
-- useAgentResponseWait reads this per agent; only Coach is bumped for now.

update public.agent_definitions
set response_timeout_ms = 90000
where slug = 'coach';
