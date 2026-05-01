-- Phase P0: Durable live-video session state for AMRAP wrappers.
-- This migration is additive and intentionally does not touch chat tables,
-- invite metadata, or live_session_deck_items.

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------

-- Created when Agora channel opens; id = Agora channel id
create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references auth.users (id),
  interval_wrapper_kind text not null default 'none'
    check (interval_wrapper_kind in ('none', 'amrap')),
  interval_wrapper_config jsonb null,
  created_at timestamptz not null default now()
);

comment on table public.live_sessions is
  'Durable live-video session row created when the Agora channel opens; isolated from chat invite metadata.';

comment on column public.live_sessions.interval_wrapper_kind is
  'Wrapper renderer selector for live-video clients. Phase P0 supports none/amrap.';

-- Created when a user joins the Agora channel
create table if not exists public.live_session_participants (
  id uuid primary key default gen_random_uuid(), -- this is the Agora account string
  session_id uuid not null references public.live_sessions (id) on delete cascade,
  user_id uuid null references auth.users (id), -- null for guests
  display_name text not null,
  role text not null check (role in ('host', 'participant')),
  joined_at timestamptz not null default now(),
  unique (session_id, user_id) -- prevents duplicate authenticated participant rows
);

comment on table public.live_session_participants is
  'Durable participant rows created when users join the Agora channel; guests may have null user_id.';

create index if not exists live_sessions_host_user_id_idx
  on public.live_sessions (host_user_id);

create index if not exists live_session_participants_session_id_idx
  on public.live_session_participants (session_id);

create index if not exists live_session_participants_user_id_idx
  on public.live_session_participants (user_id)
  where user_id is not null;

-- ---------------------------------------------------------------------------
-- 2) SECURITY DEFINER helper for RLS membership checks
-- ---------------------------------------------------------------------------

create or replace function public.is_live_session_participant(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.live_session_participants lsp
    where lsp.session_id = p_session_id
      and lsp.user_id = auth.uid()
  );
$$;

comment on function public.is_live_session_participant(uuid) is
  'RLS helper: returns true when auth.uid() has an authenticated participant row for the live session.';

revoke all on function public.is_live_session_participant(uuid) from public;
grant execute on function public.is_live_session_participant(uuid) to authenticated;
grant execute on function public.is_live_session_participant(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------

alter table public.live_sessions enable row level security;
alter table public.live_session_participants enable row level security;

drop policy if exists live_sessions_select on public.live_sessions;
drop policy if exists live_sessions_insert on public.live_sessions;
drop policy if exists live_sessions_update on public.live_sessions;

drop policy if exists live_session_participants_select on public.live_session_participants;
drop policy if exists live_session_participants_insert on public.live_session_participants;

-- live_sessions: host can read/update their session. Authenticated users can read
-- sessions they participate in. Host SELECT is required because UPDATE needs SELECT.
create policy live_sessions_select on public.live_sessions
  for select using (
    auth.uid() is not null
    and (
      host_user_id = auth.uid()
      or public.is_live_session_participant(live_sessions.id)
    )
  );

create policy live_sessions_insert on public.live_sessions
  for insert with check (
    auth.uid() is not null
    and host_user_id = auth.uid()
  );

create policy live_sessions_update on public.live_sessions
  for update
  using (
    auth.uid() is not null
    and host_user_id = auth.uid()
  )
  with check (
    auth.uid() is not null
    and host_user_id = auth.uid()
  );

-- live_session_participants: authenticated users can read participant rows in
-- their own session. Users can insert their own authenticated participant row.
create policy live_session_participants_select on public.live_session_participants
  for select using (
    auth.uid() is not null
    and public.is_live_session_participant(live_session_participants.session_id)
  );

create policy live_session_participants_insert on public.live_session_participants
  for insert with check (
    auth.uid() is not null
    and user_id = auth.uid()
    and (
      role = 'participant'
      or exists (
        select 1
        from public.live_sessions ls
        where ls.id = session_id
          and ls.host_user_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 4) RPC: host attaches AMRAP wrapper state to a live session
-- ---------------------------------------------------------------------------

create or replace function public.host_attach_amrap_session(
  p_session_id uuid,
  p_interval_wrapper_config jsonb default null
)
returns public.live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.live_sessions;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select *
  into v_session
  from public.live_sessions ls
  where ls.id = p_session_id;

  if not found then
    raise exception 'live session not found';
  end if;

  if v_session.host_user_id <> auth.uid() then
    raise exception 'forbidden';
  end if;

  update public.live_sessions ls
  set interval_wrapper_kind = 'amrap',
      interval_wrapper_config = p_interval_wrapper_config
  where ls.id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

comment on function public.host_attach_amrap_session(uuid, jsonb) is
  'Host-only RPC for attaching AMRAP wrapper config to a live session. SECURITY DEFINER; requires auth.uid() = live_sessions.host_user_id.';

revoke all on function public.host_attach_amrap_session(uuid, jsonb) from public;
grant execute on function public.host_attach_amrap_session(uuid, jsonb) to authenticated;
grant execute on function public.host_attach_amrap_session(uuid, jsonb) to service_role;
