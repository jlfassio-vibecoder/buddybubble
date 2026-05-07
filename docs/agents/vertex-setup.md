# Vertex AI setup for `agent-dispatch-v2`

Operational guide for the GCP infrastructure that powers the consolidated agent
dispatcher. This document is the source of truth for the `GCP_*` secrets listed in
[`docs/refactor/vertex-agent-dispatch-consolidation/secrets-matrix.md`](../refactor/vertex-agent-dispatch-consolidation/secrets-matrix.md).

> Audience: ops + on-call. The dispatcher is described in the Phase 2 plan at
> [`docs/refactor/vertex-agent-dispatch-consolidation/phase-2-coach-strategy-and-v2-entry.md`](../refactor/vertex-agent-dispatch-consolidation/phase-2-coach-strategy-and-v2-entry.md).
> Coach-specific guidance lives in [`docs/agents/coach/README.md`](./coach/README.md).

## 1. GCP project layout

| Item                    | Value (production)                                | Notes                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GCP project             | `buddybubble-vertex` _(rename to match your org)_ | Dedicated project so quota and IAM are scoped to dispatcher use.                                                                                                                     |
| Region (`GCP_LOCATION`) | `us-central1`                                     | Vertex publisher API supports `gemini-2.5-flash` here; pick whichever region your bubble database is closest to.                                                                     |
| Default model           | `gemini-2.5-flash`                                | Configured per-strategy as `model` on the `AgentStrategy`. Override per-strategy in code; do not introduce a global env override unless you also document it in `secrets-matrix.md`. |

### Required APIs

Enable the following on the project:

```bash
gcloud services enable aiplatform.googleapis.com --project="$PROJECT_ID"
```

The dispatcher signs the RS256 JWT locally with WebCrypto and exchanges it directly
against Google's OAuth token endpoint (see
[`supabase/functions/_shared/llm/vertex-auth.ts`](../../supabase/functions/_shared/llm/vertex-auth.ts)).
It does not call the IAM Credentials API.

## 2. Service account + IAM

Create a dedicated Service Account whose only job is dispatcher OAuth exchange.

```bash
PROJECT_ID="buddybubble-vertex"
SA_NAME="agent-dispatch-v2"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create "$SA_NAME" \
  --project="$PROJECT_ID" \
  --display-name="agent-dispatch-v2 Vertex caller"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/aiplatform.user"
```

Grant only the minimum role:

- `roles/aiplatform.user` — required to call `:generateContent` on publisher models.

Do NOT grant `roles/owner`, `roles/editor`, or `roles/aiplatform.admin`. The
dispatcher never provisions models or modifies project state.

### Generate the JSON key

```bash
gcloud iam service-accounts keys create "/tmp/${SA_NAME}.json" \
  --iam-account="$SA_EMAIL" \
  --project="$PROJECT_ID"
```

Read the file's contents and set the secret as `GCP_SERVICE_ACCOUNT_JSON` in the
function's secret store (Supabase: `supabase secrets set GCP_SERVICE_ACCOUNT_JSON="$(cat /tmp/$SA_NAME.json)" --env-file ...`). Delete the local copy immediately:

```bash
shred -u "/tmp/${SA_NAME}.json"
```

The dispatcher parses `GCP_SERVICE_ACCOUNT_JSON` lazily and caches the parsed
`{ client_email, private_key }` pair in module scope; rotating the secret requires the
function to restart (next deploy).

## 3. Secrets

Set on the Supabase Edge Function environment for `agent-dispatch-v2`:

| Secret                      | Source    | Notes                                                                                                                         |
| --------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `GCP_PROJECT_ID`            | step 1    | The project that hosts Vertex API quota.                                                                                      |
| `GCP_LOCATION`              | step 1    | E.g. `us-central1`.                                                                                                           |
| `GCP_SERVICE_ACCOUNT_JSON`  | step 2    | Full JSON contents — never just the key.                                                                                      |
| `LLM_TIMEOUT_MS` (optional) | n/a       | Defaults to 25_000 ms; minimum 1_000 ms. Set lower only if you understand the retry budget in `_shared/llm/vertex-gemini.ts`. |
| `AGENT_WEBHOOK_SECRET`      | unchanged | The shared secret the Supabase webhook posts in `x-agent-secret`.                                                             |

Cross-reference the [secrets matrix](../refactor/vertex-agent-dispatch-consolidation/secrets-matrix.md) before adding or removing any secret.

## 4. Key rotation (90-day cadence)

Rotate `GCP_SERVICE_ACCOUNT_JSON` quarterly and on any suspected leak.

1. Create the new key (do NOT delete the old one yet):
   ```bash
   gcloud iam service-accounts keys create "/tmp/new.json" \
     --iam-account="$SA_EMAIL" \
     --project="$PROJECT_ID"
   ```
2. Set the new secret:
   ```bash
   supabase secrets set GCP_SERVICE_ACCOUNT_JSON="$(cat /tmp/new.json)" --project-ref ...
   shred -u /tmp/new.json
   ```
3. Redeploy `agent-dispatch-v2` so the new secret is loaded:
   ```bash
   supabase functions deploy agent-dispatch-v2 --no-verify-jwt
   ```
4. Wait ≥ 5 minutes for any in-flight requests on the old key to drain. Verify
   `vertex auth failed` log lines have stopped (see §6) before continuing.
5. Disable / delete the old key:
   ```bash
   gcloud iam service-accounts keys list --iam-account="$SA_EMAIL" --project="$PROJECT_ID"
   gcloud iam service-accounts keys delete <OLD_KEY_ID> \
     --iam-account="$SA_EMAIL" --project="$PROJECT_ID"
   ```

Keep a key-rotation log in your ops repo with the date + key id.

## 5. Quotas

Vertex publisher quotas live under
[GCP Console → Vertex AI → Quotas](https://console.cloud.google.com/iam-admin/quotas) for
the `aiplatform.googleapis.com` service. Pin alerts on:

| Quota                                                         | Why it matters                                                          | Recommended alert                         |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| `Generate content requests per minute per region per project` | Hard rate limit for `:generateContent`. Coach + future agents share it. | Page when usage > 70% of quota for 5 min. |
| `Total online prediction requests per region per minute`      | Same surface, regional aggregate.                                       | Page when usage > 80% for 10 min.         |

Request a quota increase before going wider on traffic; the dispatcher's retry policy
(`_shared/llm/vertex-gemini.ts:RETRY_DELAYS_MS`) absorbs short bursts but cannot mask a
sustained `429`.

## 6. Monitoring + observability

Two log surfaces matter:

- **Cloud Logging** (`projects/$PROJECT_ID/logs/aiplatform.googleapis.com%2Faiplatform.googleapis.com_*`)
  — verify Vertex saw the request and what it returned. Useful when Supabase logs show
  `error_kind=http`.
- **Supabase Edge Function logs** for `agent-dispatch-v2` — the structured JSON lines
  the dispatcher emits via `_shared/obs/log.ts`. Each line carries `request_id`,
  `slug`, `message_id`, `bubble_id`, `phase`, plus `model` / `latency_ms` /
  `http_status` / `error_kind` as appropriate.

Recommended alerts (Supabase logs):

| Alert                                                   | Trigger                   | Action                                                                                       |
| ------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| `vertex auth failed` (`level=error`, `error_kind=auth`) | Any occurrence            | Verify `GCP_SERVICE_ACCOUNT_JSON` is current; check key rotation log.                        |
| `dispatch failed` rate (`level=warn`)                   | > 5% of requests in 5 min | Inspect `error_kind`; if `timeout`, raise `LLM_TIMEOUT_MS`; if `http`, check Vertex Console. |
| `fallback insertion` (`fallback_ok=false`)              | Any occurrence            | RPC is broken — rollback to legacy dispatcher and page the on-call DBA.                      |

For deeper exploration of a single request, search Supabase logs by
`request_id=<uuid>`; every dispatch step shares one id.

## 7. Cross-references

- Secrets inventory: [`docs/refactor/vertex-agent-dispatch-consolidation/secrets-matrix.md`](../refactor/vertex-agent-dispatch-consolidation/secrets-matrix.md)
- Phase 2 plan: [`docs/refactor/vertex-agent-dispatch-consolidation/phase-2-coach-strategy-and-v2-entry.md`](../refactor/vertex-agent-dispatch-consolidation/phase-2-coach-strategy-and-v2-entry.md)
- Coach strategy: [`docs/agents/coach/README.md`](./coach/README.md)
- Smoke script: [`scripts/smoke-agent-dispatch-v2.ts`](../../scripts/smoke-agent-dispatch-v2.ts)
