-- Allow minimal AMRAP wrapper kind on live_sessions; extend amrap_create_for_session with p_wrapper_kind.

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where rel.relname = 'live_sessions'
      and nsp.nspname = 'public'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%interval_wrapper_kind%'
  loop
    execute format('alter table public.live_sessions drop constraint if exists %I', r.conname);
  end loop;
end $$;

alter table public.live_sessions
  add constraint live_sessions_interval_wrapper_kind_check
  check (interval_wrapper_kind in ('none', 'amrap', 'amrap_minimal'));

comment on column public.live_sessions.interval_wrapper_kind is
  'Wrapper renderer: none, amrap (full drawer UI), amrap_minimal (video overlays only).';

drop function if exists public.amrap_create_for_session(uuid, integer, jsonb);

create or replace function public.amrap_create_for_session(
  p_live_session_id uuid,
  p_duration_seconds integer default 600,
  p_block_snapshot jsonb default null,
  p_wrapper_kind text default 'amrap'
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
  v_kind text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_duration_seconds is null or p_duration_seconds < 1 then
    raise exception 'invalid duration';
  end if;

  v_kind := coalesce(nullif(trim(p_wrapper_kind), ''), 'amrap');
  if v_kind not in ('amrap', 'amrap_minimal') then
    raise exception 'invalid wrapper kind';
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

  insert into public.amrap_sessions (live_session_id, duration_seconds, block_snapshot)
  values (p_live_session_id, p_duration_seconds, p_block_snapshot)
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
  set interval_wrapper_kind = v_kind,
      interval_wrapper_config = jsonb_build_object('amrap_session_id', v_amrap_id::text)
  where ls.id = p_live_session_id;

  return v_amrap_id;
end;
$$;

comment on function public.amrap_create_for_session(uuid, integer, jsonb, text) is
  'Host-only: ensures one amrap_sessions row per live session, upserts host participant, sets live_sessions wrapper kind (amrap or amrap_minimal) and config; optional block_snapshot on first insert.';

revoke all on function public.amrap_create_for_session(uuid, integer, jsonb, text) from public;
grant execute on function public.amrap_create_for_session(uuid, integer, jsonb, text) to authenticated;
grant execute on function public.amrap_create_for_session(uuid, integer, jsonb, text) to service_role;
