-- Rich invite preview for anonymous users on `/invite/[token]` without widening RLS on workspaces/users.
-- Returns only workspace name, category theme, host display name, and approval hint.

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
    'workspace_name', coalesce(ws.name, ''),
    'category_type', coalesce(ws.category_type, 'business'),
    'host_name', coalesce(host_name, 'Host'),
    'requires_approval', (inv.max_uses > 1)
  );
end;
$$;

comment on function public.get_invite_preview(text) is
  'Anonymous-safe invite preview: workspace name, category_type, host label; validates token without RLS leaks.';

grant execute on function public.get_invite_preview(text) to anon;
grant execute on function public.get_invite_preview(text) to authenticated;
