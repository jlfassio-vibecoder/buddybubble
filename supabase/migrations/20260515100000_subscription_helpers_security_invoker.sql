-- Harden subscription helper RPCs: SECURITY DEFINER bypassed RLS and allowed
-- any caller to read subscription status / workspace category for arbitrary IDs.
-- SECURITY INVOKER applies the caller's privileges so existing RLS policies govern visibility.

CREATE OR REPLACE FUNCTION public.get_workspace_subscription_status(p_workspace_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT ws.status FROM public.workspace_subscriptions ws
     WHERE  ws.workspace_id = p_workspace_id),
    'no_subscription'
  );
$$;

CREATE OR REPLACE FUNCTION public.workspace_requires_subscription(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT w.category_type IN ('business', 'fitness')
     FROM   public.workspaces w
     WHERE  w.id = p_workspace_id),
    false
  );
$$;
