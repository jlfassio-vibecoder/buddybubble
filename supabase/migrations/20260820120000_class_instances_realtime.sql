-- Broadcast class_instances UPDATEs (e.g. metadata.class_recording pipeline) to workspace clients.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'class_instances'
  ) then
    alter publication supabase_realtime add table public.class_instances;
  end if;
end $$;
