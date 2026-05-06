-- Sprint 3: schedule Agora recording reconciler Edge Function via pg_cron + pg_net + Vault.
--
-- Operator setup (Dashboard SQL or migration follow-up):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'agora_reconciler_supabase_url');
--   select vault.create_secret('<same value as Edge Function CRON_SECRET>', 'agora_reconciler_cron_secret');
--
-- The cron job no-ops when either secret is missing (guarded DO block).

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net;

-- supabase_vault provides `vault.decrypted_secrets` (hosted + recent local CLI).
create schema if not exists vault;
create extension if not exists supabase_vault with schema vault;

grant usage on schema cron to postgres;

-- Idempotent: drop prior schedule by stable job name.
do $$
declare
  jid bigint;
begin
  select j.jobid into jid
  from cron.job j
  where j.jobname = 'agora-recording-reconciler-15m'
  limit 1;
  if jid is not null then
    perform cron.unschedule(jid);
  end if;
end $$;

select cron.schedule(
  'agora-recording-reconciler-15m',
  '*/15 * * * *',
  $cron$
  do $job$
  begin
    if exists (
      select 1
      from vault.decrypted_secrets
      where name = 'agora_reconciler_supabase_url'
      limit 1
    )
    and exists (
      select 1
      from vault.decrypted_secrets
      where name = 'agora_reconciler_cron_secret'
      limit 1
    ) then
      perform net.http_post(
        url :=
          rtrim(
            (select decrypted_secret::text from vault.decrypted_secrets where name = 'agora_reconciler_supabase_url' limit 1),
            '/'
          )
          || '/functions/v1/agora-recording-reconciler',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization',
          'Bearer '
            || (select decrypted_secret::text from vault.decrypted_secrets where name = 'agora_reconciler_cron_secret' limit 1)
        ),
        body := jsonb_build_object(
          'source', 'pg_cron',
          'scheduled_at', to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ),
        timeout_milliseconds := 60000
      );
    end if;
  end
  $job$;
  $cron$
);
