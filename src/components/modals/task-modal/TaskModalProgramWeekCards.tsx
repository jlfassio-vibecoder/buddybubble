'use client';

import { Dumbbell, Moon } from 'lucide-react';
import type { ProgramWeek } from '@/lib/item-metadata';
import { buildProgramWeekCards } from '@/lib/fitness/program-schedule';
import { cn } from '@/lib/utils';

export type TaskModalProgramWeekCardsProps = {
  programSchedule: ProgramWeek[];
  programDurationWeeks?: string;
  className?: string;
};

/**
 * Handoff-style `.tm-week` / `.tm-sess` read canvas for program `metadata.schedule`.
 */
export function TaskModalProgramWeekCards({
  programSchedule,
  programDurationWeeks,
  className,
}: TaskModalProgramWeekCardsProps) {
  const cards = buildProgramWeekCards(programSchedule, programDurationWeeks);
  if (!cards.length) return null;

  return (
    <div className={cn('space-y-2.5', className)} data-testid="task-modal-program-week-cards">
      {cards.map((card) => {
        const metaParts = [`${card.sessionCount} sessions`];
        if (card.repeatingMeta) metaParts.push(card.repeatingMeta);
        return (
          <div
            key={card.weekNumber}
            className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-background"
            data-testid={`task-modal-program-week-${card.weekNumber}`}
          >
            <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.06em] text-primary">
                Week {card.weekNumber}
              </span>
              <span className="ml-auto text-[11.5px] text-muted-foreground">
                {metaParts.join(' · ')}
              </span>
            </div>
            <ul className="m-0 list-none p-0">
              {card.rows.map((row, idx) => {
                const isRest = row.kind === 'rest';
                const Icon = isRest ? Moon : Dumbbell;
                return (
                  <li
                    key={row.dayLabel}
                    className={cn(
                      'flex items-center gap-2.5 px-3.5 py-2.5',
                      idx < card.rows.length - 1 && 'border-b border-border/60',
                    )}
                    data-kind={row.kind}
                    data-testid={`task-modal-program-sess-${card.weekNumber}-${row.dayLabel}`}
                  >
                    <span className="w-10 shrink-0 text-[11px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
                      {row.dayLabel}
                    </span>
                    <span
                      className={cn(
                        'inline-flex min-w-0 flex-1 items-center gap-1.5 text-[13.5px]',
                        isRest
                          ? 'font-medium text-muted-foreground'
                          : 'font-semibold text-foreground',
                      )}
                    >
                      <Icon
                        className={cn(
                          'size-3.5 shrink-0',
                          isRest ? 'text-muted-foreground' : 'text-primary',
                        )}
                        aria-hidden
                      />
                      <span className="truncate">
                        {row.title}
                        {row.subtitle ? (
                          <span className="font-normal text-muted-foreground">
                            {' '}
                            · {row.subtitle}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                      {isRest ? 'Rest' : 'Workout'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
