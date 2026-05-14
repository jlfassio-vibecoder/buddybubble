# Phase 6 — `ChatArea` and future surfaces (optional)

> Out of scope for the initial epic. This file exists so that follow-on work
> has an obvious home and so that anyone proposing a new chat surface in the
> meantime can record it here instead of building a one-off.

## Status

**Not in the initial epic.** Do not begin until Phases 1–5 have shipped and
soaked for at least two calendar weeks.

## Candidate surfaces

| Surface                         | Current owner                      | Why it might want the standard rail                                                                                                                                                                                         |
| ------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChatArea` (bubble / dashboard) | `src/components/chat/ChatArea.tsx` | Currently has its own composer; default-slug routing is a separate codepath. Migrating would unify presentation, but `MessageThreadFilter` would need a `'bubble'` mode (the current rail is hardcoded to `scope: 'task'`). |
| Right-side drawer surfaces      | TBD                                | Drawer-mounted task chat would benefit from the same layout contract.                                                                                                                                                       |
| Mobile sheet surfaces           | TBD                                | Same as drawer.                                                                                                                                                                                                             |

## Constraints to honor before any of this is started

1. **Do not loosen the `scope: 'task'` hardcode in `StandardTaskChatRail`.**
   If a non-task surface needs the rail, build a sibling component
   (`StandardBubbleChatRail`) that shares the inner presentation primitives
   but takes a different `MessageThreadFilter`. The two-rail split keeps
   each one's contract small and auditable.
2. **No new agent slugs added through this phase.** Adding agents goes
   through `agent_definitions` + `bubble_agent_bindings`, not through the
   rail.
3. **Re-validate Phase 0 §3 before adding any new `item_type` to the map.**
   Every addition needs the same audit (`agent_definitions` row exists +
   `bubble_agent_bindings` row exists).

## Deliverables (when this phase is opened)

- A new Phase 0–style discovery doc inside this folder that re-locks the
  contract for the next surface.
- New phase docs (`phase-7-…`, `phase-8-…`) following the same template as
  Phases 1–5.

## Acceptance criteria

This phase is intentionally empty until it is opened. Closing it without
work is also acceptable; if the rail proves it does not need to expand, this
file should be archived rather than reopened speculatively.
