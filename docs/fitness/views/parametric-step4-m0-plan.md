# Parametric Step 4 — Milestone 0 (Foundation)

**Status:** Shipped.

**Parent:** [parametric-step4-plan.md](./parametric-step4-plan.md) · **Next:** [M1 Core viewers](./parametric-step4-plan.md#milestone-1--core-viewers-sprint-days-34)

**Rule:** M0 adds new modules and tests only. **Do not** wire `RichWorkoutReadView`, `WorkoutPlayerBlockList`, or any live-video surface in this milestone.

---

## Goal

Ship a **stateless read rendering package** under `workout-block-renderer/` that:

1. Accepts `WorkoutSessionBlockView[]` (from `buildWorkoutSessionViewModel`).
2. Renders warmup → main → finisher → cooldown with block headers, subtitles, instruction cards, and exercise rows.
3. Supports optional `renderExercise` slot (for M1 player compose).
4. Passes a **12-format Vitest matrix** using existing fixtures.

---

## Scope boundary

| In M0                                                | Not in M0                                      |
| ---------------------------------------------------- | ---------------------------------------------- |
| New renderer components + pure helpers               | `workout-viewer-dialog.tsx` refactor           |
| `WorkoutInstructionBlockList` internal dedupe        | `WorkoutPlayerBlockList` compose               |
| `WorkoutBlockListRenderer.test.tsx`                  | UpNext / PreJoin / CoachDraft                  |
| `index.ts` public exports                            | `density="inline"` full styling (stub prop OK) |
| Extract shared row UI from viewer **into new files** | Delete viewer duplicates (M1)                  |

---

## File plan

```text
src/lib/workout-factory/
  format-exercise-prescription-line.ts    # NEW pure — meta line from Exercise | WorkoutExercise
  block-station-label.ts                  # NEW pure — A1/A2/… from blockFormat + index

src/components/fitness/workout-block-renderer/
  WorkoutBlockHeader.tsx                  # EXISTS — no change
  WorkoutReadExerciseRow.tsx              # NEW — extract ExerciseReadRow + ExerciseDetail bits
  RequestImageLink.tsx                    # NEW — extract from workout-viewer-dialog (client)
  WorkoutExerciseThumbnail.tsx            # NEW — extract ExerciseThumbnailFrame
  WorkoutInstructionSection.tsx           # NEW — single Prep-card section (warmup/finisher/cooldown)
  WorkoutBlockExerciseGroup.tsx           # NEW — grouped station wrapper + labels
  WorkoutBlockListRenderer.tsx            # NEW — orchestrator
  WorkoutFlatExerciseList.tsx             # NEW — flat WorkoutExercise[] list
  WorkoutInstructionBlockList.tsx         # REFACTOR — delegate to WorkoutInstructionSection
  WorkoutBlockListRenderer.test.tsx       # NEW
  index.ts                                # NEW — explicit exports

  # UNCHANGED in M0
  WorkoutPlayerBlockList.tsx
  WorkoutPlayerExercisePanel.tsx
  WorkoutPlayerBlockList.test.tsx
```

---

## Task breakdown (implementation order)

### T1 — Pure helpers (no React)

**`format-exercise-prescription-line.ts`**

Extract the bit-string logic duplicated in `ExerciseDetail` and `FlatExercisesReadView`:

```ts
export function formatExercisePrescriptionLineFromFactory(ex: Exercise): string | null;
export function formatExercisePrescriptionLineFromTask(ex: WorkoutExercise): string | null;
```

Rules (match viewer today):

- Factory: `sets×`, `reps`, `RPE`, `restSeconds`, `workSeconds`, `rounds` joined with `·`
- Task: `sets×`, `reps`, `rest_seconds` via `formatRestLabel`
- Use existing `formatRepsDisplay`, `formatRestLabel` (move `formatRestLabel` to this file or `parse-reps-scalar` neighbor)

**`block-station-label.ts`**

```ts
export function blockStationLabel(
  blockFormat: BlockFormat | null,
  exerciseIndexInBlock: number,
): string | null;
```

| Format                 | Labels                  |
| ---------------------- | ----------------------- |
| `superset`, `contrast` | `A1`, `A2` (index 0, 1) |
| `circuit`, `chipper`   | `A1`…`An`               |
| Others                 | `null` (no prefix)      |

**Tests:** `format-exercise-prescription-line.test.ts`, `block-station-label.test.ts` (small, fast).

---

### T2 — Row primitives (client)

**Extract from** [workout-viewer-dialog.tsx](../../../src/components/fitness/workout-viewer-dialog.tsx):

| New module                     | Source                              |
| ------------------------------ | ----------------------------------- |
| `RequestImageLink.tsx`         | lines 46–89                         |
| `WorkoutExerciseThumbnail.tsx` | `ExerciseThumbnailFrame`            |
| `WorkoutReadExerciseRow.tsx`   | `ExerciseReadRow` + factory wrapper |

**`WorkoutReadExerciseRow` props:**

```tsx
type WorkoutReadExerciseRowProps = {
  name: string;
  metaLine: string | null;
  notes?: string | null;
  thumbnailUrl?: string | null;
  taskId?: string | null;
  exerciseQuery?: string;
  stationLabel?: string | null; // "A1" badge when grouped
  density?: 'full' | 'compact';
};
```

- `density="compact"`: smaller padding, optional `line-clamp-1` on notes (used in M2).
- Station label: small uppercase badge left of name when non-null.

**Factory adapter:**

```tsx
export function WorkoutReadExerciseRowFromFactory({
  ex,
  taskId,
  stationLabel,
  density,
}: {
  ex: Exercise;
  taskId?: string | null;
  stationLabel?: string | null;
  density?: 'full' | 'compact';
});
```

Uses `formatExercisePrescriptionLineFromFactory(ex)`.

**M0 note:** Viewer still imports its local copies until M1 deletes them — avoid editing viewer in M0 to reduce PR risk. Copy extract first; M1 switches imports and deletes duplicates.

---

### T3 — Instruction section (client)

**`WorkoutInstructionSection.tsx`**

Unify markup from:

- `InstructionBlockSection` (viewer)
- `WorkoutInstructionBlockList` (player)

Single component:

```tsx
type WorkoutInstructionSectionProps = {
  section: 'warmup' | 'finisher' | 'cooldown';
  blocks: WorkoutSessionBlockView[]; // pre-filtered or filter inside
  taskId?: string | null;
  density?: 'full' | 'compact';
};
```

Render only blocks where `block.section === section`. Each block shows `block.name` + instruction bullets (`block.instructions`). Optional `RequestImageLink` on instruction name when `taskId` set (viewer behavior).

**Refactor `WorkoutInstructionBlockList`:** thin wrapper calling `WorkoutInstructionSection` with `data-testid={`instruction-section-${section}`}` preserved for existing player test.

---

### T4 — Exercise grouping (client)

**`WorkoutBlockExerciseGroup.tsx`**

```tsx
type WorkoutBlockExerciseGroupProps = {
  block: WorkoutSessionBlockView;
  taskId?: string | null;
  density?: 'full' | 'compact';
  renderExercise?: WorkoutBlockListRendererProps['renderExercise'];
};
```

Behavior:

- If `block.blockFormat` is `superset` | `contrast` | `circuit` | `chipper` and `exercises.length > 1`:
  - Wrap rows in bordered group (`ring-1 ring-border/20 rounded-xl p-2 space-y-2`).
  - Pass `stationLabel` from `blockStationLabel`.
- Else: render exercises as flat stack (no group chrome).

When `renderExercise` provided: call it per exercise with `WorkoutBlockExerciseRenderContext`; else default `WorkoutReadExerciseRowFromFactory`.

---

### T5 — `WorkoutBlockListRenderer` (client)

**Props** (finalize types in `workout-block-renderer-types.ts` or colocate):

```tsx
export type WorkoutBlockExerciseRenderContext = {
  block: WorkoutSessionBlockView;
  exercise: Exercise;
  exerciseIndexInBlock: number;
  stationLabel: string | null;
  globalFlatIndex?: number;
};

export type WorkoutBlockListRendererProps = {
  blocks: WorkoutSessionBlockView[];
  chrome?: WorkoutBlockListChrome;
  density?: 'full' | 'compact' | 'inline';
  renderExercise?: (ctx: WorkoutBlockExerciseRenderContext) => React.ReactNode;
  taskId?: string | null;
  className?: string;
  'data-testid'?: string;
};
```

**Render algorithm:**

1. If `blocks.length === 0` → return `null` (caller handles empty copy).
2. Optional **chrome** block at top (only when `density === 'full'` and chrome fields set):
   - Difficulty line
   - Set title/description if differs from `cardTitle`
   - Session title/description
3. **Instruction sections:** `WorkoutInstructionSection` × warmup, finisher, cooldown.
4. **Main blocks:** filter `section === 'main'`, sort by `order`, for each:
   - `WorkoutBlockHeader` with `block.name` / `block.subtitle`
   - `WorkoutBlockExerciseGroup`
5. **`density === 'inline'`:** M0 stub — render block name + subtitle only (one `<p>` per main block); full inline styling deferred to M2.

**Stateless checks:**

- No hooks except what children use (`RequestImageLink` toast on click is event handler, OK).
- No imports from `WorkoutPlayer`, `SetDraft`, chat, Supabase.

---

### T6 — `WorkoutFlatExerciseList` (client)

```tsx
type WorkoutFlatExerciseListProps = {
  exercises: WorkoutExercise[];
  taskId?: string | null;
  density?: 'full' | 'compact';
  emptyMessage?: string;
};
```

- Map each `WorkoutExercise` → `WorkoutReadExerciseRow` using `formatExercisePrescriptionLineFromTask`.
- Thumbnail from `ex.thumbnail_url` (same as viewer `exerciseThumbnailSrc`).
- Default empty: `"No exercises on this card yet."`

Used directly in M1 for flat viewer path; M0 tests only.

---

### T7 — Public API (`index.ts`)

```ts
export { WorkoutBlockListRenderer } from './WorkoutBlockListRenderer';
export type { WorkoutBlockListRendererProps, WorkoutBlockExerciseRenderContext } from './...';
export { WorkoutFlatExerciseList } from './WorkoutFlatExerciseList';
export {
  WorkoutReadExerciseRow,
  WorkoutReadExerciseRowFromFactory,
} from './WorkoutReadExerciseRow';
export { WorkoutBlockHeader } from './WorkoutBlockHeader';
export { WorkoutInstructionSection } from './WorkoutInstructionSection';
// Do NOT export player-only modules from barrel by default
```

---

### T8 — Tests

**`WorkoutBlockListRenderer.test.tsx`**

Loop `BLOCK_FORMAT_ENUM` from [block-blueprint-library.ts](../../../src/lib/agents/coach/block-blueprint-library.ts):

```tsx
for (const format of BLOCK_FORMAT_ENUM) {
  it(`renders ${format} main block header and subtitle`, () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat(format));
    render(<WorkoutBlockListRenderer blocks={vm.blocks} data-testid="read-block-list" />);
    expect(screen.getByTestId('read-block-list')).toBeInTheDocument();
    expect(screen.getByText(/MAIN/i)).toBeInTheDocument();
    if (vm.blocks.find((b) => b.section === 'main')?.subtitle) {
      expect(
        screen.getByText(vm.blocks.find((b) => b.section === 'main')!.subtitle!),
      ).toBeInTheDocument();
    }
  });
}
```

Additional cases:

| Test                          | Assert                                                                 |
| ----------------------------- | ---------------------------------------------------------------------- |
| Warmup/finisher/cooldown      | `[data-testid="instruction-section-warmup"]` present for amrap fixture |
| Superset fixture              | Text `A1` and `A2` visible                                             |
| Contrast fixture              | Same                                                                   |
| Circuit fixture (3 exercises) | `A1`, `A2`, `A3`                                                       |
| `renderExercise` slot         | Custom test id per exercise; default rows not rendered                 |
| Empty blocks                  | Returns null / empty container per implementation                      |

**Regression:** Re-run existing `WorkoutPlayerBlockList.test.tsx` after `WorkoutInstructionBlockList` refactor — must still pass.

**CI:**

```bash
pnpm exec vitest run \
  src/lib/workout-factory/format-exercise-prescription-line.test.ts \
  src/lib/workout-factory/block-station-label.test.ts \
  src/components/fitness/workout-block-renderer/WorkoutBlockListRenderer.test.tsx \
  src/components/fitness/workout-block-renderer/WorkoutPlayerBlockList.test.tsx
```

---

## Type & import rules

| Rule                                                                                          | Rationale                 |
| --------------------------------------------------------------------------------------------- | ------------------------- |
| Renderer imports `WorkoutSessionBlockView` from ViewModel types only                          | No re-parse of metadata   |
| Pure helpers live under `workout-factory/`                                                    | Testable without RTL      |
| `'use client'` on all files in `workout-block-renderer/` except none in M0                    | Matches Step 3 package    |
| No new imports of `item-metadata` from renderer except `WorkoutExercise` type in flat list    | Avoid cycle               |
| Do not import `@/lib/agents/coach/block-blueprint-library` in renderer except types if needed | Subtitle already on block |

---

## Visual parity targets (M0 manual smoke)

Before merging M0, render in Storybook-style isolation (temporary dev route **not** required — use Vitest `debug()` or a one-off test page optional):

Compare **new** `WorkoutBlockListRenderer` vs **current** `RichWorkoutReadView` for one fixture:

- `richMetadataWithBlockFormat('tabata')`
- `richMetadataWithBlockFormat('superset')`

Checklist:

- [ ] Block header uppercase label matches
- [ ] Subtitle string identical
- [ ] Warmup Prep card layout matches
- [ ] Exercise meta line (`3× · 10 reps · …`) matches

---

## PR checklist (M0)

- [ ] All new files have `'use client'` where they use DOM/event handlers
- [ ] `pnpm run lint` clean
- [ ] Vitest suites above green
- [ ] No changes to `workout-viewer-dialog.tsx` (defer duplicate removal to M1)
- [ ] No changes to `WorkoutPlayerBlockList.tsx` body (M1)
- [ ] Update [parametric-step4-plan.md](./parametric-step4-plan.md) M0 status → shipped when done
- [ ] Add link in [docs/fitness/README.md](../README.md) doc map (optional one-liner)

---

## Estimated effort

| Task                        | Size |
| --------------------------- | ---- |
| T1 Pure helpers + tests     | S    |
| T2 Row extract              | M    |
| T3 Instruction unify        | S    |
| T4 Group component          | S    |
| T5 Main renderer            | M    |
| T6 Flat list                | S    |
| T7–T8 API + 12-format tests | M    |

**Total:** ~1–2 dev days before M1 viewer swap.

---

## M1 handoff (what M0 enables)

M1 PR will:

1. Replace `RichWorkoutReadView` body with `useWorkoutSessionViewModel` + `WorkoutBlockListRenderer`.
2. Replace `FlatExercisesReadView` with `WorkoutFlatExerciseList`.
3. Refactor `WorkoutPlayerBlockList` to compose renderer + `renderExercise` → `WorkoutPlayerExercisePanel`.
4. Delete duplicated viewer helpers (`ExerciseDetail`, `InstructionBlockSection`, local `ExerciseReadRow`, etc.).

M0 must export stable props so M1 does not redesign the slot API.
