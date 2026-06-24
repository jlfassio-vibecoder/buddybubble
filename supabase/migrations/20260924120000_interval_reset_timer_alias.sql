-- G3.5: Preferred RPC name for unified interval session reset (Tabata/EMOM/AMRAP).

create or replace function public.interval_reset_timer(p_interval_session_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  select public.amrap_reset_timer(p_interval_session_id);
$$;

comment on function public.interval_reset_timer(uuid) is
  'Unified interval reset alias; delegates to amrap_reset_timer for live_interval_sessions.';

revoke all on function public.interval_reset_timer(uuid) from public;
grant execute on function public.interval_reset_timer(uuid) to authenticated;
grant execute on function public.interval_reset_timer(uuid) to service_role;
