-- Storefront Buddy Phase 1: meter anonymous @Buddy turns per workspace.
-- Writes are service_role only (Edge Function); clients may read their own row.

create table public.storefront_buddy_usage (
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  turn_count integer not null default 0,
  char_total integer not null default 0,
  last_used_at timestamptz not null default now(),
  primary key (auth_user_id, workspace_id),
  constraint storefront_buddy_usage_turn_count_nonneg check (turn_count >= 0),
  constraint storefront_buddy_usage_char_total_nonneg check (char_total >= 0)
);

comment on table public.storefront_buddy_usage is
  'Anonymous storefront @Buddy usage meter; incremented by agent-dispatch via service_role.';

create index storefront_buddy_usage_workspace_idx
  on public.storefront_buddy_usage (workspace_id);

alter table public.storefront_buddy_usage enable row level security;

create policy storefront_buddy_usage_select_own on public.storefront_buddy_usage
  for select
  to authenticated
  using (auth_user_id = (select auth.uid()));

comment on policy storefront_buddy_usage_select_own on public.storefront_buddy_usage is
  'Visitors (incl. signInAnonymously) may read their own usage row for UI gating.';

-- ---------------------------------------------------------------------------
-- RPC: increment_storefront_buddy_usage
-- Called by agent-dispatch (service_role). Anonymity from auth.users.is_anonymous
-- because the Edge Function has no end-user JWT.
-- ---------------------------------------------------------------------------

create or replace function public.increment_storefront_buddy_usage(
  p_workspace_id uuid,
  p_char_count integer,
  p_auth_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := coalesce(p_auth_user_id, auth.uid());
  v_is_anon boolean;
  v_turn integer;
  v_chars integer;
begin
  if p_workspace_id is null then
    raise exception 'increment_storefront_buddy_usage: p_workspace_id required'
      using errcode = 'P0001';
  end if;

  if v_user_id is null then
    raise exception 'increment_storefront_buddy_usage: no user id'
      using errcode = 'P0001';
  end if;

  select u.is_anonymous
    into v_is_anon
  from auth.users u
  where u.id = v_user_id;

  if coalesce(v_is_anon, false) is not true then
    return jsonb_build_object('ok', true, 'metered', false);
  end if;

  insert into public.storefront_buddy_usage as sbu (
    auth_user_id,
    workspace_id,
    turn_count,
    char_total,
    last_used_at
  )
  values (
    v_user_id,
    p_workspace_id,
    1,
    greatest(coalesce(p_char_count, 0), 0),
    now()
  )
  on conflict (auth_user_id, workspace_id) do update set
    turn_count = sbu.turn_count + 1,
    char_total = sbu.char_total + greatest(coalesce(p_char_count, 0), 0),
    last_used_at = now()
  returning sbu.turn_count, sbu.char_total into v_turn, v_chars;

  return jsonb_build_object(
    'ok', true,
    'metered', true,
    'turn_count', v_turn,
    'char_total', v_chars
  );
end;
$$;

comment on function public.increment_storefront_buddy_usage(uuid, integer, uuid) is
  'Upserts anonymous @Buddy usage for a workspace. Non-anonymous callers return metered=false.';

revoke all on function public.increment_storefront_buddy_usage(uuid, integer, uuid)
  from public;

revoke all on function public.increment_storefront_buddy_usage(uuid, integer, uuid)
  from anon;

revoke all on function public.increment_storefront_buddy_usage(uuid, integer, uuid)
  from authenticated;

grant execute on function public.increment_storefront_buddy_usage(uuid, integer, uuid)
  to service_role;
