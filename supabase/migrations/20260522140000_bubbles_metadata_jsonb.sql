-- Extensible per-bubble JSON (e.g. storefront trial workout_generation state for Realtime UX).
alter table public.bubbles
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.bubbles.metadata is
  'Arbitrary bubble-scoped JSON (e.g. workout_generation status for storefront trial async path).';

alter publication supabase_realtime add table public.bubbles;
