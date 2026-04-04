-- Optional workspace avatar for the global rail (Slack/Discord-style icons).
alter table public.workspaces add column if not exists icon_url text;
