'use client';

import { Dumbbell } from 'lucide-react';
import type { Json } from '@/types/database';
import { metadataFieldsFromParsed, parseTaskMetadata } from '@/lib/item-metadata';
import { useWorkoutSessionViewModel } from '@/hooks/use-workout-session-view-model';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import type { Exercise } from '@/lib/workout-factory/types/ai-program';
import {
  TaskModalAgentTag,
  TaskModalSection,
} from '@/components/modals/task-modal/TaskModalSection';
import { cn } from '@/lib/utils';

const FMT_ACCENT = new Set([
  'amrap',
  'emom',
  'tabata',
  'superset',
  'circuit',
  'ladder',
  'chipper',
  'pyramid',
  'contrast',
  'clusters',
  'drop_sets',
]);

export type TaskModalWorkoutCanvasProps = {
  taskMetadata?: Json | null;
  className?: string;
  /** Live Coach provenance display (respects demoted keys). */
  isAgentField?: (key: string) => boolean;
};

function formatPillLabel(blockFormat: string | null): string {
  if (!blockFormat) return 'prep';
  return blockFormat.replace(/_/g, ' ');
}

function ExerciseRow({
  name,
  note,
  sets,
  reps,
  rpe,
  restSeconds,
  index,
}: {
  name: string;
  note?: string | null;
  sets?: number | null;
  reps?: string | number | null;
  rpe?: number | null;
  restSeconds?: number | null;
  index: number;
}) {
  const stats: { k: string; v: string }[] = [];
  if (sets != null && sets > 0) stats.push({ k: 'sets', v: String(sets) });
  if (reps != null && String(reps).trim()) stats.push({ k: 'reps', v: String(reps) });
  if (rpe != null && Number.isFinite(rpe)) stats.push({ k: 'rpe', v: String(rpe) });
  if (restSeconds != null && restSeconds > 0) {
    stats.push({ k: 'rest', v: `${restSeconds}s` });
  }

  return (
    <div className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-b-0">
      <span className="flex size-[22px] shrink-0 items-center justify-center rounded-[7px] bg-secondary text-[11px] font-bold text-muted-foreground">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold tracking-tight text-foreground">{name}</div>
        {note ? (
          <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{note}</div>
        ) : null}
      </div>
      {stats.length > 0 ? (
        <div className="flex shrink-0 items-center gap-3">
          {stats.map((s) => (
            <div key={s.k} className="text-right">
              <div className="text-[13px] font-bold tabular-nums tracking-tight text-foreground">
                {s.v}
              </div>
              <div className="text-[9.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                {s.k}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FactoryExerciseRow({ ex, index }: { ex: Exercise; index: number }) {
  return (
    <ExerciseRow
      index={index}
      name={ex.exerciseName}
      note={ex.instructions?.trim() || null}
      sets={ex.sets}
      reps={ex.reps}
      rpe={ex.rpe}
      restSeconds={ex.restSeconds}
    />
  );
}

function BlockCard({ block, agent }: { block: WorkoutSessionBlockView; agent?: boolean }) {
  const fmtLabel = formatPillLabel(block.blockFormat);
  const accent = Boolean(block.blockFormat && FMT_ACCENT.has(block.blockFormat));
  const isInstr = !block.blockFormat && block.instructions.length > 0;

  return (
    <div
      className={cn(
        'mb-2.5 overflow-hidden rounded-[var(--radius-xl)] border bg-background last:mb-0',
        agent ? 'border-primary/55' : 'border-border',
      )}
      data-testid={agent ? 'task-modal-workout-block-agent' : 'task-modal-workout-block'}
    >
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-3.5 py-2.5">
        <span className="text-[13.5px] font-bold tracking-tight text-foreground">{block.name}</span>
        {agent ? <TaskModalAgentTag /> : null}
        <span
          className={cn(
            'inline-flex h-[22px] items-center rounded-full px-2.5 text-[10.5px] font-extrabold uppercase tracking-[0.05em]',
            accent ? 'bg-primary/16 text-primary' : 'bg-secondary text-muted-foreground',
          )}
        >
          {fmtLabel}
        </span>
        {block.subtitle ? (
          <span className="text-[11.5px] tabular-nums text-muted-foreground">{block.subtitle}</span>
        ) : null}
      </div>
      <div className="px-3.5 pb-3 pt-1.5">
        {isInstr
          ? block.instructions.map((t, i) => (
              <div
                key={`${block.id}-instr-${i}`}
                className="flex gap-2.5 border-b border-border/60 py-2 text-[13px] leading-snug text-foreground last:border-b-0"
              >
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                {t}
              </div>
            ))
          : block.exercises.map((ex, i) => (
              <FactoryExerciseRow key={ex.id ?? `${block.id}-ex-${i}`} ex={ex} index={i} />
            ))}
      </div>
    </div>
  );
}

function EmptyBlocksPrompt() {
  return (
    <div className="rounded-[var(--radius-xl)] border border-dashed border-border bg-transparent px-4 py-[22px] text-center">
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        No blocks yet. Ask the <span className="font-semibold text-foreground">Coach</span> in chat
        to build the workout — it selects a format from the blueprint library and hydrates the
        exercises.
      </p>
    </div>
  );
}

/**
 * Handoff-aligned read canvas for workout Details: stats tiles, format pills, exercise rows.
 * Driven by `WorkoutSessionViewModel`; editing stays in structure builder / workout viewer.
 * Flat-only metadata is already mapped by the VM into a single “Exercises” block.
 */
export function TaskModalWorkoutCanvas({
  taskMetadata = null,
  className,
  isAgentField,
}: TaskModalWorkoutCanvasProps) {
  const vm = useWorkoutSessionViewModel(taskMetadata);
  const fields = metadataFieldsFromParsed(parseTaskMetadata(taskMetadata ?? {}));

  const typeTile = fields.workoutType.trim() || '—';
  const durationRaw = fields.workoutDurationMin.trim();
  const durationNum = Number(durationRaw);
  const hasDuration = durationRaw !== '' && Number.isFinite(durationNum) && durationNum > 0;

  const tiles = [
    { k: 'Type', v: typeTile, u: '' },
    { k: 'Duration', v: hasDuration ? String(durationNum) : '—', u: hasDuration ? 'min' : '' },
    { k: 'Target', v: '—', u: '' },
  ];

  const showEmpty = vm.blocks.length === 0;
  const structureAgent = Boolean(
    isAgentField?.('blocks') || isAgentField?.('coach_workout_outline'),
  );
  const flatExercisesAgent = vm.source === 'flat' && Boolean(isAgentField?.('exercises'));
  const blocksAgent = structureAgent || flatExercisesAgent;

  return (
    <div className={className} data-testid="task-modal-workout-canvas">
      <TaskModalSection
        icon={<Dumbbell className="size-4" aria-hidden />}
        title="Workout"
        sub="Structured by the Coach into parametric blocks. Edits open in the workout viewer or structure builder."
      >
        <div
          className="mb-3.5 grid grid-cols-3 gap-2.5"
          data-testid="task-modal-workout-canvas-stats"
        >
          {tiles.map((t) => (
            <div key={t.k} className="rounded-lg border border-border bg-background px-3.5 py-3">
              <div className="text-[19px] font-bold tracking-tight tabular-nums text-foreground">
                {t.v}
                {t.u ? (
                  <span className="ml-0.5 text-xs font-semibold text-muted-foreground">{t.u}</span>
                ) : null}
              </div>
              <div className="mt-0.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                {t.k}
              </div>
            </div>
          ))}
        </div>

        {showEmpty ? (
          <EmptyBlocksPrompt />
        ) : (
          <div data-testid="task-modal-workout-canvas-blocks">
            {vm.blocks.map((block) => (
              <BlockCard key={block.id} block={block} agent={blocksAgent} />
            ))}
          </div>
        )}
      </TaskModalSection>
    </div>
  );
}
