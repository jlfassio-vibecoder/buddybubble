-- One Stripe Customer record per authenticated user.
--
-- This is the enforcement point for "one trial per person ever":
-- before creating a Stripe subscription we check has_had_trial = false.
-- The stripe_customer_id is created lazily on the user's first billing action.

CREATE TABLE public.stripe_customers (
  user_id            uuid  PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text  NOT NULL UNIQUE,
  has_had_trial      bool  NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_customers ENABLE ROW LEVEL SECURITY;

-- Users can read their own Stripe customer record (e.g. to show billing status in UI).
CREATE POLICY "users can view own stripe customer"
  ON public.stripe_customers
  FOR SELECT
  USING (auth.uid() = user_id);

-- All writes go through service-role API routes and webhook handler.

COMMENT ON TABLE public.stripe_customers IS
  'Maps auth.users → Stripe Customer. '
  'has_had_trial prevents a single user from getting multiple free trials across workspaces.';
