-- Live marketing sandbox: guests post via anon key; team replies via service role (CRM API).

create table public.storefront_sandbox_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  channel_key text not null check (channel_key in ('welcome', 'qa')),
  author_kind text not null check (author_kind in ('guest', 'team')),
  guest_session_id uuid,
  display_name text,
  body text not null,
  constraint storefront_sandbox_messages_author_session_chk check (
    (author_kind = 'guest' and guest_session_id is not null)
    or (author_kind = 'team' and guest_session_id is null)
  ),
  constraint storefront_sandbox_messages_body_len_chk check (
    char_length(trim(body)) >= 1 and char_length(body) <= 2000
  ),
  constraint storefront_sandbox_messages_display_name_len_chk check (
    display_name is null or char_length(display_name) <= 80
  )
);

create index storefront_sandbox_messages_channel_created_idx
  on public.storefront_sandbox_messages (channel_key, created_at);

comment on table public.storefront_sandbox_messages is
  'Public marketing-site sandbox chat; guests use anon INSERT, team rows inserted with service role.';

alter table public.storefront_sandbox_messages enable row level security;

-- Anyone may read the public sandbox transcript (storefront + moderators).
create policy storefront_sandbox_messages_select_public
  on public.storefront_sandbox_messages
  for select
  to anon, authenticated
  using (true);

-- Guests post only as author_kind guest with a stable browser session id.
create policy storefront_sandbox_messages_insert_guest
  on public.storefront_sandbox_messages
  for insert
  to anon, authenticated
  with check (
    author_kind = 'guest'
    and guest_session_id is not null
    and channel_key in ('welcome', 'qa')
  );

alter publication supabase_realtime add table public.storefront_sandbox_messages;
