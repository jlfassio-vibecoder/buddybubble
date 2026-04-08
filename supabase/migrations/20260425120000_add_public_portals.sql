-- Public community portals: storefront-friendly workspace identity + card visibility (Phase 1 schema).

-- ---------------------------------------------------------------------------
-- workspaces: public portal fields
-- ---------------------------------------------------------------------------

alter table public.workspaces
  add column if not exists public_slug text;

alter table public.workspaces
  add column if not exists custom_domain text;

alter table public.workspaces
  add column if not exists is_public boolean not null default false;

alter table public.workspaces
  add column if not exists public_branding jsonb not null default '{}'::jsonb;

comment on column public.workspaces.public_slug is 'URL path segment for Astro storefront (e.g. grace-church). Unique when set.';
comment on column public.workspaces.custom_domain is 'Org-owned hostname mapped to storefront; unique when set.';
comment on column public.workspaces.is_public is 'When true, anon may read this workspace (and public tasks) per RLS.';
comment on column public.workspaces.public_branding is 'Public-only branding payload (logo, hero, colors, copy).';

-- One non-null slug/domain per workspace; multiple nulls allowed.
create unique index if not exists workspaces_public_slug_unique
  on public.workspaces (public_slug)
  where public_slug is not null;

create unique index if not exists workspaces_custom_domain_unique
  on public.workspaces (custom_domain)
  where custom_domain is not null;

-- ---------------------------------------------------------------------------
-- tasks: visibility for public storefront
-- ---------------------------------------------------------------------------

alter table public.tasks
  add column if not exists visibility text not null default 'private';

alter table public.tasks
  drop constraint if exists tasks_visibility_check;

alter table public.tasks
  add constraint tasks_visibility_check
  check (visibility in ('private', 'public'));

comment on column public.tasks.visibility is 'private: members only; public: anon-readable when workspace is_public.';

-- ---------------------------------------------------------------------------
-- RLS: anon read-only access to published portals + public cards
-- ---------------------------------------------------------------------------

create policy workspaces_select_public_anon on public.workspaces
  for select
  to anon
  using (is_public = true);

create policy tasks_select_public_anon on public.tasks
  for select
  to anon
  using (
    visibility = 'public'
    and exists (
      select 1
      from public.bubbles b
      inner join public.workspaces w on w.id = b.workspace_id
      where b.id = tasks.bubble_id
        and w.is_public = true
    )
  );
