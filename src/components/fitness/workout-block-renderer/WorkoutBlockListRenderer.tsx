'use client';

import { cn } from '@/lib/utils';
import { WorkoutBlockHeader } from '@/components/fitness/workout-block-renderer/WorkoutBlockHeader';
import { WorkoutBlockExerciseGroup } from '@/components/fitness/workout-block-renderer/WorkoutBlockExerciseGroup';
import { WorkoutInstructionSection } from '@/components/fitness/workout-block-renderer/WorkoutInstructionSection';
import type { WorkoutBlockListRendererProps } from '@/components/fitness/workout-block-renderer/workout-block-renderer-types';

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

  const cardTitle = chrome.cardTitle?.trim() ?? '';
  const setTitle = chrome.setTitle?.trim() ?? '';
  const setTitleDiffers = setTitle.length > 0 && setTitle !== cardTitle;
  const setDescription = chrome.setDescription?.trim() ?? '';
  const sessionTitle = chrome.sessionTitle?.trim() ?? '';
  const sessionDescription = chrome.sessionDescription?.trim() ?? '';
  const difficulty = chrome.difficulty?.trim() ?? '';

  const hasSetBlock = setTitleDiffers || setDescription.length > 0;
  const hasSessionBlock = sessionTitle.length > 0 || sessionDescription.length > 0;

  if (!difficulty && !hasSetBlock && !hasSessionBlock) return null;

  return (
    <>
      {difficulty ? (
        <p className="text-[11px] capitalize text-muted-foreground">Difficulty · {difficulty}</p>
      ) : null}
      {hasSetBlock ? (
        <div className="space-y-1 rounded-xl bg-muted/25 px-3 py-2.5 ring-1 ring-border/10">
          {setTitleDiffers ? (
            <p className="text-sm font-medium text-foreground">{setTitle}</p>
          ) : null}
          {setDescription ? (
            <p className="text-xs leading-relaxed text-muted-foreground">{setDescription}</p>
          ) : null}
        </div>
      ) : null}
      {hasSessionBlock ? (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Session
          </p>
          {sessionTitle ? (
            <p className="text-sm font-semibold text-foreground">{sessionTitle}</p>
          ) : null}
          {sessionDescription ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{sessionDescription}</p>
          ) : null}
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
