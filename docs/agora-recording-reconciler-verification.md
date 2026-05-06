# Agora recording reconciler — verification

## Automated (parsers)

With [Deno](https://deno.land/) installed:

```bash
deno test supabase/functions/_shared/agora-query-response.test.ts
```

## Manual matrix (staging)

| Scenario                | Setup                                                                                                                                    | Expected                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **404**                 | Stale row (`updated_at` >30m ago), valid `agora_resource_id` + `agora_sid`, Agora returns 404                                            | Session + `class_instances.metadata.class_recording` → `failed`, reason `agora_query_404_session_lost` |
| **Terminal + files**    | Stale row, Agora `query` 200 with `fileList` containing `.mp4` or `.m3u8`                                                                | Session → `ready`, metadata `ready` + `storagePath` under `{workspace_id}/{class_instance_id}/`        |
| **Active / unresolved** | Stale row, 200 but no parseable files                                                                                                    | No DB change; run summary `ignored++`                                                                  |
| **>24h timeout**        | Row `created_at` older than 24h (still in sweep statuses)                                                                                | `failed` + `reconciler_timeout_24h`                                                                    |
| **Auth**                | POST without `Authorization: Bearer <CRON_SECRET>`                                                                                       | `401`                                                                                                  |
| **Cron**                | Vault secrets `agora_reconciler_supabase_url` + `agora_reconciler_cron_secret` set; `cron.job` contains `agora-recording-reconciler-15m` | `net._http_response` shows periodic `200` from Edge Function when invoked                              |

## Vault + Edge secrets

1. Edge Function env: set `CRON_SECRET` (same value as vault secret below).
2. SQL (Dashboard):

   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'agora_reconciler_supabase_url');
   select vault.create_secret('<CRON_SECRET>', 'agora_reconciler_cron_secret');
   ```

3. Redeploy `agora-recording-reconciler` after setting secrets.
