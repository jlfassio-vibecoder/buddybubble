'use client';

import {
  canAddExerciseToBlock,
  canRemoveExerciseFromBlock,
} from '@/lib/agents/coach/outline-editor-client';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import { Button } from '@/components/ui/button';
import { WorkoutBlockHeader } from '@/components/fitness/workout-block-renderer/WorkoutBlockHeader';
import { WorkoutBlockExerciseEditRow } from '@/components/fitness/workout-block-renderer/WorkoutBlockExerciseEditRow';
import { WorkoutInstructionBlockEdit } from '@/components/fitness/workout-block-renderer/WorkoutInstructionBlockEdit';
import {
  addExerciseToBlock,
  blockStationLabel,
  blockUsesGroupedLayout,
  createDefaultBlockExercise,
  removeExerciseFromBlock,
  updateBlock,
  updateExerciseInBlock,
  type WorkoutBlockListEditorProps,
} from '@/components/fitness/workout-block-renderer/workout-block-editor-types';

function blockViewForExerciseGuard(block: WorkoutSessionBlockView): Record<string, unknown> {
  return {
    block_format: block.blockFormat,
    format_params: block.formatParams,
    exercises: block.exercises ?? [],
  };
}

const SECTION_LABEL = {
  warmup: 'Warm-up',
  finisher: 'Finisher',
  cooldown: 'Cool down',
} as const;

export type { WorkoutBlockListEditorProps } from '@/components/fitness/workout-block-renderer/workout-block-editor-types';

export function WorkoutBlockListEditor({
  blocks,
  canWrite,
  workoutUnitSystem: _workoutUnitSystem,
  onChange,
  idPrefix = 'wbe',
}: WorkoutBlockListEditorProps) {
  if (blocks.length === 0) {
    return <p className="text-sm text-muted-foreground">No blocks on this workout.</p>;
  }

  const mainBlocks = blocks
    .filter((b) => b.section === 'main')
    .slice()
    .sort((a, b) => a.order - b.order);

  const renderInstructionSection = (section: 'warmup' | 'finisher' | 'cooldown') => {
    const sectionBlocks = blocks
      .filter((b) => b.section === section)
      .slice()
      .sort((a, b) => a.order - b.order);
    if (sectionBlocks.length === 0) return null;

    return (
      <section key={section} className="space-y-3" data-testid={`editor-instruction-${section}`}>
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {SECTION_LABEL[section]}
        </h4>
        <div className="space-y-2">
          {sectionBlocks.map((block) => (
            <WorkoutInstructionBlockEdit
              key={block.id}
              block={block}
              canWrite={canWrite}
              idPrefix={`${idPrefix}-${block.id}`}
              onChange={(patch) => onChange(updateBlock(blocks, block.id, patch))}
            />
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-6" data-testid="workout-block-list-editor">
      {renderInstructionSection('warmup')}

      {mainBlocks.map((block) => {
        const exercises = block.exercises ?? [];
        const grouped = blockUsesGroupedLayout(block.blockFormat, exercises.length);

        const allowRemove =
          canWrite && canRemoveExerciseFromBlock(blockViewForExerciseGuard(block));
        const allowAdd = canWrite && canAddExerciseToBlock(blockViewForExerciseGuard(block));

        const addExerciseButton = allowAdd ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            data-testid={`add-exercise-${block.id}`}
            onClick={() =>
              onChange(
                addExerciseToBlock(
                  blocks,
                  block.id,
                  createDefaultBlockExercise(block, exercises.length),
                ),
              )
            }
          >
            Add exercise
          </Button>
        ) : null;

        const rows = exercises.map((ex, ei) => (
          <WorkoutBlockExerciseEditRow
            key={ex.id ?? `${block.id}-ex-${ei}`}
            exercise={ex}
            stationLabel={blockStationLabel(block.blockFormat, ei)}
            canWrite={canWrite}
            idPrefix={`${idPrefix}-${block.id}`}
            exerciseIndex={ei}
            onChange={(patch) => onChange(updateExerciseInBlock(blocks, block.id, ei, patch))}
            onRemove={
              allowRemove
                ? () => onChange(removeExerciseFromBlock(blocks, block.id, ei))
                : undefined
            }
          />
        ));

        return (
          <section
            key={block.id}
            className="space-y-3"
            data-testid={`editor-main-block-${block.id}`}
          >
            <WorkoutBlockHeader name={block.name} subtitle={block.subtitle} />
            {grouped ? (
              <div className="space-y-2 rounded-xl p-2 ring-1 ring-border/20">
                {rows}
                {addExerciseButton}
              </div>
            ) : (
              <div className="space-y-2">
                {rows}
                {addExerciseButton}
              </div>
            )}
          </section>
        );
      })}

      {renderInstructionSection('finisher')}
      {renderInstructionSection('cooldown')}
    </div>
  );
}
