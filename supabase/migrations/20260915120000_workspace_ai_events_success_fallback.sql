-- Allow success_fallback for workout factory deterministic fill telemetry (P3 observability).

alter table public.workspace_ai_events
  drop constraint if exists workspace_ai_events_event_type_check;

alter table public.workspace_ai_events
  add constraint workspace_ai_events_event_type_check
  check (event_type in (
    'success',
    'success_fallback',
    'error_truncated',
    'error_attestation',
    'error_parse',
    'error_shape',
    'error_http',
    'error_timeout',
    'error_auth',
    'error_other'
  ));
