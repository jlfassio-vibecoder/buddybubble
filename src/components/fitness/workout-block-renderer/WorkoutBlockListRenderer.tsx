'use client';

import { cn } from '@/lib/utils';
import { WorkoutBlockHeader } from '@/components/fitness/workout-block-renderer/WorkoutBlockHeader';
import { WorkoutBlockExerciseGroup } from '@/components/fitness/workout-block-renderer/WorkoutBlockExerciseGroup';
import { WorkoutInstructionSection } from '@/components/fitness/workout-block-renderer/WorkoutInstructionSection';
import type { WorkoutBlockListRendererProps } from '@/components/fitness/workout-block-renderer/workout-block-renderer-types';
import { WORKOUT_NARRATIVE_SECTION_LABEL_CLASS } from '@/lib/workout-factory/workout-viewer-narrative';

export type {
  WorkoutBlockExerciseRenderContext,
  WorkoutBlockListChrome,
  WorkoutBlockListRendererProps,
} from '@/components/fitness/workout-block-renderer/workout-block-renderer-types';

function WorkoutBlockListChromeSection({
  chrome,
  density,
}: {
  chrome: NonNullable<WorkoutBlockListRendererProps['chrome']>;
  density: WorkoutBlockListRendererProps['density'];
}) {
  if (density !== 'full') return null;

  const difficulty = chrome.difficulty?.trim() ?? '';
  const structureRationale = chrome.structureRationale?.trim() ?? '';
  const sessionAdaptations = chrome.sessionAdaptations?.trim() ?? '';

  if (!difficulty && !structureRationale && !sessionAdaptations) return null;

  return (
    <>
      {difficulty ? (
        <p className="text-[11px] capitalize text-muted-foreground">Difficulty · {difficulty}</p>
      ) : null}
      {structureRationale ? (
        <div className="space-y-1 rounded-xl bg-muted/25 px-3 py-2.5 ring-1 ring-border/10">
          <p className={WORKOUT_NARRATIVE_SECTION_LABEL_CLASS}>Structure</p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {structureRationale}
          </p>
        </div>
      ) : null}
      {sessionAdaptations ? (
        <div className="space-y-1">
          <p className={WORKOUT_NARRATIVE_SECTION_LABEL_CLASS}>Session adjustments</p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {sessionAdaptations}
          </p>
        </div>
      ) : null}
    </>
  );
}

export function WorkoutBlockListRenderer({
  blocks,
  chrome,
  density = 'full',
  renderExercise,
  taskId = null,
  className,
  'data-testid': dataTestId,
  getMainBlockSectionProps,
  renderMainBlockAfterHeader,
  cuesByKey,
  cuesLoading = false,
  canWriteCue = false,
  onCueSave,
  onCueDraftChange,
  onCueCancel,
}: WorkoutBlockListRendererProps) {
  if (blocks.length === 0) return null;

  const mainBlocks = blocks
    .filter((b) => b.section === 'main')
    .slice()
    .sort((a, b) => a.order - b.order);

  const mainFlatIndexStarts: number[] = [];
  let flatCursor = 0;
  for (const block of mainBlocks) {
    mainFlatIndexStarts.push(flatCursor);
    flatCursor += block.exercises.length;
  }

  const instructionDensity = density === 'compact' ? 'compact' : 'full';

  return (
    <div
      className={cn(density === 'full' ? 'space-y-6' : 'space-y-4', className)}
      data-testid={dataTestId}
    >
      {chrome ? <WorkoutBlockListChromeSection chrome={chrome} density={density} /> : null}

      <WorkoutInstructionSection
        section="warmup"
        blocks={blocks}
        taskId={taskId}
        density={instructionDensity}
      />

      {mainBlocks.map((block, blockIndex) => {
        if (density === 'inline') {
          return (
            <p key={block.id} className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{block.name}</span>
              {block.subtitle ? ` · ${block.subtitle}` : ''}
            </p>
          );
        }

        const group = (
          <WorkoutBlockExerciseGroup
            block={block}
            taskId={taskId}
            density={density === 'compact' ? 'compact' : 'full'}
            renderExercise={renderExercise}
            globalFlatIndexStart={mainFlatIndexStarts[blockIndex] ?? 0}
            cuesByKey={cuesByKey}
            cuesLoading={cuesLoading}
            canWriteCue={canWriteCue}
            onCueSave={onCueSave}
            onCueDraftChange={onCueDraftChange}
            onCueCancel={onCueCancel}
          />
        );

        const sectionProps = getMainBlockSectionProps?.(block);
        return (
          <section
            key={block.id}
            {...sectionProps}
            className={cn('space-y-3', sectionProps?.className)}
          >
            <WorkoutBlockHeader name={block.name} subtitle={block.subtitle} />
            {renderMainBlockAfterHeader?.(block)}
            {group}
          </section>
        );
      })}

      <WorkoutInstructionSection
        section="finisher"
        blocks={blocks}
        taskId={taskId}
        density={instructionDensity}
      />
      <WorkoutInstructionSection
        section="cooldown"
        blocks={blocks}
        taskId={taskId}
        density={instructionDensity}
      />
    </div>
  );
}
