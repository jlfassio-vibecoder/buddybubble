# Handoff: TaskModal — Universal Canvas

## Overview

A parametric card/task editor for BuddyBubble's Bubbleboard. One universal modal component whose form fields are driven by `card_type` (a closed schema per type), rather than 9+ bespoke modals. Includes the "PCC" (Persona-Constrained Canvas) behavior: an AI Coach persona can hydrate fields via chat, but only within the fixed schema — it cannot add fields the Canvas doesn't define.

## Implementation status (app codebase)

Tracked against PR [#176](https://github.com/jlfassio-vibecoder/buddybubble/pull/176) (`feat/taskmodal-canvas-pcc-reactions`); earlier shell work landed in [#175](https://github.com/jlfassio-vibecoder/buddybubble/pull/175). Showcase-only chrome (stage, top bar, ghost Kanban, JSON panel) remains **out of scope**.

### Completed

- **Modal shell** — `max-w-[760px]`, `--radius-3xl`, tokenized card surface; showcase chrome not ported.
- **Cover header** — `TaskModalCoverHeader`: type chip + change-type popover (9 types), visibility eyebrow, Live Huddle chip, cover-image / More / Close icon actions, borderless title + description, optional cover image as absolute backdrop (not a separate 16:9 cinematic hero).
- **Editor chrome (persistent)** — Visibility SegWide + Live toggle + Workout player in `TaskModalEditorChrome`, mounted across Details / Comments / Subtasks / Activity. Visibility/Live hide in comments reading-context; workout player may still show. Cover header chips are **read-only echoes** of chrome state (do not trap edit controls in Details-only Properties).
- **Tabs** — Desktop labeled strip with incomplete-count badges; mobile icon + label bar; Bubbly control on both breakpoints.
- **Shared wrappers** — `TaskModalSection` / `TaskModalField` / `TaskModalDisclosure`, shared input sizing token, Badge / Select / Checkbox / Progress primitives.
- **Details section order** — Properties → type body → Schedule (date/time) → Cover → Attachments → Danger.
- **Properties** — `TaskModalPropertiesSection`: Status / Priority / Assigned to (3-col board metadata only).
- **Schedule** — date + time (`TaskModalSchedulingSection`); events also get Ends → `metadata.ends`; experience dates stay in type metadata; section omitted for `experience`.
- **Subtasks / Activity** — Checkbox rows + progress; icon-dot timeline.
- **Review / regression follow-ups** — Cover file input always mounted for header picker; unified-comments heroes keep Close; metadata `aria-label`s; `asChild` Choose-file without invalid `type="button"`; Visibility/Live restored to chrome after a Details-only regression.
- **Handoff docs in repo** — this folder is checked in as the design source of truth. Prototype JSX/HTML is **ESLint-ignored** (`eslint.config.mjs`) so Babel globals do not fail CI; HTML entry is Prettier-formatted.
- **Workout Details read canvas** — `TaskModalWorkoutCanvas`: 3-col stats (Type / Duration / Target), format pills, `.tm-ex`-style exercise rows from `WorkoutSessionViewModel`; outline / intake / preflight / viewer CTA unchanged. Read-only this pass (edits stay in structure builder / viewer).
- **Class RSVP read canvas** — `TaskModalClassRsvpCanvas` above embedded `ClassEditor` when an instance exists: reserved/spots copy, progress fill, avatar stack (+ overflow), Manage roster → existing `ManageClassRosterModal`. Roster enrollments include `avatar_url`. No price / admin Reserve CTA this pass.
- **Details sticky footer** — `TaskModalDetailsStickyFooter`: save-state hint (`All changes saved` / `Unsaved changes` / busy) + Cancel / Save|Create. Title/desc autosave unchanged; Cancel restores from `originalRef` and closes without `flushNow`. Danger zone stays in scroll body. Class Details keeps ClassEditor save (no duplicate sticky Save).
- **Idea + Memory Details canvases** — `TaskModalIdeaCanvas` (interactive interest vote via `metadata.votes` + `voted_by`, editable effort/impact/tags, Promote → Event/Program/Class via `setItemType`); `TaskModalMemoryCanvas` (image-attachment gallery + Add photo → existing uploader, optional location). Caption stays in Moment metadata.
- **Idea vote toggle** — `.tm-vote` upvote on/off for current user; managed keys `votes` / `voted_by`; immediate `saveCoreFields` on existing tasks; primary-tinted on state; Coach provenance demote on overwrite. No vote ledger table / ranked boards.
- **Memory people + linked event + moment reactions** — `TaskModalMemoryCanvas`: From (`linked_event` free text), Tagged people chips + avatar stack (`people`), moment reaction pills on task metadata (`reactions` with `emoji`/`count`/`reacted_by`). Reuses `ChatMessageReactionPills`; sticky Save. Caption stays in Moment; Comments `message_reactions` unchanged. No CRM picker / Event auto-link.
- **Workout block Coach chrome** — `TaskModalWorkoutCanvas` block cards show Coach border/tag when `field_provenance` marks `blocks` / `coach_workout_outline` (or flat `exercises`) agent-filled; live demote clears chrome. Form `exercises` edits also demote `blocks`. No nested provenance writers / editable block chrome.
- **Cover title/description Coach chrome** — `TaskModalCoverHeader` (and DetailsBody fallback when cover does not own title fields): Coach tag + soft inset ring when `title` / `description` are agent-filled; live demotion clears chrome. Autosave stays column-only (no JSONB provenance patch on keystroke).
- **Theme spot-check (business × light)** — Shell + Details verified under `theme-business` light; sticky-footer saved check uses `text-primary` (see Phase I results below). No redesign / no new themes.
- **Bubbly alias** — Tab bar mounts product `BubblyButton` (Bubble Up / `task_bubble_ups`); prototype had no Bubbly control. Idea votes stay separate. Bubbly is a sibling of `role="tablist"` (not a section tab).
- **Schemas gap closure** — Diffed handoff `schemas.js` vs app managed metadata; closed trivial keys (idea effort/impact/tags, event `cost`, workout `target_rpe`, memory `location`, program `days_per_week`/`level`, workout_log `session_rpe`/`completion`/`mood`). See Phase K audit below. Larger leftovers ticketed as L–O.
- **Comments reaction pills** — `message_reactions` table + `useMessageReactions`; `.tm-react`-style pills on `ChatMessageRow` (StandardTaskChatRail + TaskModalCommentsPanel) with closed emoji set and SmilePlus popover.
- **Coach / PCC display** — durable `tasks.metadata.field_provenance` sidecar (`by: 'agent' | 'user'`, optional `agent_slug` / `at`). Coach Edge strategy stamps keys it changes; TaskModal save + title/desc autosave demote to `by: 'user'`. UI: `TaskModalPersonaStrip` when any agent entries remain; `TaskModalField.agent` chrome on type/metadata fields via `isAgentFilledForDisplay` (Properties stay human board meta). Helpers: `src/lib/task-field-provenance.ts` (+ Edge twin). No historical backfill.
- **Program week cards** — `TaskModalProgramWeekCards` in `TaskModalProgramFields`: `.tm-week` / `.tm-sess` Tailwind from `ProgramWeek[]` (Mon–Sun rows, muted Rest for missing days). Single-template + `duration_weeks > 1` shows “Repeats · N weeks” meta (no cloned cards). Goal / Duration / Personalize unchanged; `TaskModalField.agent` on `schedule`. Helpers: `buildProgramWeekCardModel` / `buildProgramWeekCards` in `src/lib/fitness/program-schedule.ts`. No Add-week / enrollment / child deep links.
- **Event bring tags + RSVP (metadata-only)** — Earlier pass: Who’s going from metadata `going` / `going_people`. Superseded by Phase L ledger RSVP below.
- **Event end + real RSVP (Phase L)** — Schedule Ends date/time → managed `metadata.ends` (`YYYY-MM-DDTHH:mm`; starts stay on `scheduled_on` / `scheduled_time`). `event_rsvps` ledger + `useEventRsvp`; TaskModal Event canvas **I’m going** / **Not going**, ledger-derived count/avatars, host-editable `capacity` / bring / cost. Metadata `going` / `going_people` editors demoted (no longer SoT for display). Soft ends≤start warning; capacity-full blocks client enroll.
- **Experience highlights / includes / good_for** — `TaskModalExperienceCanvas`: icon-led lists + good_for chips + optional location / duration / price / group min–max. Managed keys `highlights`, `includes`, `good_for`, `price`, `group_min`, `group_max` (+ experience writes of `location` / `duration_min`). Shared `TaskModalChipListEditor` / `TaskModalStringListEditor`. Experience span (season / start / end) unchanged; Schedule still omitted. No booking / maps / enrollment.
- **Workout log session canvas** — `TaskModalWorkoutLogCanvas`: performed on / start time echoes from `scheduledOn` / `scheduledTime`, 3-col stats (Duration / Session RPE / Completion), light-edit Type + Duration, embedded `WorkoutLogReadSummary`. Helpers in `workout-log-session-stats.ts`. Optional display-only PR chip when exercise `pr === true`. No player / PR detection / parallel `log[]` model; Schedule remains the date/time editor.

### Phase I — Theme spot-check results

**Matrix:** `theme-business` × light (required).

| Surface                                              | Result | Notes                                                                                                                                                                                             |
| ---------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell                                                | Pass   | Card `bg-card`, overlay, radius readable on light; indigo primary from ThemeScope                                                                                                                 |
| Cover (no image)                                     | Pass   | Title/desc contrast OK; primary wash on cover header                                                                                                                                              |
| Cover (with image)                                   | Pass   | White title + near-white desc over dark gradient remain legible                                                                                                                                   |
| Type chip + change-type popover                      | Pass   | Chip type tint OK; portaled menu readable (white surface / dark text). Menu inherits `:root` `--primary` (near-black), not business indigo — not a contrast fail; type selection uses type colors |
| Tabs                                                 | Pass   | Active Details underline/icon on business indigo                                                                                                                                                  |
| Editor chrome                                        | Pass   | Visibility Private selected = indigo border/tint; Live checkbox readable                                                                                                                          |
| Persona strip + Coach tags / agent fields            | Pass   | No agent-stamped fields on sample cards; chrome is tokenized (`bg-primary` / `text-primary`) — indigo tint verified on related primary surfaces (tabs, Visibility, format pills)                  |
| Properties / Schedule / Cover / Attachments / Danger | Pass   | Borders + muted labels readable                                                                                                                                                                   |
| One type body                                        | Pass   | Workout blocks: circuit pills primary-tinted indigo; exercise rows readable                                                                                                                       |
| Sticky footer                                        | Pass   | Cancel/Save contrast OK; saved check was hard-coded emerald (~3.8:1 on white) → `text-primary`                                                                                                    |

**Fixes landed:** `TaskModalDetailsStickyFooter` saved `Check` icon: `text-emerald-600` → `text-primary`.

**Other category × mode notes:** none found during this pass (did not expand into a full matrix).

### Phase K — Schemas gap audit

**Sources:** `taskmodal/schemas.js` vs `src/lib/item-metadata.ts` + type canvases. Status: `present` | `present-different-name` | `fixed-in-K` | `deferred`.

**Universal (all types):** `card_type`→`item_type` (`card`→`task`); `title`/`description`/`status`/`priority` present; `assignee`→`task_assignees`; `visibility`/`live_session` chrome; `cover`→`card_cover_path`; `attachments` section; schedule via `scheduled_on`/`scheduled_time` where applicable.

#### card (`task`)

| Schema key               | Status                 | Notes            |
| ------------------------ | ---------------------- | ---------------- |
| `scheduled_for` / `time` | present-different-name | Schedule section |

#### event

| Schema key                                  | Status                 | Notes                                |
| ------------------------------------------- | ---------------------- | ------------------------------------ |
| `location` / `bring` / `capacity` / `going` | present                | Canvas + managed keys                |
| `starts`                                    | present-different-name | Schedule                             |
| `ends`                                      | present                | Schedule Ends → `metadata.ends`      |
| `timezone`                                  | deferred               | Workspace TZ                         |
| `cost`                                      | fixed-in-K             | Managed string                       |
| `rsvp`                                      | present                | `event_rsvps` ledger + I’m going CTA |

#### experience

| Schema key                                                                                 | Status   | Notes             |
| ------------------------------------------------------------------------------------------ | -------- | ----------------- |
| `location` / `duration_min` / `group_*` / `price` / `highlights` / `includes` / `good_for` | present  | Experience canvas |
| `booked`                                                                                   | deferred | Booking backend   |

#### idea

| Schema key                   | Status                           | Notes                                  |
| ---------------------------- | -------------------------------- | -------------------------------------- |
| `votes` / `voted`            | present / present-different-name | `votes` + `voted_by`                   |
| `effort` / `impact` / `tags` | fixed-in-K                       | Select + chip editor                   |
| `promote_to`                 | deferred                         | Promote via `setItemType` (not stored) |

#### memory

| Schema key                              | Status                 | Notes                     |
| --------------------------------------- | ---------------------- | ------------------------- |
| `happened_on`                           | present-different-name | Schedule                  |
| `location`                              | fixed-in-K             | Optional string           |
| `people` / `reactions` / `linked_event` | present                | Memory canvas             |
| `photos`                                | present-different-name | Image attachments gallery |

#### workout

| Schema key                                 | Status     | Notes                      |
| ------------------------------------------ | ---------- | -------------------------- |
| `workout_type` / `duration_min` / `blocks` | present    | Canvas + factory           |
| `target_rpe`                               | fixed-in-K | Managed 1–10 + Target tile |
| Nested editable blocks in Details          | deferred   | Builder/viewer             |

#### workout_log

| Schema key                            | Status                 | Notes                                            |
| ------------------------------------- | ---------------------- | ------------------------------------------------ |
| `performed_on`                        | present-different-name | Schedule echoes                                  |
| `actual_duration_min`                 | present-different-name | `duration_min`                                   |
| `session_rpe` / `completion` / `mood` | fixed-in-K             | Light-edit + stats (`completion_pct` read alias) |
| `log[]`                               | deferred               | Phase O                                          |

#### program

| Schema key                          | Status                 | Notes                                               |
| ----------------------------------- | ---------------------- | --------------------------------------------------- |
| `start_date` / `weeks` / `schedule` | present-different-name | `scheduled_on` / `duration_weeks` / `ProgramWeek[]` |
| `days_per_week` / `level`           | fixed-in-K             | Program fields                                      |
| `enrolled` / `capacity`             | deferred               | Phase M                                             |

#### class

| Schema key                                                            | Status                           | Notes                     |
| --------------------------------------------------------------------- | -------------------------------- | ------------------------- |
| `location` / `instructor` / `capacity` / `reserved` / `signup`        | present / present-different-name | ClassEditor + RSVP canvas |
| `starts` / `ends`                                                     | present-different-name           | `scheduled_at` + duration |
| `format` / `join_link` / `recurring` / `days` / `price` / `reminders` | deferred                         | Phase N                   |
| `timezone`                                                            | deferred                         | Workspace TZ              |

### Remaining work (phased — one plan each)

Each phase below is sized for a **single implementation plan**. Do not combine phases. Design refs: `taskmodal/forms.jsx`, `taskmodal/schemas.js`, `taskmodal/modal.css` (classes noted per phase). Keep Properties / Schedule / Cover / Attachments / Danger as they are unless a phase says otherwise. Showcase chrome stays out of scope.

#### Phase M — Program enrollment + schedule parity

- **Goal:** Program `enrolled`/`capacity` + richer week/session links (Add-week / card_ref parity).

#### Phase N — Class offering gaps

- **Goal:** Class `format`, `join_link`, recurring/`days`, `price`, reminders in ClassEditor / offerings.

#### Phase O — Workout log `log[]` / PR model

- **Goal:** Parallel performed-row model + PR ownership with the workout player (not Details-only).

### Explicitly deferred / out of scope

- Showcase chrome (stage, top bar, ghost Kanban, JSON panel) and prototype `Root` wrapper.
- Historical `field_provenance` backfill.
- Class price / admin Reserve CTA (Class RSVP canvas pass).
- Cue `{ value, provenance }` trees and cue-library personal chips.
- Full editable nested block editor inside Details (edits stay in structure builder / viewer).

## About the Design Files

The bundled files are **HTML/CSS/JSX design references** built as a standalone prototype — not production code to import as-is. They use inline mock data (`schemas.js`), plain React-via-Babel globals, and a showcase-only outer chrome (top control bar, ghost Kanban backdrop, JSON inspector panel) that is **not part of the product UI**. The task is to recreate the actual modal (cover header, tabs, per-type Details form, Comments/Subtasks/Activity) inside the real BuddyBubble codebase (`jlfassio-vibecoder/buddybubble`, Next.js 15 + Supabase), using its existing component library, theme-engine tokens, and data layer — not by copying this HTML/JSX directly. Skip the showcase-only chrome entirely (see "Files" below for what to skip).

`taskmodal/TaskModal.jsx` defines two things: **`TaskModalShell`** — the actual reusable modal (cover header + tabs + body + footer, everything inside `.tm-card`) — and `Root`, the showcase wrapper that adds the top control bar, ghost Kanban backdrop, and JSON panel around it for this prototype only. Recreate `TaskModalShell`; ignore `Root`.

## Fidelity

**High-fidelity.** Colors, spacing, type, radii, and interaction states are final-intent and pulled from the real design-token source (`colors_and_type.css`, itself sourced from the app's `globals.css` + `theme-engine/registry.ts`). Recreate pixel-faithfully using the codebase's existing shadcn/Tailwind setup and semantic tokens — do not hardcode the hex/hsl values found here; map to the equivalent CSS variables already in the app.

## Screens / Views

### 1. TaskModal shell

- **Purpose:** Container for any card type; owns cover header, tab strip/tab bar, scrollable body, footer.
- **Layout:** Card is a centered floating panel, `max-width: 760px` desktop / `412px` mobile, `border-radius: var(--radius-3xl)` (30px desktop, 30px mobile too), `max-height: calc(100vh - 130px)`, flex column: cover → tabs → scrollable body → footer.
- **Cover header** (`.tm-cover`, padding `22px 24px 20px`, bottom border):
  - Top row: type chip (pill, opens change-type popover on click — 252px popover listing all 9 types with icon + label + checkmark on active), visibility/eyebrow meta (separated by a 3px dot), "LIVE" chip when Live Huddle is on (red-tinted pill, pulsing dot), icon buttons pushed right (cover image, more, delete — `.tm-iconbtn`, 34×34, 9px radius).
  - Title: borderless input, 24px/700/-0.02em, hover tint `rgba(255,255,255,.04)`, focus ring via `var(--ring)`.
  - Description: borderless auto-growing textarea, 14.5px, muted color until focus.
  - Optional cover image: absolute-positioned bg-image with dark gradient overlay (`linear-gradient(180deg, rgba(0,0,0,.2), rgba(10,10,10,.85))`).
- **Tabs:** Details · Comments · Subtasks · Activity. Desktop = horizontal strip with 2px bottom accent underline on active tab + count badges. Mobile = bottom tab bar (icon + 9.5px label + badge).
- **Footer:** left = save-state hint (green check icon + text), right = Cancel/Save actions.

### 2. Details form (per-type)

Shared sections, in order, each `.tm-section` (18px vertical padding, top hairline border, 26×26 icon chip + 13px/700 title):

1. **Properties** — type-specific grid (status, priority, assignee, dates — via `tm-select`/`tm-input`, `.tm-grid-2`/`.tm-grid-3`, 44px field height, `var(--radius-lg)`).
2. **Type-specific body** (see Card Types below).
3. **Schedule** — date/time fields, `.tm-segwide` for recurrence/visibility toggles.
4. **Cover** — image upload row (`.tm-uploadrow`, `.tm-btn` variants) + AI-generate action.
5. **Attachments** — file chips (`.tm-filechip`).
6. **Danger zone** — collapsible (`.tm-disc`), red-tinted panel (`.tm-danger`, border `color-mix(destructive 35%, border)`), archive/delete actions.

Agent-filled fields get a highlighted border (`color-mix(primary 55%, input)`) and a small "COACH" pill tag (`.tm-agent-tag`, 9.5px uppercase). A `.tm-persona-strip` banner (avatar + name + tag + subtitle) appears when any `metadata.field_provenance` entry is still `by: 'agent'` (after live demotions). Contract: sidecar map on flat task values — not cue `{ value, provenance }` wrappers.

### 3. Card Types (9, in `schemas.js`)

Fully custom Details bodies:

- **Workout** — parametric `blocks[]` (warmup/main/cooldown), each block has a format (`EMOM`/`AMRAP`/`Tabata`/`Superset`/`Straight sets`/…) rendered as a colored format pill, plus an exercise list (`.tm-ex` rows: index, name, note, right-aligned stat columns in mono tabular figures) or instruction bullets for timed formats. Summary stat tiles (`.tm-stats`, 3-col grid: duration/exercises/calories).
- **Workout log** — recorded results against a workout, PR callouts.
- **Program** — week-by-week schedule (`.tm-week` cards: week tag + name + meta header, `.tm-sess` rows per day linking to sessions, rest days styled muted).
- **Class** — RSVP/signup block (`.tm-rsvp`: spots-left text + progress bar) + enrollment avatar stack (`.tm-av-stack`, overlapping circles, "+N more").
- **Event** — highlights/includes list (`.tm-list`, icon-led rows) + tag row (`.tm-tag`, pill chips, active state tinted primary).
- **Experience** — similar to Event; tag-driven.
- **Idea** — vote widget (`.tm-vote`: big count + up/down, primary-tinted when voted) + "promote to…" row (buttons to convert into Event/Class/etc., `.tm-promote-btn`).
- **Memory** — photo gallery grid (`.tm-gallery`, 4-col desktop/3-col mobile, striped placeholder tiles pending real photos, dashed "add" tile).
- **Card** (generic) — universal template only, no bespoke body.

### 4. Comments / Subtasks / Activity tabs

- **Comments:** avatar + name/timestamp + text + reaction pills (`.tm-react`), composer input pinned above footer.
- **Subtasks:** checkbox rows (`.tm-subtask`, strikethrough + muted when done) + avatar, progress bar + label at top (`.tm-progress-row`).
- **Activity:** vertical timeline (`.tm-act`, connecting line, dot icon per event — accent-tinted for key events), bold actor names inline in the log text.

## Interactions & Behavior

- **Change type:** click type chip → popover with 9 options → selecting swaps the Details body entirely (destructive; real app should confirm if it would drop type-specific data).
- **Title/description:** inline-editable, save on blur/debounce; hover/focus states shown via background tint + inset ring.
- **Collapsible sections** (Danger zone): chevron rotates 90° open; content mounts/unmounts.
- **Agent/Coach fill:** fields the Coach has set show a persistent tinted border + tag — this is a **display state driven by field provenance** (was this field last written by agent vs. human), not a one-time animation. Needs a `filled_by: 'agent' | 'user'` (or similar) flag per field in the real data model.
- **Live Huddle chip:** presence indicator, likely bound to a real-time video/call session state — pulsing dot.
- **Responsive:** below ~1180px the JSON panel (showcase-only) stacks under the card; the product's own responsive breakpoint should switch cover/tab layout to the mobile tab-bar variant shown in `.tm-work.is-mobile` styles — treat that mobile variant as the real target for phone widths (bottom tab bar, single-column grids, smaller paddings 16px, 3-col galleries → keep 3-col, stat tiles stay 3-col).
- **Popovers** close on outside-click via a full-screen overlay (`.tm-pop-overlay`).

## State Management

- `card_type` — drives which Details body + which Properties fields render (see `schemas.js` per-type field lists).
- `values` — the live field values object (shown in the JSON panel's "Card" tab in the prototype).
- Per-field provenance (`agent` vs `user`-set) for the Coach-tag styling.
- Active tab (Details/Comments/Subtasks/Activity).
- Popover open/closed (type-change), section-collapsed state (Danger zone).
- Comments/Subtasks/Activity are their own lists, presumably paginated/streamed from Supabase in production.

## Design Tokens

Full source: `colors_and_type.css` (bundled). Key values used by this component, under `theme-fitness dark` (the palette this modal was built against):

- `--background: hsl(0 0% 5%)`, `--card: hsl(0 0% 9%)`, `--foreground: hsl(0 0% 98%)`
- `--primary: hsl(0 90% 50%)` / `--primary-foreground: #fff` (red accent)
- `--secondary: hsl(0 0% 15%)`, `--muted-foreground: hsl(0 0% 65%)`
- `--border: hsl(0 0% 15%)`, `--input: hsl(0 0% 15%)`, `--ring: hsl(0 90% 50%)`
- `--destructive: hsl(0 84% 50%)`
- Radius scale (base `--radius: 0.625rem`): `--radius-lg` (10px, inputs/buttons), `--radius-xl` (14px, cards/blocks), `--radius-2xl` (18px, popovers/JSON panel), `--radius-3xl` (~22px, modal shell).
- Type: Geist (sans) + Geist Mono (numeric/tabular figures — durations, stats, timers). Title 24px/700, section title 13px/700, body/inputs 14.5px, hint/meta 11–12px, eyebrow 10–11.5px uppercase tracked +.05–.07em.
- This component is theme-agnostic by construction: it only reads semantic vars (`var(--primary)`, `var(--card)`, etc.) so it should render correctly under any of the app's 5 category themes (business/kids/class/community/fitness) × light/dark — verify against at least one other theme (e.g. `theme-business` light) before shipping.

## Assets

No external image/icon assets — icons are Lucide (inline SVG components, referenced by name in the JSX, e.g. `Dumbbell`, `Calendar`, `MoreHorizontal`). Cover images and gallery photos are placeholders (striped pattern) pending real user uploads. Avatars are colored-initial circles (no photo assets).

## Files

- `TaskModal - Universal Canvas.html` — entry file; wires up the showcase chrome (top bar Segs, ghost Kanban backdrop, JSON panel) around the real component. **Only the modal itself (inside `.tm-card`) is in scope for recreation** — ignore `.tm-stage`, `.tm-bar`, `.tm-work`/`.tm-backdrop`, and `.tm-json*` styles/markup.
- `taskmodal/TaskModalReference.jsx` — defines `TaskModalShell` (the real modal: cover header, tab strip, footer, popovers) plus the showcase-only `Root` that wraps it. (Named `Reference` here only to avoid colliding with the design system's own compiled `TaskModal` component — no functional difference.)
- `taskmodal/fields.jsx` — shared form primitives (inputs, selects, checkcards, segmented controls).
- `taskmodal/forms.jsx` — per-card-type Details bodies + Comments/Subtasks/Activity tab bodies.
- `taskmodal/workout.jsx` — Workout-specific parametric block editor + summary stats.
- `taskmodal/schemas.js` — card-type definitions, field schemas, and example/mock records for all 9 types.
- `taskmodal/modal.css` — all component styles (`.tm-*` classes) referenced above.
- `colors_and_type.css` — BuddyBubble design tokens (source of truth for theming, radius, and type scale); cross-reference against the app's live `globals.css` + `theme-engine/registry.ts`, which this file documents as being generated from.
