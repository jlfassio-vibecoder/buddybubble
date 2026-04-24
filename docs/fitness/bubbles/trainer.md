# Trainer (bubble)

**Role:** A **general-purpose** fitness channel for coach or team coordination (messages + shared board) using the same Kanban columns as the rest of the fitness workspace, without a dedicated custom main-stage component.

## Seeding

The channel name **`Trainer`** is defined in [`WORKSPACE_SEED_BY_CATEGORY.fitness`](../../src/lib/workspace-seed-templates.ts). The shell does **not** special-case this name; behavior matches any non-Programs/Classes/Analytics fitness bubble.

## What you see

The main stage is **[`KanbanBoard`](../../src/components/board/kanban-board.tsx)** with fitness theming, **chat** in the split layout, and the **calendar rail** when the layout injects it. Use **TaskModal** to create and edit cards (events, tasks, workouts, etc.) like other bubbles.

## Typical content

- Any **`tasks`** the space needs for **trainer–client** or **household** coordination: check-ins, notes, one-off events, or workout cards if you place them here.

## Permissions, state, and gating (this channel)

**Trainer** is a **standard Kanban** channel: same [permission matrix and state flow](README.md#architecture-roles-state-and-gating) as **Workouts** (and any public/private bubble). There is no dedicated shell branch for the name `Trainer`. **Guests** and **viewers** on private bubbles get **read / chat** per `canViewBubble` and **`canPostMessages`**, with **task writes** only when `canWriteBubble` is true (e.g. **editor** on a private channel). Product language may call someone a _lead_ or _coach_; their **technical** role is still `owner` \| `admin` \| `member` \| `trialing` \| `guest` as stored in `workspace_members` and `bubble_members`.

## Related

- [workout-player.md](../workout-player.md) if you start workouts from cards on this board.
- [bubbles README](README.md) for the full channel index.
