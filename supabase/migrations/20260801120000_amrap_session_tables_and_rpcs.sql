-- Phase P5: AMRAP session tables + RPCs (durable timer + leaderboard).
-- Additive; isolated from chat invite metadata. Gated on live session membership.

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------

create table if not exists public.amrap_sessions (
  id uuid primary key default gen_random_uuid(),
  live_session_id uuid not null unique references public.live_sessions (id) on delete cascade,
  duration_seconds integer not null check (duration_seconds > 0),
  timer_phase text not null default 'idle'
    check (timer_phase in ('idle', 'setup', 'work', 'finished')),
  work_started_at timestamptz null,
  created_at timestamptz not null default now()
);

comment on table public.amrap_sessions is
  'One AMRAP block per live session; timer_phase and work_started_at are the server clock source.';

create table if not exists public.amrap_participants (
  id uuid primary key default gen_random_uuid(),
  amrap_session_id uuid not null references public.amrap_sessions (id) on delete cascade,
  user_id uuid null references auth.users (id),
  display_name text not null,
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (amrap_session_id, user_id)
);

comment on table public.amrap_participants is
  'AMRAP roster; host row created with session; guests may have null user_id.';

create unique index if not exists amrap_participants_one_host_per_session_idx
  on public.amrap_participants (amrap_session_id)
  where is_host = true;

create table if not exists public.amrap_session_rounds (
  id uuid primary key default gen_random_uuid(),
  amrap_session_id uuid not null references public.amrap_sessions (id) on delete cascade,
  participant_id uuid not null references public.amrap_participants (id) on delete cascade,
  logged_at timestamptz not null default now()
);

comment on table public.amrap_session_rounds is
  'Append-only round logs for leaderboard counts.';

create index if not exists amrap_participants_amrap_session_id_idx
  on public.amrap_participants (amrap_session_id);

create index if not exists amrap_session_rounds_amrap_session_id_idx
  on public.amrap_session_rounds (amrap_session_id);

create index if not exists amrap_session_rounds_participant_id_idx
  on public.amrap_session_rounds (participant_id);

-- ---------------------------------------------------------------------------
-- 2) RLS
-- ---------------------------------------------------------------------------

alter table public.amrap_sessions enable row level security;
alter table public.amrap_participants enable row level security;
alter table public.amrap_session_rounds enable row level security;

drop policy if exists amrap_sessions_select on public.amrap_sessions;
drop policy if exists amrap_participants_select on public.amrap_participants;
drop policy if exists amrap_session_rounds_select on public.amrap_session_rounds;

create policy amrap_sessions_select on public.amrap_sessions
  for select using (
    auth.uid() is not null
    and public.is_live_session_participant(amrap_sessions.live_session_id)
  );

create policy amrap_participants_select on public.amrap_participants
  for select using (
    auth.uid() is not null
    and exists (
      select 1
      from public.amrap_sessions s
      where s.id = amrap_participants.amrap_session_id
        and public.is_live_session_participant(s.live_session_id)
    )
  );

create policy amrap_session_rounds_select on public.amrap_session_rounds
  for select using (
    auth.uid() is not null
    and exists (
      select 1
      from public.amrap_sessions s
      where s.id = amrap_session_rounds.amrap_session_id
        and public.is_live_session_participant(s.live_session_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Realtime (postgres_changes subscriptions)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'amrap_sessions'
  ) then
    alter publication supabase_realtime add table public.amrap_sessions;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'amrap_participants'
  ) then
    alter publication supabase_realtime add table public.amrap_participants;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'amrap_session_rounds'
  ) then
    alter publication supabase_realtime add table public.amrap_session_rounds;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) RPC: amrap_create_for_session (host-only, idempotent)
-- ---------------------------------------------------------------------------

create or replace function public.amrap_create_for_session(
  p_live_session_id uuid,
  p_duration_seconds integer default 600
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_display_name text;
  v_amrap_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_duration_seconds is null or p_duration_seconds < 1 then
    raise exception 'invalid duration';
  end if;

  select ls.host_user_id
  into v_host
  from public.live_sessions ls
  where ls.id = p_live_session_id;

  if not found then
    raise exception 'live session not found';
  end if;

  if v_host <> auth.uid() then
    raise exception 'forbidden';
  end if;

  select lsp.display_name
  into v_display_name
  from public.live_session_participants lsp
  where lsp.session_id = p_live_session_id
    and lsp.user_id = auth.uid()
  limit 1;

  if v_display_name is null then
    v_display_name := 'Host';
  end if;

  insert into public.amrap_sessions (live_session_id, duration_seconds)
  values (p_live_session_id, p_duration_seconds)
  on conflict (live_session_id) do nothing;

  select s.id
  into v_amrap_id
  from public.amrap_sessions s
  where s.live_session_id = p_live_session_id;

  insert into public.amrap_participants (amrap_session_id, user_id, display_name, is_host)
  values (v_amrap_id, auth.uid(), v_display_name, true)
  on conflict (amrap_session_id, user_id) do update
    set display_name = excluded.display_name,
        is_host      = true;

  update public.live_sessions ls
  set interval_wrapper_kind = 'amrap',
      interval_wrapper_config = jsonb_build_object('amrap_session_id', v_amrap_id::text)
  where ls.id = p_live_session_id;

  return v_amrap_id;
end;
$$;

comment on function public.amrap_create_for_session(uuid, integer) is
  'Host-only: ensures one amrap_sessions row per live session, upserts host participant, sets live_sessions AMRAP wrapper config.';

revoke all on function public.amrap_create_for_session(uuid, integer) from public;
grant execute on function public.amrap_create_for_session(uuid, integer) to authenticated;
grant execute on function public.amrap_create_for_session(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 5) RPC: amrap_join_session (participant upsert)
-- ---------------------------------------------------------------------------

create or replace function public.amrap_join_session(
  p_amrap_session_id uuid,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live_session_id uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select s.live_session_id
  into v_live_session_id
  from public.amrap_sessions s
  where s.id = p_amrap_session_id;

  if not found then
    raise exception 'amrap session not found';
  end if;

  if not public.is_live_session_participant(v_live_session_id) then
    raise exception 'forbidden';
  end if;

  insert into public.amrap_participants (amrap_session_id, user_id, display_name, is_host)
  values (p_amrap_session_id, auth.uid(), p_display_name, false)
  on conflict (amrap_session_id, user_id) do update
    set display_name = excluded.display_name
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.amrap_join_session(uuid, text) is
  'Authenticated participant upsert into amrap_participants; requires live session membership.';

revoke all on function public.amrap_join_session(uuid, text) from public;
grant execute on function public.amrap_join_session(uuid, text) to authenticated;
grant execute on function public.amrap_join_session(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6) RPC: amrap_start_timer (host-only)
-- ---------------------------------------------------------------------------

create or replace function public.amrap_start_timer(p_amrap_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live_session_id uuid;
  v_host uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select s.live_session_id
  into v_live_session_id
  from public.amrap_sessions s
  where s.id = p_amrap_session_id;

  if not found then
    raise exception 'amrap session not found';
  end if;

  select ls.host_user_id
  into v_host
  from public.live_sessions ls
  where ls.id = v_live_session_id;

  if not found or v_host <> auth.uid() then
    raise exception 'forbidden';
  end if;

  update public.amrap_sessions s
  set timer_phase = 'work',
      work_started_at = now()
  where s.id = p_amrap_session_id;
end;
$$;

comment on function public.amrap_start_timer(uuid) is
  'Host-only: starts work timer (server clock source at work_started_at).';

revoke all on function public.amrap_start_timer(uuid) from public;
grant execute on function public.amrap_start_timer(uuid) to authenticated;
grant execute on function public.amrap_start_timer(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 7) RPC: amrap_log_round (caller own participant row)
-- ---------------------------------------------------------------------------

create or replace function public.amrap_log_round(
  p_amrap_session_id uuid,
  p_participant_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live_session_id uuid;
  v_uid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select s.live_session_id
  into v_live_session_id
  from public.amrap_sessions s
  where s.id = p_amrap_session_id;

  if not found then
    raise exception 'amrap session not found';
  end if;

  if not public.is_live_session_participant(v_live_session_id) then
    raise exception 'forbidden';
  end if;

  select ap.user_id
  into v_uid
  from public.amrap_participants ap
  where ap.id = p_participant_id
    and ap.amrap_session_id = p_amrap_session_id;

  if not found then
    raise exception 'participant not found';
  end if;

  if v_uid is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;

  insert into public.amrap_session_rounds (amrap_session_id, participant_id)
  values (p_amrap_session_id, p_participant_id);
end;
$$;

comment on function public.amrap_log_round(uuid, uuid) is
  'Logs one round for the caller''s own amrap_participants row.';

revoke all on function public.amrap_log_round(uuid, uuid) from public;
grant execute on function public.amrap_log_round(uuid, uuid) to authenticated;
grant execute on function public.amrap_log_round(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 8) RPC: amrap_reset_timer (host-only)
-- ---------------------------------------------------------------------------

create or replace function public.amrap_reset_timer(p_amrap_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live_session_id uuid;
  v_host uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select s.live_session_id
  into v_live_session_id
  from public.amrap_sessions s
  where s.id = p_amrap_session_id;

  if not found then
    raise exception 'amrap session not found';
  end if;

  select ls.host_user_id
  into v_host
  from public.live_sessions ls
  where ls.id = v_live_session_id;

  if not found or v_host <> auth.uid() then
    raise exception 'forbidden';
  end if;

  delete from public.amrap_session_rounds r
  where r.amrap_session_id = p_amrap_session_id;

  update public.amrap_sessions s
  set timer_phase = 'idle',
      work_started_at = null
  where s.id = p_amrap_session_id;
end;
$$;

comment on function public.amrap_reset_timer(uuid) is
  'Host-only: clears rounds and resets timer to idle.';

revoke all on function public.amrap_reset_timer(uuid) from public;
grant execute on function public.amrap_reset_timer(uuid) to authenticated;
grant execute on function public.amrap_reset_timer(uuid) to service_role;
