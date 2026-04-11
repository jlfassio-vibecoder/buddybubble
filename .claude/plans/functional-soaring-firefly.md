# BuddyBubble Fitness Workspace Template — Implementation Plan

## Status snapshot (as of branch work vs. this doc)

| Phase       | Summary                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| **Phase 1** | **Done** — category, seed, theme, validation, UI entry points                                                         |
| **Phase 2** | **Mostly done** — schema, profile sheet, workout task modal; **template picker / clone UX not wired**                 |
| **Phase 3** | **Done** — Analytics bubble + board + shell routing; V1 metrics (sessions, time, streak), not kcal                    |
| **Phase 4** | **Done for V1** — calendar dots, class tables, `ClassesBoard`, `ManualClassProvider`; **partner sync still deferred** |

---

## Context

The user provided a TDD for a "Fitness" workspace category (V2). After review, we agreed on four key design decisions:

1. **Phased implementation** — Phase 1 shipped the minimum viable fitness workspace (category + seed + theme). Phases 2–4 add fitness profile, analytics, calendar overlays, and classes.
2. **Reuse `tasks` table** — Workouts/workout logs use existing polymorphic `item_type` + `metadata` JSON rather than separate domain tables for every workout field.
3. **Profile as sheet/drawer** — Fitness profile surfaces as a slide-out sheet, not a new collapsible layout rail.
4. **Defer partner integration** — Class schema + manual UI; actual partner sync deferred.

### TDD revisions (historical)

- **Remove "#All Bubbles" from seeded bubbles** — still true; synthetic `ALL_BUBBLES_BUBBLE_ID`.
- **Analytics bubble timing** — Original plan deferred Analytics to Phase 2/3 so new workspaces would not show an empty board; **current codebase seeds five bubbles** including **Analytics**, with a **backfill migration** for older fitness workspaces.
- **Fitness profile** — Implemented as **`FitnessProfileSheet`**, not a collapsible rail.
- **Workout data** — Uses **`tasks.item_type`** + **`metadata`** (no separate `workout_templates` / `workout_logs` tables).
- **Class tables** — Originally deferred to Phase 3; **now implemented** (`class_offerings`, `class_instances`, `class_enrollments`) with **`ManualClassProvider`**.

---

## Phase 1: Core Fitness Category — **COMPLETED**

### Delivered

| Item                                                     | Notes                                                                                                                  |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| DB migration — `'fitness'` on `workspaces.category_type` | `supabase/migrations/20260429100001_workspace_category_fitness.sql` (filename differs from early plan stub `…100000…`) |
| `WorkspaceCategory` + store types                        | `src/types/database.ts`, `src/store/workspaceStore.ts`                                                                 |
| Fitness seed template                                    | `src/lib/workspace-seed-templates.ts` — bubbles: Programs, Workouts, Classes, Trainer, **Analytics**                   |
| Server validation                                        | `VALID_CATEGORIES` includes `'fitness'` (`src/app/(dashboard)/app/actions.ts`)                                         |
| Create workspace UI                                      | `CreateWorkspaceModal` — Fitness option + Dumbbell icon                                                                |
| Theme registry + overrides                               | `src/lib/theme-engine/registry.ts`, `merge.ts`, `use-theme-override.ts`                                                |
| Category theme select                                    | `category-theme-select.tsx`                                                                                            |
| `showFamilyNames`                                        | Fitness excluded (kids/community only) — verified                                                                      |

### Files reference (Phase 1)

| File                                                                | Change                      |
| ------------------------------------------------------------------- | --------------------------- |
| `supabase/migrations/20260429100001_workspace_category_fitness.sql` | **Added**                   |
| `src/types/database.ts`                                             | `'fitness'` + related types |
| `src/lib/workspace-seed-templates.ts`                               | `fitness` seed              |
| `src/app/(dashboard)/app/actions.ts`                                | `VALID_CATEGORIES`          |
| `src/components/modals/CreateWorkspaceModal.tsx`                    | Fitness option              |
| `src/lib/theme-engine/registry.ts`                                  | `fitness` theme             |
| `src/lib/theme-engine/merge.ts`                                     | `normalizeCategory`         |
| `src/hooks/use-theme-override.ts`                                   | Category guards             |
| `src/components/theme/category-theme-select.tsx`                    | Fitness option              |

### Supporting / follow-up (not in original Phase 1 list)

- **Task/board copy** — e.g. `task-date-labels.ts` (`fitness`), `kanban-board-title.ts`, `item-type-styles.ts` for `workout` / `workout_log`.
- **Dashboard layout** — `Suspense` fallback around `DashboardShell` in `app/(dashboard)/app/[workspace_id]/layout.tsx` (hydration / `useSearchParams`).

---

## Phase 2: Fitness Profile + Workout Logging

### **Completed**

| Item                                        | Implementation                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `fitness_profiles` table                    | `supabase/migrations/20260430100000_fitness_profiles.sql`                                        |
| RLS hardening (membership on insert/update) | `supabase/migrations/20260430100001_fitness_profiles_rls_require_membership.sql`                 |
| `item_type`: `'workout'`, `'workout_log'`   | `ItemType` + `ITEM_TYPE_SET` in `src/types/database.ts`                                          |
| `FitnessProfileSheet`                       | `src/components/fitness/FitnessProfileSheet.tsx`; opened from dashboard when category is fitness |
| `TaskModal` workout fields                  | Type, duration, exercises list; metadata persistence; reset on new task                          |

### **To do**

| Item                         | Detail                                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`useWorkoutTemplates` UX** | Hook exists (`src/hooks/use-workout-templates.ts`) but is **not imported** anywhere — no template picker or “clone workout” flow in create/edit task UI yet |
| **Unit system in modal**     | Comment in `TaskModal`: kg label until `unit_system` from profile is threaded into modal                                                                    |
| **Optional**                 | Richer exercise editor (sets/reps/weight model beyond current list) if product wants V2                                                                     |

---

## Phase 3: Analytics Bubble

### **Completed**

| Item                                  | Implementation                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Seed + backfill “Analytics” bubble    | Seed in `WORKSPACE_SEED_BY_CATEGORY.fitness`; `supabase/migrations/20260431100000_backfill_fitness_analytics_bubble.sql` |
| `AnalyticsBoard`                      | `src/components/fitness/AnalyticsBoard.tsx` — stats, weekly bars, recent sessions                                        |
| `DashboardShell` routing              | `isAnalyticsBubble` → `<AnalyticsBoard calendarTimezone={workspaceCalendarTz} />` vs Kanban vs Classes                   |
| `WorkspaceMainSplit` / `cloneElement` | Board type widened; `calendarSlot` + `taskViewsNonce` injected                                                           |
| Timezone-safe bucketing               | `created_at` bucketed with `getCalendarDateInTimeZone` (aligned with workspace calendar)                                 |

### **To do / V2 ideas**

| Item                       | Detail                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **kcal / nutrition**       | Plan mentioned week/month kcal; **current V1** uses **session counts**, **logged minutes**, **streak** — add calories only if product specifies data source |
| **Stable bubble identity** | Selection by bubble **name** `"Analytics"` is fragile; future: slug or channel key in schema                                                                |

---

## Phase 4: Calendar Volume Overlay + Classes

### **Completed**

| Item                                           | Implementation                                                                                                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calendar month overlay                         | `dayAnnotations` on `CalendarMonthGrid`; fitness workspaces compute counts from completed `workout` / `workout_log` + `scheduled_on` in `calendar-rail.tsx` |
| Class domain tables                            | `supabase/migrations/20260501100000_class_domain_tables.sql`                                                                                                |
| `ClassesBoard`                                 | Four columns: Available → Scheduled → Today → History                                                                                                       |
| `FitnessClassProvider` + `ManualClassProvider` | `src/lib/fitness/class-providers.ts`                                                                                                                        |
| `DashboardShell`                               | `isClassesBubble` → `<ClassesBoard />`                                                                                                                      |

### **To do**

| Item                           | Detail                                                                                                                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Partner adapters**           | Mindbody / ClassPass-style sync — **still deferred**; interface exists for future providers                                                                                                              |
| **Timezone polish**            | `ClassesBoard` / `localYmd` use **UTC date slice** on ISO strings; consider **`calendarTimezone`** + `getCalendarDateInTimeZone` for “today” and column bucketing (align with Analytics + calendar rail) |
| **Admin / CRUD for offerings** | Manual provider assumes rows exist; no dedicated studio UI in plan scope                                                                                                                                 |

---

## Verification

1. **Typecheck / lint** — `npx tsc --noEmit`, `npm run lint` — should pass
2. **Build** — `npm run build` — CI / Vercel
3. **Manual smoke (fitness workspace)**
   - Five bubbles: Programs, Workouts, Classes, Trainer, Analytics
   - Kanban columns: Planned, Scheduled, Today, Completed
   - Theme + category override include Fitness
   - Open **Analytics** bubble → analytics view; **Classes** → classes board
   - Fitness profile sheet opens from rail affordance
4. **Tests** — Run `use-theme-override` tests; add/adjust cases if fitness branches are not covered

---

## Quick reference — migrations (fitness-related)

| Migration                                                    | Purpose                                               |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| `20260429100001_workspace_category_fitness.sql`              | `category_type` includes `fitness`                    |
| `20260430100000_fitness_profiles.sql`                        | `fitness_profiles` + base RLS                         |
| `20260430100001_fitness_profiles_rls_require_membership.sql` | Insert/update require membership                      |
| `20260431100000_backfill_fitness_analytics_bubble.sql`       | Insert Analytics bubble for legacy fitness workspaces |
| `20260501100000_class_domain_tables.sql`                     | Class offerings / instances / enrollments             |
