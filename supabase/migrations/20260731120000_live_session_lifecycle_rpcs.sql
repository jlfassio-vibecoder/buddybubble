-- Phase P3: live-session lifecycle RPCs and Agora uid bridge.
-- Additive on top of 20260730120000_create_live_sessions_and_participants.sql.

-- ---------------------------------------------------------------------------
-- 1) Agora uid bridge (deterministic from agoraUidFromUuid; populated client-side).
-- ---------------------------------------------------------------------------

alter table public.live_session_participants
  add column if not exists agora_uid text null;

create index if not exists live_session_participants_session_agora_uid_idx
  on public.live_session_participants (session_id, agora_uid)
  where agora_uid is not null;

comment on column public.live_session_participants.agora_uid is
  'String form of agoraUidFromUuid(user_id); used for video tile identity. Nullable for guest/legacy rows.';

-- ---------------------------------------------------------------------------
-- 2) Host: insert session row AND host participant row in one call. Idempotent.
-- ---------------------------------------------------------------------------

create or replace function public.live_session_create(
  p_session_id   uuid,
  p_display_name text,
  p_agora_uid    text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.live_sessions (id, host_user_id)
  values (p_session_id, auth.uid())
  on conflict (id) do nothing;

  insert into public.live_session_participants (session_id, user_id, display_name, role, agora_uid)
  values (p_session_id, auth.uid(), p_display_name, 'host', p_agora_uid)
  on conflict (session_id, user_id) do update
    set display_name = excluded.display_name,
        agora_uid    = excluded.agora_uid;
end;
$$;

comment on function public.live_session_create(uuid, text, text) is
  'Host-only idempotent create: ensures live_sessions row exists and upserts host live_session_participants with agora_uid.';

revoke all on function public.live_session_create(uuid, text, text) from public;
grant execute on function public.live_session_create(uuid, text, text) to authenticated;
grant execute on function public.live_session_create(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3) Participant: upsert their own row (refreshes agora_uid on rejoin).
-- ---------------------------------------------------------------------------

create or replace function public.live_session_participant_join(
  p_session_id   uuid,
  p_display_name text,
  p_agora_uid    text,
  p_role         text default 'participant'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_role not in ('host', 'participant') then
    raise exception 'invalid role';
  end if;

  insert into public.live_session_participants (session_id, user_id, display_name, role, agora_uid)
  values (p_session_id, auth.uid(), p_display_name, p_role, p_agora_uid)
  on conflict (session_id, user_id) do update
    set display_name = excluded.display_name,
        role         = excluded.role,
        agora_uid    = excluded.agora_uid
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.live_session_participant_join(uuid, text, text, text) is
  'Authenticated participant upsert for live_session_participants; requires existing live_sessions row (host creates first).';

revoke all on function public.live_session_participant_join(uuid, text, text, text) from public;
grant execute on function public.live_session_participant_join(uuid, text, text, text) to authenticated;
grant execute on function public.live_session_participant_join(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4) Read RPC. SECURITY DEFINER but gated on caller membership.
-- ---------------------------------------------------------------------------

create or replace function public.live_session_list_participants(
  p_session_id uuid
) returns table (
  id           uuid,
  user_id      uuid,
  display_name text,
  role         text,
  agora_uid    text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_live_session_participant(p_session_id)
     and not exists (
       select 1
       from public.live_sessions ls
       where ls.id = p_session_id
         and ls.host_user_id = auth.uid()
     ) then
    raise exception 'forbidden';
  end if;

  return query
    select lsp.id, lsp.user_id, lsp.display_name, lsp.role, lsp.agora_uid
    from public.live_session_participants lsp
    where lsp.session_id = p_session_id;
end;
$$;

comment on function public.live_session_list_participants(uuid) is
  'Lists participants for a live session; caller must be host or an existing participant row.';

revoke all on function public.live_session_list_participants(uuid) from public;
grant execute on function public.live_session_list_participants(uuid) to authenticated;
grant execute on function public.live_session_list_participants(uuid) to service_role;
