# FitnessProfileSheet

Source: [src/components/fitness/FitnessProfileSheet.tsx](../../src/components/fitness/FitnessProfileSheet.tsx)

Right-side **Sheet** for the per-user, per-workspace `**fitness_profiles`** row: goals, equipment checklist, unit system, biometrics (weight/height/age), and a **Quick workout\*\* action that can insert a workout card into the current bubble.

## Props

| Prop                    | Role                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `open` / `onOpenChange` | Radix sheet visibility.                                                                                                                    |
| `workspaceId`           | Row scope for select/upsert.                                                                                                               |
| `targetUserId`          | Optional: load/save the profile for this user (trainer view). Defaults to the signed-in user.                                              |
| `bubbleIdForTasks`      | Required for quick workout: target bubble id for the generated `**tasks`** row. Shell passes `null` when the user is on **All\*\* bubbles. |
| `onQuickWorkoutCreated` | Optional callback after successful generation (shell uses `bumpTaskViews`).                                                                |

## Data model + RLS

- **Table:** `public.fitness_profiles` (unique `(workspace_id, user_id)`).
- **Privacy:** `biometrics_is_public` (default `true`) — added in [supabase/migrations/20260723170000_fitness_profile_biometrics_privacy_and_admin_rls.sql](../../supabase/migrations/20260723170000_fitness_profile_biometrics_privacy_and_admin_rls.sql).
- **RLS (summary):**
  - Workspace members can read all profiles in the workspace.
  - Profile owners can insert/update their own row.
  - Workspace owners/admins can insert/update rows for workspace members.
  - `workspace_id` and `user_id` are immutable on update (trigger).
  - Privacy toggle is self-service via `set_fitness_profile_biometrics_public(workspace_id, show)` (security definer), mirroring the email privacy pattern.

## Load and save

- **Load** (on `open`): `fitness_profiles` `select('*')` for `(workspace_id, targetUserId || authUserId)`.
- **Save:** writes `goals`, `equipment`, `unit_system`, `biometrics`, and `biometrics_is_public`. Insert vs update depends on whether a profile `id` exists.
- **Biometrics encoding:** merges unmanaged `bioExtras` into `biometrics`, persists canonical `weight_kg`, `height_cm`, `age`, and strips legacy `weight` / `height` keys.

## Biometrics privacy UX

- **Owner view:** can toggle biometrics visibility via a PrivacyToggle (RPC-backed).
- **Trainer view:**
  - If `biometrics_is_public` is true: shows and allows editing biometrics inputs.
  - If false: hides weight/height/age and shows a locked message.

Tripwire: the sheet logs `[DEBUG] Profile Biometrics Render` with `{ isOwner, isPublic }` near the biometrics branch.

## Quick workout

`POST /api/ai/quick-workout-from-profile` with JSON `{ workspace_id, bubble_id }`.

Enabled only for **owner view**; trainer-scoped sheet disables it because the API currently generates from the signed-in user’s profile only.

## Entry point (ThemeScope header)

The desktop top bar in [src/components/dashboard/dashboard-shell.tsx](../../src/components/dashboard/dashboard-shell.tsx) includes a **Fitness Profile** button next to [DesktopViewSwitcher](../../src/components/layout/desktop-view-switcher.tsx). When the selected bubble is private and the viewer is an owner/admin, the shell resolves the other member via `bubble_members` and passes that as `targetUserId`.

## Related docs

- [README.md](README.md)
- [workout-player.md](workout-player.md)

---

## Architectural gap analysis (trainer / client profile in header)

This section assesses moving the **Fitness Profile** entry point from the left [WorkspaceRail](../../src/components/layout/WorkspaceRail.tsx) into the **desktop top bar** next to [DesktopViewSwitcher](../../src/components/layout/desktop-view-switcher.tsx) (the chat / board / calendar / split toggles). That bar lives inside [DashboardShell](../../src/components/dashboard/dashboard-shell.tsx) under [ThemeScope](../../src/components/theme/ThemeScope.tsx) (`h-11` strip with `buddyBubbleTitle` and layout controls). It is the natural “ThemeScope bar” target for a profile icon.

### Discovered files

| Area                                                 | Path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile UI (drawer)                                  | [src/components/fitness/FitnessProfileSheet.tsx](../../src/components/fitness/FitnessProfileSheet.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Profile trigger today                                | [src/components/layout/WorkspaceRail.tsx](../../src/components/layout/WorkspaceRail.tsx) (`onOpenFitnessProfile`, dumbbell `title="Fitness Profile"`)                                                                                                                                                                                                                                                                                                                                                                                                             |
| Shell: sheet mount + state + rail props              | [src/components/dashboard/dashboard-shell.tsx](../../src/components/dashboard/dashboard-shell.tsx) (`fitnessProfileOpen`, `setFitnessProfileOpen`, `workspaceRailProps.onOpenFitnessProfile`, `<FitnessProfileSheet …>`)                                                                                                                                                                                                                                                                                                                                          |
| Desktop header row + layout toggles                  | [src/components/dashboard/dashboard-shell.tsx](../../src/components/dashboard/dashboard-shell.tsx) (strip with `DesktopViewSwitcher`)                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Layout toggle component                              | [src/components/layout/desktop-view-switcher.tsx](../../src/components/layout/desktop-view-switcher.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Theme wrapper                                        | [src/components/theme/ThemeScope.tsx](../../src/components/theme/ThemeScope.tsx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `fitness_profiles` table + RLS                       | [supabase/migrations/20260430100000_fitness_profiles.sql](../../supabase/migrations/20260430100000_fitness_profiles.sql), [supabase/migrations/20260430100001_fitness_profiles_rls_require_membership.sql](../../supabase/migrations/20260430100001_fitness_profiles_rls_require_membership.sql)                                                                                                                                                                                                                                                                  |
| Other readers of `fitness_profiles` (session-scoped) | e.g. [src/app/api/ai/generate-workout-chain/route.ts](../../src/app/api/ai/generate-workout-chain/route.ts), [src/app/api/ai/personalize-program/route.ts](../../src/app/api/ai/personalize-program/route.ts), [src/app/api/ai/quick-workout-from-profile/route.ts](../../src/app/api/ai/quick-workout-from-profile/route.ts), [src/components/modals/task-modal/hooks/useWorkoutUnitSystem.ts](../../src/components/modals/task-modal/hooks/useWorkoutUnitSystem.ts), [src/components/fitness/WorkoutPlayer.tsx](../../src/components/fitness/WorkoutPlayer.tsx) |

### Current data architecture

1. **Scope:** One row per `(workspace_id, user_id)` with unique constraint ([migration](../../supabase/migrations/20260430100000_fitness_profiles.sql)).
2. **FitnessProfileSheet** ([source](../../src/components/fitness/FitnessProfileSheet.tsx)):

- **Load:** `auth.getUser()` then `from('fitness_profiles').select('*').eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle()`.
- **Save:** `payload.user_id` is always `user.id` from the session; `update`/`insert` keyed by loaded `profile.id` or new row.
- There is **no prop** for `targetUserId` / `profileUserId`; the component is hard-bound to the **authenticated user**.

3. **Quick workout:** Client POSTs only `{ workspace_id, bubble_id }`. The route loads `**fitness_profiles` for `auth` user\*\* and assigns the created task to the caller — not a third-party client id.
4. **Shell wiring:** `bubbleIdForTasks` is the **selected bubble id** (or `null` on “All”), not a client identity.

### Production gaps and RLS risks

**Read access (trainer viewing client row)**

- Policy _"workspace members can read fitness profiles"_ allows **any** workspace member to `SELECT` **all** rows in that workspace ([20260430100000](../../supabase/migrations/20260430100000_fitness_profiles.sql)).
- So a trainer **can** read a client’s `fitness_profiles` row **if** the app queries `.eq('user_id', clientId)` instead of `auth.uid()` — RLS does **not** block cross-user reads inside the same workspace.

**Write access (trainer editing client row)**

- `INSERT` / `UPDATE` / `DELETE` policies require `**user_id = auth.uid()`\*\* (and membership on insert/update per [20260430100001](../../supabase/migrations/20260430100001_fitness_profiles_rls_require_membership.sql)).
- A trainer using the current save path with `user_id: clientId` in the payload will get **RLS violations** on insert/update unless policies are extended (e.g. owner/admin may update rows for members they coach) or writes go through a **privileged API route** (service role) with explicit authorization checks.

**UI / product**

- Today the sheet is always “**my** profile”. Opening it from a client’s bubble without code changes still shows the **trainer’s** data.
- Quick workout and other AI routes that load `fitness_profiles` by `**user.id` from session** would still reflect the **trainer\*\* unless those endpoints accept an optional scoped `user_id` with strict permission checks.

### Context resolution: who is the “client” for a bubble?

- `**activeBubble`** / `**selectedBubbleId`** are in [workspaceStore](../../src/store/workspaceStore.ts) and [DashboardShell](../../src/components/dashboard/dashboard-shell.tsx); they identify the **bubble\*\*, not a single “owner” user id.
- The shell loads `**bubble_members`** only for `**user_id = profile.id`** (current user) to set `myBubbleRole`— it does **not** load the other member’s`user_id`([effect](../../src/components/dashboard/dashboard-shell.tsx) on`bubble_members` select).
- **Trial bubbles:** Provisioning in [storefront-trial-isolation](../../src/lib/storefront-trial-isolation.ts) inserts `bubble_members` for `guestUserId` (client) and `coachUserId`. The **client id is not stored on `BubbleRow`** in a standard field the header can read without a join.
- **Conclusion:** `clientUserId` is **not** globally available today. It must be **derived** when needed, for example:
  - Query `bubble_members` for `bubble_id = selectedBubbleId` and pick the member(s) that are not `auth.uid()`, or exclude coaches via role/workspace rules; or
  - For `bubble_type === 'trial'`, use a dedicated rule (e.g. trialing workspace member vs coach) plus `bubble_members`; or
  - Read from `**leads.metadata`\*\* / trial linkage if that is the source of truth for storefront trials.

Any derivation must handle **multi-member** private bubbles (more than two users) and **“All bubbles”** view (`selectedBubbleId === ALL_BUBBLES_BUBBLE_ID`) — there is **no** single client; the sheet should fall back to **self** or disable “client profile” mode.

### Recommended implementation path (no code here)

1. **Header entry point:** Add a dumbbell (or profile) control in the same `h-11` row as `DesktopViewSwitcher` in [dashboard-shell.tsx](../../src/components/dashboard/dashboard-shell.tsx), reusing `setFitnessProfileOpen`. Optionally remove or duplicate the rail control in [WorkspaceRail.tsx](../../src/components/layout/WorkspaceRail.tsx) for consistency.
2. **Resolve `profileSubjectUserId`:**

- Default: `auth` user id (current behavior).
- If `selectedBubbleId` is a concrete bubble **and** policy says “trainer viewing client bubble”: compute `clientUserId` via a small hook or `useEffect` (e.g. `bubble_members` for that `bubble_id`, filter out `auth.uid()`, disambiguate with `bubble_type` / workspace role). Cache in shell state and pass into `FitnessProfileSheet`.

3. **Extend `FitnessProfileSheet` props:** e.g. `profileUserId?: string | null` (default: session user). Load/save uses that id for `.eq('user_id', …)` and `payload.user_id`.
4. **Save permissions:** Before allowing edits for `profileUserId !== auth.uid()`:

- **Option A (recommended for security):** New **server route** (authenticated user + service role or elevated RPC) that verifies trainer–client relationship and performs update; client calls route instead of direct Supabase `update` on another user’s row.
- **Option B:** Extend Postgres RLS with narrow policies (e.g. `workspace_members.role in ('owner','admin')` may `update` rows where `user_id` is a `member` in same workspace). Requires careful review and tests.

5. **Read-only trainer mode:** Until write policies exist, the sheet can open in **view-only** for `profileUserId !== auth.uid()` (load allowed by RLS; hide save / show banner).
6. **Quick workout:** If the sheet is scoped to a client, either disable quick workout for non-self subjects or extend `/api/ai/quick-workout-from-profile` with `target_user_id` + permission checks so generation uses the **client’s** `fitness_profiles` row.
7. **Documentation / QA:** Update this doc’s “Load and save” and “Props” sections after implementation; add matrix: self vs client bubble, member vs admin, trial vs shared private bubble.

### Summary

| Concern                          | Status today                                                 |
| -------------------------------- | ------------------------------------------------------------ |
| Move toggle to ThemeScope header | Feasible in `DashboardShell`; rail is separate.              |
| Load client profile in sheet     | Possible with query change + RLS allows `SELECT`.            |
| Save client profile as trainer   | **Blocked** by RLS unless policies or server proxy change.   |
| `clientUserId` in store          | **Not present**; derive from `bubble_members` / trial rules. |
| Quick workout for client         | Uses **session** profile only; needs API/product decision.   |
