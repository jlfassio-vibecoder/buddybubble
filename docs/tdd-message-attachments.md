# Technical design: message attachments (uploads) and media modal

## 1. Problem

Chat messages in **`ChatArea`** are text-only today. The `messages` table has no attachment metadata, and there is no upload path in the composer (only legacy **`has:attachment`** search hints and a **`Paperclip`** icon in search results that are not wired to real data).

Users need to **attach images, videos, and documents** to a message. The feed should feel like a **message / media wall** (TikTok- or Facebook-like density): each message shows **fixed thumbnails** for attached media; **full playback or viewing happens in a modal**, not by expanding media inline in the scrollable feed.

## 2. Goals

1. **Attach** one or more files (image, video, document) to a **message** row, scoped by bubble/workspace membership (same trust model as chat today).
2. **Feed UX**: Show **thumbnails** (or document tiles) **bound to the message** below or beside the text; consistent aspect ratio and tap targets.
3. **Detail UX**: Tapping a thumbnail opens a **dedicated media modal** (image zoom / video player / document preview or download)—**not** inline video or large images in the thread list.
4. **Threads**: Thread replies are rows in `messages` with `parent_id`; attachments should work for **root messages and replies** the same way.

### Non-goals (v1 unless product insists)

- In-feed autoplay video or sound.
- Built-in image editor, annotations, or collaborative cursors.
- Server-side transcoding or automatic poster extraction for video (can be phased; see §6).
- Email export of attachments.

## 3. Current implementation map

| Area                     | Location                                                      | Notes                                                                                                                                |
| ------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Message schema           | `public.messages`                                             | `content`, `bubble_id`, `user_id`, `parent_id`, `created_at` — **no attachments column** in `20260404140000_initial_schema.sql`.     |
| Chat UI                  | `src/components/chat/ChatArea.tsx`                            | Inserts text-only; loads `messages` with `select('*')`; **`rowToChatMessage`** does not set `attachments`.                           |
| Legacy type              | `ChatMessage.attachments`                                     | Optional `attachments?: { length: number }[]` — **obsolete shape**; replace with real metadata.                                      |
| Task pattern (reference) | `TaskModal`, `src/lib/task-storage.ts`                        | Private bucket **`task-attachments`**, path `{workspace_id}/{task_id}/{uuid}_{safeName}`; metadata in **`tasks.attachments`** JSONB. |
| Storage RLS              | `20260407130000_tasks_jsonb_and_task_attachments_storage.sql` | Policies join `tasks` + `bubbles` by path segments.                                                                                  |

## 4. Design overview

### 4.1 Data model

**Add `attachments jsonb not null default '[]'::jsonb` to `public.messages`**, mirroring the task model: append-only style updates when files finish uploading.

**Suggested TypeScript shape** (single source of truth in app types, aligned with JSON):

```ts
type MessageAttachment = {
  id: string; // client or server uuid for stable React keys (whole-message delete removes all)
  kind: 'image' | 'video' | 'document';
  /** Storage object path within the message-attachments bucket */
  path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string; // ISO
  /** Optional: thumbnail/poster path (image or video poster); omit for pure doc tiles */
  thumb_path?: string | null;
  /** For documents: show icon + label; optional page count later */
  width?: number | null;
  height?: number | null;
  duration_sec?: number | null; // video, if known client-side
};
```

- **Multiple attachments per message**: JSON array, max count and total size enforced (see §5).
- **Search**: Extend `has:attachment` to mean `jsonb_array_length(attachments) > 0` (and fix current client filter that never receives `attachments` from mappers).

### 4.2 Storage

**New private bucket `message-attachments`** (do not overload `task-attachments`; RLS is keyed differently).

**Path convention:** `{workspace_id}/{message_id}/{uuid}_{safeFileName}`

- **`workspace_id`** resolves from `bubble_id → bubbles.workspace_id` for RLS.
- **`message_id`** must exist and match the row being updated; insert policies can require the first segment of `name` to match a bubble the user can write to, then narrow on update—**mirror the task pattern**: policies on `storage.objects` `join` `messages` → `bubbles` and verify `split_part(name, '/', 1) = workspace_id::text`, `split_part(name, '/', 2) = message_id::text`, and `is_workspace_member` / `can_write_workspace` as appropriate for select/insert/delete.

**File size limit:** Start aligned with tasks (**50 MB** per object in bucket config) unless product specifies otherwise; enforce **per-message aggregate** cap in app (and optionally trigger later).

**Signed URLs:** Private bucket → client uses `supabase.storage.from(...).createSignedUrl` (or download) for modal display; thumbnails in feed use signed URLs with short TTL or refresh on visibility.

### 4.3 Upload flow (reliable ordering)

Because `message_id` is required for stable paths and RLS, use a **two-step** flow (same family as “save task first” for task files):

1. **Insert** message with **non-empty** trimmed `content` and `attachments: []` (see §8.1 — **message text is required**; attachment-only posts are not allowed).
2. **Upload** each file to `message-attachments` at `{workspace_id}/{message_id}/...`.
3. **Update** the same message row: set `attachments` to the full JSON array.

**Failure handling:** If (3) fails after (2), delete orphaned objects (client retry or **Edge Function** cleanup job); minimally, document **manual** cleanup policy for v1.

**Thread replies:** Same flow; `parent_id` set on insert before uploads.

**Deletion (see §8.2):** Users do **not** remove or replace attachments in isolation. Removing media means **deleting the entire message**. On delete, remove the `messages` row (no retention of deleted content) and **delete all storage objects** under that message’s path prefix.

### 4.4 Thumbnails in the feed

| Kind         | Feed thumbnail                                                                                                                                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Image**    | Resize client-side before upload **or** Supabase **image transformation** on the stored object for a small fixed width; show **cover** crop in a fixed aspect box (e.g. `aspect-video` or `aspect-square`).                      |
| **Video**    | **v1:** Client-generated **poster** (canvas `captureStream` / `<video>` seek + draw) uploaded as a second object (`thumb_path`) **or** a static placeholder icon until poster exists. **v2:** Edge Function + ffmpeg for poster. |
| **Document** | Generic tile: file-type icon + truncated filename; optional PDF first-page raster as **v2**.                                                                                                                                     |

**Layout:** Horizontal row of thumbs below message text (wrap on small widths); max **N** visible + “+3” overflow chip if needed.

**Accessibility:** `button` or `role="button"` per thumb, `aria-label` including file name and kind.

### 4.5 Media modal

- **New component** e.g. `MessageMediaModal` (or shared `MediaViewerModal`) controlled by `ChatArea` / thread state:
  - **Image**: large display, optional zoom, dark/light chrome consistent with app.
  - **Video**: `<video controls>`; no autoplay in modal until user interaction if matching platform policy.
  - **Document**: `mime_type` → open PDF in new tab via signed URL, or **download** + hint for Office files.
- **Keyboard:** Escape closes; focus trap inside modal.
- **Carousel:** If multiple attachments on one message, modal supports **prev/next** within that message only (v1).

### 4.6 Composer UX

- **Paperclip** opens file picker (`accept` tuned: image/_, video/_, common doc types).
- **Send** is enabled only when **trimmed message text is non-empty** (attachments are optional). Show **pending chips** (filename + remove) before send; disable send while uploads are in flight if the design requires all files committed before the message is final.
- **Optional:** Paste image from clipboard (nice-to-have).

### 4.7 Realtime and types

- **`postgres_changes`** on `messages` already includes `UPDATE`; ensure clients **merge** `attachments` when receiving updates so thumbs appear without full reload.
- Regenerate **`src/types/database.ts`** (or hand-edit) so **`messages.Row`** includes `attachments: Json`.

## 5. Security and permissions

- **RLS on `messages`:** Existing insert/update policies already scope by bubble → workspace; **attachments JSON must only be writable by the same roles** that can edit the message (today: author updates; confirm policy matches product).
- **Storage:** No public bucket; all access via **authenticated** policies tied to **workspace + message id** path segments.
- **Validation:** Prefer **allowlist** `mime_type` client-side; optional **Edge Function** or **check** constraint for server-side (JSON check is awkward—MIME allowlist in app + storage bucket MIME restrictions if Supabase supports).

## 6. Phasing

| Phase  | Scope                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **P0** | Migration: `attachments` column + bucket + RLS; upload + update flow; image + document thumbs; modal for image/doc; `ChatArea` + `ThreadPanel` render thumbs; fix search `has:attachment`. |
| **P1** | Video poster generation (client); video modal player; stricter size/type limits; orphan cleanup.                                                                                           |
| **P2** | PDF page preview; server-side video poster; optional **image transformation** CDN params.                                                                                                  |

**P2 optional env (Next.js):** `NEXT_PUBLIC_STORAGE_IMAGE_TRANSFORM=1` enables Storage **image** thumbnail transforms (requires the Supabase project feature). `NEXT_PUBLIC_MESSAGE_VIDEO_POSTER_EDGE=1` calls the Edge Function `generate-message-video-poster` after each video upload (FFmpeg WASM in the function, ~25MB cap; client falls back to `captureVideoPoster` on failure). Deploy the function with `supabase functions deploy generate-message-video-poster`; local: `supabase functions serve generate-message-video-poster`. PDF page-1 previews use client-side pdf.js and need no flag.

## 7. Risks and mitigations

| Risk                                    | Mitigation                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| Large videos slow feed                  | Enforce max size; poster + modal playback only; no inline video.                     |
| Orphaned storage after failed DB update | Retry delete; optional scheduled job listing orphans under `message_id` with no row. |
| Signed URL expiry                       | Refresh signed URL when opening modal or on thumb `onError`.                         |
| Out-of-sync generated types             | Regenerate after migration; CI typecheck.                                            |

## 8. Product decisions (resolved)

### 8.1 Message text required

A **message is required** on every post: users **cannot** send attachment-only content. Enforce in the composer (and optionally with a DB/app check): `trim(content).length > 0` before insert/update. The existing `content text not null default ''` column is sufficient; no schema change needed beyond optional check constraints if you want server-side enforcement.

### 8.2 Edit vs delete; no partial attachment removal

Users may **edit** message text and **delete** messages as your app already allows, but they **cannot** delete or swap **only** the media while keeping the message row. To remove attachments, the user **deletes the whole message**.

- **Deleted messages** are **not** retained in the database (no tombstone / archive of deleted content for v1).
- **Storage:** On message delete, remove all objects under `{workspace_id}/{message_id}/` (same transaction or best-effort client + retry); storage **delete** policies must allow the same actors who can delete the message row.

### 8.3 Mobile vs desktop

A dedicated **mobile** client (native app or PWA) is **out of scope for this design’s first implementation**; it will come later. The UI should still be **mobile-compatible** in principle (responsive layout, **stacking** thumbnails and composer controls on narrow viewports), but **this version targets desktop** first.

### 8.4 “All Bubbles” aggregate view

**Confirmed:** Same UI and behavior as single-bubble chat; attachments belong to each message and inherit that message’s bubble. No separate treatment beyond existing bubble labels in the feed.

---

## 9. Implementation checklist (for PRs)

- [ ] Migration: `alter table messages add column attachments jsonb not null default '[]'::jsonb;`
- [ ] Migration: bucket `message-attachments` + RLS policies (insert/select/delete aligned with §8.2)
- [ ] `src/lib/message-storage.ts` (path builder, constants) — mirror `task-storage.ts`
- [ ] Update `MessageRow` / `ChatArea` mapping and `sendMessage` / update flow; **block send** when `trim(content)` is empty
- [ ] On **message delete**: remove storage objects for that `message_id` prefix; no DB retention of deleted rows
- [ ] UI: composer attach + `MessageAttachmentThumbnails` + `MessageMediaModal`; responsive stacking for narrow viewports
- [ ] Thread panel parity (same subcomponents)
- [ ] Search: `has:attachment` + DB or client filter on `attachments`
- [ ] Tests: Vitest for path helpers and attachment JSON merge helpers (optional)
