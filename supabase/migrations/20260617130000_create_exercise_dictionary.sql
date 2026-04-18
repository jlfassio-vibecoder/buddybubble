-- Centralized exercise catalog for RAG / Vertex matching and public SEO (slug routes).
-- Writes: service_role (Edge, admin tooling). Reads: anon + authenticated via RLS.

create table if not exists public.exercise_dictionary (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  complexity_level text,
  kinetic_chain_type text,
  status text not null default 'pending',
  biomechanics jsonb not null default '{}'::jsonb,
  instructions jsonb not null default '[]'::jsonb,
  media jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_dictionary_slug_key unique (slug),
  constraint exercise_dictionary_status_nonempty check (length(trim(status)) > 0)
);

comment on table public.exercise_dictionary is
  'Canonical exercise catalog (slug SEO, RAG). Legacy fields map: name, slug, complexity_level, kinetic_chain_type, biomechanics jsonb, media jsonb, instructions as step strings.';

comment on column public.exercise_dictionary.slug is
  'URL-safe unique key for SEO routes (e.g. reverse-lunge-with-knee-drive-jump-1).';

comment on column public.exercise_dictionary.biomechanics is
  'JSON object: biomechanicalChain, commonMistakes, performanceCues, pivotPoints, stabilizationNeeds, etc.';

comment on column public.exercise_dictionary.instructions is
  'JSON array of step-by-step instruction strings.';

comment on column public.exercise_dictionary.media is
  'JSON object: imagePrompt, imageUrl, visualStyle, video URLs, etc.';

create or replace function public.exercise_dictionary_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists exercise_dictionary_set_updated_at on public.exercise_dictionary;
create trigger exercise_dictionary_set_updated_at
  before update on public.exercise_dictionary
  for each row
  execute function public.exercise_dictionary_set_updated_at();

-- UNIQUE(slug) supplies a btree index; explicit name index for lookups / ILIKE prefix scans.
create index if not exists exercise_dictionary_name_idx
  on public.exercise_dictionary (name);

alter table public.exercise_dictionary enable row level security;

-- Public read (SEO + app). No INSERT/UPDATE/DELETE policies for anon/authenticated => writes denied.
create policy exercise_dictionary_select_anon
  on public.exercise_dictionary
  for select
  to anon
  using (true);

create policy exercise_dictionary_select_authenticated
  on public.exercise_dictionary
  for select
  to authenticated
  using (true);

grant select on table public.exercise_dictionary to anon, authenticated;
grant all on table public.exercise_dictionary to service_role;
