-- Phase 4: public invite funnel — anon-safe preview without widening invitations RLS.
--
-- JSON shapes (no target_identity or other PII):
--   ok: true  → { ok, workspace_name, requires_approval }  (requires_approval = max_uses > 1)
--   ok: false → { ok, reason } where reason ∈
--     not_found | revoked | expired | depleted

create or replace function public.peek_invitation(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := nullif(trim(p_token), '');
  inv public.invitations%rowtype;
  ws_name text;
begin
  if v_token is null then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into inv
  from public.invitations
  where token = v_token;

  if not found then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;

  if inv.revoked_at is not null then
    return json_build_object('ok', false, 'reason', 'revoked');
  end if;

  if inv.expires_at <= now() then
    return json_build_object('ok', false, 'reason', 'expired');
  end if;

  if inv.uses_count >= inv.max_uses then
    return json_build_object('ok', false, 'reason', 'depleted');
  end if;

  select w.name into ws_name
  from public.workspaces w
  where w.id = inv.workspace_id;

  return json_build_object(
    'ok', true,
    'workspace_name', coalesce(ws_name, ''),
    'requires_approval', (inv.max_uses > 1)
  );
end;
$$;

grant execute on function public.peek_invitation(text) to anon;
grant execute on function public.peek_invitation(text) to authenticated;
