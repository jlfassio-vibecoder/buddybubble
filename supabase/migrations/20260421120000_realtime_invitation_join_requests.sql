-- Allow hosts to receive live pending-count updates (sidebar badge + chat bell) without polling.
alter publication supabase_realtime add table public.invitation_join_requests;
