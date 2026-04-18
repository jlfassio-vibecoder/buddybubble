-- Trainer Spoke: catalog purchase ordering on app users (hub parity with Fitcopilot `purchased_index`).
alter table public.users
  add column if not exists purchased_index integer default 0;

comment on column public.users.purchased_index is
  'Trainer-hub storefront: index for purchased program ordering; default 0.';
