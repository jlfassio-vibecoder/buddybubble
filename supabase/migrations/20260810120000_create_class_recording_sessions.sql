-- Agora Cloud Recording control plane (Track 1). Edge Functions use service_role only;
-- RLS enabled with no policies so PostgREST denies anon/authenticated; service_role bypasses RLS.

create table if not exists public.class_recording_sessions (
  id                 uuid primary key default gen_random_uuid(),
  class_instance_id  uuid not null references public.class_instances (id) on delete cascade,
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  status             text not null
    check (status in (
      'acquiring',
      'starting',
      'recording',
      'stopping',
      'stopped',
      'uploading',
      'ready',
      'failed'
    )),
  agora_resource_id  text,
  agora_sid          text,
  channel_name       text not null,
  agora_uid          integer not null,
  raw_start_response jsonb,
  error_message      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  started_at         timestamptz,
  stopped_at         timestamptz
);

comment on table public.class_recording_sessions is
  'Agora cloud recording lifecycle; written only via Edge Functions (service_role). Frontend must not query this table.';

create unique index if not exists class_recording_sessions_one_active_per_instance
  on public.class_recording_sessions (class_instance_id)
  where status in ('acquiring', 'starting', 'recording');

create unique index if not exists class_recording_sessions_agora_sid_unique
  on public.class_recording_sessions (agora_sid)
  where agora_sid is not null;

create index if not exists class_recording_sessions_instance_status_updated
  on public.class_recording_sessions (class_instance_id, status, updated_at desc);

create index if not exists class_recording_sessions_workspace_created
  on public.class_recording_sessions (workspace_id, created_at desc);

create or replace function public.class_recording_sessions_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists class_recording_sessions_set_updated_at on public.class_recording_sessions;
create trigger class_recording_sessions_set_updated_at
  before update on public.class_recording_sessions
  for each row
  execute function public.class_recording_sessions_set_updated_at();

alter table public.class_recording_sessions enable row level security;
