# Global fitness chat (replace “All Bubbles” for fitness)

| Field              | Value                                                |
| ------------------ | ---------------------------------------------------- |
| **Status**         | Pre-planned; **out of scope for the current sprint** |
| **Target**         | **Next sprint**                                      |
| **Workspace kind** | Fitness Social Space (`fitness` category) only       |

## Summary

Replace the fitness experience of **“All Bubbles”** (aggregate chat/board) with a **single workspace-wide conversation**: **Global fitness chat**. Everyone in the tenant (members, owners, admins) can participate. **Buddy** and **Coach** are enabled there for **Q&A and claim confirmation** only—not for generating workout cards or any other cards in this channel.

Business, community, and kids-style spaces are unchanged unless explicitly scoped later.

## Goals

1. **Social layer**: One clear place for tenant-wide conversation among members and staff (owners/admins).
2. **Agent behavior**: Buddy + Coach answer questions and help users validate or challenge claims; they do **not** create structured artifacts (cards, workouts, tasks) from global chat.
3. **Product clarity**: Global chat is **not** a substitute for bubble-specific work (e.g. Programs, Classes, Workouts); it complements it.

## Foundation

### Product

- **Mental model**: _Global = social + light assistance; bubbles = structured work + cards._
- **Audience**: All users in one fitness tenant, including owners and admins.

### Data and messaging

- Need a **first-class representation** of tenant-wide messages, for example:
  - A **dedicated bubble** (e.g. lobby/global) with explicit visibility/kind flags and RLS aligned to “all workspace members,” **or**
  - A **workspace-level thread** without a normal bubble row (heavier touch on queries and RLS).

- **RLS**: Read/write rules for all members in the workspace; no cross-tenant leakage; alignment with existing roles (owner/admin/member).
- **Threading**: Decide whether global chat uses flat messages only, threads, and how `thread_subject_user_id` / `subject_threads` semantics apply (global is **not** per-member semi-private like Workouts chat).

### UI and navigation

- Fitness-only: remove or hide **“All Bubbles”** and surface **Global fitness chat** in the shell (sidebar, mobile tabs, default selection, deep links).
- Ensure defaults and stored preferences do not assume aggregate `ALL_BUBBLES` for fitness.

### Agents

- **Routing**: Buddy and Coach active in global context.
- **Prompts**: Instructions to stay conversational—no card or workout generation from this surface.
- **Enforcement**: **Tool allowlists or server-side rejection** for global context so creation tools cannot run even if the model tries; prompts alone are insufficient.

## Scope buckets (for estimation)

| Area                             | Notes                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Data model & migrations**      | Global channel representation; optional backfill for existing fitness workspaces; generated types. |
| **RLS & security**               | Tenant-scoped policies; role checks; audit against existing message visibility patterns.           |
| **Messaging client**             | Subscriptions, inserts, hooks (`useMessageThread`, etc.); parity with realtime expectations.       |
| **Dashboard shell / fitness UI** | Replace All Bubbles entry; default bubble; mobile `?tab=` behavior if applicable.                  |
| **Agents**                       | Dispatch context flag; prompts; **tool gating** in edge functions or dispatch layer; tests.        |
| **QA**                           | Member, owner, admin; verify no card creation paths from global chat.                              |

## Risks and dependencies

- Much behavior is **bubble-scoped** today (agents, boards, cards). Global chat needs a **single explicit context** in routing, RLS, and UI—not scattered string checks.
- **Kanban / calendar**: If fitness users previously relied on aggregate “All Bubbles” for boards, define whether global chat has **no** board, a **minimal** board, or staff-only tooling (product decision).
- **Documentation**: Update [bubbles/README.md](bubbles/README.md) and [README.md](README.md) references to “All” / aggregate behavior for fitness when this ships.

## Open questions (next sprint)

1. **Storage shape**: Dedicated global bubble row vs workspace-level messages.
2. **Moderation / retention**: Required for v1 or follow-up?
3. **Coach vs Buddy**: Single combined policy vs slightly different tool lists per agent in global chat.

## Related docs

- [Fitness UI overview](README.md) (shell, boards, `ALL_BUBBLES` mentions).
- [CHAT_ARCHITECTURE_ASSESSMENT.md](../CHAT_ARCHITECTURE_ASSESSMENT.md) (broader chat model).
- Agent routing and tools: [BUBBLE_AGENTS_ARCHITECTURE_PLAN.md](../BUBBLE_AGENTS_ARCHITECTURE_PLAN.md), [agents/adding-a-coach.md](../agents/adding-a-coach.md).
