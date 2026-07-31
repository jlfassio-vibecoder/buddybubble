-- Per-user emoji reactions on chat messages (Comments tab / StandardTaskChatRail).

create table public.message_reactions (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji),
  constraint message_reactions_emoji_nonempty check (char_length(btrim(emoji)) > 0),
  -- Closed set aligned with src/lib/message-reactions.ts MESSAGE_REACTION_EMOJIS (v1).
  constraint message_reactions_emoji_allowed check (
    emoji = btrim(emoji)
    and emoji in ('👍', '❤️', '😂', '🎉', '👀')
  )
);

create index message_reactions_message_id_idx on public.message_reactions (message_id);

comment on table public.message_reactions is
  'One row per (message, user, emoji); delete row to remove that reaction.';

alter table public.message_reactions enable row level security;

-- SELECT: same visibility as the parent message (workspace_public / subject_threads)
create policy message_reactions_select on public.message_reactions
  for select using (
    exists (
      select 1
      from public.messages m
      where m.id = message_reactions.message_id
        and public.can_view_bubble(m.bubble_id)
        and (
          public.get_bubble_message_visibility(m.bubble_id) = 'workspace_public'
          or (
            public.get_bubble_message_visibility(m.bubble_id) = 'subject_threads'
            and (
              m.thread_subject_user_id = (select auth.uid())
              or public.is_workspace_admin(public.workspace_id_for_bubble(m.bubble_id))
            )
          )
        )
    )
  );

create policy message_reactions_insert on public.message_reactions
  for insert with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.messages m
      where m.id = message_id
        and public.can_view_bubble(m.bubble_id)
        and (
          public.get_bubble_message_visibility(m.bubble_id) = 'workspace_public'
          or (
            public.get_bubble_message_visibility(m.bubble_id) = 'subject_threads'
            and (
              m.thread_subject_user_id = (select auth.uid())
              or public.is_workspace_admin(public.workspace_id_for_bubble(m.bubble_id))
            )
          )
        )
    )
  );

create policy message_reactions_delete on public.message_reactions
  for delete using (user_id = (select auth.uid()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;
