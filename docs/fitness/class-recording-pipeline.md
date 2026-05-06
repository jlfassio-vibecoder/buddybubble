# Class recording metadata (manual upload + future Agora auto-attach)

## Storage shape (`class_instances.metadata.class_recording`)

Shared contract for **Track 2 (manual upload)** and **Track 1 (Agora Cloud Recording webhook)**:

| Field          | Type                                  | Notes                                                                                                                                                                           |
| -------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`         | `'class_recording'`                   | Discriminator                                                                                                                                                                   |
| `provider`     | `'agora' \| 'manual'` (optional)      | Track 1 cloud recording vs Track 2 manual upload                                                                                                                                |
| `status`       | `'processing' \| 'ready' \| 'failed'` | Member UX + trainer state                                                                                                                                                       |
| `storagePath`  | string (optional)                     | Path inside Supabase bucket `class-recordings`: `{workspace_id}/{class_instance_id}/{filename}`. Prefer this for durable playback; clients call `createSignedUrl` at read time. |
| `playbackUrl`  | string (optional)                     | Legacy rows, public CDN, or vendor URL from Agora callback when you intentionally store a stable HTTPS URL.                                                                     |
| `createdAt`    | ISO string (optional)                 | First attach                                                                                                                                                                    |
| `updatedAt`    | ISO string (optional)                 | Last mutation                                                                                                                                                                   |
| `errorMessage` | string (optional)                     | Human-readable failure                                                                                                                                                          |

### Status semantics

- **`processing`**: upload in progress, transcoding, or webhook waiting for final file. Members see **Recording processing…** on the class card; async shell lobby disables Play until `ready` with a resolvable URL/path.
- **`ready`**: playback is available via `storagePath` and/or `playbackUrl`.
- **`failed`**: pipeline or upload failed; `errorMessage` should be set when known. Members can still open the async shell for **queue / logger**; video area shows a fallback.

## Track 2 (manual upload)

Trainers attach video in **Class Editor → Recording management** (workspace admins only). Flow:

1. Write `status: 'processing'` + `storagePath` to metadata.
2. `storage.upload` to `class-recordings`.
3. On success: `status: 'ready'` (same `storagePath`). On failure: `status: 'failed'` + `errorMessage`.

## Track 1 (Agora auto-attach) — implementation handoff

### Control plane (`class_recording_sessions`)

- Sprint 1 Edge Functions start/stop recording and set `agora_sid` on the session row.
- Sprint 2 Edge Function **`agora-recording-webhook`** (Notifications / `productId: 3`) updates:
  - `class_recording_sessions.status` → `uploading` / `ready` / `failed`
  - `class_instances.metadata.class_recording` → `ready` + `storagePath` or `failed` + `errorMessage`

**Auth:** `verify_jwt = false`; requests are authenticated with **`Agora-Signature`** = HMAC-SHA1 (hex) of the **raw JSON body** using **`AGORA_WEBHOOK_SECRET`**. Invalid signature → **401**.

### Metadata merge (webhook)

Webhook / Edge Function (service role) should **merge** into existing `class_instances.metadata` (do not clobber `live_session` / `async_session`):

1. **Start processing** (`agora-recording-start`): set `class_recording.status = 'processing'`, `provider: 'agora'`, `updatedAt` (and preserve `createdAt` when re-emitting).
2. **On upload success** (`agora-recording-webhook`, Agora events **31** or **32** with `details.status === 0`): set `status = 'ready'`, `storagePath` under `class-recordings` (`{workspace_id}/{class_instance_id}/…`), `updatedAt`. Prefer **`.mp4`** in `fileList` when present, else **`.m3u8`**.
3. **On failure**: set `status = 'failed'`, `errorMessage`, `updatedAt`, `provider: 'agora'`.

**Event notes (Agora reference vs our handler):**

| `eventType`     | Handling                                                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **4**           | First M3U8 uploaded — **non-terminal**; we set `class_recording_sessions.status` to **`uploading`** when appropriate (does **not** set metadata `failed`). |
| **33**          | Upload **progress** heartbeat (~1/min) — **ignored** (must **not** mark failure).                                                                          |
| **31** / **32** | Upload complete / backup complete — **success** path when `details.status === 0` and `fileList` resolves.                                                  |
| **1**           | Cloud recording **error** — mark **failed** when `errorLevel >= 4` (Major/Fatal).                                                                          |
| **11**          | **session_exit** — mark **failed** when `exitStatus === 1` (abnormal).                                                                                     |

**Resolving `class_instance_id`:** webhook loads `class_recording_sessions` by **`agora_sid`** (no JSONB scan).

**Idempotency**: if the session row is already **`ready`** or **`failed`**, return **200** immediately (Agora retries).

## RLS / buckets

- Bucket: `class-recordings` (private). Policies: members **read** objects tied to a real `class_instances` row; workspace **admins** write/delete. See migration `20260808120000_class_recordings_storage_bucket.sql`.
