# Analytics (bubble)

**Role:** **Personal** workout analytics for the signed-in user, scoped by **selected program** (plus calendar-aligned streaks, volume, and recent sessions).

## Seeding

The channel name **`Analytics`** is in [`WORKSPACE_SEED_BY_CATEGORY.fitness`](../../src/lib/workspace-seed-templates.ts). Older fitness workspaces may have received the same channel via [20260431100000_backfill_fitness_analytics_bubble.sql](../../supabase/migrations/20260431100000_backfill_fitness_analytics_bubble.sql). The shell requires an **exact** name match to mount the analytics board (see [bubbles README](README.md#name-contract-special-boards)).

## What you see

The main stage is **[`AnalyticsBoard`](../../src/components/fitness/AnalyticsBoard.tsx)**, wrapped in **`PremiumGate`** with `feature="analytics"` in [dashboard-shell.tsx](../../src/components/dashboard/dashboard-shell.tsx) so the surface respects subscription gating. Deep dive: [analytics-board.md](../analytics-board.md).

## Typical content

- No custom “bubble tasks” in the same sense as Kanban: the board **queries** `program` and `workout` / `workout_log` tasks the user is assigned to and aggregates in the workspace **calendar timezone**.

## Permissions, state, and gating (this channel)

Base [role and state model](README.md#architecture-roles-state-and-gating) applies. **Additional** gating: the shell wraps **`AnalyticsBoard`** in [**`PremiumGate` `feature="analytics"`**](../../src/components/subscription/premium-gate.tsx) so **fitness** (paid category) workspaces need an appropriate **Stripe subscription** (or trial) to use the surface—see [resolveSubscriptionPermissions](../../src/lib/subscription-permissions.ts) `canViewAnalytics`. **Non-owners** see a **dimmed board** and **“Ask the socialspace owner to subscribe”** if the workspace is not entitled; the **Analytics** bubble is **not** removed from the sidebar. **Member/trialing** roles are unchanged: they can still use the board when the subscription allows it.

## Related

- [programs.md](programs.md) — where programs and assignments are managed.
- [bubbles README](README.md) for the full channel index.
