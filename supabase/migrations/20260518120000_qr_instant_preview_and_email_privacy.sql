-- QR instant invite: expose invite_type in get_invite_preview.
-- Email privacy: per-workspace flag (default private); self-service update via RPC (RLS only allows admins to UPDATE rows).

alter table public.workspace_members
  add column if not exists show_email_to_workspace_members boolean not null default false;

comment on column public.workspace_members.show_email_to_workspace_members is
  'When false, hide this member''s email from other workspace peers (chat, non-admin surfaces). Owners/admins may still see email in admin tools.';

-- Invitee updates own flag without broader workspace_members UPDATE rights.
create or replace function public.set_workspace_member_show_email(
  p_workspace_id uuid,
  p_show boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.workspace_members wm
  set show_email_to_workspace_members = p_show
  where wm.workspace_id = p_workspace_id
    and wm.user_id = auth.uid();
end;
$$;

comment on function public.set_workspace_member_show_email(uuid, boolean) is
  'Sets show_email_to_workspace_members for the current user in one workspace.';

grant execute on function public.set_workspace_member_show_email(uuid, boolean) to authenticated;

create or replace function public.get_invite_preview(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := nullif(trim(p_token), '');
  inv public.invitations%rowtype;
  ws public.workspaces%rowtype;
  host_name text;
begin
  if v_token is null then
    return json_build_object('valid', false, 'error', 'invalid_token');
  end if;

  select * into inv
  from public.invitations
  where token = v_token;

  if not found then
    return json_build_object('valid', false, 'error', 'not_found');
  end if;

  if inv.revoked_at is not null then
    return json_build_object('valid', false, 'error', 'revoked');
  end if;

  if inv.expires_at <= now() then
    return json_build_object('valid', false, 'error', 'expired');
  end if;

  if inv.uses_count >= inv.max_uses then
    return json_build_object('valid', false, 'error', 'depleted');
  end if;

  select * into ws
  from public.workspaces
  where id = inv.workspace_id;

  if not found then
    return json_build_object('valid', false, 'error', 'not_found');
  end if;

  select coalesce(
    (
      select coalesce(
        nullif(trim(u.full_name), ''),
        nullif(trim(u.email), ''),
        'Host'
      )
      from public.users u
      where u.id = inv.created_by
    ),
    'Host'
  )
  into host_name;

  return json_build_object(
    'valid', true,
    'workspace_id', inv.workspace_id,
    'workspace_name', coalesce(ws.name, ''),
    'category_type', coalesce(ws.category_type, 'business'),
    'host_name', coalesce(host_name, 'Host'),
    'requires_approval', (inv.max_uses > 1),
    'invite_type', inv.invite_type,
    'max_uses', inv.max_uses
  );
end;
$$;

comment on function public.get_invite_preview(text) is
  'Anonymous-safe invite preview: workspace id, name, category_type, host label, invite_type, max_uses; validates token without RLS leaks.';
