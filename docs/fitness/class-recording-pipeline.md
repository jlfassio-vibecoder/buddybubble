# Class recording metadata (manual upload + future Agora auto-attach)

## Storage shape (`class_instances.metadata.class_recording`)

Shared contract for **Track 2 (manual upload)** and **Track 1 (Agora Cloud Recording webhook)**:

| Field          | Type                                  | Notes                                                                                                                                                                           |
| -------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`         | `'class_recording'`                   | Discriminator                                                                                                                                                                   |
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

Webhook / Edge Function (service role) should **merge** into existing `class_instances.metadata` (do not clobber `live_session` / `async_session`):

1. **Start processing** when recording is requested or when Agora reports “started” (optional): set `class_recording.status = 'processing'`, clear or omit `errorMessage`, set `updatedAt`.
2. **On success** when a stable HTTPS URL exists: set `status = 'ready'`, `playbackUrl` (and/or upload to `class-recordings` and set `storagePath` for consistency with Track 2), `updatedAt`.
3. **On failure**: `status = 'failed'`, `errorMessage`, `updatedAt`.

**Resolving `class_instance_id` from Agora callbacks** is app-specific (e.g. map `channelName` / recording session id → instance). Consider a small mapping table or indexed metadata if JSONB scans become hot.

**Idempotency**: callbacks may retry; upserts should be safe (same `status`/`urls`).

## RLS / buckets

- Bucket: `class-recordings` (private). Policies: members **read** objects tied to a real `class_instances` row; workspace **admins** write/delete. See migration `20260808120000_class_recordings_storage_bucket.sql`.
