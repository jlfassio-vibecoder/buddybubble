-- Lead capture: anonymous / semi-anonymous visitors who arrived via an invite
-- link but have not yet created an account or started a trial.
--
-- Rows are created server-side (service role) via POST /api/leads/track.
-- No direct anon write access — the route checks the invite against public.invitations
-- (workspace match, not revoked/expired/depleted) before insert/update.

CREATE TABLE public.leads (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invite_token  text,
  -- 'qr' | 'link' | 'email' | 'sms' | 'direct'
  source        text        CHECK (source IN ('qr', 'link', 'email', 'sms', 'direct')),
  email         text,       -- populated when the originating invite was email-targeted
  utm_params    jsonb       NOT NULL DEFAULT '{}',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  converted_at  timestamptz,           -- set when the lead starts a trial
  user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata      jsonb       NOT NULL DEFAULT '{}'
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Workspace owners and admins can read leads for their workspace.
CREATE POLICY "workspace admins can view leads"
  ON public.leads
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM   public.workspace_members wm
      WHERE  wm.workspace_id = leads.workspace_id
        AND  wm.user_id      = auth.uid()
        AND  wm.role IN ('owner', 'admin')
    )
  );

-- No direct client inserts/updates; all writes go through service-role API routes.

COMMENT ON TABLE public.leads IS
  'Anonymous visitors who viewed a workspace via an invite link but have not yet started a trial. '
  'Rows are maintained by the /api/leads/track edge function using the service role key.';
