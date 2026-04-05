-- Per-user IANA timezone (profile); used for display and to seed workspace calendar timezone (see docs).

alter table public.users
  add column if not exists timezone text not null default 'UTC';

comment on column public.users.timezone is 'IANA timezone (e.g. America/Los_Angeles); user preference.';
