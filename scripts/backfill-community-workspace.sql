-- Backfill community template: `board_columns` + default Bubbles for an existing workspace
-- created before dynamic seeding (e.g. only had "General").
--
-- How to run:
--   1. Find your workspace id, e.g. in Dashboard → Table Editor → workspaces, or run:
--        SELECT id, name, category_type FROM public.workspaces;
--   2. In the DO block below, replace NULL with your id:
--        ws uuid := 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::uuid;
--   3. Supabase Dashboard → SQL Editor → paste → Run
--   Or psql: edit the file first, then:
--        psql "$SUPABASE_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/backfill-community-workspace.sql
--
-- Safe to re-run: skips rows that already exist (same workspace_id + slug, or same bubble name).
-- Does not delete or rename existing Bubbles (e.g. legacy "General").
--
-- Tasks: if you already have tasks with status todo/in_progress/done, consider mapping them to the
-- new slugs in a separate step; the Kanban UI maps unknown statuses to the first column.

DO $$
DECLARE
  ws uuid := 'd4834875-b202-45c9-9d64-7c920b5c2648'::uuid;
BEGIN
  IF ws IS NULL THEN
    RAISE EXCEPTION
      'Assign ws in this script (it is NULL). Example: ws uuid := ''xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx''::uuid. '
      'Find ids with: SELECT id, name FROM public.workspaces;';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = ws) THEN
    RAISE EXCEPTION 'Workspace % not found.', ws;
  END IF;

  IF (SELECT category_type FROM public.workspaces WHERE id = ws) IS DISTINCT FROM 'community' THEN
    RAISE WARNING 'Workspace % is not category_type community; continuing anyway.', ws;
  END IF;

  INSERT INTO public.board_columns (workspace_id, name, slug, position)
  SELECT ws, v.name, v.slug, v.position
  FROM (
    VALUES
      ('Planning', 'planning', 0),
      ('Scheduled', 'scheduled', 1),
      ('Today', 'today', 2),
      ('Past Events', 'past_events', 3)
  ) AS v(name, slug, position)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.board_columns bc
    WHERE bc.workspace_id = ws AND bc.slug = v.slug
  );

  INSERT INTO public.bubbles (workspace_id, name, icon)
  SELECT ws, v.name, 'Hash'::text
  FROM (
    VALUES
      ('Announcements'),
      ('General Chat'),
      ('Upcoming Events'),
      ('Volunteer Coordination')
  ) AS v(name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.bubbles b
    WHERE b.workspace_id = ws AND b.name = v.name
  );
END $$;
