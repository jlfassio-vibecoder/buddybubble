-- Reconciler sweep: status IN (…) AND updated_at < cutoff ORDER BY updated_at ASC LIMIT 50
create index if not exists class_recording_sessions_reconciler_sweep
  on public.class_recording_sessions (status, updated_at asc)
  where status in ('starting', 'recording', 'stopping', 'uploading', 'stopped');
