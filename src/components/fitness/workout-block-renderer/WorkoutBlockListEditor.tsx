'use client';

import {
  canAddExerciseToBlock,
  canRemoveExerciseFromBlock,
} from '@/lib/agents/coach/outline-editor-client';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import { Button } from '@/components/ui/button';
import { WorkoutBlockHeader } from '@/components/fitness/workout-block-renderer/WorkoutBlockHeader';
import { WorkoutInstructionBlockEdit } from '@/components/fitness/workout-block-renderer/WorkoutInstructionBlockEdit';
import { MainBlockExerciseList } from '@/components/fitness/workout-block-renderer/MainBlockExerciseList';
import {
  appendInstructionBlock,
  appendMainBlock,
  blockUsesGroupedLayout,
  createDefaultMainBlock,
  createInstructionBlock,
  INSTRUCTION_REMOVE_ARIA_LABELS,
  removeInstructionBlockById,
  removeMainBlockById,
  SECTION_LABELS,
  updateBlock,
  type InstructionSectionKind,
  type WorkoutBlockListEditorProps,
} from '@/components/fitness/workout-block-renderer/workout-block-editor-types';
import { Trash2 } from 'lucide-react';

function blockViewForExerciseGuard(block: WorkoutSessionBlockView): Record<string, unknown> {
  return {
    block_format: block.blockFormat,
    format_params: block.formatParams,
    exercises: block.exercises ?? [],
  };
}

const SECTION_LABEL = SECTION_LABELS;

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

  const allowRemoveBlock = canWrite && mainBlocks.length > 1;

  const sectionExists = (section: InstructionSectionKind) =>
    blocks.some((b) => b.section === section);

  const renderAddInstructionButton = (
    section: InstructionSectionKind,
    testId: string,
    label: string,
  ) =>
    canWrite && !sectionExists(section) ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        data-testid={testId}
        onClick={() => onChange(appendInstructionBlock(blocks, createInstructionBlock(section, 1)))}
      >
        {label}
      </Button>
    ) : null;

  const renderInstructionSection = (section: InstructionSectionKind) => {
    const sectionBlocks = blocks
      .filter((b) => b.section === section)
      .slice()
      .sort((a, b) => a.order - b.order);
    if (sectionBlocks.length === 0) return null;

    return (
      <section key={section} className="space-y-3" data-testid={`editor-instruction-${section}`}>
        {sectionBlocks.map((block) => (
          <div key={block.id} className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {SECTION_LABEL[section]}
              </h4>
              {canWrite ? (
                <button
                  type="button"
                  aria-label={INSTRUCTION_REMOVE_ARIA_LABELS[section]}
                  data-testid={`remove-instruction-${block.id}`}
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                  onClick={() => onChange(removeInstructionBlockById(blocks, block.id))}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <WorkoutInstructionBlockEdit
              block={block}
              canWrite={canWrite}
              idPrefix={`${idPrefix}-${block.id}`}
              onChange={(patch) => onChange(updateBlock(blocks, block.id, patch))}
            />
          </div>
        ))}
      </section>
    );
  };

  return (
    <div className="space-y-6" data-testid="workout-block-list-editor">
      {renderInstructionSection('warmup')}
      {renderAddInstructionButton('warmup', 'add-warmup', 'Add Warm-up')}

      {mainBlocks.map((block) => {
        const exercises = block.exercises ?? [];
        const grouped = blockUsesGroupedLayout(block.blockFormat, exercises.length);
        const allowRemove =
          canWrite && canRemoveExerciseFromBlock(blockViewForExerciseGuard(block));
        const allowAdd = canWrite && canAddExerciseToBlock(blockViewForExerciseGuard(block));

        return (
          <section
            key={block.id}
            className="space-y-3"
            data-testid={`editor-main-block-${block.id}`}
          >
            <div className="flex items-start justify-between gap-2">
              <WorkoutBlockHeader name={block.name} subtitle={block.subtitle} />
              {allowRemoveBlock ? (
                <button
                  type="button"
                  aria-label="Remove main block"
                  data-testid={`remove-main-block-${block.id}`}
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                  onClick={() => onChange(removeMainBlockById(blocks, block.id))}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <MainBlockExerciseList
              block={block}
              blocks={blocks}
              canWrite={canWrite}
              idPrefix={idPrefix}
              allowAdd={allowAdd}
              allowRemove={allowRemove}
              grouped={grouped}
              onChange={onChange}
            />
          </section>
        );
      })}

      {canWrite ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          data-testid="add-main-block"
          onClick={() => {
            const nextOrder =
              mainBlocks.length > 0 ? Math.max(...mainBlocks.map((b) => b.order)) + 1 : 1;
            onChange(appendMainBlock(blocks, createDefaultMainBlock(nextOrder)));
          }}
        >
          Add main block
        </Button>
      ) : null}

      {renderInstructionSection('finisher')}
      {renderAddInstructionButton('finisher', 'add-finisher', 'Add Finisher')}

      {renderInstructionSection('cooldown')}
      {renderAddInstructionButton('cooldown', 'add-cooldown', 'Add Cooldown')}
    </div>
  );
}
