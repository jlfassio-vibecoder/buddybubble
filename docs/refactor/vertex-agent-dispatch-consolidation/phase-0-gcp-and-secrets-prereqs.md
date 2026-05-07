# Phase 0 — GCP project + Vertex enablement + Supabase secret rotation prep

> No code changes. This phase is operational prep so Phase 1 can ship as a normal PR
> without scrambling for credentials.

## Inputs

- A GCP project (existing or new) where Vertex AI Gemini will be billed.
- Supabase project with edge-function secret access (Dashboard → Edge Functions →
  Secrets, or `supabase secrets set`).
- Read access to the current Supabase secrets so we can audit what needs to coexist
  during the parallel-run window.

## Deliverables

1. A dedicated service account in GCP with the **minimum** Vertex role.
2. A JSON key for that SA, pasted into Supabase as a single secret.
3. A documented secret matrix in `docs/refactor/vertex-agent-dispatch-consolidation/secrets-matrix.md`
   that lists every secret in play during the migration window so nothing is dropped
   prematurely.

## Step-by-step

### 1. GCP — enable Vertex AI

```sh
gcloud services enable aiplatform.googleapis.com --project=<GCP_PROJECT_ID>
```

Verify in the console that **Vertex AI API** is `ENABLED`.

### 2. GCP — create the dispatch service account

```sh
gcloud iam service-accounts create bb-agent-dispatch \
  --display-name="BuddyBubble agent dispatch (Vertex Gemini)" \
  --project=<GCP_PROJECT_ID>

gcloud projects add-iam-policy-binding <GCP_PROJECT_ID> \
  --member="serviceAccount:bb-agent-dispatch@<GCP_PROJECT_ID>.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

Do **not** grant any other role. `roles/aiplatform.user` is exactly the publisher-API
scope Phase 1's auth helper will request. If you need to call Vertex Logging or
Monitoring later, grant those roles separately.

### 3. GCP — create + download a JSON key

```sh
gcloud iam service-accounts keys create ~/secrets/bb-agent-dispatch.json \
  --iam-account=bb-agent-dispatch@<GCP_PROJECT_ID>.iam.gserviceaccount.com
```

Treat the file like a database password: do not commit, do not paste into chat
transcripts, rotate if exposed.

### 4. GCP — set per-model quotas + alerts

In the Vertex Dashboard (Quotas & System Limits), set per-model quotas for
`gemini-2.5-flash` (and whatever Coach is using today; check `GEMINI_MODEL`
in Supabase secrets). Configure a **Cloud Monitoring alert at 70% of quota** so we get
warnings before any production throttle.

### 5. Supabase — set the new secrets, leave old ones in place

Add the following secrets (Dashboard → Edge Functions → Secrets, or
`supabase secrets set`). Use the canonical names below; the plan as originally written
used two competing names for the SA JSON.

| Var                        | Value                                                       | Phase that consumes it |
| -------------------------- | ----------------------------------------------------------- | ---------------------- |
| `GCP_PROJECT_ID`           | Your GCP project id                                         | Phase 1                |
| `GCP_LOCATION`             | `us-central1` (recommended for `gemini-2.5-flash`)          | Phase 1                |
| `GCP_SERVICE_ACCOUNT_JSON` | Full SA JSON, pasted (Supabase secrets allow multi-line)    | Phase 1                |
| `AGENT_WEBHOOK_SECRET`     | A new long random string (≥ 32 bytes base64)                | Phase 1                |
| `LLM_TIMEOUT_MS`           | `25000` (overrides the legacy 55s default; document in env) | Phase 1                |
| `LLM_DEBUG`                | unset (set to `1` only when debugging redacted prompts)     | Phase 1                |

**Do not delete** any of the following until **Phase 6** confirms cutover:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`, `VERTEX_GEMINI_MODEL`, `BUDDY_GEMINI_MODEL`, `ORGANIZER_GEMINI_MODEL`
- `BUBBLE_AGENT_WEBHOOK_SECRET`
- `BUDDY_AGENT_WEBHOOK_SECRET`
- `ORGANIZER_AGENT_WEBHOOK_SECRET`
- `GEMINI_FETCH_TIMEOUT_MS`, `BUDDY_GEMINI_FETCH_TIMEOUT_MS`, `ORGANIZER_GEMINI_FETCH_TIMEOUT_MS`

### 6. Document the secret matrix

Create `docs/refactor/vertex-agent-dispatch-consolidation/secrets-matrix.md` with a
table that, per secret, lists: **owner function**, **status (live / parallel / removed)**,
and **phase that flips it**. Update this file in every subsequent phase. This is the
single artifact that prevents an accidental "secret garbage collection" PR from
breaking the legacy dispatchers mid-migration.

Suggested initial table:

| Secret                                 | Live consumers (today)                                                      | Phase 1 consumer    | Phase 6 status |
| -------------------------------------- | --------------------------------------------------------------------------- | ------------------- | -------------- |
| `GCP_PROJECT_ID`                       | none                                                                        | `agent-dispatch-v2` | live           |
| `GCP_LOCATION`                         | none                                                                        | `agent-dispatch-v2` | live           |
| `GCP_SERVICE_ACCOUNT_JSON`             | none                                                                        | `agent-dispatch-v2` | live           |
| `AGENT_WEBHOOK_SECRET`                 | none                                                                        | `agent-dispatch-v2` | live           |
| `LLM_TIMEOUT_MS`                       | none                                                                        | `agent-dispatch-v2` | live           |
| `GEMINI_API_KEY`                       | `bubble-agent-dispatch`, `buddy-agent-dispatch`, `organizer-agent-dispatch` | unchanged           | **deleted**    |
| `GEMINI_MODEL` / `VERTEX_GEMINI_MODEL` | `bubble-agent-dispatch`                                                     | unchanged           | **deleted**    |
| `BUDDY_GEMINI_MODEL`                   | `buddy-agent-dispatch`                                                      | unchanged           | **deleted**    |
| `ORGANIZER_GEMINI_MODEL`               | `organizer-agent-dispatch`                                                  | unchanged           | **deleted**    |
| `BUBBLE_AGENT_WEBHOOK_SECRET`          | `bubble-agent-dispatch`                                                     | unchanged           | **deleted**    |
| `BUDDY_AGENT_WEBHOOK_SECRET`           | `buddy-agent-dispatch`                                                      | unchanged           | **deleted**    |
| `ORGANIZER_AGENT_WEBHOOK_SECRET`       | `organizer-agent-dispatch`                                                  | unchanged           | **deleted**    |
| `*_GEMINI_FETCH_TIMEOUT_MS`            | their respective functions                                                  | unchanged           | **deleted**    |

## Verification

- `gcloud projects get-iam-policy <GCP_PROJECT_ID> --filter='bindings.members:bb-agent-dispatch'`
  shows exactly one binding to `roles/aiplatform.user`.
- `supabase secrets list` (or Dashboard) shows the new five secrets present and
  every legacy secret still present.
- `docs/refactor/vertex-agent-dispatch-consolidation/secrets-matrix.md` is committed.

## Risk + rollback

- Phase 0 makes no code changes; rollback is "revoke the SA key and remove the new
  Supabase secrets."
- The new secrets are **inert** until Phase 1's function reads them — adding them
  early cannot affect the live dispatchers.

## Hand-off to next phase

Phase 1 expects:

- `GCP_PROJECT_ID`, `GCP_LOCATION`, `GCP_SERVICE_ACCOUNT_JSON`, `AGENT_WEBHOOK_SECRET`,
  `LLM_TIMEOUT_MS` set in Supabase Edge secrets.
- The secret matrix doc updated and committed.
- Vertex AI API enabled and quotas reviewed.
