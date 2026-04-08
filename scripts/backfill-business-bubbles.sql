-- Idempotent: add standard business-category bubbles to an existing workspace (by id).
-- Run in Supabase SQL Editor. Set ws to your demo workspace UUID(s) — one run per workspace.
--
-- Example (production demo):
--   ws uuid := 'c3689e06-0ae7-4af8-8107-35be049ee4b5'::uuid;
-- Example (local demo):
--   ws uuid := '5f903baa-7b09-497e-be83-4020edf45453'::uuid;

DO $$
DECLARE
  ws uuid := NULL; -- REQUIRED: paste workspace id here
BEGIN
  IF ws IS NULL THEN
    RAISE EXCEPTION
      'Set ws in this script. Example: ws uuid := ''xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx''::uuid; '
      'Find ids: SELECT id, name, category_type FROM public.workspaces ORDER BY created_at DESC;';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = ws) THEN
    RAISE EXCEPTION 'Workspace % not found.', ws;
  END IF;

  INSERT INTO public.bubbles (workspace_id, name, icon)
  SELECT ws, v.name, 'Hash'::text
  FROM (
    VALUES
      ('Dev Ops'),
      ('Customer Success'),
      ('General'),
      ('Announcements')
  ) AS v(name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.bubbles b
    WHERE b.workspace_id = ws AND b.name = v.name
  );
END $$;
