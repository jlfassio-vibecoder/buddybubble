# LiveClassReminderModal

## Component overview

| Item               | Detail                                                                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Path**           | [`src/components/dashboard/LiveClassReminderModal.tsx`](../../src/components/dashboard/LiveClassReminderModal.tsx)                                                                                                                                           |
| **Purpose**        | Surface a **non-blocking dialog** when an upcoming or imminently starting **live class** matches reminder windows, so the member can **read context** (title, time, notes) and optionally **jump into the existing live video dock** without hunting the UI. |
| **Parent context** | Rendered from the dashboard shell when the workspace is eligible (`enabled`); it does **not** own routing for the class itself—it only coordinates **reminder visibility** and **live video store** handoff.                                                 |

The modal is **client-only** (`'use client'`). It depends on:

- `DEFAULT_CLASS_PROVIDER.listInstances` for class rows.
- `parseLiveSessionInviteFromMessageMetadata` on `class_instances.metadata` for the **live session invite** shape used by the dock.
- `useLiveVideoStore` to detect when the user is **already** in the same live session (suppresses join CTA).
- `useUserProfileStore` for `userId` (no reminders without a profile id).

---

## Trigger and state mechanism

### Data loading

1. On mount and whenever `tick` increments, the component calls `load()` which fetches **`ClassInstance[]`** via `DEFAULT_CLASS_PROVIDER.listInstances(workspaceId, userId)`.
2. A **60s interval** (`POLL_MS`) bumps `tick` so the candidate list stays fresh without tying to every render.

### Candidate selection (`nextCandidate`)

`pickReminderCandidate(instances, new Date(), workspaceId)` builds at most one **`ReminderPayload`**: `{ instance, window }` where `window` is **`'15m'`** or **`'5m'`**.

**Time windows** (relative to `instance.scheduled_at` and `offering.duration_min`):

- **`15m`**: now is in **[start − 15m, start − 5m)**.
- **`5m`**: now is in **[start − 5m, start + duration]** (inclusive end at session length).

Instances that are **`cancelled`** or **`completed`** are excluded.

### Invitee-only classes

If `class_instances.metadata` indicates invitee-only reminders (`reminder_invitee_only === true` or `class_reminder_audience === 'invitees'`), the instance is only eligible when `my_enrollment_status` is **`enrolled`** or **`waitlisted`**.

### Opening the dialog (`open` / `payload`)

A `useEffect` watches **`nextCandidate`** and **`open`**:

- If there is **no** candidate and the dialog was open → **close** and clear `payload`.
- If there **is** a candidate and the dialog is **closed** → set `payload` to `nextCandidate` and **`setOpen(true)`**.
- If the dialog is already open for the **same** instance but the **window** changed (15m → 5m) → update `payload`.
- If the **instance id** changes while open → replace `payload` with the new candidate.

`payloadRef` mirrors `payload` so dismiss/join handlers always read the latest row without stale closures.

---

## Dismissal, “Do not see again”, and localStorage

Flags are stored as **`'1'`** / **`'0'`** strings via `localStorage` (see [`src/lib/reminder-storage-keys.ts`](../../src/lib/reminder-storage-keys.ts)).

| Action                | Storage effect                                                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Close**             | Writes **`reminded15m`** or **`reminded5m`** for `(workspaceId, instanceId)` depending on current **`payload.window`**. That suppresses **this window only** for this class instance so the same modal does not immediately reopen for the same phase. |
| **Do not see again**  | Writes **`ignoreClass`** for `(workspaceId, instanceId)`. `pickReminderCandidate` **skips** any instance with that flag—no further reminders for that class in this workspace (until the key is cleared).                                              |
| **Join live session** | Also sets **`ignoreClass`** (same as “do not see again”) so joining does not re-trigger the reminder for that instance.                                                                                                                                |

**`skipRemindedOnDismissRef`**: When Close / Join / “Do not see again” intentionally dismisses, the ref is set so **`onDialogOpenChange(false)`** does **not** double-apply `dismissWithReminded()` (which would write the reminded key twice or conflict with intentional flows).

If the user dismisses via **overlay / Escape** without using the buttons, `onDialogOpenChange` runs **`dismissWithReminded()`** unless the skip ref is set—same per-window suppression as **Close**.

---

## “Join live session” architecture

### No dedicated `/live/...` route

Clicking **Join live session** does **not** `router.push` to a live URL. The dashboard already hosts the live video shell; the modal only **selects the session** in global state.

### Store dispatch

```ts
useLiveVideoStore.getState().joinSession({
  workspaceId: liveInvite.workspaceId,
  sessionId: liveInvite.sessionId,
  channelId: liveInvite.channelId,
  hostUserId: liveInvite.hostUserId,
  mode: liveInvite.mode,
  sourceInstanceId: p.instance.id,
});
```

- **`liveInvite`** comes from **`parseLiveSessionInviteFromMessageMetadata(payload.instance.metadata)`** (must match the invite schema used elsewhere: chat, cards, classes).
- **`sourceInstanceId`** is the **`class_instances.id`** from the reminder payload so host-side flows (e.g. recording) can correlate.

After `joinSession`, the modal **clears `payload` and closes** so the user lands on the **mounted `DashboardLiveVideoDock`** driven by `activeSession` in the shell.

### Join eligibility (`canJoinLive`)

The Join CTA (wrapped in `PremiumGate`) is shown only when:

- `userId` exists,
- `liveInvite` parses and **`endedAt`** is not set,
- the user is **not** already in the same session as `useLiveVideoStore().activeSession` (matching `sessionId`, `channelId`, `workspaceId`).

Otherwise the body shows a short explanation (already in session vs invite not ready).

### Billing gate

`PremiumGate` with **`feature="live_video"`** and **`inline`** gates the Join button per workspace subscription policy without blocking **Close** / **Do not see again** (see below). **Tier C** on `/api/live-video/token` remains the server-side authorization for tokens.

---

## Critical UI and layout gotchas

### Radix `Dialog` / `DialogContent` accessibility

Radix expects a **`DialogTitle`** and **`DialogDescription`** associated with **`DialogContent`**. If they mount **late**, are **missing**, or `aria-describedby` is overridden incorrectly, you can see **transient console warnings** and odd focus behavior.

**Stable pattern in this modal:**

- **`DialogTitle`** and **`DialogDescription`** are the **first two children** of **`DialogContent`**, rendered **whenever the dialog is mounted** (not nested only under conditional body branches).
- Description uses **`className="sr-only"`** for screen readers while the visible title carries the primary heading.
- Avoid setting **`aria-describedby={undefined}`** manually on `DialogContent`; let Radix wire description/title.

The body (`inst` block) may still be conditional; the **title/description primitives must stay unconditional** relative to `DialogContent`.

### `PremiumGate` in flex footers

**Problem (fixed):** The default (non-`inline`) **`PremiumGate`** renders a **`relative`** wrapper with an **`absolute inset-0`** overlay and pointer capture for the locked state. In a **`DialogFooter`** flex column, that block-level gate can **stretch** and the overlay’s hit target can **overlap sibling buttons** (“Close”, “Do not see again”), making them **appear dead**. Z-index tweaks alone are unreliable because the issue is **geometry + pointer stacking**, not only paint order.

**Required pattern here:** use **`inline`** so the gate uses the **compact inline affordance** documented on `PremiumGate`, which does not create a full-bleed overlay over the footer.

Example structure (current intent):

```tsx
<DialogContent>
  <DialogTitle>...</DialogTitle>
  <DialogDescription className="sr-only">...</DialogDescription>

  {/* optional body */}

  <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end sm:gap-2">
    {canJoinLive ? (
      <PremiumGate feature="live_video" inline>
        <Button onClick={handleJoin}>Join live session</Button>
      </PremiumGate>
    ) : null}
    <Button variant="secondary" onClick={handleClose}>
      Close
    </Button>
    <Button variant="ghost" onClick={handleDoNotShowAgain}>
      Do not see again
    </Button>
  </DialogFooter>
</DialogContent>
```

**Rule of thumb for future edits:** Any **`PremiumGate`** wrapping a control **inside a dense flex footer** next to other actions should default to **`inline`** unless you explicitly redesign the footer into an isolated row for a full overlay gate.

---

## Related files

| Area                             | File                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| LocalStorage key helpers         | [`src/lib/reminder-storage-keys.ts`](../../src/lib/reminder-storage-keys.ts)                                             |
| Live session invite parsing      | [`src/types/live-session-invite.ts`](../../src/types/live-session-invite.ts)                                             |
| Active session store             | [`src/store/liveVideoStore.ts`](../../src/store/liveVideoStore.ts)                                                       |
| Dock + Agora                     | [`src/components/dashboard/dashboard-live-video-dock.tsx`](../../src/components/dashboard/dashboard-live-video-dock.tsx) |
| Subscription gate implementation | [`src/components/subscription/premium-gate.tsx`](../../src/components/subscription/premium-gate.tsx)                     |
| Shadcn / Radix dialog primitives | [`src/components/ui/dialog.tsx`](../../src/components/ui/dialog.tsx)                                                     |

---

## Debugging checklist

1. **Modal never opens:** Check `enabled`, `userId`, `listInstances` errors, and whether **`ignoreClass`** / **`reminded*`** keys already block the instance (`Application` → Local Storage).
2. **Join missing:** Confirm `metadata.live_session` parses (`liveInvite` null → `canJoinLive` false).
3. **Join does nothing:** Confirm `joinSession` payload has non-empty `workspaceId` (store rejects empty workspace id).
4. **Footer buttons frozen:** Inspect for **non-inline `PremiumGate`** or extra **absolute** layers in the footer; restore **`inline`** on the Join gate.
5. **Radix description warnings:** Confirm **`DialogTitle`** / **`DialogDescription`** are direct children of **`DialogContent`** on first paint when `open` becomes true.
6. **Modal closes and instantly reopens:** Ensure dismiss paths bump **`dismissNonce`** immediately after writing the `reminded*` / `ignoreClass` localStorage flags (`dismissWithReminded` / `setIgnoreForPayload`), and that the consolidated effect lists **`dismissNonce`** in its dependency array. Without the nonce bump, `pickReminderCandidate` is not re-evaluated in the same turn and the dialog can reopen using a stale candidate.
