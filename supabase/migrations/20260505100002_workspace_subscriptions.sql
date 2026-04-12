-- One subscription record per workspace (business / fitness types only).
-- The workspace owner is the billing entity; members inherit premium access.
--
-- status lifecycle:
--   trialing → active           (Stripe charges card at trial end)
--   trialing → trial_expired    (owner cancelled during trial OR card failed)
--   active   → past_due         (invoice payment failed)
--   active   → canceled         (owner explicitly cancelled post-trial)
--   past_due → active           (payment recovered)
--   past_due → canceled         (Stripe gives up after retries)

CREATE TABLE public.workspace_subscriptions (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           uuid        UNIQUE NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  stripe_customer_id     text,
  stripe_subscription_id text        UNIQUE,
  stripe_price_id        text,
  stripe_product_id      text,
  status                 text        NOT NULL DEFAULT 'trialing'
    CHECK (status IN (
      'trialing',
      'active',
      'past_due',
      'trial_expired',
      'canceled',
      'incomplete'
    )),
  trial_start            timestamptz,
  trial_end              timestamptz,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   bool        NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_subscriptions ENABLE ROW LEVEL SECURITY;

-- Any workspace member can read the subscription (UI needs to know gating status).
CREATE POLICY "workspace members can view subscription"
  ON public.workspace_subscriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM   public.workspace_members wm
      WHERE  wm.workspace_id = workspace_subscriptions.workspace_id
        AND  wm.user_id      = auth.uid()
    )
  );

-- All writes go through service-role API routes and webhook handler.

-- ──────────────────────────────────────────────────────────────────────────────
-- Helper: keep updated_at current
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_workspace_subscriptions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER workspace_subscriptions_updated_at
  BEFORE UPDATE ON public.workspace_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_workspace_subscriptions_updated_at();

-- ──────────────────────────────────────────────────────────────────────────────
-- Helper: stable lookup used by RLS-aware queries and the permission layer.
-- Returns 'no_subscription' when no row exists.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_workspace_subscription_status(p_workspace_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT ws.status FROM public.workspace_subscriptions ws
     WHERE  ws.workspace_id = p_workspace_id),
    'no_subscription'
  );
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- Helper: returns true when the workspace category requires a subscription.
-- community / kids / class are always free.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.workspace_requires_subscription(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT w.category_type IN ('business', 'fitness')
     FROM   public.workspaces w
     WHERE  w.id = p_workspace_id),
    false
  );
$$;

COMMENT ON TABLE public.workspace_subscriptions IS
  'Stripe subscription state for business/fitness workspaces. '
  'The owner pays; all members inherit the workspace premium status. '
  'Updated by the /api/stripe/webhook handler using the service role key.';
